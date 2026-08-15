"use client";

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { Bike, ChevronDown, ShoppingBag } from "lucide-react";
import {
  cambiarTipoPedido,
  useTipoPedido,
  type TipoPedido,
} from "@/lib/tienda/tipo-pedido";

// A nivel de módulo para que su identidad no cambie entre renders: si no, React se
// resuscribiría en cada uno.
const sinSuscripcion = () => () => {};
const enCliente = () => true;
const enServidor = () => false;

/** `false` en el servidor y mientras hidrata; `true` después. */
function useHidratado(): boolean {
  return useSyncExternalStore(sinSuscripcion, enCliente, enServidor);
}

/**
 * **No usa `components/ui/Modal`, y no es un descuido.** Los otros dos diálogos del proyecto se
 * unificaron ahí; este se quedó fuera porque difiere en las dos cosas que definen un modal:
 *
 * - **Es bloqueante.** Mientras no haya tipo elegido no se puede cerrar —ni por fuera, ni con
 *   Escape—, porque toda la carta depende de esa respuesta. El `Modal` compartido cierra siempre.
 * - **Es hoja inferior en móvil** (`items-end` + `rounded-t-lg`), donde el pulgar alcanza.
 *
 * Meterlo obligaría a añadirle al componente compartido dos props que usaría solo él, que es
 * cómo una abstracción buena se convierte en una mala.
 */
export function SelectorTipoPedido() {
  const tipo = useTipoPedido();
  const [reabierto, setReabierto] = useState(false);
  /**
   * Lo que se cayó del carrito al cambiar de canal.
   *
   * Se guardan los nombres y no un contador: "quitamos 2 productos" obliga a ir al carrito a
   * ver cuáles, y quien acaba de cambiar de canal está mirando esta pantalla, no aquella.
   */
  const [retirados, setRetirados] = useState<string[]>([]);
  // El modal NO puede decidirse en el servidor: su única fuente de verdad es
  // localStorage, que ahí no existe. Sin esta espera, el HTML estático (ISR) llega
  // siempre con el modal puesto —en el servidor el tipo es null— y el navegador lo
  // pinta antes de que exista JS; recién al hidratar se descubre que el cliente ya
  // había elegido y se desmonta. Eso es el parpadeo.
  const hidratado = useHidratado();

  const mostrarModal = hidratado && (reabierto || tipo === null);

  function elegir(nuevo: TipoPedido) {
    setRetirados(cambiarTipoPedido(nuevo).map((i) => i.nombre));
    setReabierto(false);
  }

  return (
    <>
      {/* Fuera del modal a propósito: el modal se cierra al elegir, y el aviso tiene que
          sobrevivirle — si viviera dentro, se iría con él sin que nadie lo leyera. */}
      {retirados.length > 0 && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-4 z-50 rounded-md bg-cafe px-4 py-3 text-sm text-crema shadow-modal sm:inset-x-auto sm:right-4 sm:max-w-sm"
        >
          <p>
            {retirados.length === 1
              ? `Quitamos ${retirados[0]} del carrito: no se vende para ${tipo === "domicilio" ? "domicilio" : "recoger"}.`
              : `Quitamos del carrito ${retirados.join(", ")}: no se venden para ${tipo === "domicilio" ? "domicilio" : "recoger"}.`}
          </p>
          <button
            type="button"
            onClick={() => setRetirados([])}
            className="mt-1 min-h-11 font-bold text-crema underline underline-offset-2"
          >
            Entendido
          </button>
        </div>
      )}

      {tipo && (
        <button
          type="button"
          onClick={() => setReabierto(true)}
          className="flex items-center gap-1.5 rounded-full bg-crema-oscura px-3 py-1 text-sm font-medium text-cafe"
        >
          {tipo === "domicilio" ? (
            <Bike className="size-4" />
          ) : (
            <ShoppingBag className="size-4" />
          )}
          {tipo === "domicilio" ? "Domicilio" : "Recoger"}
          <ChevronDown className="size-3.5" />
        </button>
      )}

      {mostrarModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-cafe/40 sm:items-center"
          onClick={() => {
            if (tipo) setReabierto(false);
          }}
        >
          <div
            className="w-full max-w-sm rounded-t-lg bg-tarjeta p-6 sm:rounded-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center">
              <Image
                src="/Churro_musical_opciones.png"
                alt=""
                width={318}
                height={456}
                className="h-24 w-auto"
              />
            </div>
            <h2 className="mt-2 text-center font-titulo text-xl font-semibold text-cafe">
              ¿Cómo quieres tu pedido?
            </h2>
            {/* Al reabrirlo desde el chip hay que ver cuál está puesto: si los dos se pintan
                igual, el diálogo no responde la pregunta que trae quien lo abre. */}
            <div className="mt-4 flex gap-3">
              <Opcion
                icono={<Bike className="size-6" />}
                etiqueta="Domicilio"
                elegido={tipo === "domicilio"}
                onClick={() => elegir("domicilio")}
              />
              <Opcion
                icono={<ShoppingBag className="size-6" />}
                etiqueta="Recoger"
                elegido={tipo === "recoger"}
                onClick={() => elegir("recoger")}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Opcion({
  icono,
  etiqueta,
  elegido,
  onClick,
}: {
  icono: React.ReactNode;
  etiqueta: string;
  elegido: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={elegido}
      className={`flex flex-1 flex-col items-center gap-2 rounded-md border py-4 ${
        elegido
          ? "border-naranja bg-naranja/10 font-semibold text-naranja"
          : "border-crema-oscura text-cafe hover:border-naranja hover:text-naranja"
      }`}
    >
      {icono}
      {etiqueta}
    </button>
  );
}
