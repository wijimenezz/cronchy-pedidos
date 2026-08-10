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

export function minutosDeTimeString(hhmmss: string): number {
  const [h, m] = hhmmss.split(":").map(Number);
  return h * 60 + m;
}

/**
 * La vuelta de `ahoraEnBogota`: de una fecha local y unos minutos desde medianoche al instante
 * absoluto que les corresponde. Es lo que se guarda en `order.programado_para`.
 *
 * Se resta el desfase a mano en vez de usar `Intl` porque Colombia es **UTC-5 fijo y sin
 * horario de verano** desde 1993, así que aquí no hay ambigüedad que resolver: ninguna hora
 * local se repite ni se salta. La conversión vive en un solo sitio precisamente para que el
 * día que eso deje de ser cierto —o que aparezca una segunda tienda en otra zona— haya un
 * único lugar que arreglar.
 */
export function instanteEnBogota(fecha: string, minutos: number): Date {
  const [anio, mes, dia] = fecha.split("-").map(Number);

  return new Date(Date.UTC(anio, mes - 1, dia, Math.floor(minutos / 60) + 5, minutos % 60, 0, 0));
}

/**
 * Los rangos que de verdad rigen un día: `store_closure` **reemplaza** a `store_hours`, no lo
 * complementa. Devuelve vacío si ese día no se abre.
 *
 * Existe aparte de `calcularDisponibilidad` porque hay dos preguntas distintas sobre los
 * mismos datos —"¿está abierta?" necesita saber *por qué* no lo está, y "¿qué horas puedo
 * ofrecer?" solo necesita los tramos— y mezclarlas obligaba a devolver un motivo que al
 * generador de franjas no le sirve de nada.
 */
export function rangosDelDia(
  ctx: Pick<ContextoHorario, "cierreHoy" | "horariosHoy">,
): RangoHorario[] {
  if (!ctx.cierreHoy) return ctx.horariosHoy;
  if (ctx.cierreHoy.cerrado) return [];

  // cerrado=false con horario especial: abre/cierra siempre vienen llenos en este caso.
  return [{ abre: ctx.cierreHoy.abre!, cierra: ctx.cierreHoy.cierra! }];
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

  // Cerrar el día entero es lo único que `rangosDelDia` no puede distinguir de "no hay
  // horario": los dos dan una lista vacía, pero el mensaje que lee el cliente es distinto.
  if (ctx.cierreHoy?.cerrado) {
    return {
      abierta: false,
      motivo: "excepcional",
      mensaje: ctx.cierreHoy.motivo ?? ctx.mensajeCerrado ?? "Hoy no abrimos.",
    };
  }

  const rangos = rangosDelDia(ctx);

  if (rangos.length === 0) {
    return {
      abierta: false,
      motivo: "sin_horario",
      mensaje: ctx.mensajeCerrado ?? "Hoy no tenemos horario de atención.",
    };
  }

  const { minutos } = ahoraEnBogota(ahora);
  const dentroDeAlgunRango = rangos.some(
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

/**
 * Compone getStore() + la consulta del día + el cálculo puro, para un instante cualquiera.
 *
 * El instante es parámetro y no `new Date()` porque un pedido programado pregunta por una hora
 * futura: "¿estaréis abiertos a las 7?". Los campos del contexto se llaman `cierreHoy` y
 * `horariosHoy` por su origen, pero lo que traen es el día que se consultó.
 */
export async function estaAbiertaEn(instante: Date): Promise<Disponibilidad> {
  const tienda = await getStore();
  const { fecha, diaSemana } = ahoraEnBogota(instante);
  const contexto = await obtenerContextoHorarioHoy(tienda.id, fecha, diaSemana);

  return calcularDisponibilidad(
    {
      aceptaPedidos: tienda.aceptaPedidos,
      mensajeCerrado: tienda.mensajeCerrado,
      ...contexto,
    },
    instante,
  );
}

/** ¿Se puede pedir ahora mismo? */
export function estaAbierta(): Promise<Disponibilidad> {
  return estaAbiertaEn(new Date());
}
