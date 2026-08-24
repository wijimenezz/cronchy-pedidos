import { describe, expect, it } from "vitest";
import { ESQUEMA_IMPRESION, enlaceImpresion } from "./enlace";

describe("enlaceImpresion", () => {
  it("apunta al host que la app de impresión declara en su manifest", () => {
    const url = enlaceImpresion(Uint8Array.from([0x1b, 0x40]));

    expect(url.startsWith(`${ESQUEMA_IMPRESION}://raw?`)).toBe(true);
  });

  // Sin versión, cambiar el formato obligaría a actualizar el APK de todos los aparatos a la
  // vez. Con ella, uno viejo puede decir que no entiende en vez de imprimir basura.
  it("declara la versión del formato", () => {
    expect(enlaceImpresion(Uint8Array.from([0x00]))).toContain("v=1");
  });

  // base64 normal usa `+`, `/` y `=`, que en un query string hay que escapar — y `+` se lee
  // como espacio. Escaparlos triplicaría esos bytes en la URL.
  it("el payload no lleva ningún carácter que haya que escapar en una URL", () => {
    const todosLosBytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    const url = enlaceImpresion(todosLosBytes);
    const d = new URL(url).searchParams.get("d") ?? "";

    expect(d).not.toMatch(/[+/=]/);
    expect(d).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(url).toBe(encodeURI(url));
  });

  it("los bytes llegan enteros al otro lado", () => {
    const original = Uint8Array.from([0x1b, 0x40, 0xa0, 0xff, 0x00, 0x0a]);
    const d = new URL(enlaceImpresion(original)).searchParams.get("d") ?? "";

    expect(Uint8Array.from(Buffer.from(d, "base64url"))).toEqual(original);
  });

  it("un ticket vacío sigue siendo una URL válida", () => {
    expect(() => new URL(enlaceImpresion(Uint8Array.from([])))).not.toThrow();
  });
});
