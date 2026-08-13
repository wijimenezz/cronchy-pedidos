import { describe, expect, it } from "vitest";
import { esMetodoOfrecido, metodosDePago } from "./pago";

/**
 * Las cuatro combinaciones, que son toda la regla. Lo que se protege aquí es que nadie
 * "simplifique" la función y se lleve por delante el respaldo: sin llave configurada, recoger
 * tiene que seguir aceptando efectivo o el checkout se queda sin ninguna forma de pagar.
 */

const CON_LLAVE = { llaveDisponible: true };
const SIN_LLAVE = { llaveDisponible: false };

describe("metodosDePago", () => {
  it("recoger se paga por adelantado: no ofrece efectivo", () => {
    expect(metodosDePago("recoger", CON_LLAVE)).toEqual(["nequi"]);
  });

  it("recoger sin llave cae al efectivo, porque no hay con qué cobrar antes", () => {
    // El respaldo. Un checkout sin métodos de pago no protege nada: pierde el pedido.
    expect(metodosDePago("recoger", SIN_LLAVE)).toEqual(["efectivo"]);
  });

  it("domicilio ofrece los dos", () => {
    expect(metodosDePago("domicilio", CON_LLAVE)).toEqual(["efectivo", "nequi"]);
  });

  it("domicilio sin llave se queda solo con efectivo", () => {
    expect(metodosDePago("domicilio", SIN_LLAVE)).toEqual(["efectivo"]);
  });

  it("nunca devuelve una lista vacía", () => {
    // Es la invariante que sostiene al checkout: siempre hay algo que ofrecer.
    for (const tipo of ["domicilio", "recoger"] as const) {
      for (const opciones of [CON_LLAVE, SIN_LLAVE]) {
        expect(metodosDePago(tipo, opciones).length).toBeGreaterThan(0);
      }
    }
  });
});

describe("esMetodoOfrecido", () => {
  it("rechaza el efectivo en recoger, que es lo que decide el servidor", () => {
    expect(esMetodoOfrecido("efectivo", "recoger", CON_LLAVE)).toBe(false);
    expect(esMetodoOfrecido("nequi", "recoger", CON_LLAVE)).toBe(true);
  });

  it("acepta el efectivo en recoger cuando es el respaldo", () => {
    expect(esMetodoOfrecido("efectivo", "recoger", SIN_LLAVE)).toBe(true);
  });

  it("no acepta nequi sin llave: no habría a dónde pagar", () => {
    expect(esMetodoOfrecido("nequi", "domicilio", SIN_LLAVE)).toBe(false);
    expect(esMetodoOfrecido("nequi", "recoger", SIN_LLAVE)).toBe(false);
  });

  it("rechaza los métodos del enum que el checkout no ofrece", () => {
    // `metodo_pago` en la base tiene cuatro valores porque el XLSX cuadra caja por método,
    // no porque se puedan pedir: llegar con uno de esos es un payload armado a mano.
    for (const metodo of ["transferencia", "datafono", "", "NEQUI"]) {
      expect(esMetodoOfrecido(metodo, "domicilio", CON_LLAVE)).toBe(false);
    }
  });

  it("coincide con metodosDePago en las cuatro combinaciones", () => {
    for (const tipo of ["domicilio", "recoger"] as const) {
      for (const opciones of [CON_LLAVE, SIN_LLAVE]) {
        for (const metodo of ["efectivo", "nequi"] as const) {
          expect(esMetodoOfrecido(metodo, tipo, opciones)).toBe(
            metodosDePago(tipo, opciones).includes(metodo),
          );
        }
      }
    }
  });
});
