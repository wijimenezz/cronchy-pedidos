import { sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimit } from "@/db/schema";

/**
 * Quién lleva la cuenta del límite de peticiones. El criterio —cuánto se permite— vive aparte,
 * en `lib/limites/politica.ts`.
 *
 * Se cuenta en Postgres y no en memoria porque esto corre en serverless: cada instancia tiene su
 * propia memoria y un arranque en frío la borra. Justo bajo ataque Vercel escala a más
 * instancias, así que un `Map` se diluye precisamente cuando haría falta.
 */

/**
 * Suma uno y devuelve cuántas van, **en una sola sentencia**.
 *
 * Que sea una y no dos es el punto: leer y luego escribir deja una ventana en la que dos
 * peticiones simultáneas leen el mismo número y las dos pasan. El `ON CONFLICT DO UPDATE` lo
 * resuelve dentro de la fila, sin transacción explícita ni `FOR UPDATE`.
 *
 * El valor devuelto **incluye esta petición**: es "esta es la número N".
 */
export async function consumirCupo(clave: string, ventana: Date): Promise<number> {
  const [fila] = await db
    .insert(rateLimit)
    .values({ clave, ventana: ventana.toISOString(), conteo: 1 })
    .onConflictDoUpdate({
      target: [rateLimit.clave, rateLimit.ventana],
      set: { conteo: sql`${rateLimit.conteo} + 1` },
    })
    .returning({ conteo: rateLimit.conteo });

  return fila.conteo;
}
