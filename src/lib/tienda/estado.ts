import { DIAS_SEMANA_LARGOS } from "@/lib/fechas";
import {
  ahoraEnBogota,
  instanteEnBogota,
  minutosDeTimeString,
  rangosDelDia,
} from "@/lib/horario";
import type { CierreDelDia, RangoHorario } from "@/lib/horario";
import { horaCorta } from "@/lib/notificaciones/plantillas";

/**
 * ¿Está abierta la tienda, y qué se le dice al cliente?
 *
 * Puro y sin base de datos, igual que `franjas.ts` y `zonas.ts`: recibe el horario ya leído y el
 * instante, y devuelve lo que se pinta. Quien lo compone con la base es
 * `GET /api/tienda/estado`.
 *
 * **No reimplementa la jerarquía de la regla 6**: `aceptaPedidos` gana sobre todo, y de ahí para
 * abajo manda `rangosDelDia` (`lib/horario.ts`), que ya resuelve que un `store_closure`
 * **reemplaza** al horario semanal en vez de sumarse.
 *
 * Y no se llama `estaAbierta`. Esto sirve para **mostrar** el estado en la carta, jamás para
 * decidir si se acepta un pedido: eso lo decide `opcionesDeEntrega` (regla 16), porque con la
 * tienda cerrada todavía se puede programar. El final de `lib/horario.ts` cuenta qué pasó la vez
 * que se confundieron las dos preguntas.
 */

/** Los tres estados que sabe pintar el personaje del header. */
export type EstadoDeTienda = "abierta" | "cerrada_horario" | "cerrada_manual";

/** Un día del horizonte, con sus rangos ya resueltos (cierre excepcional incluido). */
export type DiaDeHorario = {
  /** "YYYY-MM-DD" en Bogotá. */
  fecha: string;
  /** 0 = domingo, como `EXTRACT(DOW)`. */
  diaSemana: number;
  cierre: CierreDelDia;
  horarios: RangoHorario[];
};

export type ContextoEstado = {
  aceptaPedidos: boolean;
  mensajeCerrado: string | null;
  /** Hoy primero, y los siguientes en orden. Con uno solo, `proximaApertura` solo ve hoy. */
  dias: DiaDeHorario[];
};

export type EstadoTienda = {
  estado: EstadoDeTienda;
  /** El letrero: "Abierto" / "Cerrado". */
  badge: string;
  /** La frase grande. */
  titulo: string;
  /** La línea de abajo. `null` cuando no hay nada honesto que decir. */
  detalle: string | null;
  /** Cuándo vuelve a abrir, si es que abre en el horizonte que se le pasó. */
  proximaApertura: { fecha: string; minutos: number } | null;
};

/**
 * **Todo el texto vive aquí**, no repartido por los componentes: el badge, las dos frases y las
 * plantillas de la línea de detalle. Es la misma doctrina que `notificaciones/plantillas.ts` —el
 * contenido separado de quien lo pinta— y lo que hace que la hoja de horarios y el header no
 * puedan decir cosas distintas del mismo estado.
 */
export const TEXTOS = {
  badgeAbierta: "Abierto",
  badgeCerrada: "Cerrado",
  tituloAbierta: "¡Estamos abiertos!",
  tituloCerrada: "Nos estamos preparando",
  /** Se cierra a las... */
  cierraA: (hora: string) => `Cerramos a las ${hora}`,
  /** Se abre el... */
  abreEn: (cuando: string, hora: string) => `Abrimos ${cuando} a las ${hora}`,
  /** Cuando no abre en toda la semana que se mira. */
  sinApertura: "Vuelve a consultarnos pronto",
  diaCerrado: "Cerrado",
} as const;

/**
 * "hoy", "mañana" o el nombre del día.
 *
 * Se compara por posición en la lista y no por fecha para no volver a hacer aritmética de
 * calendario: quien arma el contexto ya puso hoy en la posición 0.
 */
function cuandoEs(indice: number, diaSemana: number): string {
  if (indice === 0) return "hoy";
  if (indice === 1) return "mañana";

  return `el ${DIAS_SEMANA_LARGOS[diaSemana].toLowerCase()}`;
}

/** Los minutos de la hora local a texto ("8:00 pm"), por el único formateador del proyecto. */
export function horaDelDia(fecha: string, minutos: number): string {
  return horaCorta(instanteEnBogota(fecha, minutos));
}

/**
 * El rango que está corriendo ahora mismo, si alguno.
 *
 * `[abre, cierra)`, mismo criterio que `calcularDisponibilidad` y que las franjas: **a la hora
 * exacta del cierre ya está cerrado**. Si no fuera así, la última franja programable y el
 * "abierto" del letrero dirían cosas distintas del mismo minuto.
 */
function rangoEnCurso(
  rangos: RangoHorario[],
  minutos: number,
): RangoHorario | null {
  return (
    rangos.find(
      (r) =>
        minutos >= minutosDeTimeString(r.abre) &&
        minutos < minutosDeTimeString(r.cierra),
    ) ?? null
  );
}

/**
 * La próxima apertura dentro del horizonte recibido.
 *
 * Hoy solo cuentan los rangos que todavía no empezaron —de ahí el `>` sobre el minuto actual—,
 * y de los demás días vale el primero. Devuelve `null` si en ningún día hay uno, que es lo que
 * pasa con la semana entera cerrada.
 */
function buscarProximaApertura(
  dias: DiaDeHorario[],
  minutosAhora: number,
): { fecha: string; minutos: number } | null {
  for (const [indice, dia] of dias.entries()) {
    const inicios = rangosDelDia({
      cierreHoy: dia.cierre,
      horariosHoy: dia.horarios,
    })
      .map((r) => minutosDeTimeString(r.abre))
      .sort((a, b) => a - b);

    const proximo = inicios.find(
      (inicio) => indice > 0 || inicio > minutosAhora,
    );
    if (proximo !== undefined) return { fecha: dia.fecha, minutos: proximo };
  }

  return null;
}

export function calcularEstadoTienda(
  ctx: ContextoEstado,
  ahora: Date = new Date(),
): EstadoTienda {
  const { minutos } = ahoraEnBogota(ahora);
  const hoy = ctx.dias[0];
  const rangosHoy = hoy
    ? rangosDelDia({ cierreHoy: hoy.cierre, horariosHoy: hoy.horarios })
    : [];
  const enCurso = rangoEnCurso(rangosHoy, minutos);
  const proximaApertura = buscarProximaApertura(ctx.dias, minutos);

  /** La línea de "abrimos tal día a tal hora", cuando hay tal día. */
  function detalleDeApertura(): string | null {
    if (!proximaApertura) return TEXTOS.sinApertura;

    const indice = ctx.dias.findIndex((d) => d.fecha === proximaApertura.fecha);
    const dia = ctx.dias[indice];

    return TEXTOS.abreEn(
      cuandoEs(indice, dia.diaSemana),
      horaDelDia(proximaApertura.fecha, proximaApertura.minutos),
    );
  }

  // El interruptor de pánico gana sobre el horario (regla 6), y su mensaje es el que escribió el
  // panel. Vacío, cae al copy de cerrada por horario: un letrero mudo no le sirve a nadie.
  if (!ctx.aceptaPedidos) {
    const escrito = ctx.mensajeCerrado?.trim();

    return {
      estado: "cerrada_manual",
      badge: TEXTOS.badgeCerrada,
      titulo: escrito || TEXTOS.tituloCerrada,
      // Con mensaje propio no se añade el "abrimos mañana": el dueño apagó la tienda por algo que
      // el horario no sabe, y prometer una hora de apertura encima de su aviso lo contradice.
      detalle: escrito ? null : detalleDeApertura(),
      proximaApertura,
    };
  }

  if (enCurso) {
    return {
      estado: "abierta",
      badge: TEXTOS.badgeAbierta,
      titulo: TEXTOS.tituloAbierta,
      detalle: TEXTOS.cierraA(
        horaDelDia(hoy.fecha, minutosDeTimeString(enCurso.cierra)),
      ),
      proximaApertura,
    };
  }

  return {
    estado: "cerrada_horario",
    badge: TEXTOS.badgeCerrada,
    titulo: TEXTOS.tituloCerrada,
    detalle: detalleDeApertura(),
    proximaApertura,
  };
}

/**
 * Una hora suelta del horario ("12:00" o "12:00:00") en el formato que lee el cliente.
 *
 * La fecha da igual y por eso es fija: Colombia es UTC-5 sin horario de verano (ver
 * `instanteEnBogota`), así que las 12:00 se pintan igual el 1 de enero que en agosto. Existe para
 * que la tabla de la semana —que solo tiene horas, sin día— no tenga que inventarse un formateo
 * propio y acabe diciendo "12:00" donde el resto dice "12:00 pm".
 */
const FECHA_DE_REFERENCIA = "2026-01-01";

export function horaLegible(hhmm: string): string {
  return horaDelDia(FECHA_DE_REFERENCIA, minutosDeTimeString(hhmm));
}

/**
 * Lo que devuelve `GET /api/tienda/estado`.
 *
 * Vive aquí, en el módulo puro, y no en el route handler: lo escribe el servidor y lo lee un
 * componente de cliente, así que un tipo declarado en cualquiera de los dos lados dejaría al otro
 * copiándolo a mano.
 */
export type RespuestaEstado = EstadoTienda & {
  /**
   * Qué día es hoy en Bogotá, resuelto en el servidor.
   *
   * Viaja en la respuesta para que el navegador **nunca** tenga que preguntárselo a su reloj: de
   * esto depende qué fila de la tabla se resalta, y un teléfono con la hora mal puesta resaltaría
   * la que no es. Es la regla 6 llevada hasta el último detalle de la pantalla.
   */
  hoy: { fecha: string; diaSemana: number };
  /** Los siete días, con sus tramos. Vacío = ese día no se abre. Sin excepciones aplicadas. */
  semana: { diaSemana: number; tramos: { abre: string; cierra: string }[] }[];
  /** El cierre excepcional de HOY, si lo hay. */
  cierreDeHoy: {
    fecha: string;
    cerrado: boolean;
    abre: string | null;
    cierra: string | null;
    motivo: string;
  } | null;
  /** Si ahora mismo se puede dejar un pedido programado. Lo dice `opcionesDeEntrega`, no una suposición. */
  sePuedeProgramar: boolean;
};
