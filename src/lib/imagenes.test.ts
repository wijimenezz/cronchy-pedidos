import { describe, expect, it } from "vitest";
import { esUrlDeFotoProducto } from "@/lib/imagenes";

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
