import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { storeClosure, storeHours } from "@/db/schema";
import type { ContextoHorario } from "@/lib/horario";

/** Lo que rige un día concreto: su excepción (si la hay) y su horario semanal. */
export type ContextoDelDia = Pick<ContextoHorario, "cierreHoy" | "horariosHoy">;

/**
 * El horario de varios días de una vez, indexado por fecha "YYYY-MM-DD".
 *
 * Son dos consultas para N días y no dos por día: el selector de pedido programado pide hoy y
 * mañana en el mismo render, y encadenar `obtenerContextoHorarioDia` dos veces serían cuatro
 * viajes a la base para pintar una lista de horas.
 *
 * Los días se piden con su `diaSemana` ya calculado porque quien llama viene de
 * `ahoraEnBogota()` y ya lo tiene; recalcularlo aquí obligaría a repetir la conversión de zona
 * horaria en la capa de datos, que es justo donde no debe vivir (regla 6).
 */
export async function obtenerContextoHorario(
  storeId: string,
  dias: { fecha: string; diaSemana: number }[],
): Promise<Map<string, ContextoDelDia>> {
  const fechas = [...new Set(dias.map((d) => d.fecha))];
  const diasSemana = [...new Set(dias.map((d) => d.diaSemana))];

  const [cierres, horarios] = await Promise.all([
    db.query.storeClosure.findMany({
      where: and(eq(storeClosure.storeId, storeId), inArray(storeClosure.fecha, fechas)),
    }),
    db.query.storeHours.findMany({
      where: and(eq(storeHours.storeId, storeId), inArray(storeHours.diaSemana, diasSemana)),
      orderBy: asc(storeHours.abre),
    }),
  ]);

  const porFecha = new Map(cierres.map((c) => [c.fecha, c]));

  return new Map(
    dias.map((d) => {
      const cierre = porFecha.get(d.fecha);

      return [
        d.fecha,
        {
          cierreHoy: cierre
            ? {
                cerrado: cierre.cerrado,
                abre: cierre.abre,
                cierra: cierre.cierra,
                motivo: cierre.motivo,
              }
            : null,
          horariosHoy: horarios
            .filter((h) => h.diaSemana === d.diaSemana)
            .map((h) => ({ abre: h.abre, cierra: h.cierra })),
        },
      ];
    }),
  );
}

/*
 * Aquí estaba `obtenerContextoHorarioHoy`, el atajo de un solo día. Existía solo para
 * `estaAbiertaEn`, que se fue con ella (ver el final de `lib/horario.ts`): quien pregunta por el
 * horario hoy pregunta por hoy **y mañana**, porque las franjas programables llegan hasta ahí.
 * `obtenerContextoHorario` con una lista de fechas es lo que se usa, y ya cubre el caso de una.
 */
