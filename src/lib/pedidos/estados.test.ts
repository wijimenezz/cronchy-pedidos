import { describe, expect, it } from "vitest";
import {
  COLUMNAS_TABLERO,
  columnaDeTablero,
  hitosDelPedido,
  indiceDeHito,
  pasosDelPedido,
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

// `aceptado` salió del recorrido (aceptar es empezar a preparar), pero sigue en el enum y
// puede haber pedidos guardados con él. Si no se leyera como `preparando`, esos pedidos se
// quedarían sin avance y la única salida del panel sería cancelarlos.
describe("pedidos guardados en el estado retirado `aceptado`", () => {
  it("avanzan como si estuvieran en preparación", () => {
    expect(siguienteEstado("aceptado", "domicilio")).toBe("en_camino");
    expect(siguienteEstado("aceptado", "recoger")).toBe("listo");
  });

  it("siguen en la columna y el hito de preparación", () => {
    expect(columnaDeTablero("aceptado", "domicilio")).toBe(1);
    expect(indiceDeHito("aceptado", "recoger")).toBe(1);
  });

  it("ya no se generan: aceptar deja el pedido en preparación", () => {
    expect(pasosDelPedido("domicilio")).not.toContain("aceptado");
    expect(siguienteEstado("nuevo", "domicilio")).toBe("preparando");
    expect(siguienteEstado("nuevo", "recoger")).toBe("preparando");
  });
});

describe("siguienteEstado", () => {
  it("recorre el camino completo de un domicilio", () => {
    expect(siguienteEstado("nuevo", "domicilio")).toBe("preparando");
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
    expect(validarCambioEstado(pedido(), "preparando")).toEqual({ ok: true });
  });

  it("rechaza saltarse pasos", () => {
    expect(validarCambioEstado(pedido(), "entregado")).toEqual({
      ok: false,
      motivo: "transicion_invalida",
    });
  });

  it("rechaza retroceder", () => {
    expect(validarCambioEstado(pedido({ estado: "en_camino" }), "preparando")).toEqual({
      ok: false,
      motivo: "transicion_invalida",
    });
  });

  it("rechaza repetir el estado en el que ya está", () => {
    expect(validarCambioEstado(pedido({ estado: "preparando" }), "preparando")).toEqual({
      ok: false,
      motivo: "transicion_invalida",
    });
  });

  // El estado retirado tampoco se puede volver a escribir: leerlo es una cosa, generarlo otra.
  it("rechaza volver a poner un pedido en `aceptado`", () => {
    expect(validarCambioEstado(pedido(), "aceptado")).toEqual({
      ok: false,
      motivo: "transicion_invalida",
    });
  });

  // Regla del PRD: sin comprobante no hay pedido Nequi que avance.
  it("no deja aceptar un pedido Nequi sin comprobante", () => {
    const nequi = pedido({ metodoPago: "nequi", tieneComprobante: false });

    expect(validarCambioEstado(nequi, "preparando")).toEqual({
      ok: false,
      motivo: "nequi_sin_comprobante",
    });
  });

  it("deja aceptarlo en cuanto sube el comprobante", () => {
    const nequi = pedido({ metodoPago: "nequi", tieneComprobante: true });

    expect(validarCambioEstado(nequi, "preparando")).toEqual({ ok: true });
  });

  it("sí deja cancelar un pedido Nequi sin comprobante", () => {
    const nequi = pedido({ metodoPago: "nequi", tieneComprobante: false });

    expect(validarCambioEstado(nequi, "cancelado")).toEqual({ ok: true });
  });

  it("un pedido en efectivo no necesita comprobante", () => {
    expect(validarCambioEstado(pedido({ metodoPago: "efectivo" }), "preparando")).toEqual({
      ok: true,
    });
  });
});

describe("hitos del seguimiento", () => {
  it("son cuatro, y el tercero y el cuarto cambian con el tipo", () => {
    expect(hitosDelPedido("domicilio").map((h) => h.etiqueta)).toEqual([
      "Recibido",
      "En preparación",
      "En camino",
      "Entregado",
    ]);
    expect(hitosDelPedido("recoger").map((h) => h.etiqueta)).toEqual([
      "Recibido",
      "En preparación",
      "Listo",
      "Recogido",
    ]);
  });

  // El caso que pidió el negocio con estas palabras: "si acepta el pedido la barra avanza a
  // cooking". Aceptar no es un hito propio — es la señal de que la cocina lo tiene.
  it("aceptar ya mueve la barra a preparación", () => {
    expect(indiceDeHito("nuevo", "domicilio")).toBe(0);
    expect(indiceDeHito("preparando", "domicilio")).toBe(1);
  });

  it("en camino y listo ocupan el mismo hito, cada uno en su tipo", () => {
    expect(indiceDeHito("en_camino", "domicilio")).toBe(2);
    expect(indiceDeHito("listo", "recoger")).toBe(2);
  });

  it("entregado llega al final en los dos tipos", () => {
    expect(indiceDeHito("entregado", "domicilio")).toBe(3);
    expect(indiceDeHito("entregado", "recoger")).toBe(3);
  });

  // Cancelar no es un punto del recorrido: es salirse. La pantalla no pinta barra.
  it("cancelado no tiene hito", () => {
    expect(indiceDeHito("cancelado", "domicilio")).toBe(-1);
    expect(indiceDeHito("cancelado", "recoger")).toBe(-1);
  });

  // La barra es un resumen de la máquina de estados, no una segunda versión de ella. Si
  // mañana aparece un estado nuevo y nadie lo mapea, este test lo caza.
  it.each(["domicilio", "recoger"] as const)("todo estado vivo de %s cae en un hito", (tipo) => {
    for (const estado of pasosDelPedido(tipo)) {
      expect(indiceDeHito(estado, tipo)).toBeGreaterThanOrEqual(0);
    }
  });

  // Y avanzar de estado nunca puede retroceder la barra: el cliente vería su pedido
  // "desprogresar", que es peor que no mostrarle nada.
  it.each(["domicilio", "recoger"] as const)("la barra nunca retrocede en %s", (tipo) => {
    const indices = pasosDelPedido(tipo).map((e) => indiceDeHito(e, tipo));

    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });
});

describe("columnas del tablero", () => {
  it("son las mismas cuatro fases que ve el cliente, con otras palabras", () => {
    expect(COLUMNAS_TABLERO).toHaveLength(hitosDelPedido("domicilio").length);
    expect(COLUMNAS_TABLERO.map((c) => c.titulo)).toEqual([
      "Sin aceptar",
      "En preparación",
      "En camino / Listos",
      "Terminados",
    ]);
  });

  it("un pedido sin aceptar abre el tablero y uno aceptado pasa a preparación", () => {
    expect(columnaDeTablero("nuevo", "domicilio")).toBe(0);
    expect(columnaDeTablero("preparando", "domicilio")).toBe(1);
  });

  it("en camino y listo son la misma columna, cada uno en su tipo", () => {
    expect(columnaDeTablero("en_camino", "domicilio")).toBe(2);
    expect(columnaDeTablero("listo", "recoger")).toBe(2);
  });

  // La única diferencia con `indiceDeHito`: para el cliente cancelar es salirse del recorrido
  // y no pinta barra; para la cocina es un pedido que ya no toca, o sea Terminados.
  it("cancelado va a Terminados y no se queda sin columna", () => {
    expect(indiceDeHito("cancelado", "domicilio")).toBe(-1);
    expect(columnaDeTablero("cancelado", "domicilio")).toBe(3);
    expect(columnaDeTablero("entregado", "domicilio")).toBe(3);
  });

  // En el tablero no puede haber pedidos sin sitio: uno que no cayera en ninguna columna
  // desaparecería de la pantalla con la que se opera el local.
  it.each(["domicilio", "recoger"] as const)("ningún estado de %s se queda fuera", (tipo) => {
    const estados = [...pasosDelPedido(tipo), "cancelado"] as const;

    for (const estado of estados) {
      const columna = columnaDeTablero(estado, tipo);
      expect(columna).toBeGreaterThanOrEqual(0);
      expect(columna).toBeLessThan(COLUMNAS_TABLERO.length);
    }
  });
});
