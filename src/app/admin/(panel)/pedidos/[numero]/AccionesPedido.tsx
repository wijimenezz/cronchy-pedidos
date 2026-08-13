"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ETIQUETA_ESTADO } from "@/lib/pedidos/estados";
import type { EstadoPedido } from "@/lib/notificaciones/plantillas";
import { cambiarEstado, prepararAviso } from "../acciones";

/**
 * Operar el pedido desde su propia pantalla.
 *
 * Faltaba, y era el agujero: el detalle era de solo lectura, así que para aceptar había que
 * volver al tablero — o sea, decidir en la pantalla que **no** muestra lo que hay que
 * preparar. Aquí se ve el pedido completo y se acepta sin moverse.
 *
 * No trae ni una regla nueva: llama a las mismas server actions que la tarjeta, y qué
 * transición vale lo sigue decidiendo `validarCambioEstado` en el servidor. Este componente
 * solo pinta los botones que el servidor ya dijo que existen.
 */
export function AccionesPedido({
  pedidoId,
  numero,
  estado,
  siguiente,
  avisoPendiente,
}: {
  pedidoId: string;
  numero: number;
  estado: EstadoPedido;
  /** El avance natural, o null si el pedido ya terminó. */
  siguiente: EstadoPedido | null;
  avisoPendiente: boolean;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [urlBloqueada, setUrlBloqueada] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  /**
   * `_blank`: el panel se queda en su pestaña, que es donde se sigue trabajando al volver de
   * WhatsApp. Si el navegador bloquea la ventana —`window.open` devuelve `null`— se ofrece el
   * enlace a mano: el candado de idempotencia ya se cerró y no habrá una segunda oportunidad.
   */
  function abrirWhatsapp(url: string | null) {
    if (!url) return;
    const ventana = window.open(url, "_blank", "noopener");
    setUrlBloqueada(ventana ? null : url);
  }

  /** Avanza y avisa en el mismo toque. Cancelar entra por aquí y también avisa al cliente. */
  function avanzar(nuevo: string) {
    setError(null);
    setUrlBloqueada(null);
    iniciar(async () => {
      const resultado = await cambiarEstado({ pedidoId, estado: nuevo });
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setConfirmando(false);
      abrirWhatsapp(resultado.url);
      // La página es `force-dynamic`: esto la vuelve a pedir con el estado ya cambiado, sin
      // duplicar aquí el cálculo de cuál es el siguiente paso.
      router.refresh();
    });
  }

  /** El reintento: solo aparece si quedó un aviso pendiente de antes. */
  function avisar() {
    setError(null);
    setUrlBloqueada(null);
    iniciar(async () => {
      const resultado = await prepararAviso({ numero, estado });
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      abrirWhatsapp(resultado.url);
      router.refresh();
    });
  }

  if (!siguiente && !avisoPendiente) {
    return (
      // Sin centrar: en una banda a todo el ancho, un cuadro con el texto en el medio se lee
      // como un error del sistema y no como el estado normal de un pedido cerrado.
      <p className="rounded-md border border-crema-oscura bg-tarjeta px-4 py-3 font-cuerpo text-[13px] text-cafe-tenue">
        Este pedido ya terminó.
      </p>
    );
  }

  return (
    // Una banda a todo el ancho bajo la cabecera, y no la última tarjeta de la columna derecha:
    // ahí quedaba debajo del mapa y del asignador de domiciliario, así que para aceptar un pedido
    // había que bajar hasta el fondo. Aquí está siempre en el mismo sitio, mida lo que mida.
    <div className="flex flex-col gap-2 rounded-md border border-crema-oscura bg-tarjeta p-3">
      {error && (
        <p role="alert" className="font-cuerpo text-[13px] font-semibold text-error">
          {error}
        </p>
      )}

      {/* La ventana se bloqueó, pero el mensaje no se perdió: está a un clic. */}
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

      <div className="flex flex-wrap items-center gap-2">
        {siguiente && (
          <button
            type="button"
            onClick={() => avanzar(siguiente)}
            disabled={pendiente}
            className="min-h-11 rounded-full bg-naranja px-6 py-3 font-cuerpo text-base font-bold text-crema transition-colors hover:bg-naranja-osc focus:outline-none focus:ring-2 focus:ring-naranja focus:ring-offset-2 disabled:opacity-50"
          >
            {estado === "nuevo" ? "Aceptar pedido" : ETIQUETA_ESTADO[siguiente]}
          </button>
        )}

        {/* Ámbar, igual que en la tarjeta del tablero: es el segundo toque de la operación y
            el que se olvida. */}
        {avisoPendiente && (
          <button
            type="button"
            onClick={avisar}
            disabled={pendiente}
            className="min-h-11 rounded-full border border-alerta bg-alerta/20 px-6 py-3 font-cuerpo text-sm font-bold text-cafe transition-colors hover:bg-alerta/35 focus:outline-none focus:ring-2 focus:ring-naranja disabled:opacity-50"
          >
            Avisar al cliente
          </button>
        )}

        {/* Al otro extremo de la barra: es la única acción de esta pantalla sin vuelta atrás,
            y no puede quedar pegada al botón que se pulsa cien veces al día. */}
        {siguiente && !confirmando && (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            disabled={pendiente}
            className="ml-auto min-h-11 rounded-full px-6 font-cuerpo text-sm font-bold text-cafe-tenue transition-colors hover:text-error focus:outline-none focus:ring-2 focus:ring-naranja disabled:opacity-50"
          >
            Cancelar pedido
          </button>
        )}
      </div>

      {/* Cancelar sí pregunta, a diferencia de los avances: `cancelado` es terminal. */}
      {siguiente && confirmando && (
        <div className="flex flex-col gap-2 rounded-md border border-error/40 bg-error/5 p-3 lg:max-w-sm">
          <p className="font-cuerpo text-[13px] font-bold text-cafe">
            ¿Cancelar el pedido #{numero}? No se puede deshacer.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => avanzar("cancelado")}
              disabled={pendiente}
              className="min-h-11 flex-1 rounded-full bg-error px-4 font-cuerpo text-sm font-bold text-crema transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Sí, cancelar
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              disabled={pendiente}
              className="min-h-11 flex-1 rounded-full border border-crema-oscura px-4 font-cuerpo text-sm font-bold text-cafe transition-colors hover:bg-crema disabled:opacity-50"
            >
              No
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
