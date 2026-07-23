import { describe, expect, it } from "vitest";
import { ahoraEnBogota, calcularDisponibilidad, type ContextoHorario } from "./horario";

/** Construye un instante UTC que corresponde a la hora dada en Bogotá (UTC-5, sin DST) el 2026-01-01. */
function horaBogota(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 0, 1, h + 5, m, 0));
}

const base: ContextoHorario = {
  aceptaPedidos: true,
  mensajeCerrado: null,
  cierreHoy: null,
  horariosHoy: [],
};

describe("ahoraEnBogota", () => {
  it("da fecha, día de la semana y minutos correctos a mediodía", () => {
    // 2026-01-01 es jueves.
    const r = ahoraEnBogota(horaBogota("12:00"));
    expect(r).toEqual({ fecha: "2026-01-01", diaSemana: 4, minutos: 720 });
  });

  it("no confunde la fecha en Bogotá con la fecha en UTC cerca de medianoche", () => {
    // UTC 2026-01-02T02:00:00Z = Bogotá 2026-01-01T21:00 (sigue siendo el día anterior).
    const r = ahoraEnBogota(new Date("2026-01-02T02:00:00.000Z"));
    expect(r.fecha).toBe("2026-01-01");
    expect(r.diaSemana).toBe(4);
    expect(r.minutos).toBe(21 * 60);
  });
});

describe("calcularDisponibilidad", () => {
  it("aceptaPedidos=false gana aunque el horario diga que está abierto", () => {
    const ctx: ContextoHorario = {
      ...base,
      aceptaPedidos: false,
      mensajeCerrado: "Volvemos mañana",
      horariosHoy: [{ abre: "00:00:00", cierra: "23:59:00" }],
    };
    const r = calcularDisponibilidad(ctx, horaBogota("12:00"));
    expect(r).toEqual({ abierta: false, motivo: "manual", mensaje: "Volvemos mañana" });
  });

  it("store_closure de hoy cerrado con motivo", () => {
    const ctx: ContextoHorario = {
      ...base,
      cierreHoy: { cerrado: true, abre: null, cierra: null, motivo: "Festivo" },
      horariosHoy: [{ abre: "08:00:00", cierra: "20:00:00" }],
    };
    const r = calcularDisponibilidad(ctx, horaBogota("12:00"));
    expect(r).toEqual({ abierta: false, motivo: "excepcional", mensaje: "Festivo" });
  });

  it("store_closure de hoy cerrado sin motivo cae al mensajeCerrado de la tienda", () => {
    const ctx: ContextoHorario = {
      ...base,
      mensajeCerrado: "Cerrado hoy",
      cierreHoy: { cerrado: true, abre: null, cierra: null, motivo: null },
    };
    const r = calcularDisponibilidad(ctx, horaBogota("12:00"));
    expect(r).toEqual({ abierta: false, motivo: "excepcional", mensaje: "Cerrado hoy" });
  });

  it("store_closure con horario especial: dentro del rango abre", () => {
    const ctx: ContextoHorario = {
      ...base,
      cierreHoy: { cerrado: false, abre: "10:00:00", cierra: "14:00:00", motivo: null },
    };
    expect(calcularDisponibilidad(ctx, horaBogota("12:00"))).toEqual({ abierta: true });
  });

  it("store_closure con horario especial: fuera del rango cierra", () => {
    const ctx: ContextoHorario = {
      ...base,
      cierreHoy: { cerrado: false, abre: "10:00:00", cierra: "14:00:00", motivo: null },
    };
    const r = calcularDisponibilidad(ctx, horaBogota("15:00"));
    expect(r.abierta).toBe(false);
    if (!r.abierta) expect(r.motivo).toBe("fuera_de_horario");
  });

  it("día normal por store_hours, dentro de rango", () => {
    const ctx: ContextoHorario = {
      ...base,
      horariosHoy: [{ abre: "08:00:00", cierra: "20:00:00" }],
    };
    expect(calcularDisponibilidad(ctx, horaBogota("10:00"))).toEqual({ abierta: true });
  });

  it("límite exacto: la hora de apertura sí está abierta", () => {
    const ctx: ContextoHorario = { ...base, horariosHoy: [{ abre: "08:00:00", cierra: "20:00:00" }] };
    expect(calcularDisponibilidad(ctx, horaBogota("08:00"))).toEqual({ abierta: true });
  });

  it("límite exacto: la hora de cierre ya está cerrada", () => {
    const ctx: ContextoHorario = { ...base, horariosHoy: [{ abre: "08:00:00", cierra: "20:00:00" }] };
    const r = calcularDisponibilidad(ctx, horaBogota("20:00"));
    expect(r.abierta).toBe(false);
    if (!r.abierta) expect(r.motivo).toBe("fuera_de_horario");
  });

  it("sin store_closure y sin store_hours para hoy", () => {
    const r = calcularDisponibilidad(base, horaBogota("12:00"));
    expect(r.abierta).toBe(false);
    if (!r.abierta) expect(r.motivo).toBe("sin_horario");
  });

  it("turno partido: cerrado entre los dos rangos", () => {
    const ctx: ContextoHorario = {
      ...base,
      horariosHoy: [
        { abre: "08:00:00", cierra: "12:00:00" },
        { abre: "14:00:00", cierra: "20:00:00" },
      ],
    };
    const r = calcularDisponibilidad(ctx, horaBogota("13:00"));
    expect(r.abierta).toBe(false);
    if (!r.abierta) expect(r.motivo).toBe("fuera_de_horario");
  });

  it("turno partido: abierto en el segundo rango", () => {
    const ctx: ContextoHorario = {
      ...base,
      horariosHoy: [
        { abre: "08:00:00", cierra: "12:00:00" },
        { abre: "14:00:00", cierra: "20:00:00" },
      ],
    };
    expect(calcularDisponibilidad(ctx, horaBogota("15:00"))).toEqual({ abierta: true });
  });
});
