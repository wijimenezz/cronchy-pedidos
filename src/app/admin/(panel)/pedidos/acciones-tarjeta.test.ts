import { describe, expect, it } from "vitest";
import type { EstadoPedido, TipoPedido } from "@/lib/notificaciones/plantillas";
import { siguienteEstado } from "@/lib/pedidos/estados";
import { accionesDeTarjeta } from "./acciones-tarjeta";

/**
 * El siguiente paso lo calcula el servidor, así que aquí se calcula igual en vez de escribirlo a
 * mano: un test que fije "de preparando se pasa a en_camino" con una constante seguiría pasando
 * el día que cambie el recorrido, mintiendo sobre lo que pinta la tarjeta.
 */
function acciones(estado: EstadoPedido, tipo: TipoPedido, avisoPendiente = false) {
  return accionesDeTarjeta({
    estado,
    tipo,
    siguiente: siguienteEstado(estado, tipo),
    avisoPendiente,
  });
}

describe("accionesDeTarjeta", () => {
  describe("un pedido a domicilio, columna por columna", () => {
    it("sin aceptar: la impresora saca la comanda de una, sin preguntar", () => {
      expect(acciones("nuevo", "domicilio")).toMatchObject({
        imprimir: "comanda",
        asignar: false,
        avanzar: "preparando",
      });
    });

    it("en preparación: se llama al domiciliario, y la impresora ya ofrece los dos tickets", () => {
      expect(acciones("preparando", "domicilio")).toMatchObject({
        imprimir: "menu",
        asignar: true,
        avanzar: "en_camino",
      });
    });

    it("en camino: sigue pudiendo reasignarse", () => {
      expect(acciones("en_camino", "domicilio")).toMatchObject({
        imprimir: "menu",
        asignar: true,
        avanzar: "entregado",
      });
    });

    it("entregado: no queda nada por hacer", () => {
      expect(acciones("entregado", "domicilio")).toMatchObject({
        imprimir: null,
        asignar: false,
        avanzar: null,
      });
    });

    it("cancelado: tampoco, aunque nunca llegara a la cocina", () => {
      expect(acciones("cancelado", "domicilio")).toMatchObject({
        imprimir: null,
        asignar: false,
        avanzar: null,
      });
    });
  });

  // EL CASO QUE IMPORTA. El botón es un icono de bici sin texto: en un pedido para recoger no
  // significa nada y quien lo pulse llama a un domiciliario para un pedido que nadie va a llevar.
  it("un pedido para recoger NUNCA ofrece asignar, en ningún estado", () => {
    const estados: EstadoPedido[] = ["nuevo", "preparando", "listo", "entregado", "cancelado"];

    for (const estado of estados) {
      expect(acciones(estado, "recoger").asignar).toBe(false);
    }
  });

  // `aceptado` salió del recorrido pero hay historial escrito con él, y todo el módulo de estados
  // lo lee como `preparando`. Si aquí no se leyera igual, ese pedido se quedaría sin el botón de
  // llamar al domiciliario y nadie sabría por qué.
  it("un pedido guardado en `aceptado` se opera como uno en preparación", () => {
    expect(acciones("aceptado", "domicilio")).toMatchObject({
      imprimir: "menu",
      asignar: true,
      avanzar: "en_camino",
    });
  });

  it("un pedido para recoger listo se entrega, sin bici", () => {
    expect(acciones("listo", "recoger")).toMatchObject({
      imprimir: "menu",
      asignar: false,
      avanzar: "entregado",
    });
  });

  // La comanda es la del primer toque y por eso no pregunta: en la columna de sin aceptar solo
  // puede querer decir una cosa. En cuanto la cocina tiene el pedido, el recibo también es una
  // respuesta razonable, y ahí un icono que decide solo elegiría mal la mitad de las veces.
  describe("qué ofrece la impresora", () => {
    it("sin aceptar imprime la comanda de una", () => {
      expect(acciones("nuevo", "domicilio").imprimir).toBe("comanda");
      expect(acciones("nuevo", "recoger").imprimir).toBe("comanda");
    });

    it("desde que la cocina lo tiene, pregunta cuál de los dos", () => {
      for (const estado of ["aceptado", "preparando", "en_camino", "listo"] as const) {
        expect(acciones(estado, "domicilio").imprimir).toBe("menu");
      }
    });

    it("un pedido terminado no ofrece nada; para eso está el detalle", () => {
      expect(acciones("entregado", "domicilio").imprimir).toBeNull();
      expect(acciones("cancelado", "domicilio").imprimir).toBeNull();
    });
  });

  describe("el aviso pendiente", () => {
    it("sale cuando el servidor dice que quedó uno por mandar", () => {
      expect(acciones("preparando", "domicilio", true).avisar).toBe(true);
    });

    // Un pedido terminado no tiene nada que avanzar, pero sí puede arrastrar un aviso que el
    // navegador bloqueó. Es la única acción que sobrevive a la última columna.
    it("es lo único que le queda a un pedido ya entregado", () => {
      expect(acciones("entregado", "domicilio", true)).toEqual({
        imprimir: null,
        asignar: false,
        avisar: true,
        avanzar: null,
      });
    });

    // `avisoPendiente` ya llega con `aceptaAvisos` aplicado desde `panel.ts`: aquí no se vuelve a
    // decidir, se traslada. Duplicar esa regla sería tener dos sitios donde se puede olvidar.
    it("no se inventa uno cuando el servidor dice que no", () => {
      expect(acciones("preparando", "domicilio", false).avisar).toBe(false);
    });
  });
});
