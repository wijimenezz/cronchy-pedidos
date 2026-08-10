import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscription } from "@/db/schema";

export type SuscripcionGuardada = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/**
 * Guarda o refresca la suscripción de un dispositivo.
 *
 * El `endpoint` es la llave: lo asigna el servicio de push y ya identifica a ese navegador en ese
 * dispositivo. Reactivar los avisos devuelve el mismo endpoint, así que el upsert evita
 * duplicarlo — y de paso lo reasigna al usuario que está en sesión ahora, que es lo correcto si
 * dos empleados comparten la tablet del mostrador.
 */
export async function guardarSuscripcion(entrada: {
  storeId: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<void> {
  await db
    .insert(pushSubscription)
    .values(entrada)
    .onConflictDoUpdate({
      target: pushSubscription.endpoint,
      set: {
        storeId: entrada.storeId,
        userId: entrada.userId,
        p256dh: entrada.p256dh,
        auth: entrada.auth,
      },
    });
}

export async function borrarSuscripcion(endpoint: string): Promise<void> {
  await db.delete(pushSubscription).where(eq(pushSubscription.endpoint, endpoint));
}

/** Todo lo que hay que soltar al cerrar sesión desde este dispositivo. */
export async function borrarSuscripcionesDeUsuario(
  storeId: string,
  userId: string,
): Promise<void> {
  await db
    .delete(pushSubscription)
    .where(and(eq(pushSubscription.storeId, storeId), eq(pushSubscription.userId, userId)));
}

/**
 * A quién hay que avisarle. Todos los dispositivos de la tienda, sin filtrar por usuario:
 * cualquiera del mostrador puede atender el pedido, y el primero que lo vea gana.
 */
export async function suscripcionesDeTienda(storeId: string): Promise<SuscripcionGuardada[]> {
  return db
    .select({
      id: pushSubscription.id,
      endpoint: pushSubscription.endpoint,
      p256dh: pushSubscription.p256dh,
      auth: pushSubscription.auth,
    })
    .from(pushSubscription)
    .where(eq(pushSubscription.storeId, storeId));
}
