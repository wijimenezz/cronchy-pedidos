"use client";

import { useEffect } from "react";

/**
 * Deja quieta la carta mientras hay un modal abierto encima.
 *
 * **Sin esto, un gesto que el modal no consuma se lo lleva el fondo.** Es lo que pasaba en la ficha
 * de producto: al deslizar sobre la foto, lo que se movía era la carta detrás del velo, así que
 * parecía que la ficha no respondía. El scroll de fondo no es solo un detalle de pulido — es una
 * respuesta equivocada a un gesto, y se lee como una pantalla rota.
 *
 * `HojaHorarios` ya lo traía gratis por usar el `Drawer` de Base UI con `modal`. Este hook es lo
 * mismo para los dos modales hechos a mano, `ProductoFicha` y `CartSheet`.
 *
 * **`overflow: hidden` en el body NO basta, y esa es toda la razón de que esto sea un hook y no una
 * clase de Tailwind.** iOS Safari lo ignora para el gesto táctil: la página sigue arrastrándose. Lo
 * que sí funciona en todas partes es sacar el body del flujo con `position: fixed`, y entonces hay
 * que guardar el `scrollY` y devolverlo al cerrar — si no, el body fijado salta a cero y el cliente
 * vuelve a una carta rebobinada al principio, habiendo perdido dónde estaba mirando. Cambiar un
 * scroll indeseado por perder el sitio no es un arreglo.
 *
 * El `right: 0` va con el `position: fixed` a propósito: un body fijado sin ancho declarado se
 * encoge a su contenido, y la carta entera se estrecharía de golpe al abrir el modal.
 */
export function useFondoQuieto(activo: boolean): void {
  useEffect(() => {
    if (!activo) return;

    const { body } = document;
    const desplazamiento = window.scrollY;
    const previo = {
      position: body.style.position,
      top: body.style.top,
      right: body.style.right,
      left: body.style.left,
      overflow: body.style.overflow,
    };

    body.style.position = "fixed";
    body.style.top = `-${desplazamiento}px`;
    body.style.left = "0";
    body.style.right = "0";
    // Redundante con el `fixed` en la práctica, pero mantiene la barra de scroll fuera en
    // escritorio en vez de dejar un carril muerto a la derecha.
    body.style.overflow = "hidden";

    return () => {
      body.style.position = previo.position;
      body.style.top = previo.top;
      body.style.left = previo.left;
      body.style.right = previo.right;
      body.style.overflow = previo.overflow;

      // `instant` y no el suave por defecto: esto no es una navegación, es devolver la página
      // exactamente donde estaba. Animarlo se vería como un salto que nadie pidió.
      window.scrollTo({ top: desplazamiento, behavior: "instant" });
    };
  }, [activo]);
}
