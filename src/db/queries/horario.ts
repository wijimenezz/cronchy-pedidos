import { and, asc, eq, gte, inArray } from "drizzle-orm";
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

// ------------------------------------------------------------
// El CRUD del panel (/admin/ajustes)
// ------------------------------------------------------------

/**
 * Un día de la semana tal como lo edita el panel.
 *
 * Las horas van en **"HH:MM"** y no en el "HH:MM:SS" que devuelve Postgres, porque es lo que
 * comen y escupen los `<input type="time">` de la pantalla. Recortar aquí —en el borde— evita
 * que cada componente se acuerde de hacerlo, y el cálculo del dominio no se entera:
 * `minutosDeTimeString` lee los dos formatos igual.
 */
export type DiaSemanal = { diaSemana: number; abre: string; cierra: string };

export async function listarHorarioSemanal(storeId: string): Promise<DiaSemanal[]> {
  const filas = await db
    .select({ diaSemana: storeHours.diaSemana, abre: storeHours.abre, cierra: storeHours.cierra })
    .from(storeHours)
    .where(eq(storeHours.storeId, storeId))
    .orderBy(asc(storeHours.diaSemana), asc(storeHours.abre));

  return filas.map((f) => ({
    diaSemana: f.diaSemana,
    abre: f.abre.slice(0, 5),
    cierra: f.cierra.slice(0, 5),
  }));
}

/**
 * Reemplaza la semana entera: borra las filas de la tienda e inserta las de los días abiertos.
 *
 * **Un día sin fila ES un día cerrado**, así que no hay ninguna columna que apagar — la ausencia
 * es el dato, y `rangosDelDia` devuelve una lista vacía. Por eso se escribe la semana completa de
 * una vez y no día por día: el editor muestra los siete, así que lo que manda es la foto entera.
 *
 * Consecuencia que hay que conocer antes de tocar esto: **la pantalla edita UN tramo por día**,
 * pero la tabla admite varios (turno partido). Si alguien metiera dos filas a mano en un día,
 * guardar desde el panel las colapsaría en una. Es el precio aceptado por una pantalla simple, y
 * hoy no hay ningún turno partido en la base.
 *
 * En una transacción porque entre el DELETE y el INSERT la tienda no tiene horario ninguno, y ese
 * hueco lo podría leer un checkout.
 */
export async function guardarHorarioSemanal(
  storeId: string,
  dias: DiaSemanal[],
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.delete(storeHours).where(eq(storeHours.storeId, storeId));

    if (dias.length > 0) {
      await tx.insert(storeHours).values(
        dias.map((d) => ({
          storeId,
          diaSemana: d.diaSemana,
          abre: d.abre,
          cierra: d.cierra,
        })),
      );
    }

    return true;
  });
}

/** Una excepción de un día concreto, tal como la lista el panel. */
export type ExcepcionDelPanel = {
  id: string;
  fecha: string;
  cerrado: boolean;
  abre: string | null;
  cierra: string | null;
  motivo: string | null;
};

/**
 * Las excepciones de hoy en adelante.
 *
 * Las pasadas no se listan: ya no pueden cambiar nada y llenarían la pantalla de años viejos. No
 * se borran solas, tampoco — es historial de por qué un día no se vendió, y nadie ha pedido
 * tirarlo.
 */
export async function listarExcepciones(
  storeId: string,
  desde: string,
): Promise<ExcepcionDelPanel[]> {
  const filas = await db
    .select({
      id: storeClosure.id,
      fecha: storeClosure.fecha,
      cerrado: storeClosure.cerrado,
      abre: storeClosure.abre,
      cierra: storeClosure.cierra,
      motivo: storeClosure.motivo,
    })
    .from(storeClosure)
    .where(and(eq(storeClosure.storeId, storeId), gte(storeClosure.fecha, desde)))
    .orderBy(asc(storeClosure.fecha));

  return filas.map((f) => ({
    ...f,
    abre: f.abre?.slice(0, 5) ?? null,
    cierra: f.cierra?.slice(0, 5) ?? null,
  }));
}

/**
 * Guarda la excepción de un día. **Es un upsert**, y se apoya en el único `(store_id, fecha)` que
 * la tabla ya tenía: volver a guardar el mismo día lo reemplaza en vez de reventar con un error
 * de duplicado que no le dice nada a nadie.
 *
 * `cerrado = false` significa "ese día abro a otras horas", y entonces `abre` y `cierra` son
 * obligatorios — `rangosDelDia` los da por buenos con un `!`. Quien lo garantiza es el esquema
 * Zod de la acción.
 */
export async function guardarExcepcion(
  storeId: string,
  excepcion: {
    fecha: string;
    cerrado: boolean;
    abre: string | null;
    cierra: string | null;
    motivo: string | null;
  },
): Promise<boolean> {
  const valores = {
    cerrado: excepcion.cerrado,
    // Un día cerrado no tiene horas, y dejarlas escritas de un guardado anterior sería basura
    // que el día que alguien lo cambie a "abro a otra hora" aparecería sola.
    abre: excepcion.cerrado ? null : excepcion.abre,
    cierra: excepcion.cerrado ? null : excepcion.cierra,
    motivo: excepcion.motivo,
  };

  const filas = await db
    .insert(storeClosure)
    .values({ storeId, fecha: excepcion.fecha, ...valores })
    .onConflictDoUpdate({
      target: [storeClosure.storeId, storeClosure.fecha],
      set: valores,
    })
    .returning({ id: storeClosure.id });

  return filas.length > 0;
}

/** El `store_id` va en el WHERE y no solo el id: el id llega del navegador (regla 5). */
export async function eliminarExcepcion(storeId: string, id: string): Promise<boolean> {
  const filas = await db
    .delete(storeClosure)
    .where(and(eq(storeClosure.storeId, storeId), eq(storeClosure.id, id)))
    .returning({ id: storeClosure.id });

  return filas.length > 0;
}
