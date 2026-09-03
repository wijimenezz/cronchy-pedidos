"use client";

import { useCallback, useEffect, useRef } from "react";

/** Con qué se reconoce nuestra entrada del historial. */
const MARCA = "capaCronchy";

/** Distingue una capa de otra. A nivel de módulo: no se reinicia entre montajes. */
let contador = 0;

/**
 * Hace que el botón atrás del teléfono cierre esta capa en vez de salir de la app.
 *
 * La ficha de un producto, el carrito y el menú lateral no son rutas: son estado. Sin esto, el
 * historial no sabe que hay algo abierto, así que el atrás actúa sobre lo que había **antes de la
 * carta** —en la PWA instalada, nada— y el cliente que solo quería volver al menú se queda fuera
 * con el carrito a medias.
 *
 * Devuelve el `cerrar` que deben usar TODOS los gestos de cierre (la X, el velo, Escape). No es un
 * detalle de estilo: cerrar es `history.back()`, y el `popstate` que eso produce es quien llama a
 * `onCerrar`. Si un botón llamara a `onCerrar` a secas, la entrada que empujamos se quedaría en el
 * historial y el siguiente atrás no haría nada visible.
 *
 * **La alternativa —cerrar por estado y deshacer la entrada en la limpieza del efecto— está
 * descartada a propósito.** `history.back()` es asíncrono, así que ahí compite con el `pushState`
 * que Next hace al navegar (el "Continuar" del carrito va a `/checkout`) y podría deshacer la
 * navegación. Y en desarrollo, con el StrictMode que Next trae activo, ese `back()` llega **después**
 * del segundo montaje y cierra la capa sola nada más abrirla.
 *
 * En `pnpm dev` ese mismo StrictMode empuja **dos** entradas por capa, así que sobra un atrás al
 * cerrar. Es un artefacto de desarrollo, no un fallo: se juzga con `pnpm build && pnpm start`.
 */
export function useCerrarConAtras(onCerrar: () => void): () => void {
  // El callback vive en una ref porque quien lo pasa lo redefine en cada render
  // (`onClose={() => setFichaAbierta(false)}`). Si estuviera en las dependencias del efecto, cada
  // render empujaría otra entrada al historial.
  const cerrarRef = useRef(onCerrar);
  useEffect(() => {
    cerrarRef.current = onCerrar;
  });

  const idRef = useRef(0);

  useEffect(() => {
    const id = ++contador;
    idRef.current = id;
    // Sin `url`: no queremos cambiar la barra de direcciones, solo dejar un escalón. Next parchea
    // `pushState` y copia su estado interno dentro del que le damos, así que la marca sobrevive y
    // el `popstate` restaura el mismo árbol —o sea, no navega a ninguna parte.
    window.history.pushState({ ...window.history.state, [MARCA]: id }, "");

    function alVolver() {
      cerrarRef.current();
    }

    window.addEventListener("popstate", alVolver);
    return () => window.removeEventListener("popstate", alVolver);
  }, []);

  return useCallback(() => {
    // El camino normal: quitamos nuestra entrada y el `popstate` cierra la capa.
    if (window.history.state?.[MARCA] === idRef.current) {
      window.history.back();
      return;
    }
    // Si nuestra entrada ya no está arriba —algo repuso el estado— se cierra a mano. Deja un
    // escalón muerto, que es mucho mejor que una X que no responde.
    cerrarRef.current();
  }, []);
}
