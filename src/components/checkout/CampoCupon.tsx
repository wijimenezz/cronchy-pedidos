"use client";

import { useState } from "react";
import { Loader2, TicketPercent, X } from "lucide-react";
import { normalizarCodigo } from "@/lib/cupones";
import { pesos } from "@/lib/notificaciones/plantillas";
import { claseControl } from "@/components/checkout/Campo";

/**
 * Qué dice el servidor del código que el cliente escribió.
 *
 * Es el gemelo de `Cobertura` en `SelectorUbicacion`, y por lo mismo: los dos son la respuesta a
 * una consulta que se pinta en vivo y que el servidor volverá a hacer al confirmar (regla 1).
 */
export type EstadoCupon =
  | { estado: "sin_cupon" }
  | { estado: "comprobando" }
  | { estado: "aplicado"; descuento: number }
  | { estado: "rechazado"; mensaje: string };

/**
 * El campo del cupón. **Presentacional**: no consulta nada.
 *
 * Quien pide la comprobación y guarda el resultado es el checkout, igual que con la cotización del
 * domicilio. Aquí solo se escribe el código y se muestra qué contestó.
 *
 * El texto que se teclea es estado local y el código *aplicado* vive en el carrito. No es
 * duplicación: son dos cosas distintas —lo que se está escribiendo y lo que se está intentando
 * usar—, y separarlas es lo que permite que un cupón llegado por un link `?cupon=` aparezca ya
 * aplicado sin que nadie haya tecleado nada.
 *
 * **El texto se inicializa del código y no se sincroniza con un efecto.** Cuando este componente
 * monta, el carrito ya está hidratado (el checkout pinta un esqueleto hasta que lo está), así que
 * un cupón que venía de un link o de localStorage ya está ahí. Si el código llegara a cambiar por
 * fuera, quien lo pinta le pasa `key`: remontar es la forma de React de reiniciar estado local, y
 * un `useEffect` que llama a `setState` es la que provoca renders en cascada.
 */
export function CampoCupon({
  codigo,
  estado,
  onAplicar,
  onQuitar,
}: {
  /** El código que se está intentando usar, o `null` si no hay ninguno. */
  codigo: string | null;
  estado: EstadoCupon;
  onAplicar: (codigo: string) => void;
  onQuitar: () => void;
}) {
  const [texto, setTexto] = useState(codigo ?? "");

  if (estado.estado === "aplicado") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-sm bg-exito/10 px-3 py-2">
        <span className="flex min-w-0 items-center gap-2 font-cuerpo text-sm text-cafe">
          <TicketPercent className="size-4 shrink-0 text-exito" />
          <span className="truncate">
            <span className="font-bold">{codigo}</span> aplicado
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="font-cuerpo text-sm font-bold text-exito">
            −{pesos(estado.descuento)}
          </span>
          {/* Quitarlo tiene que ser tan fácil como ponerlo: el cliente puede querer probar otro. */}
          <button
            type="button"
            onClick={onQuitar}
            aria-label="Quitar el cupón"
            className="flex size-8 items-center justify-center rounded-full text-cafe-suave hover:bg-crema-oscura"
          >
            <X className="size-4" />
          </button>
        </span>
      </div>
    );
  }

  const comprobando = estado.estado === "comprobando";
  const mensaje = estado.estado === "rechazado" ? estado.mensaje : undefined;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input
          type="text"
          value={texto}
          // Se normaliza mientras se escribe, así que se ve en mayúsculas y no hay sorpresa entre
          // lo que el cliente teclea y lo que se busca.
          onChange={(e) => setTexto(normalizarCodigo(e.target.value))}
          onKeyDown={(e) => {
            // Enter aplica el cupón, no envía el pedido: el campo vive dentro del `<form>` y sin
            // esto un Enter aquí dispararía el submit.
            if (e.key === "Enter") {
              e.preventDefault();
              if (texto) onAplicar(texto);
            }
          }}
          placeholder="¿Tienes un cupón?"
          aria-label="Código del cupón"
          aria-invalid={Boolean(mensaje)}
          autoCapitalize="characters"
          autoComplete="off"
          className={claseControl(mensaje)}
        />
        <button
          type="button"
          onClick={() => onAplicar(texto)}
          disabled={!texto || comprobando}
          className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-crema-oscura px-4 font-cuerpo text-sm font-bold text-cafe disabled:opacity-40"
        >
          {comprobando ? <Loader2 className="size-4 animate-spin" /> : "Aplicar"}
        </button>
      </div>

      {mensaje && (
        <p role="status" className="font-cuerpo text-[13px] font-semibold text-error">
          {mensaje}
        </p>
      )}
    </div>
  );
}
