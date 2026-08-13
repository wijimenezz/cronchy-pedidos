import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { barrio } from "@/db/schema";
import type { CorreccionBarrio } from "@/lib/barrio";

/**
 * El diccionario que traduce los nombres de OSM (ver `src/lib/barrio.ts`).
 *
 * Nada de esto es geográfico: son nombres. Quién cubre qué punto y cuánto cuesta sigue siendo
 * `delivery_zone` y `zonas.ts` (regla 13), que no tienen nada que ver con esta tabla.
 */

export type BarrioDelPanel = {
  id: string;
  nombreOsm: string;
  nombre: string | null;
};

/**
 * Qué dice la tienda del nombre que devolvió OSM.
 *
 * `undefined` cuando no hay fila, y esa distinción es el contrato con `resolverNombreBarrio`:
 * "no hay opinión" no es lo mismo que "se decidió no sugerir nada".
 *
 * Se consulta en cada cotización en vez de cachear el diccionario en memoria: es una lectura
 * por índice único, y una caché de proceso seguiría dando el nombre viejo después de
 * corregirlo en el panel, que es justo lo que se quiere poder hacer sin desplegar.
 */
export async function correccionDeBarrio(
  storeId: string,
  nombreOsm: string,
): Promise<CorreccionBarrio> {
  const fila = await db.query.barrio.findFirst({
    columns: { nombre: true },
    where: and(eq(barrio.storeId, storeId), eq(barrio.nombreOsm, nombreOsm)),
  });

  return fila ? { nombre: fila.nombre } : undefined;
}

/** La lista completa para el panel, en el orden en que se lee. */
export async function listarBarrios(storeId: string): Promise<BarrioDelPanel[]> {
  return db
    .select({ id: barrio.id, nombreOsm: barrio.nombreOsm, nombre: barrio.nombre })
    .from(barrio)
    .where(eq(barrio.storeId, storeId))
    .orderBy(asc(barrio.nombreOsm));
}

/**
 * Guarda las correcciones que el admin cambió, y solo esas.
 *
 * En una transacción con un UPDATE por fila: son unas pocas de noventa, y un `CASE WHEN`
 * gigante ahorraría viajes a costa de una sentencia que nadie querría depurar.
 *
 * El `inArray` del final es la guarda de la regla 5: los ids llegan del navegador, así que se
 * comprueba que todos sean de esta tienda antes de escribir ninguno.
 */
export async function guardarCorrecciones(
  storeId: string,
  cambios: { id: string; nombre: string | null }[],
): Promise<boolean> {
  if (cambios.length === 0) return true;

  const ids = cambios.map((c) => c.id);

  return db.transaction(async (tx) => {
    const propios = await tx
      .select({ id: barrio.id })
      .from(barrio)
      .where(and(eq(barrio.storeId, storeId), inArray(barrio.id, ids)));

    if (propios.length !== ids.length) return false;

    for (const cambio of cambios) {
      await tx
        .update(barrio)
        .set({ nombre: cambio.nombre })
        .where(and(eq(barrio.storeId, storeId), eq(barrio.id, cambio.id)));
    }

    return true;
  });
}
