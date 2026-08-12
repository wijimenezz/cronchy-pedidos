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

/**
 * La llave con la que el cliente paga (Nequi, Bre-B, la que sea) y a nombre de quién sale.
 *
 * El titular se guarda porque el cliente lo ve antes de transferir: una llave suelta, sin un
 * nombre que reconozca, es una cuenta desconocida a la que le está mandando plata.
 */
export async function actualizarLlaveNequi(
  storeId: string,
  llave: string | null,
  titular: string | null,
): Promise<boolean> {
  const filas = await db
    .update(store)
    .set({ nequiLlave: llave, nequiLlaveTitular: titular })
    .where(eq(store.id, storeId))
    .returning({ id: store.id });

  return filas.length > 0;
}

/**
 * El QR de pago. Devuelve el ANTERIOR, igual que `guardarBannerCategoria`: sin él no se
 * puede borrar el objeto viejo del bucket y cada cambio dejaría uno colgando.
 *
 * La lectura y la escritura van en una transacción para que dos guardados a la vez no
 * devuelvan ambos el mismo "previo" y uno de los dos borre el QR que acaba de quedar vivo.
 */
export async function guardarQrPago(
  storeId: string,
  url: string | null,
): Promise<{ previo: string | null } | null> {
  return db.transaction(async (tx) => {
    const [antes] = await tx
      .select({ nequiQrUrl: store.nequiQrUrl })
      .from(store)
      .where(eq(store.id, storeId))
      .for("update");

    if (!antes) return null;

    await tx.update(store).set({ nequiQrUrl: url }).where(eq(store.id, storeId));

    return { previo: antes.nequiQrUrl };
  });
}
