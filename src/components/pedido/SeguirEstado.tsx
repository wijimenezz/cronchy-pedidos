"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { EstadoPedido } from "@/lib/notificaciones/plantillas";

/**
 * Hace que la barra del seguimiento avance sola mientras el cliente mira la pantalla.
 *
 * Es la excepción medida al "nada de polling en la tienda pública" de CLAUDE.md, y la
 * diferencia con la carta es real: aquella la miran todos los visitantes a la vez y no cambia
 * casi nunca; esto es **una** persona con **un** pedido en curso, esperando que pase algo. Aun
 * así se acota por los tres lados:
 *
 * - **Solo con la pestaña visible.** Con el teléfono en el bolsillo no sale ni una petición,
 *   que es donde va a estar la mayor parte del tiempo.
 * - **Solo mientras el pedido esté vivo.** En `entregado` o `cancelado` no vuelve a preguntar
 *   nunca: ya no hay nada que esperar.
 * - **Solo el estado.** El endpoint devuelve unas decenas de bytes; la página completa se
 *   vuelve a pedir únicamente cuando el estado cambió de verdad.
 *
 * Un pedido normal vive unos 40 minutos, así que son ~20 consultas diminutas repartidas en
 * los ratos en que el cliente está mirando.
 */

/** Cada cuánto se pregunta. El panel usa 5 s porque ahí se opera; aquí se espera. */
const CADA_MS = 15_000;

/** Estados en los que ya no hay nada que esperar. */
const TERMINADO: EstadoPedido[] = ["entregado", "cancelado"];

export function SeguirEstado({ token, estado }: { token: string; estado: EstadoPedido }) {
  const router = useRouter();
  // El estado que la página tiene pintado ahora mismo. En un ref y no en estado propio porque
  // cambiarlo no tiene que redibujar nada: quien redibuja es `router.refresh()`.
  const pintado = useRef(estado);

  useEffect(() => {
    pintado.current = estado;
  }, [estado]);

  useEffect(() => {
    if (TERMINADO.includes(estado)) return;

    let vivo = true;

    async function mirar() {
      if (!vivo || document.visibilityState !== "visible") return;

      try {
        const respuesta = await fetch(`/api/pedido/${token}/estado`);
        if (!respuesta.ok || !vivo) return;

        const { estado: actual } = (await respuesta.json()) as { estado: EstadoPedido };

        // Solo si cambió: refrescar cada 15 s "por si acaso" sería justo el gasto que este
        // endpoint diminuto existe para evitar.
        if (actual !== pintado.current) {
          pintado.current = actual;
          router.refresh();
        }
      } catch {
        // Se ignora y se reintenta en el siguiente turno. El cliente puede estar en un
        // ascensor; no hay nada que decirle.
      }
    }

    const reloj = setInterval(mirar, CADA_MS);
    // Al volver a la pestaña se mira de inmediato, sin esperar el turno: es justo cuando el
    // cliente quiere saber si su pedido avanzó mientras no miraba.
    document.addEventListener("visibilitychange", mirar);

    return () => {
      vivo = false;
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", mirar);
    };
  }, [token, estado, router]);

  return null;
}
