"use client";

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { Bike, ChevronDown, ShoppingBag } from "lucide-react";
import { elegirTipoPedido, useTipoPedido, type TipoPedido } from "@/lib/tienda/tipo-pedido";

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
  // El modal NO puede decidirse en el servidor: su única fuente de verdad es
  // localStorage, que ahí no existe. Sin esta espera, el HTML estático (ISR) llega
  // siempre con el modal puesto —en el servidor el tipo es null— y el navegador lo
  // pinta antes de que exista JS; recién al hidratar se descubre que el cliente ya
  // había elegido y se desmonta. Eso es el parpadeo.
  const hidratado = useHidratado();

  const mostrarModal = hidratado && (reabierto || tipo === null);

  function elegir(nuevo: TipoPedido) {
    elegirTipoPedido(nuevo);
    setReabierto(false);
  }

  return (
    <>
      {tipo && (
        <button
          type="button"
          onClick={() => setReabierto(true)}
          className="flex items-center gap-1.5 rounded-full bg-crema-oscura px-3 py-1 text-sm font-medium text-cafe"
        >
          {tipo === "domicilio" ? <Bike className="size-4" /> : <ShoppingBag className="size-4" />}
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
              <Image src="/churro-gorra.png" alt="" width={318} height={456} className="h-24 w-auto" />
            </div>
            <h2 className="mt-2 text-center font-titulo text-xl font-semibold text-cafe">
              ¿Cómo quieres tu pedido?
            </h2>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => elegir("domicilio")}
                className="flex flex-1 flex-col items-center gap-2 rounded-md border border-crema-oscura py-4 text-cafe hover:border-naranja hover:text-naranja"
              >
                <Bike className="size-6" />
                Domicilio
              </button>
              <button
                type="button"
                onClick={() => elegir("recoger")}
                className="flex flex-1 flex-col items-center gap-2 rounded-md border border-crema-oscura py-4 text-cafe hover:border-naranja hover:text-naranja"
              >
                <ShoppingBag className="size-6" />
                Recoger
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
