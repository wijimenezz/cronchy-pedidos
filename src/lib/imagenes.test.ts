import { describe, expect, it } from "vitest";
import {
  esFoco,
  esUrlDeFotoProducto,
  FOCO_CENTRO,
  FOCOS,
  focoDeFoto,
  fotosConFoco,
} from "@/lib/imagenes";

/**
 * El filtro que decide qué URL puede acabar guardada en una columna.
 *
 * Importa más de lo que parece: las URLs llegan desde el navegador —las manda el panel tras
 * subir— y sin este corte un admin podría escribir el dominio de un tercero, con lo que la
 * carta pública terminaría cargando imágenes ajenas (o un pixel de rastreo) desde un host que
 * `next.config.ts` ni siquiera tiene permitido. Es también lo que protege `/api/qr-pago` de
 * convertirse en un proxy de descargas.
 */

const BASE = "https://proyecto.supabase.co/storage/v1/object/public/productos";
const UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTRO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("esUrlDeFotoProducto", () => {
  it("acepta las tres carpetas del bucket público", () => {
    expect(esUrlDeFotoProducto(`${BASE}/${UUID}/${OTRO}.webp`)).toBe(true);
    expect(esUrlDeFotoProducto(`${BASE}/categorias/${UUID}/${OTRO}.webp`)).toBe(true);
    // El QR de pago, que además puede venir en jpg o png porque no se recomprime.
    expect(esUrlDeFotoProducto(`${BASE}/tienda/${UUID}/${OTRO}.jpg`)).toBe(true);
    expect(esUrlDeFotoProducto(`${BASE}/tienda/${UUID}/${OTRO}.png`)).toBe(true);
  });

  it("rechaza otro dominio, aunque imite la ruta", () => {
    expect(
      esUrlDeFotoProducto(
        `https://malo.example.com/storage/v1/object/public/productos/${UUID}/${OTRO}.webp`,
      ),
    ).toBe(false);
  });

  it("rechaza el bucket privado de comprobantes", () => {
    // Son datos personales tras un proxy autenticado; nada de aquí puede colarse como foto.
    expect(
      esUrlDeFotoProducto(
        `https://proyecto.supabase.co/storage/v1/object/comprobantes/2026/07/${UUID}.jpg`,
      ),
    ).toBe(false);
  });

  it("rechaza una carpeta que no es ninguna de las tres", () => {
    expect(esUrlDeFotoProducto(`${BASE}/otra/${UUID}/${OTRO}.webp`)).toBe(false);
  });

  it("rechaza extensiones que no son imagen", () => {
    expect(esUrlDeFotoProducto(`${BASE}/tienda/${UUID}/${OTRO}.svg`)).toBe(false);
  });

  it("rechaza lo que lleve algo pegado detrás", () => {
    // El patrón está anclado: sin el `$`, un `?redirect=` o una ruta extra pasarían.
    expect(esUrlDeFotoProducto(`${BASE}/tienda/${UUID}/${OTRO}.jpg?x=1`)).toBe(false);
    expect(esUrlDeFotoProducto(`${BASE}/tienda/${UUID}/${OTRO}.jpg/../secreto`)).toBe(false);
  });
});

/**
 * El foco decide qué parte de la foto sobrevive al recorte de `object-cover`. Es puro y va a
 * parar a un atributo `style`, así que lo que importa es que nada que no sea una de las nueve
 * posiciones llegue hasta ahí.
 */
describe("focoDeFoto", () => {
  it("devuelve el foco elegido para esa foto", () => {
    expect(focoDeFoto(["50% 0%", "100% 100%"], 1)).toBe("100% 100%");
  });

  // La columna nace vacía y nadie rellenó las fotos que ya estaban: el hueco ES el modelo.
  it("un array más corto que las fotos cae al centro sin reventar", () => {
    expect(focoDeFoto(["50% 0%"], 2)).toBe(FOCO_CENTRO);
    expect(focoDeFoto([], 0)).toBe(FOCO_CENTRO);
    expect(focoDeFoto(undefined, 0)).toBe(FOCO_CENTRO);
  });

  // Esto sale de la base, no de un `<select>`: si alguien escribió a mano por SQL, no puede
  // colarse en el `style` de la carta pública.
  it("una cadena que no es de la rejilla cae al centro", () => {
    expect(focoDeFoto(["arriba del todo"], 0)).toBe(FOCO_CENTRO);
    expect(focoDeFoto(["49% 3%"], 0)).toBe(FOCO_CENTRO);
    expect(focoDeFoto([""], 0)).toBe(FOCO_CENTRO);
  });

  it("las nueve posiciones se aceptan tal cual", () => {
    for (const foco of FOCOS) {
      expect(focoDeFoto([foco], 0)).toBe(foco);
      expect(esFoco(foco)).toBe(true);
    }
  });

  // El centro tiene que ser una de las nueve, o elegirlo en la rejilla no lo marcaría.
  it("el centro pertenece a la rejilla", () => {
    expect(FOCOS).toContain(FOCO_CENTRO);
    expect(FOCOS).toHaveLength(9);
  });
});

describe("fotosConFoco", () => {
  it("empareja cada foto con su encuadre", () => {
    expect(fotosConFoco(["a", "b"], ["50% 0%", "100% 100%"])).toEqual([
      { url: "a", foco: "50% 0%" },
      { url: "b", foco: "100% 100%" },
    ]);
  });

  /**
   * El caso que motiva la función: filtrar solo `imagenes` correría los índices y el foco de la
   * segunda foto acabaría aplicado a la primera. Se ve bien —es una foto— pero recortada por
   * donde no era, que es de los bugs que nadie mira.
   */
  it("un hueco se lleva su foco con él, sin descolocar al resto", () => {
    expect(fotosConFoco(["", "b"], [FOCO_CENTRO, "100% 0%"])).toEqual([
      { url: "b", foco: "100% 0%" },
    ]);
  });

  it("sin focos guardados, todas al centro", () => {
    expect(fotosConFoco(["a", "b"], [])).toEqual([
      { url: "a", foco: FOCO_CENTRO },
      { url: "b", foco: FOCO_CENTRO },
    ]);
  });

  it("sin fotos no hay nada que emparejar", () => {
    expect(fotosConFoco([], [])).toEqual([]);
  });
});
