import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EstiloPagina, Pagina } from "./fondo-quieto";

/**
 * El módulo lleva la cuenta de capas en una variable de módulo, así que cada prueba necesita el
 * suyo. Se reimporta limpio en vez de exponer un `reiniciar()` que solo existiría para los tests.
 */
let tomarFondo: (pagina: Pagina) => void;
let soltarFondo: (pagina: Pagina) => void;
let capasDeFondo: () => number;

beforeEach(async () => {
  vi.resetModules();
  ({ tomarFondo, soltarFondo, capasDeFondo } = await import("./fondo-quieto"));
});

const LIMPIO: EstiloPagina = {
  position: "",
  top: "",
  left: "",
  right: "",
  overflow: "",
};

/**
 * Una página de mentira que imita **la trampa del navegador**: con el body fijado, `window.scrollY`
 * vale 0. Es justo lo que hacía que una segunda capa guardara un desplazamiento equivocado y
 * rebobinara la carta al cerrar.
 */
function paginaFalsa(desplazamientoInicial = 0) {
  const estilo: EstiloPagina = { ...LIMPIO };
  let y = desplazamientoInicial;
  const idas: number[] = [];

  const pagina: Pagina = {
    estilo,
    desplazamiento: () => (estilo.position === "fixed" ? 0 : y),
    irA: (destino) => {
      y = destino;
      idas.push(destino);
    },
  };

  return { pagina, estilo, idas, dondeEsta: () => y };
}

describe("una sola capa", () => {
  it("fija la página y guarda dónde estaba", () => {
    const { pagina, estilo } = paginaFalsa(500);

    tomarFondo(pagina);

    expect(estilo.position).toBe("fixed");
    expect(estilo.top).toBe("-500px");
    // Sin ancho declarado, un body fijado se encoge a su contenido y la carta se estrecha de golpe.
    expect(estilo.left).toBe("0");
    expect(estilo.right).toBe("0");
  });

  it("al soltar, la deja como estaba y la devuelve a su sitio", () => {
    const { pagina, estilo, dondeEsta } = paginaFalsa(500);

    tomarFondo(pagina);
    soltarFondo(pagina);

    expect(estilo).toEqual(LIMPIO);
    expect(dondeEsta()).toBe(500);
  });
});

describe("dos capas solapadas", () => {
  /**
   * **LA REGRESIÓN.**
   *
   * El candado guardaba los valores que encontrara y los reponía al cerrar. Con una capa montada
   * encima de otra, la de arriba guardaba el `position: fixed` de la de abajo como si fuera el
   * estado limpio — y al soltarse lo volvía a escribir. Nadie lo quitaba ya: ni cerrando, ni
   * navegando, porque esos estilos viven en el DOM y sobreviven a la navegación de Next.
   *
   * Pasaba de verdad: vaciar el carrito desmontaba la hoja sin cerrarla, así que al añadir otro
   * producto la hoja se montaba sola **encima de la ficha**, que ya tenía su candado puesto.
   */
  it("da igual cómo se intercalen: cerrada la última capa, la página queda limpia", () => {
    const { pagina, estilo } = paginaFalsa(500);

    // Abrir y cerrar entremezclado, como pasa de verdad: ficha, hoja encima, se va la ficha,
    // vuelve a abrirse algo, y al final no queda nada.
    tomarFondo(pagina);
    tomarFondo(pagina);
    soltarFondo(pagina);
    tomarFondo(pagina);
    soltarFondo(pagina);
    expect(estilo.position, "con una capa viva sigue fija").toBe("fixed");

    soltarFondo(pagina);

    expect(estilo).toEqual(LIMPIO);
    expect(capasDeFondo()).toBe(0);
  });

  it("mientras quede una capa abierta, la página sigue fija", () => {
    const { pagina, estilo } = paginaFalsa(500);

    tomarFondo(pagina);
    tomarFondo(pagina);
    soltarFondo(pagina);

    expect(estilo.position).toBe("fixed");
    expect(capasDeFondo()).toBe(1);
  });

  // Con el body ya fijado el navegador reporta `scrollY` 0, así que la segunda capa guardaba un
  // cero y al cerrar devolvía al cliente al principio de la carta, perdiendo dónde miraba.
  it("la segunda capa no pisa el desplazamiento guardado por la primera", () => {
    const { pagina, idas, dondeEsta } = paginaFalsa(500);

    tomarFondo(pagina);
    tomarFondo(pagina);
    soltarFondo(pagina);
    soltarFondo(pagina);

    expect(dondeEsta()).toBe(500);
    // Y se devuelve UNA vez, al cerrarse la última: un scroll por capa se vería como un salto.
    expect(idas).toEqual([500]);
  });
});

describe("soltar de más", () => {
  // Un `soltar` sin su `tomar` es un error de quien llama, pero la respuesta no puede ser dejar la
  // carta fijada ni contar capas negativas — eso haría que el siguiente `tomar` no aplicara nada.
  it("no deja el contador en negativo ni repone dos veces", () => {
    const { pagina, estilo, idas } = paginaFalsa(300);

    soltarFondo(pagina);
    expect(capasDeFondo()).toBe(0);
    expect(idas).toEqual([]);

    tomarFondo(pagina);
    soltarFondo(pagina);
    soltarFondo(pagina);

    expect(capasDeFondo()).toBe(0);
    expect(estilo).toEqual(LIMPIO);
    expect(idas).toEqual([300]);
  });
});

describe("lo que había antes se respeta", () => {
  // La página puede traer estilos propios; el candado no es dueño del body.
  it("repone el valor previo en vez de vaciarlo", () => {
    const { pagina, estilo } = paginaFalsa(0);
    estilo.overflow = "auto";

    tomarFondo(pagina);
    expect(estilo.overflow).toBe("hidden");

    soltarFondo(pagina);
    expect(estilo.overflow).toBe("auto");
  });
});
