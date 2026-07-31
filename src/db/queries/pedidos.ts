import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { order, orderItem, orderStatusEvent } from "@/db/schema";
import { upsertCustomer } from "@/db/queries/customers";
import { itemCalculadoASnapshot, type PedidoCalculado } from "@/lib/precios";
import { itemSnapshotSchema, type CrearPedidoInput } from "@/lib/validaciones";
import { puntoDesdeGeoJSON } from "@/lib/zonas";
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
        clienteEmail: input.clienteEmail ?? null,
        clienteCumple: input.clienteCumple ?? null,
        // Solo aplica a domicilio: en recoger, quien pidió es quien pasa por el pedido.
        recibeNombre: input.tipo === "domicilio" ? (input.recibeNombre ?? null) : null,
        recibeTelefono: input.tipo === "domicilio" ? (input.recibeTelefono ?? null) : null,
        // Snapshot de la zona (regla 2 aplicada al domicilio). Lo que se muestra y se cobra
        // sale de aquí, no de un JOIN contra `delivery_zone`.
        zonaNombre: calculo.zonaNombre,
        // El pin que determinó el precio. Es lo que abre el domiciliario en Maps.
        punto:
          input.tipo === "domicilio" && input.punto
            ? sql`ST_SetSRID(ST_MakePoint(${input.punto.lng}, ${input.punto.lat}), 4326)`
            : null,
        direccion: input.direccion ?? null,
        indicaciones: input.indicaciones ?? null,
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
  /** Nombre congelado de la zona que cobró el domicilio. */
  barrio: string | null;
  /** El pin del cliente. Es lo que convierte el aviso al negocio en un link de Maps. */
  punto: { lat: number; lng: number } | null;
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
 * Todo sale de datos congelados, sin un solo JOIN contra `product`, `modifier_option` ni
 * `delivery_zone` (regla 2): los items desde `order_item.snapshot` y el barrio desde
 * `order.zona_nombre`. Si mañana sube el churro o se renombra una zona, este pedido debe
 * seguir mostrando lo que el cliente pagó.
 */
export async function obtenerPedidoPorToken(
  storeId: string,
  token: string,
): Promise<PedidoPublico | null> {
  const fila = await db.query.order.findFirst({
    where: and(eq(order.storeId, storeId), eq(order.tokenPublico, token)),
    // El punto se pide como GeoJSON: un select normal sobre `geometry` devuelve WKB en hex.
    extras: { puntoGeo: sql<string | null>`ST_AsGeoJSON(${order.punto})`.as("punto_geo") },
    with: {
      orderItems: { orderBy: asc(orderItem.orden) },
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
    barrio: fila.zonaNombre,
    punto: puntoDesdeGeoJSON(fila.puntoGeo),
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
