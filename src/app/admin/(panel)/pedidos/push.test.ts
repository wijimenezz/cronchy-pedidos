import { describe, expect, it } from "vitest";
import { base64UrlABytes } from "./push";

/** Vitest corre en Node, donde `atob` es global desde la 16. */
function aBase64Url(bytes: number[]): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

describe("base64UrlABytes", () => {
  it("devuelve los bytes originales", () => {
    const bytes = [0, 1, 127, 128, 255, 42];

    expect([...base64UrlABytes(aBase64Url(bytes))]).toEqual(bytes);
  });

  // Lo que distingue base64url de base64: sin relleno, y con - _ en vez de + /.
  it("repone el relleno que base64url quita", () => {
    // 1, 2 y 3 bytes cubren los tres restos posibles al dividir entre 4.
    for (const bytes of [[1], [1, 2], [1, 2, 3]]) {
      const codificado = aBase64Url(bytes);
      expect(codificado).not.toContain("=");
      expect([...base64UrlABytes(codificado)]).toEqual(bytes);
    }
  });

  it("traduce los caracteres propios de base64url", () => {
    // 0xFB 0xFF produce "+/" en base64 y "-_" en base64url.
    const bytes = [0xfb, 0xff, 0xbf];
    const codificado = aBase64Url(bytes);

    expect(codificado).toMatch(/[-_]/);
    expect([...base64UrlABytes(codificado)]).toEqual(bytes);
  });

  // Una llave VAPID real son 65 bytes: 0x04 y dos coordenadas de 32.
  it("aguanta una llave del tamaño de una VAPID", () => {
    const bytes = [0x04, ...Array.from({ length: 64 }, (_, i) => i * 3 % 256)];

    expect(base64UrlABytes(aBase64Url(bytes))).toHaveLength(65);
  });

  it("una cadena vacía no revienta", () => {
    expect(base64UrlABytes("")).toHaveLength(0);
  });
});
