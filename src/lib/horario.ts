import { getStore } from "@/db/queries/store";
import { obtenerContextoHorarioHoy } from "@/db/queries/horario";

/** Regla 6 de CLAUDE.md: siempre America/Bogota, nunca UTC ni la hora del servidor. */
const TIMEZONE = "America/Bogota" as const;

export type RangoHorario = { abre: string; cierra: string }; // "HH:MM:SS"

export type CierreDelDia = {
  cerrado: boolean;
  abre: string | null;
  cierra: string | null;
  motivo: string | null;
} | null; // null = no hay fila de store_closure para hoy

export type ContextoHorario = {
  aceptaPedidos: boolean;
  mensajeCerrado: string | null;
  cierreHoy: CierreDelDia;
  horariosHoy: RangoHorario[]; // store_hours del día; puede haber varios (turno partido)
};

export type MotivoCerrado = "manual" | "excepcional" | "fuera_de_horario" | "sin_horario";

export type Disponibilidad =
  | { abierta: true }
  | { abierta: false; motivo: MotivoCerrado; mensaje: string };

/**
 * Componentes locales de Bogotá para un instante UTC, sin depender del TZ del
 * proceso que ejecuta el código (server, CI, o test).
 */
export function ahoraEnBogota(ahora: Date = new Date()): {
  fecha: string; // "YYYY-MM-DD", comparable con store_closure.fecha
  diaSemana: number; // 0=domingo..6=sábado, misma convención que EXTRACT(DOW) de Postgres
  minutos: number; // minutos desde medianoche, 0-1439
} {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(ahora);

  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "";
  const year = Number(p("year"));
  const month = Number(p("month"));
  const day = Number(p("day"));
  const minuto = Number(p("minute"));
  // Algunas implementaciones de ICU devuelven "24" para la medianoche con hour12:false.
  const hora = Number(p("hour")) % 24;

  return {
    fecha: `${p("year")}-${p("month")}-${p("day")}`,
    diaSemana: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    minutos: hora * 60 + minuto,
  };
}

function minutosDeTimeString(hhmmss: string): number {
  const [h, m] = hhmmss.split(":").map(Number);
  return h * 60 + m;
}

/** Lógica pura, sin DB — testeable con fixtures. Precedencia: aceptaPedidos > cierreHoy > horariosHoy. */
export function calcularDisponibilidad(
  ctx: ContextoHorario,
  ahora: Date = new Date(),
): Disponibilidad {
  if (!ctx.aceptaPedidos) {
    return {
      abierta: false,
      motivo: "manual",
      mensaje: ctx.mensajeCerrado ?? "En este momento no estamos aceptando pedidos.",
    };
  }

  const { minutos } = ahoraEnBogota(ahora);

  if (ctx.cierreHoy) {
    if (ctx.cierreHoy.cerrado) {
      return {
        abierta: false,
        motivo: "excepcional",
        mensaje: ctx.cierreHoy.motivo ?? ctx.mensajeCerrado ?? "Hoy no abrimos.",
      };
    }

    // cerrado=false con horario especial: abre/cierra siempre vienen llenos en este caso.
    const dentro =
      minutos >= minutosDeTimeString(ctx.cierreHoy.abre!) &&
      minutos < minutosDeTimeString(ctx.cierreHoy.cierra!);

    return dentro
      ? { abierta: true }
      : {
          abierta: false,
          motivo: "fuera_de_horario",
          mensaje: ctx.mensajeCerrado ?? "Estamos cerrados en este momento.",
        };
  }

  if (ctx.horariosHoy.length === 0) {
    return {
      abierta: false,
      motivo: "sin_horario",
      mensaje: ctx.mensajeCerrado ?? "Hoy no tenemos horario de atención.",
    };
  }

  const dentroDeAlgunRango = ctx.horariosHoy.some(
    (r) => minutos >= minutosDeTimeString(r.abre) && minutos < minutosDeTimeString(r.cierra),
  );

  return dentroDeAlgunRango
    ? { abierta: true }
    : {
        abierta: false,
        motivo: "fuera_de_horario",
        mensaje: ctx.mensajeCerrado ?? "Estamos cerrados en este momento.",
      };
}

/** Compone getStore() + la consulta del día + el cálculo puro. */
export async function estaAbierta(): Promise<Disponibilidad> {
  const tienda = await getStore();
  const ahora = new Date();
  const { fecha, diaSemana } = ahoraEnBogota(ahora);
  const contexto = await obtenerContextoHorarioHoy(tienda.id, fecha, diaSemana);

  return calcularDisponibilidad(
    {
      aceptaPedidos: tienda.aceptaPedidos,
      mensajeCerrado: tienda.mensajeCerrado,
      ...contexto,
    },
    ahora,
  );
}
