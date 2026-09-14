"use client";

import { useEffect } from "react";

/**
 * DEJA QUIETA LA PÁGINA MIENTRAS HAYA CAPAS ABIERTAS ENCIMA, contando cuántas hay.
 *
 * Sin esto, un gesto que el modal no consuma se lo lleva el fondo: al deslizar sobre la foto de la
 * ficha lo que se movía era la carta detrás del velo, y parecía que la ficha no respondía. Un
 * scroll de fondo no es un detalle de pulido, es una respuesta equivocada a un gesto.
 *
 * **`overflow: hidden` en el body NO basta**: iOS Safari lo ignora para el gesto táctil. Lo que
 * funciona en todas partes es sacar el body del flujo con `position: fixed`, y entonces hay que
 * guardar el `scrollY` y devolverlo al cerrar — si no, el body fijado salta a cero y el cliente
 * vuelve a una carta rebobinada. El `right: 0` va con el `fixed` porque un body fijado sin ancho
 * declarado se encoge a su contenido y la carta se estrecharía de golpe.
 *
 * **SE CUENTAN CAPAS, Y ESE CONTADOR ES TODO EL ARREGLO.** Antes cada capa guardaba los estilos
 * que encontrara y los reponía al cerrarse. Con una capa montada encima de otra, la de arriba
 * guardaba el `position: fixed` de la de abajo **como si fuera el estado limpio**, y al soltarse lo
 * volvía a escribir. A partir de ahí la página quedaba muerta: sin scroll, con el contenido
 * cortado y la foto del local a la vista donde el body ya no llegaba. Y no se arreglaba navegando,
 * porque estos estilos viven en el DOM y sobreviven al router de Next — solo recargando.
 *
 * Pasó de verdad: vaciar el carrito desmontaba la hoja sin cerrarla (`CartBar` la escondía con un
 * `return null`), así que al añadir otro producto la hoja se montaba sola **encima de la ficha**,
 * que ya tenía su candado puesto. Al llegar al checkout, la hoja se desmontaba y reponía el
 * `fixed`. Con un contador eso es imposible por construcción: solo la primera capa guarda y solo
 * la última repone, sin importar el orden ni cuántas se intercalen.
 *
 * Puro y probado: recibe la página como parámetro en vez de tocar `document`, porque Vitest corre
 * en `environment: "node"` y aquí no hay DOM — mismo criterio que `leerGuardado(crudo, ahora)` en
 * `tipo-pedido.ts`.
 */

/** Las cinco propiedades que toca el candado. En el navegador es `document.body.style`. */
export type EstiloPagina = {
  position: string;
  top: string;
  left: string;
  right: string;
  overflow: string;
};

export type Pagina = {
  estilo: EstiloPagina;
  /** Dónde está el scroll. En el navegador, `window.scrollY`. */
  desplazamiento: () => number;
  /** Devolver el scroll a un punto. En el navegador, `window.scrollTo`. */
  irA: (destino: number) => void;
};

const CLAVES = ["position", "top", "left", "right", "overflow"] as const;

function copiar(estilo: EstiloPagina): EstiloPagina {
  // Propiedad a propiedad y no con un spread: en el navegador esto es una `CSSStyleDeclaration`,
  // que trae cientos de claves indexadas además de las cinco que interesan.
  return {
    position: estilo.position,
    top: estilo.top,
    left: estilo.left,
    right: estilo.right,
    overflow: estilo.overflow,
  };
}

/** Cuántas capas hay abiertas ahora mismo. */
let capas = 0;
/** Cómo estaba la página antes de la primera. `null` cuando no hay ninguna abierta. */
let guardado: { estilo: EstiloPagina; desplazamiento: number } | null = null;

/** Abre una capa. Solo la primera toca la página. */
export function tomarFondo(pagina: Pagina): void {
  capas += 1;
  if (capas > 1) return;

  const desplazamiento = pagina.desplazamiento();
  guardado = { estilo: copiar(pagina.estilo), desplazamiento };

  pagina.estilo.position = "fixed";
  pagina.estilo.top = `-${desplazamiento}px`;
  pagina.estilo.left = "0";
  pagina.estilo.right = "0";
  // Redundante con el `fixed` en la práctica, pero mantiene la barra de scroll fuera en escritorio
  // en vez de dejar un carril muerto a la derecha.
  pagina.estilo.overflow = "hidden";
}

/**
 * Cierra una capa. Solo la última repone.
 *
 * Un `soltar` sin su `tomar` no hace nada: el contador no baja de cero. Dejarlo en negativo haría
 * que el siguiente `tomar` no aplicara el candado, que es cómo un error de quien llama se
 * convertiría en el bug de al lado.
 */
export function soltarFondo(pagina: Pagina): void {
  if (capas === 0) return;

  capas -= 1;
  if (capas > 0 || !guardado) return;

  for (const clave of CLAVES) pagina.estilo[clave] = guardado.estilo[clave];

  // `instant` allá arriba, en el hook: esto no es una navegación, es devolver la página donde
  // estaba. Va una sola vez, al cerrarse la última capa — un scroll por capa se vería como saltos.
  pagina.irA(guardado.desplazamiento);
  guardado = null;
}

/** Cuántas capas hay abiertas. Existe para que los tests puedan comprobar el contador. */
export function capasDeFondo(): number {
  return capas;
}

/**
 * Ata una capa al ciclo de vida de un componente: montar la abre, desmontar la cierra.
 *
 * Lo usan los cuatro modales hechos a mano —`ProductoFicha`, `CartSheet`, `Drawer` y `ui/Modal`—,
 * y que los cuatro pasen por el mismo contador es lo que les permite solaparse sin romperse. Antes
 * cada uno guardaba por su cuenta los estilos que encontraba y se los reponía al de al lado; los
 * comentarios de `Drawer` y `Modal` ya avisaban del riesgo de "dos modales anidados", solo que
 * guardar el valor previo era justo lo que lo provocaba, no lo que lo evitaba.
 */
export function useFondoQuieto(activo: boolean): void {
  useEffect(() => {
    if (!activo) return;

    const pagina: Pagina = {
      estilo: document.body.style,
      desplazamiento: () => window.scrollY,
      // `instant` y no el suave por defecto: esto no es una navegación, es devolver la página
      // exactamente donde estaba. Animarlo se vería como un salto que nadie pidió.
      irA: (destino) => window.scrollTo({ top: destino, behavior: "instant" }),
    };

    tomarFondo(pagina);

    return () => soltarFondo(pagina);
  }, [activo]);
}
