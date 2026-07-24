import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { deliveryZone } from "@/db/schema";

export async function obtenerZonaActiva(
  storeId: string,
  zonaId: string,
): Promise<{ id: string; barrio: string; precio: number; activa: boolean } | null> {
  const zona = await db.query.deliveryZone.findFirst({
    where: and(eq(deliveryZone.storeId, storeId), eq(deliveryZone.id, zonaId)),
  });

  return zona ?? null;
}
