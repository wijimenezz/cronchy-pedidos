import { describe, expect, it } from "vitest";
import {
  cuentaParaPromedio,
  duracionCorta,
  minutosDeEntrega,
  minutosEntre,
  promedioDeEntrega,
  type PedidoMedible,
} from "./tiempos";

const BASE: PedidoMedible = {
  tipo: "domicilio",
  creadoEn: new Date("2025-12-09T20:00:00Z"),
  entregadoEn: new Date("2025-12-09T20:40:00Z"),
  programadoPara: null,
};

const pedido = (parcial: Partial<PedidoMedible> = {}): PedidoMedible => ({ ...BASE, ...parcial });

describe("duracionCorta", () => {
  it("bajo la hora dice los minutos", () => {
    expect(duracionCorta(8)).toBe("8 min");
    expect(duracionCorta(59)).toBe("59 min");
  });

  it("pasada la hora parte en horas y resto", () => {
    expect(duracionCorta(60)).toBe("1 h");
    expect(duracionCorta(95)).toBe("1 h 35");
    expect(duracionCorta(120)).toBe("2 h");
  });
});

describe("minutosEntre", () => {
  it("redondea hacia abajo", () => {
    const desde = new Date("2025-12-09T20:00:00Z");
    // 36 minutos y 59 segundos siguen siendo 36: el pedido no ha cumplido el minuto 37.
    expect(minutosEntre(desde, new Date("2025-12-09T20:36:59Z"))).toBe(36);
  });

  // Los dos instantes salen del mismo `now()` de Postgres, pero una fila corregida a mano en la
  // base no puede pintar un "-3 min" que se lea como que el panel está roto.
  it("nunca es negativo", () => {
    const desde = new Date("2025-12-09T20:00:00Z");
    expect(minutosEntre(desde, new Date("2025-12-09T19:00:00Z"))).toBe(0);
  });
});

describe("minutosDeEntrega", () => {
  it("mide desde que entró hasta que se entregó", () => {
    expect(minutosDeEntrega(pedido())).toBe(40);
  });

  it("es null mientras no se ha entregado", () => {
    expect(minutosDeEntrega(pedido({ entregadoEn: null }))).toBeNull();
  });
});

describe("cuentaParaPromedio", () => {
  it("cuenta un pedido entregado normal", () => {
    expect(cuentaParaPromedio(pedido())).toBe(true);
  });

  it("no cuenta lo que no se ha entregado", () => {
    expect(cuentaParaPromedio(pedido({ entregadoEn: null }))).toBe(false);
  });

  // Un pedido tomado anoche para hoy a las 2 pm da horas de "espera" que no midió nadie.
  it("no cuenta un programado, aunque se haya entregado", () => {
    expect(
      cuentaParaPromedio(pedido({ programadoPara: new Date("2025-12-10T19:00:00Z") })),
    ).toBe(false);
  });
});

describe("promedioDeEntrega", () => {
  it("promedia solo lo entregado y no programado", () => {
    const r = promedioDeEntrega([
      pedido(), // 40 min
      pedido({ entregadoEn: new Date("2025-12-09T20:20:00Z") }), // 20 min
      pedido({ entregadoEn: null }), // sin entregar
      pedido({
        // programado con 13 horas de antelación: fuera
        programadoPara: new Date("2025-12-10T19:00:00Z"),
        entregadoEn: new Date("2025-12-10T19:05:00Z"),
      }),
    ]);

    expect(r).not.toBeNull();
    expect(r!.general).toBe(30);
    expect(r!.entregados).toBe(2);
  });

  it("separa domicilio de recoger", () => {
    const r = promedioDeEntrega([
      pedido({ tipo: "domicilio", entregadoEn: new Date("2025-12-09T20:40:00Z") }), // 40
      pedido({ tipo: "recoger", entregadoEn: new Date("2025-12-09T20:20:00Z") }), // 20
    ]);

    expect(r!.domicilio).toBe(40);
    expect(r!.recoger).toBe(20);
    expect(r!.general).toBe(30);
  });

  it("deja en null el tipo del que no hubo ninguna entrega", () => {
    const r = promedioDeEntrega([pedido({ tipo: "domicilio" })]);

    expect(r!.domicilio).toBe(40);
    expect(r!.recoger).toBeNull();
  });

  // Un "0 min" sería una cifra falsa; lo que pasa es que no hay dato.
  it("devuelve null cuando no hubo ninguna entrega que medir", () => {
    expect(promedioDeEntrega([])).toBeNull();
    expect(promedioDeEntrega([pedido({ entregadoEn: null })])).toBeNull();
  });
});
