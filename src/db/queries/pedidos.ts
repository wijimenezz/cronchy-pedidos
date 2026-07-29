import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { order, orderItem, orderStatusEvent } from "@/db/schema";
import { upsertCustomer } from "@/db/queries/customers";
import { itemCalculadoASnapshot, type PedidoCalculado } from "@/lib/precios";
import { itemSnapshotSchema, type CrearPedidoInput } from "@/lib/validaciones";
import type { EstadoPedido, ItemSnapshot, TipoPedido } from "@/lib/notificaciones/plantillas";

export async function crearPedidoEnDB(
  storeId: string,
  input: CrearPedidoInput,
  calculo: PedidoCalculado,
): Promise<{ id: string; numero: number; tokenPublico: string }> {
  return db.transaction(async (tx) => {
    const cliente = await upsertCustomer(tx, storeId, input.clienteTelefono, input.clienteNombre, calculo.total);

    // El dinero sale siempre de `calculo` (ya validado en servidor), nunca del input del cliente.
    const [pedido] = await tx
      .insert(order)
      .values({
        storeId,
        tipo: input.tipo,
        customerId: cliente.id,
        clienteNombre: input.clienteNombre,
        clienteTelefono: input.clienteTelefono,
        zonaId: input.tipo === "domicilio" ? (input.zonaId ?? null) : null,
        // Solo tiene sentido guardar el barrio escrito a mano si es un domicilio sin
        // zona de la lista; en cualquier otro caso sería un dato contradictorio.
        barrioTexto:
          input.tipo === "domicilio" && !input.zonaId ? (input.barrioTexto ?? null) : null,
        direccion: input.direccion ?? null,
        indicaciones: input.indicaciones ?? null,
        domicilioPorConfirmar: calculo.domicilioPorConfirmar,
        notas: input.notas ?? null,
        metodoPago: input.metodoPago,
        comprobanteUrl: input.comprobanteUrl ?? null,
        subtotal: calculo.subtotal,
        costoDomicilio: calculo.costoDomicilio,
        descuento: calculo.descuento,
        total: calculo.total,
      })
      .returning({ id: order.id, numero: order.numero, tokenPublico: order.tokenPublico });

    await tx.insert(orderItem).values(
      calculo.items.map((item, i) => ({
        storeId,
        orderId: pedido.id,
        productId: item.productId,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        subtotal: item.subtotal,
        snapshot: itemCalculadoASnapshot(item),
        orden: i,
      })),
    );

    await tx.insert(orderStatusEvent).values({ storeId, orderId: pedido.id, estado: "nuevo" });

    return pedido;
  });
}

/** Lo que ve el cliente en `/pedido/[token]`, sin login. */
export type PedidoPublico = {
  numero: number;
  tokenPublico: string;
  tipo: TipoPedido;
  estado: EstadoPedido;
  creadoEn: Date;
  clienteNombre: string;
  clienteTelefono: string;
  direccion: string | null;
  indicaciones: string | null;
  /** Barrio de la lista, o el que escribió el cliente si no estaba (US11). */
  barrio: string | null;
  domicilioPorConfirmar: boolean;
  metodoPago: string;
  /** No se expone la URL: el comprobante es privado y solo lo abre el panel. */
  tieneComprobante: boolean;
  notas: string | null;
  items: ItemSnapshot[];
  subtotal: number;
  costoDomicilio: number;
  descuento: number;
  total: number;
};

/**
 * Busca un pedido por su token público. Filtra por `storeId` (regla 5): un token de otra
 * tienda no debe resolver aquí.
 *
 * Los items salen del `snapshot` congelado, sin un solo JOIN contra `product` ni
 * `modifier_option` (regla 2): si mañana sube el churro, este pedido debe seguir
 * mostrando lo que el cliente pagó.
 */
export async function obtenerPedidoPorToken(
  storeId: string,
  token: string,
): Promise<PedidoPublico | null> {
  const fila = await db.query.order.findFirst({
    where: and(eq(order.storeId, storeId), eq(order.tokenPublico, token)),
    with: {
      orderItems: { orderBy: asc(orderItem.orden) },
      deliveryZone: true,
    },
  });

  if (!fila) return null;

  const items = fila.orderItems.flatMap((item) => {
    const parsed = itemSnapshotSchema.safeParse(item.snapshot);
    // Un snapshot corrupto no debe tumbar la página entera del pedido.
    return parsed.success ? [parsed.data] : [];
  });

  return {
    numero: fila.numero,
    tokenPublico: fila.tokenPublico,
    tipo: fila.tipo,
    estado: fila.estado,
    creadoEn: new Date(fila.creadoEn),
    clienteNombre: fila.clienteNombre,
    clienteTelefono: fila.clienteTelefono,
    direccion: fila.direccion,
    indicaciones: fila.indicaciones,
    barrio: fila.deliveryZone?.barrio ?? fila.barrioTexto,
    domicilioPorConfirmar: fila.domicilioPorConfirmar,
    metodoPago: fila.metodoPago,
    tieneComprobante: Boolean(fila.comprobanteUrl),
    notas: fila.notas,
    items,
    subtotal: fila.subtotal,
    costoDomicilio: fila.costoDomicilio,
    descuento: fila.descuento,
    total: fila.total,
  };
}
