import { ahoraEnBogota, instanteEnBogota, minutosDeTimeString } from "@/lib/horario";
import type { RangoHorario } from "@/lib/horario";
import { horaCorta } from "@/lib/notificaciones/plantillas";

/**
 * Qué horas se le pueden ofrecer a un cliente que quiere programar su pedido.
 *
 * Módulo puro, sin base de datos, con su archivo de tests: mismo trato que `precios.ts` y
 * `zonas.ts`, y por la misma razón. Un error aquí no rompe una pantalla, promete un pedido
 * para una hora en la que no hay nadie en el local.
 *
 * Quien compone esto con la tienda y su horario es `entrega.ts`.
 */

/** Cada media hora. Menos opciones, más fáciles de tocar en un móvil, y le da holgura a la
 *  cocina para agrupar. Un cuarto de hora cuadruplicaría la lista y prometería una puntualidad
 *  que una churrería con un courier externo no controla. */
export const PASO_MINUTOS = 30;

/** Hoy y mañana. Subirlo es cambiar este número y las etiquetas de `DiaConFranjas`. */
export const DIAS_OFRECIDOS = 2;

export type Franja = {
  /** Instante absoluto. Es lo que viaja al servidor y lo que se guarda en `programado_para`. */
  instante: Date;
  /** Ya formateada en hora de Bogotá: "7:00 pm". */
  etiqueta: string;
};

export type DiaConFranjas = {
  dia: "hoy" | "manana";
  /** "YYYY-MM-DD" en Bogotá. */
  fecha: string;
  franjas: Franja[];
};

export type DiaParaFranjas = {
  fecha: string;
  /** Ya resueltos con `rangosDelDia`: el cierre excepcional reemplaza al horario semanal. */
  rangos: RangoHorario[];
};

/**
 * Las franjas de cada día que tenga alguna. Los días se pasan en orden —hoy primero— y se
 * devuelven solo los que producen al menos una hora, así que un día cerrado simplemente no
 * aparece y quien pinta el selector no necesita ningún caso especial.
 *
 * `anticipacionMinutos` es el estimado máximo de la tienda: nadie programa para dentro de
 * cinco minutos, y sin ese colchón "programado" no significaría nada distinto de "ya". Solo
 * aplica al primer día; los siguientes empiezan en su hora de apertura.
 */
export function diasConFranjas(
  dias: DiaParaFranjas[],
  ahora: Date,
  anticipacionMinutos: number,
): DiaConFranjas[] {
  const hoy = ahoraEnBogota(ahora);
  const manana = ahoraEnBogota(new Date(ahora.getTime() + 24 * 60 * 60 * 1000)).fecha;

  return dias
    .filter((dia) => dia.fecha === hoy.fecha || dia.fecha === manana)
    .map((dia) => ({
      dia: (dia.fecha === hoy.fecha ? "hoy" : "manana") as "hoy" | "manana",
      fecha: dia.fecha,
      // El suelo solo existe para el día en curso. Mañana no arrastra la anticipación: si la
      // tienda abre a las 3, la primera franja de mañana son las 3, se pida a la hora que se
      // pida.
      franjas: franjasDeDia(
        dia,
        dia.fecha === hoy.fecha ? hoy.minutos + anticipacionMinutos : null,
      ),
    }))
    .filter((d) => d.franjas.length > 0);
}

function franjasDeDia(dia: DiaParaFranjas, minimoMinutos: number | null): Franja[] {
  const franjas: Franja[] = [];

  for (const rango of dia.rangos) {
    const abre = minutosDeTimeString(rango.abre);
    const cierra = minutosDeTimeString(rango.cierra);
    const desde = redondearArriba(Math.max(abre, minimoMinutos ?? abre));

    // `< cierra` y no `<=`: el intervalo es semiabierto por la derecha, igual que en
    // `calcularDisponibilidad`. Una entrega a la hora exacta de cierre llega al local vacío.
    for (let minutos = desde; minutos < cierra; minutos += PASO_MINUTOS) {
      const instante = instanteEnBogota(dia.fecha, minutos);
      franjas.push({ instante, etiqueta: horaCorta(instante) });
    }
  }

  return franjas;
}

/** Al siguiente múltiplo del paso: a las 6:05 con 45 min de colchón, la primera es 7:00. */
function redondearArriba(minutos: number): number {
  return Math.ceil(minutos / PASO_MINUTOS) * PASO_MINUTOS;
}
