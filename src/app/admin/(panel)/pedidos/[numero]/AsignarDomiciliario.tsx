"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bike } from "lucide-react";
import type { Domiciliario } from "@/db/queries/domiciliarios";
import { ModalAsignar } from "../ModalAsignar";

/**
 * A quién se le pasa este pedido, desde el detalle.
 *
 * Solo aparece en domicilios: un pedido para recoger no tiene a quién asignar.
 *
 * **Asignar no cambia el estado del pedido.** Entre que se llama al domiciliario y que llega
 * pasan entre cinco y quince minutos; durante esa espera el pedido sigue en preparación, que es
 * la verdad. "En camino" es un toque aparte, cuando el pedido de verdad sale por la puerta.
 *
 * Aquí solo vive lo propio de esta pantalla —el disparador ancho, la línea de quién lo lleva y la
 * ventana bloqueada—; la lista, el alta y el envío están en `ModalAsignar`, que comparte con la
 * tarjeta del tablero.
 */
export function AsignarDomiciliario({
  pedidoId,
  numero,
  domiciliarios,
  asignado,
}: {
  pedidoId: string;
  numero: number;
  /** Los activos de la agenda, cargados en el servidor. */
  domiciliarios: Domiciliario[];
  /** Quién lo lleva ya, si se asignó antes. */
  asignado: { nombre: string; telefono: string } | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [urlBloqueada, setUrlBloqueada] = useState<string | null>(null);

  function alAsignar(url: string | null) {
    setUrlBloqueada(null);
    // `window.open` devuelve null cuando el navegador bloquea la ventana. Es señal fiable, y con
    // ella se ofrece el enlace a mano en vez de perder el mensaje en silencio.
    if (url) {
      const ventana = window.open(url, "_blank", "noopener");
      setUrlBloqueada(ventana ? null : url);
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {asignado && (
        <p className="flex items-center gap-2 rounded-sm bg-crema px-3 py-2 font-cuerpo text-[13px] text-cafe">
          <Bike className="size-4 shrink-0 text-cafe-suave" />
          <span>
            Lo lleva <span className="font-bold">{asignado.nombre}</span> · {asignado.telefono}
          </span>
        </p>
      )}

      {/* Si la ventana se bloqueó, el mensaje no se perdió: está a un clic. */}
      {urlBloqueada && (
        <a
          href={urlBloqueada}
          target="_blank"
          rel="noopener"
          onClick={() => setUrlBloqueada(null)}
          className="rounded-sm bg-alerta/20 px-3 py-2 text-center font-cuerpo text-[13px] font-bold text-cafe underline-offset-2 hover:underline"
        >
          El navegador bloqueó WhatsApp — toca aquí para abrirlo
        </a>
      )}

      {/* El tono lo pone el estado, porque es lo único que el botón no decía: mientras nadie
          lleve el pedido esto es una tarea pendiente, y en ámbar —el mismo de "Avisar al
          cliente"— se distingue de "Llamar" y "Escribir", que antes eran idénticos. Una vez
          asignado baja de tono: reasignar es la excepción, no la tarea.

          Ámbar y no naranja lleno a propósito: ese es del botón que mueve el pedido de columna,
          y un "Asignar" naranja al lado de "En camino" insinuaría que asignar lo avanza. No lo
          hace (regla 18). */}
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-haspopup="dialog"
        className={`flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 font-cuerpo text-sm font-bold text-cafe transition-colors focus:outline-none focus:ring-2 focus:ring-naranja ${
          asignado
            ? "border-crema-oscura hover:bg-crema"
            : "border-alerta bg-alerta/20 hover:bg-alerta/35"
        }`}
      >
        <Bike className="size-4" />
        {asignado ? "Cambiar o reenviar" : "Asignar domiciliario"}
      </button>

      {abierto && (
        <ModalAsignar
          pedidoId={pedidoId}
          numero={numero}
          domiciliarios={domiciliarios}
          onCerrar={() => setAbierto(false)}
          onAsignado={alAsignar}
        />
      )}
    </div>
  );
}
