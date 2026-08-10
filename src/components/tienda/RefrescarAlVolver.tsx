"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { limpiarCacheProductos } from "@/lib/tienda/productos-cache";

/**
 * Vuelve a pedir la carta cuando el cliente regresa a la pestaña.
 *
 * El menú se sirve con ISR y el panel ya lo revalida al guardar, pero nada de eso llega a
 * una pestaña que ya está abierta: la gente deja la carta abierta en el móvil y vuelve
 * media hora después a un menú de hace media hora. Ahí es donde se entera de que algo se
 * agotó, y no al final del checkout.
 *
 * NO es polling, y la diferencia importa: mientras nadie mira, no sale ni una petición.
 * Un intervalo fijo costaría una petición por visitante cada N segundos, con los datos
 * móviles del cliente y el free tier de Vercel pagándolo (CLAUDE.md descarta también el
 * tiempo real por lo mismo).
 *
 * Esto es una mejora de comodidad, no una barrera: quien manda sigue siendo el servidor,
 * que recalcula precios y disponibilidad al confirmar el pedido (regla 1).
 */

/** Tope entre refrescos. Sin él, alternar ventanas dispararía uno por cada alt-tab. */
const CADA_MS = 60_000;

export function RefrescarAlVolver() {
  const router = useRouter();
  // Se siembra en el efecto y no aquí: `Date.now()` durante el render es impuro y daría un
  // valor distinto en cada re-render. El 0 solo vive hasta que monta.
  const ultimo = useRef(0);

  useEffect(() => {
    // La página acaba de cargarse, así que ya está fresca: el reloj arranca ahora y no en
    // 1970, o el primer regreso a la pestaña refrescaría de inmediato sin necesidad.
    ultimo.current = Date.now();

    function alVolver() {
      // `focus` también salta con la pestaña oculta en algunos navegadores.
      if (document.visibilityState !== "visible") return;
      if (Date.now() - ultimo.current < CADA_MS) return;

      ultimo.current = Date.now();
      limpiarCacheProductos();
      router.refresh();
    }

    // Los dos eventos, porque ninguno cubre todo: `visibilitychange` es el que salta al
    // cambiar de pestaña y al desbloquear el teléfono —el caso real—, y `focus` cubre
    // cambiar de ventana en escritorio, donde la pestaña nunca deja de ser "visible".
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);

    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, [router]);

  return null;
}
