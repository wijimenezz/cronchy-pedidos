import { getStore } from "@/db/queries/store";
import { obtenerContextoHorario } from "@/db/queries/horario";
import { ahoraEnBogota, calcularDisponibilidad, rangosDelDia } from "@/lib/horario";
import { diasConFranjas, DIAS_OFRECIDOS, type DiaConFranjas } from "./franjas";

/**
 * Qué se le puede ofrecer a alguien que va a pedir: "para ya" con su estimado, o una lista de
 * horas para programar.
 *
 * Existe como una sola función porque **la usan el checkout y el route handler**, y tienen que
 * ver exactamente lo mismo. Si la pantalla ofreciera una franja que el servidor no reconoce,
 * el cliente llenaría todo el formulario para que lo rechacen al final.
 */

export type OpcionesEntrega = {
  /** El rango prometido en "lo más pronto posible". `null` = ahora mismo no se puede pedir. */
  pronto: { min: number; max: number } | null;
  /** Los días que tienen alguna hora libre. Vacío = no hay nada que ofrecer. */
  dias: DiaConFranjas[];
  /** Por qué no se puede pedir, cuando no se puede. */
  mensajeCerrado: string | null;
};

export async function opcionesDeEntrega(ahora: Date = new Date()): Promise<OpcionesEntrega> {
  const tienda = await getStore();

  // El interruptor manual gana sobre todo (regla 6) y programar no es la excepción. Se apaga
  // cuando se dañó la freidora o se acabó la masa, y seguir aceptando pedidos para dentro de
  // dos horas convertiría el botón de pánico en un botón de nada.
  if (!tienda.aceptaPedidos) {
    return {
      pronto: null,
      dias: [],
      mensajeCerrado: tienda.mensajeCerrado ?? "En este momento no estamos aceptando pedidos.",
    };
  }

  const fechas = proximosDias(ahora, DIAS_OFRECIDOS);
  const contextos = await obtenerContextoHorario(tienda.id, fechas);

  const hoy = fechas[0];
  const contextoHoy = contextos.get(hoy.fecha) ?? { cierreHoy: null, horariosHoy: [] };
  const disponibilidad = calcularDisponibilidad(
    { aceptaPedidos: true, mensajeCerrado: tienda.mensajeCerrado, ...contextoHoy },
    ahora,
  );

  const dias = diasConFranjas(
    fechas.map((d) => ({
      fecha: d.fecha,
      rangos: rangosDelDia(contextos.get(d.fecha) ?? { cierreHoy: null, horariosHoy: [] }),
    })),
    ahora,
    tienda.minutosEstimadoMax,
  );

  return {
    pronto: disponibilidad.abierta
      ? { min: tienda.minutosEstimadoMin, max: tienda.minutosEstimadoMax }
      : null,
    dias,
    mensajeCerrado: disponibilidad.abierta ? null : disponibilidad.mensaje,
  };
}

/**
 * Hoy, mañana, y así. Se avanza sumando días al instante y volviendo a preguntar por su fecha
 * en Bogotá, en vez de sumar 1 al número del día: así el salto de mes y el de año salen solos.
 */
function proximosDias(ahora: Date, cuantos: number): { fecha: string; diaSemana: number }[] {
  return Array.from({ length: cuantos }, (_, i) =>
    ahoraEnBogota(new Date(ahora.getTime() + i * 24 * 60 * 60 * 1000)),
  ).map(({ fecha, diaSemana }) => ({ fecha, diaSemana }));
}

/**
 * ¿Es esta hora una de las que el servidor ofrece ahora mismo?
 *
 * Es la regla 1 aplicada al tiempo: el navegador manda **cuál** franja eligió, nunca si esa
 * franja vale. Comparar contra la lista recién generada, en vez de revalidar la hora a mano,
 * cierra gratis la carrera de la franja que caduca mientras el cliente llena el formulario.
 */
export function esFranjaOfrecida(opciones: OpcionesEntrega, instante: Date): boolean {
  const buscado = instante.getTime();

  return opciones.dias.some((d) => d.franjas.some((f) => f.instante.getTime() === buscado));
}
