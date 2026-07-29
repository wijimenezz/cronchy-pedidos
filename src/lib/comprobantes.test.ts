import { describe, expect, it } from "vitest";
import { detectarTipoImagen, esUrlDeComprobante, rutaComprobante } from "./comprobantes";

function bytes(...valores: number[]): Uint8Array {
  return new Uint8Array(valores);
}

const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00);
// "RIFF" + 4 bytes de tamaño + "WEBP"
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50);

describe("detectarTipoImagen", () => {
  it("reconoce JPEG, PNG y WEBP por sus magic bytes", () => {
    expect(detectarTipoImagen(JPEG)).toBe("image/jpeg");
    expect(detectarTipoImagen(PNG)).toBe("image/png");
    expect(detectarTipoImagen(WEBP)).toBe("image/webp");
  });

  it("rechaza lo que no es imagen", () => {
    expect(detectarTipoImagen(bytes(0x25, 0x50, 0x44, 0x46))).toBeNull(); // %PDF
    expect(detectarTipoImagen(bytes(0x00, 0x01, 0x02, 0x03))).toBeNull();
    expect(detectarTipoImagen(bytes())).toBeNull();
  });

  it("no confunde un RIFF que no es WEBP (ej. un .wav)", () => {
    const wav = bytes(0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45);
    expect(detectarTipoImagen(wav)).toBeNull();
  });

  it("un prefijo demasiado corto no cuenta como imagen", () => {
    expect(detectarTipoImagen(bytes(0xff, 0xd8))).toBeNull();
    expect(detectarTipoImagen(bytes(0x89, 0x50, 0x4e))).toBeNull();
  });
});

describe("rutaComprobante", () => {
  it("particiona por año/mes y usa la extensión del tipo real", () => {
    const ruta = rutaComprobante("image/png", new Date(Date.UTC(2026, 6, 27)));
    expect(ruta).toMatch(/^2026\/07\/[0-9a-f-]{36}\.png$/);
  });

  it("dos llamadas nunca colisionan", () => {
    expect(rutaComprobante("image/jpeg")).not.toBe(rutaComprobante("image/jpeg"));
  });
});

describe("esUrlDeComprobante", () => {
  const valida =
    "https://koipbxrmkylpucbsgmqd.supabase.co/storage/v1/object/comprobantes/2026/07/11111111-1111-4111-8111-111111111111.jpg";

  it("acepta la URL que produce nuestra propia subida", () => {
    expect(esUrlDeComprobante(valida)).toBe(true);
  });

  it("rechaza un dominio ajeno", () => {
    expect(esUrlDeComprobante("https://evil.com/storage/v1/object/comprobantes/2026/07/x.jpg")).toBe(false);
    expect(
      esUrlDeComprobante(
        "https://koipbxrmkylpucbsgmqd.supabase.co.evil.com/storage/v1/object/comprobantes/2026/07/11111111-1111-4111-8111-111111111111.jpg",
      ),
    ).toBe(false);
  });

  it("rechaza la variante /public/: el bucket es privado", () => {
    expect(esUrlDeComprobante(valida.replace("/object/", "/object/public/"))).toBe(false);
  });

  it("rechaza otro bucket y otras extensiones", () => {
    expect(esUrlDeComprobante(valida.replace("/comprobantes/", "/productos/"))).toBe(false);
    expect(esUrlDeComprobante(valida.replace(".jpg", ".svg"))).toBe(false);
  });

  it("rechaza http sin cifrar", () => {
    expect(esUrlDeComprobante(valida.replace("https://", "http://"))).toBe(false);
  });
});
