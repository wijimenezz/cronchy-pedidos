import { describe, expect, it } from "vitest";
import { sePuedePedir, type OpcionesEntrega } from "./entrega";

/**
 * Los cuatro estados en los que puede quedar la oferta de entrega, que son toda la regla.
 *
 * Lo que se protege aquí es el bug del que nació la función: la subida del comprobante
 * preguntaba "¿está abierta?" en vez de "¿se puede pedir?", así que de noche devolvía 409 y un
 * pedido programado se podía pagar en efectivo pero no por Nequi —el esquema exige el
 * comprobante—, dejando el checkout sin salida. Si alguien vuelve a colapsar las dos preguntas
 * en una, el tercer caso se pone rojo.
 *
 * No toca base de datos: `sePuedePedir` es pura sobre el tipo, y quien lo consulta de verdad es
 * `opcionesDeEntrega`. Mismo trato que `franjas.ts` y `pago.ts`.
 */

const FRANJA = { instante: new Date("2026-08-20T12:00:00Z"), etiqueta: "7:00 am" };

const MANANA = { dia: "manana" as const, fecha: "2026-08-20", franjas: [FRANJA] };

function opciones(parcial: Partial<OpcionesEntrega> = {}): OpcionesEntrega {
  return { pronto: null, dias: [], mensajeCerrado: null, ...parcial };
}

describe("sePuedePedir", () => {
  it("abierta ahora: se puede pedir para ya", () => {
    expect(sePuedePedir(opciones({ pronto: { min: 30, max: 45 } }))).toBe(true);
  });

  // El caso que motivó todo. Cerrada no significa que no se pueda pedir: significa que no se
  // puede pedir "para ya", y programar existe justamente para eso (regla 16).
  it("cerrada pero con franjas: se puede programar", () => {
    expect(
      sePuedePedir(opciones({ dias: [MANANA], mensajeCerrado: "Abrimos mañana a las 7:00 am" })),
    ).toBe(true);
  });

  it("abierta y además con franjas: se puede igual", () => {
    expect(sePuedePedir(opciones({ pronto: { min: 30, max: 45 }, dias: [MANANA] }))).toBe(true);
  });

  // El único que cierra la puerta, y el que demuestra que esto sigue siendo un guardia: es lo
  // que devuelve `opcionesDeEntrega` con `store.acepta_pedidos` apagado —el botón de pánico
  // gana sobre todo— y con una tienda sin horario ni hoy ni mañana.
  it("sin nada que ofrecer: no se puede pedir", () => {
    expect(
      sePuedePedir(opciones({ mensajeCerrado: "En este momento no estamos aceptando pedidos." })),
    ).toBe(false);
  });
});
