import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { customer, order } from "@/db/schema";
import { normalizarTelefono } from "@/lib/notificaciones/transporte";
import type { EstadoPedido } from "@/lib/notificaciones/plantillas";

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

/** Un pedido anterior de la misma persona, tal como se lista en su ficha. */
export type PedidoDelCliente = {
  numero: number;
  creadoEn: Date;
  estado: EstadoPedido;
  total: number;
};

export type HistorialCliente = {
  /**
   * Cuántas veces ha pedido, **contando los cancelados**: el contador se incrementa al crear
   * el pedido, no al entregarlo. Es "cuántas veces nos escribió", no "cuántas veces cobramos".
   */
  totalPedidos: number;
  totalGastado: number;
  ultimoPedido: Date | null;
  /** Los anteriores a este, del más reciente al más viejo. */
  anteriores: PedidoDelCliente[];
};

/** Cuántos pedidos anteriores se listan. Más que esto deja de leerse de un vistazo. */
const MAX_ANTERIORES = 5;

/**
 * Quién es el cliente que hizo este pedido: cuántas veces ha pedido, cuánto ha gastado y
 * cuáles fueron sus últimos pedidos.
 *
 * Es lo que decide si a esta persona se le trata como a un habitual o como a alguien que
 * prueba por primera vez, y hasta ahora el panel no lo decía en ninguna parte.
 *
 * El pedido que se está viendo se excluye de la lista —ya se está mirando— pero **no** de los
 * totales: "3er pedido" incluye este, que es como lo cuenta cualquiera.
 *
 * Devuelve `null` si el pedido no tiene cliente asociado. `order.customer_id` es nullable y
 * los pedidos manuales de mañana (v1.1) podrían no tenerlo.
 */
export async function historialDelCliente(
  storeId: string,
  customerId: string | null,
  numeroActual: number,
): Promise<HistorialCliente | null> {
  if (!customerId) return null;

  const [ficha, anteriores] = await Promise.all([
    db.query.customer.findFirst({
      where: and(eq(customer.storeId, storeId), eq(customer.id, customerId)),
      columns: { totalPedidos: true, totalGastado: true, ultimoPedido: true },
    }),
    db.query.order.findMany({
      where: and(
        eq(order.storeId, storeId),
        eq(order.customerId, customerId),
        ne(order.numero, numeroActual),
      ),
      orderBy: desc(order.creadoEn),
      limit: MAX_ANTERIORES,
      columns: { numero: true, creadoEn: true, estado: true, total: true },
    }),
  ]);

  if (!ficha) return null;

  return {
    totalPedidos: ficha.totalPedidos,
    totalGastado: ficha.totalGastado,
    ultimoPedido: ficha.ultimoPedido ? new Date(ficha.ultimoPedido) : null,
    anteriores: anteriores.map((p) => ({
      numero: p.numero,
      creadoEn: new Date(p.creadoEn),
      estado: p.estado,
      total: p.total,
    })),
  };
}
