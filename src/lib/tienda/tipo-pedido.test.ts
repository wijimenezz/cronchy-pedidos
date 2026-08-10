import { describe, expect, it } from "vitest";
import { leerGuardado, VIGENCIA_MS } from "./tipo-pedido";

const AHORA = Date.UTC(2026, 7, 7, 20, 0, 0);

function guardado(valor: string, haceMs: number): string {
  return JSON.stringify({ valor, en: AHORA - haceMs });
}

describe("leerGuardado", () => {
  it("devuelve el valor mientras esté dentro de la vigencia", () => {
    expect(leerGuardado(guardado("domicilio", 5 * 60 * 60 * 1000), AHORA)).toBe("domicilio");
    expect(leerGuardado(guardado("recoger", 0), AHORA)).toBe("recoger");
  });

  it("caduca justo al cumplirse la vigencia", () => {
    expect(leerGuardado(guardado("domicilio", VIGENCIA_MS - 1), AHORA)).toBe("domicilio");
    expect(leerGuardado(guardado("domicilio", VIGENCIA_MS), AHORA)).toBeNull();
  });

  it("el pedido de hace dos días ya no cuenta — es el error que motivó la caducidad", () => {
    expect(leerGuardado(guardado("recoger", 48 * 60 * 60 * 1000), AHORA)).toBeNull();
  });

  // El formato anterior guardaba la cadena pelada, que no es JSON válido. Se trata como caducado
  // a propósito: quien ya tenía una respuesta guardada vuelve a responder una vez.
  it("el formato viejo (cadena pelada) se lee como caducado", () => {
    expect(leerGuardado("domicilio", AHORA)).toBeNull();
    expect(leerGuardado("recoger", AHORA)).toBeNull();
  });

  it("no hay nada guardado", () => {
    expect(leerGuardado(null, AHORA)).toBeNull();
    expect(leerGuardado("", AHORA)).toBeNull();
  });

  it("ignora lo que no es un tipo de pedido conocido", () => {
    expect(leerGuardado(guardado("pickup", 0), AHORA)).toBeNull();
    expect(leerGuardado(JSON.stringify({ valor: "domicilio" }), AHORA)).toBeNull();
    expect(leerGuardado(JSON.stringify({ valor: "domicilio", en: "ayer" }), AHORA)).toBeNull();
    expect(leerGuardado(JSON.stringify("domicilio"), AHORA)).toBeNull();
    expect(leerGuardado("{roto", AHORA)).toBeNull();
  });

  // Preguntar de más por un reloj torcido es peor que fiarse de él.
  it("una marca de tiempo en el futuro se acepta", () => {
    expect(leerGuardado(guardado("domicilio", -24 * 60 * 60 * 1000), AHORA)).toBe("domicilio");
  });
});
