import { sql } from "drizzle-orm";
import { db } from "@/db";
import { customer } from "@/db/schema";
import { normalizarTelefono } from "@/lib/notificaciones/transporte";

/** Subconjunto estructural de `db`/`tx` — evita el mismatch de tipos entre PostgresJsDatabase (tiene $client) y PgTransaction (no lo tiene). */
type Ejecutor = Pick<typeof db, "insert">;

/**
 * Crea o actualiza el cliente por (storeId, teléfono normalizado). Recibe `db` o una
 * transacción (`tx`) para poder correr atómicamente junto con la creación del pedido.
 */
export async function upsertCustomer(
  ejecutor: Ejecutor,
  storeId: string,
  telefonoCrudo: string,
  nombre: string,
  montoPedido: number,
): Promise<{ id: string }> {
  const telefono = normalizarTelefono(telefonoCrudo);

  const [fila] = await ejecutor
    .insert(customer)
    .values({
      storeId,
      telefono,
      nombre,
      totalPedidos: 1,
      totalGastado: montoPedido,
      ultimoPedido: sql`now()`,
    })
    .onConflictDoUpdate({
      target: [customer.storeId, customer.telefono],
      set: {
        nombre,
        totalPedidos: sql`${customer.totalPedidos} + 1`,
        totalGastado: sql`${customer.totalGastado} + ${montoPedido}`,
        ultimoPedido: sql`now()`,
      },
    })
    .returning({ id: customer.id });

  return fila;
}
