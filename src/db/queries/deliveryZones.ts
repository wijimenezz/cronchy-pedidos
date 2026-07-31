import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { deliveryZone } from "@/db/schema";

export type ZonaDomicilio = { id: string; nombre: string; precio: number };

/** Zonas que el checkout ofrece en la lista de barrios. */
export async function obtenerZonasActivas(storeId: string): Promise<ZonaDomicilio[]> {
  return db
    .select({ id: deliveryZone.id, nombre: deliveryZone.nombre, precio: deliveryZone.precio })
    .from(deliveryZone)
    .where(and(eq(deliveryZone.storeId, storeId), eq(deliveryZone.activa, true)))
    .orderBy(asc(deliveryZone.nombre));
}

/**
 * A diferencia de `obtenerZonasActivas`, esta NO filtra por `activa`: `calcularPedido`
 * necesita distinguir "la zona no existe" de "la zona se desactivó", para dar un error
 * distinto a cada caso.
 */
export async function obtenerZonaActiva(
  storeId: string,
  zonaId: string,
): Promise<{ id: string; nombre: string; precio: number; activa: boolean } | null> {
  const zona = await db.query.deliveryZone.findFirst({
    where: and(eq(deliveryZone.storeId, storeId), eq(deliveryZone.id, zonaId)),
  });

  return zona ?? null;
}
