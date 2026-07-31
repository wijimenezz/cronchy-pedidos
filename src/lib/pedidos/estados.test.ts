import { describe, expect, it } from "vitest";
import {
  siguienteEstado,
  transicionesPosibles,
  validarCambioEstado,
  type PedidoParaTransicion,
} from "./estados";

const pedido = (parcial: Partial<PedidoParaTransicion> = {}): PedidoParaTransicion => ({
  estado: "nuevo",
  tipo: "domicilio",
  metodoPago: "efectivo",
  tieneComprobante: false,
  ...parcial,
});

describe("transicionesPosibles", () => {
  it("un domicilio avanza a en_camino y uno para recoger a listo", () => {
    expect(transicionesPosibles("preparando", "domicilio")).toEqual(["en_camino", "cancelado"]);
    expect(transicionesPosibles("preparando", "recoger")).toEqual(["listo", "cancelado"]);
  });

  it("desde cualquier estado vivo se puede cancelar", () => {
    for (const estado of ["nuevo", "aceptado", "preparando", "en_camino"] as const) {
      expect(transicionesPosibles(estado, "domicilio")).toContain("cancelado");
    }
  });

  it("entregado y cancelado son terminales", () => {
    expect(transicionesPosibles("entregado", "domicilio")).toEqual([]);
    expect(transicionesPosibles("cancelado", "domicilio")).toEqual([]);
  });

  // El estado que no pertenece al recorrido de ese tipo no ofrece avance: un pedido para
  // recoger nunca debería estar "en_camino", y si lo está, solo queda cancelarlo.
  it("un estado ajeno al tipo solo deja cancelar", () => {
    expect(transicionesPosibles("en_camino", "recoger")).toEqual(["cancelado"]);
    expect(transicionesPosibles("listo", "domicilio")).toEqual(["cancelado"]);
  });
});

describe("siguienteEstado", () => {
  it("recorre el camino completo de un domicilio", () => {
    expect(siguienteEstado("nuevo", "domicilio")).toBe("aceptado");
    expect(siguienteEstado("aceptado", "domicilio")).toBe("preparando");
    expect(siguienteEstado("preparando", "domicilio")).toBe("en_camino");
    expect(siguienteEstado("en_camino", "domicilio")).toBe("entregado");
    expect(siguienteEstado("entregado", "domicilio")).toBeNull();
  });

  it("recorre el camino completo de uno para recoger", () => {
    expect(siguienteEstado("preparando", "recoger")).toBe("listo");
    expect(siguienteEstado("listo", "recoger")).toBe("entregado");
  });

  it("no propone avanzar un pedido cancelado", () => {
    expect(siguienteEstado("cancelado", "domicilio")).toBeNull();
  });
});

describe("validarCambioEstado", () => {
  it("acepta el avance de a un paso", () => {
    expect(validarCambioEstado(pedido(), "aceptado")).toEqual({ ok: true });
  });

  it("rechaza saltarse pasos", () => {
    expect(validarCambioEstado(pedido(), "entregado")).toEqual({
      ok: false,
      motivo: "transicion_invalida",
    });
  });

  it("rechaza retroceder", () => {
    expect(validarCambioEstado(pedido({ estado: "preparando" }), "aceptado")).toEqual({
      ok: false,
      motivo: "transicion_invalida",
    });
  });

  it("rechaza repetir el estado en el que ya está", () => {
    expect(validarCambioEstado(pedido({ estado: "aceptado" }), "aceptado")).toEqual({
      ok: false,
      motivo: "transicion_invalida",
    });
  });

  // Regla del PRD: sin comprobante no hay pedido Nequi que avance.
  it("no deja aceptar un pedido Nequi sin comprobante", () => {
    const nequi = pedido({ metodoPago: "nequi", tieneComprobante: false });

    expect(validarCambioEstado(nequi, "aceptado")).toEqual({
      ok: false,
      motivo: "nequi_sin_comprobante",
    });
  });

  it("deja aceptarlo en cuanto sube el comprobante", () => {
    const nequi = pedido({ metodoPago: "nequi", tieneComprobante: true });

    expect(validarCambioEstado(nequi, "aceptado")).toEqual({ ok: true });
  });

  it("sí deja cancelar un pedido Nequi sin comprobante", () => {
    const nequi = pedido({ metodoPago: "nequi", tieneComprobante: false });

    expect(validarCambioEstado(nequi, "cancelado")).toEqual({ ok: true });
  });

  it("un pedido en efectivo no necesita comprobante", () => {
    expect(validarCambioEstado(pedido({ metodoPago: "efectivo" }), "aceptado")).toEqual({
      ok: true,
    });
  });
});
