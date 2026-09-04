import { describe, expect, it } from "vitest";
import { instanteEnBogota } from "@/lib/horario";
import { calcularEstadoTienda, TEXTOS, type ContextoEstado, type DiaDeHorario } from "./estado";

/**
 * Jueves 2026-01-01 y viernes 2026-01-02, los dos de 12:00 a 20:00 salvo que el test diga otra cosa.
 *
 * El instante se construye con `instanteEnBogota` —código de producción— y no a mano, igual que
 * en `horario.test.ts`: es la única conversión de hora local a instante del proyecto, así que un
 * test que la replicara podría pasar con la conversión rota.
 */
function aLas(hhmm: string, fecha = "2026-01-01"): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return instanteEnBogota(fecha, h * 60 + m);
}

const HOY: DiaDeHorario = {
  fecha: "2026-01-01",
  diaSemana: 4,
  cierre: null,
  horarios: [{ abre: "12:00:00", cierra: "20:00:00" }],
};

const MANANA: DiaDeHorario = {
  fecha: "2026-01-02",
  diaSemana: 5,
  cierre: null,
  horarios: [{ abre: "12:00:00", cierra: "20:00:00" }],
};

function contexto(cambios: Partial<ContextoEstado> = {}): ContextoEstado {
  return { aceptaPedidos: true, mensajeCerrado: null, dias: [HOY, MANANA], ...cambios };
}

describe("calcularEstadoTienda", () => {
  it("dentro de la franja está abierta y dice a qué hora cierra", () => {
    const r = calcularEstadoTienda(contexto(), aLas("15:00"));

    expect(r.estado).toBe("abierta");
    expect(r.badge).toBe(TEXTOS.badgeAbierta);
    expect(r.titulo).toBe(TEXTOS.tituloAbierta);
    expect(r.detalle).toBe("Cerramos a las 8:00 pm");
  });

  it("fuera de la franja está cerrada por horario", () => {
    const r = calcularEstadoTienda(contexto(), aLas("21:00"));

    expect(r.estado).toBe("cerrada_horario");
    expect(r.titulo).toBe(TEXTOS.tituloCerrada);
  });

  it("en el minuto exacto de apertura ya está abierta", () => {
    expect(calcularEstadoTienda(contexto(), aLas("12:00")).estado).toBe("abierta");
  });

  it("en el minuto exacto del cierre ya está cerrada", () => {
    // `[abre, cierra)`, el mismo criterio con el que se generan las franjas: si el cierre contara
    // como abierto, el letrero y la última hora programable dirían cosas distintas.
    expect(calcularEstadoTienda(contexto(), aLas("20:00")).estado).toBe("cerrada_horario");
  });

  it("un minuto antes del cierre sigue abierta", () => {
    expect(calcularEstadoTienda(contexto(), aLas("19:59")).estado).toBe("abierta");
  });

  describe("turno partido", () => {
    const partido: DiaDeHorario = {
      ...HOY,
      horarios: [
        { abre: "12:00:00", cierra: "15:00:00" },
        { abre: "17:00:00", cierra: "21:00:00" },
      ],
    };

    it("en el hueco entre las dos franjas está cerrada y anuncia la segunda", () => {
      const r = calcularEstadoTienda(contexto({ dias: [partido, MANANA] }), aLas("16:00"));

      expect(r.estado).toBe("cerrada_horario");
      expect(r.proximaApertura).toEqual({ fecha: "2026-01-01", minutos: 17 * 60 });
      expect(r.detalle).toBe("Abrimos hoy a las 5:00 pm");
    });

    it("dentro de la segunda franja está abierta y cierra con la de ella", () => {
      const r = calcularEstadoTienda(contexto({ dias: [partido, MANANA] }), aLas("18:00"));

      expect(r.estado).toBe("abierta");
      expect(r.detalle).toBe("Cerramos a las 9:00 pm");
    });
  });

  it("un día sin horario configurado está cerrado", () => {
    const sinHorario: DiaDeHorario = { ...HOY, horarios: [] };
    const r = calcularEstadoTienda(contexto({ dias: [sinHorario, MANANA] }), aLas("15:00"));

    expect(r.estado).toBe("cerrada_horario");
    expect(r.proximaApertura).toEqual({ fecha: "2026-01-02", minutos: 12 * 60 });
  });

describe("cierre excepcional", () => {
  it("cerrado todo el día pisa el horario normal", () => {
    const cerrado: DiaDeHorario = {
      ...HOY,
      cierre: { cerrado: true, abre: null, cierra: null, motivo: "Festivo" },
    };
    const r = calcularEstadoTienda(contexto({ dias: [cerrado, MANANA] }), aLas("15:00"));

    expect(r.estado).toBe("cerrada_horario");
    expect(r.detalle).toBe("Abrimos mañana a las 12:00 pm");
  });

  it("el horario especial REEMPLAZA al de la semana, no se suma", () => {
    const especial: DiaDeHorario = {
      ...HOY,
      cierre: { cerrado: false, abre: "14:00:00", cierra: "18:00:00", motivo: null },
    };
    const ctx = contexto({ dias: [especial, MANANA] });

    // 13:00 cae dentro del horario semanal (12:00–20:00) y fuera del especial: manda el especial.
    expect(calcularEstadoTienda(ctx, aLas("13:00")).estado).toBe("cerrada_horario");
    expect(calcularEstadoTienda(ctx, aLas("15:00")).estado).toBe("abierta");
    expect(calcularEstadoTienda(ctx, aLas("15:00")).detalle).toBe("Cerramos a las 6:00 pm");
  });
});

describe("interruptor de pánico", () => {
  it("aceptaPedidos=false gana aunque el horario diga que está abierta", () => {
    const r = calcularEstadoTienda(
      contexto({ aceptaPedidos: false, mensajeCerrado: "Se dañó la freidora" }),
      aLas("15:00"),
    );

    expect(r.estado).toBe("cerrada_manual");
    expect(r.titulo).toBe("Se dañó la freidora");
    // Sin hora de apertura encima del aviso del dueño: apagó la tienda por algo que el horario
    // no sabe, y prometer "abrimos a las 12" lo contradiría.
    expect(r.detalle).toBeNull();
  });

  it("sin mensaje escrito cae al copy de cerrada por horario", () => {
    const r = calcularEstadoTienda(contexto({ aceptaPedidos: false }), aLas("15:00"));

    expect(r.estado).toBe("cerrada_manual");
    expect(r.titulo).toBe(TEXTOS.tituloCerrada);
    // Mañana y no hoy: la apertura de hoy (12:00) ya pasó a esta hora. Lo único honesto que se
    // puede decir sin un mensaje del dueño es cuándo toca abrir según el horario.
    expect(r.detalle).toBe("Abrimos mañana a las 12:00 pm");
  });

  it("un mensaje en blanco cuenta como vacío", () => {
    const r = calcularEstadoTienda(
      contexto({ aceptaPedidos: false, mensajeCerrado: "   " }),
      aLas("15:00"),
    );

    expect(r.titulo).toBe(TEXTOS.tituloCerrada);
  });
});

describe("proximaApertura", () => {
  it("cae al día siguiente cuando hoy ya cerró", () => {
    const r = calcularEstadoTienda(contexto(), aLas("21:00"));

    expect(r.proximaApertura).toEqual({ fecha: "2026-01-02", minutos: 12 * 60 });
    expect(r.detalle).toBe("Abrimos mañana a las 12:00 pm");
  });

  it("es la de hoy cuando todavía no ha abierto", () => {
    const r = calcularEstadoTienda(contexto(), aLas("09:00"));

    expect(r.proximaApertura).toEqual({ fecha: "2026-01-01", minutos: 12 * 60 });
    expect(r.detalle).toBe("Abrimos hoy a las 12:00 pm");
  });

  it("nombra el día cuando cae más allá de mañana", () => {
    const sabado: DiaDeHorario = {
      fecha: "2026-01-03",
      diaSemana: 6,
      cierre: null,
      horarios: [{ abre: "12:00:00", cierra: "20:30:00" }],
    };
    const sinAbrir = (d: DiaDeHorario): DiaDeHorario => ({ ...d, horarios: [] });
    const r = calcularEstadoTienda(
      contexto({ dias: [sinAbrir(HOY), sinAbrir(MANANA), sabado] }),
      aLas("15:00"),
    );

    expect(r.detalle).toBe("Abrimos el sábado a las 12:00 pm");
  });

  it("es null y lo dice cuando no abre en toda la semana", () => {
    const r = calcularEstadoTienda(
      contexto({ dias: [{ ...HOY, horarios: [] }, { ...MANANA, horarios: [] }] }),
      aLas("15:00"),
    );

    expect(r.proximaApertura).toBeNull();
    expect(r.detalle).toBe(TEXTOS.sinApertura);
  });
});
});
