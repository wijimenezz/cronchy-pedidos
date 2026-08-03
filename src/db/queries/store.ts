import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { store } from "@/db/schema";

export class StoreNoConfiguradaError extends Error {}

/** Único lugar del proyecto que resuelve qué tienda es "la tienda" (regla 5 de CLAUDE.md). */
export const getStore = cache(async () => {
  const slug = process.env.STORE_SLUG;
  if (!slug) throw new StoreNoConfiguradaError("STORE_SLUG no está definida");

  const tienda = await db.query.store.findFirst({ where: eq(store.slug, slug) });
  if (!tienda) throw new StoreNoConfiguradaError(`No existe tienda con slug "${slug}"`);

  return tienda;
});

/**
 * El rango que se le promete al cliente en "lo más pronto posible".
 *
 * Se sube el día que la cocina va lenta, así que se cambia en caliente desde la pantalla de
 * pedidos. El CHECK de la base (`min > 0`, `max >= min`) es la última palabra; la acción
 * valida antes para que el admin lea un mensaje en español y no un error de Postgres.
 */
export async function actualizarTiempoEstimado(
  storeId: string,
  min: number,
  max: number,
): Promise<boolean> {
  const filas = await db
    .update(store)
    .set({ minutosEstimadoMin: min, minutosEstimadoMax: max })
    .where(eq(store.id, storeId))
    .returning({ id: store.id });

  return filas.length > 0;
}
