import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { order, orderItem, orderStatusEvent } from "@/db/schema";
import { itemSnapshotSchema } from "@/lib/validaciones";
import { siguienteEstado, validarCambioEstado, type MotivoBloqueo } from "@/lib/pedidos/estados";
import { puedeAvisarse } from "@/lib/notificaciones/avisos";
import { puntoDesdeGeoJSON } from "@/lib/zonas";
import type { EstadoPedido, ItemSnapshot, TipoPedido } from "@/lib/notificaciones/plantillas";

/**
 * Lo que ve el panel. Como en el seguimiento público (regla 2), todo sale del `snapshot`
 * congelado y de las columnas del propio pedido, sin un solo JOIN contra el catálogo: un
 * pedido de la semana pasada debe mostrar lo que el cliente pagó, no los precios de hoy.
 *
 * A diferencia de `PedidoPublico`, aquí sí viaja lo que el cliente no ve: el método de
 * pago con su comprobante y quién tocó cada estado.
 */
export type PedidoPanel = {
  id: string;
  numero: number;
  tokenPublico: string;
  tipo: TipoPedido;
  estado: EstadoPedido;
  creadoEn: Date;
  /** La hora que pidió el cliente, o `null` si quiere su pedido lo antes posible. */
  programadoPara: Date | null;
  clienteNombre: string;
  clienteTelefono: string;
  recibeNombre: string | null;
  recibeTelefono: string | null;
  direccion: string | null;
  indicaciones: string | null;
  barrio: string | null;
  /** El pin que confirmó el cliente. Es lo que abre el domiciliario en Maps (regla 14). */
  punto: { lat: number; lng: number } | null;
  metodoPago: string;
  comprobanteUrl: string | null;
  notas: string | null;
  items: ItemSnapshot[];
  subtotal: number;
  costoDomicilio: number;
  descuento: number;
  total: number;
};

export type EventoEstado = {
  estado: EstadoPedido;
  creadoEn: Date;
  notificadoEn: Date | null;
};

/** El resumen de la lista: lo justo para decidir sin abrir el pedido. */
export type PedidoEnLista = Pick<
  PedidoPanel,
  | "id"
  | "numero"
  | "tipo"
  | "estado"
  | "creadoEn"
  | "programadoPara"
  | "clienteNombre"
  | "clienteTelefono"
  | "barrio"
  | "metodoPago"
  | "total"
> & {
  tieneComprobante: boolean;
  cantidadItems: number;
  /**
   * Si queda un aviso por mandarle al cliente en el estado actual (regla 11). Lo decide
   * el servidor y no la tarjeta: saber qué estados llevan mensaje es cosa de
   * `plantillas.ts`, y arrastrar ese módulo —y el transporte con él— hasta el navegador
   * solo para pintar un botón sería llevarse medio backend al bundle.
   */
  avisoPendiente: boolean;
  /** El siguiente paso natural, o null si el pedido ya terminó. */
  siguiente: EstadoPedido | null;
};

function aItems(filas: { snapshot: unknown }[]): ItemSnapshot[] {
  return filas.flatMap((fila) => {
    const parsed = itemSnapshotSchema.safeParse(fila.snapshot);
    // Un snapshot corrupto no debe tumbar la lista entera del panel en plena operación.
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Lista para la pantalla de operación. Los terminados se excluyen por defecto: lo que
 * importa en la cocina es lo que sigue vivo, y a fin de turno la lista quedaría enterrada
 * bajo los entregados del día.
 */
export async function listarPedidos(
  storeId: string,
  opciones: { incluirTerminados?: boolean } = {},
): Promise<PedidoEnLista[]> {
  const filas = await db.query.order.findMany({
    where: eq(order.storeId, storeId),
    orderBy: desc(order.creadoEn),
    limit: 100,
    with: {
      orderItems: { columns: { cantidad: true } },
      orderStatusEvents: { columns: { estado: true, notificadoEn: true } },
    },
  });

  const vivos = opciones.incluirTerminados
    ? filas
    : filas.filter((f) => f.estado !== "entregado" && f.estado !== "cancelado");

  return vivos.map((fila) => {
    const yaAvisados = fila.orderStatusEvents
      .filter((e) => e.notificadoEn !== null)
      .map((e) => e.estado);

    return {
      id: fila.id,
      numero: fila.numero,
      tipo: fila.tipo,
      estado: fila.estado,
      creadoEn: new Date(fila.creadoEn),
      programadoPara: fila.programadoPara ? new Date(fila.programadoPara) : null,
      clienteNombre: fila.clienteNombre,
      clienteTelefono: fila.clienteTelefono,
      barrio: fila.zonaNombre,
      metodoPago: fila.metodoPago,
      total: fila.total,
      tieneComprobante: Boolean(fila.comprobanteUrl),
      cantidadItems: fila.orderItems.reduce((n, i) => n + i.cantidad, 0),
      avisoPendiente: puedeAvisarse(fila.estado) && !yaAvisados.includes(fila.estado),
      siguiente: siguienteEstado(fila.estado, fila.tipo),
    };
  });
}

/** Se busca por `numero` y no por `id`: es lo que el negocio dice en voz alta. */
export async function obtenerPedidoPorNumero(
  storeId: string,
  numero: number,
): Promise<{ pedido: PedidoPanel; historial: EventoEstado[] } | null> {
  const fila = await db.query.order.findFirst({
    where: and(eq(order.storeId, storeId), eq(order.numero, numero)),
    // Un select normal sobre una columna `geometry` devuelve WKB en hexadecimal, así que el
    // punto se pide aparte ya convertido a GeoJSON.
    extras: { puntoGeo: sql<string | null>`ST_AsGeoJSON(${order.punto})`.as("punto_geo") },
    with: {
      orderItems: { orderBy: asc(orderItem.orden) },
      orderStatusEvents: { orderBy: asc(orderStatusEvent.creadoEn) },
    },
  });

  if (!fila) return null;

  return {
    pedido: {
      id: fila.id,
      numero: fila.numero,
      tokenPublico: fila.tokenPublico,
      tipo: fila.tipo,
      estado: fila.estado,
      creadoEn: new Date(fila.creadoEn),
      programadoPara: fila.programadoPara ? new Date(fila.programadoPara) : null,
      clienteNombre: fila.clienteNombre,
      clienteTelefono: fila.clienteTelefono,
      recibeNombre: fila.recibeNombre,
      recibeTelefono: fila.recibeTelefono,
      direccion: fila.direccion,
      indicaciones: fila.indicaciones,
      barrio: fila.zonaNombre,
      punto: puntoDesdeGeoJSON(fila.puntoGeo),
      metodoPago: fila.metodoPago,
      comprobanteUrl: fila.comprobanteUrl,
      notas: fila.notas,
      items: aItems(fila.orderItems),
      subtotal: fila.subtotal,
      costoDomicilio: fila.costoDomicilio,
      descuento: fila.descuento,
      total: fila.total,
    },
    historial: fila.orderStatusEvents.map((e) => ({
      estado: e.estado,
      creadoEn: new Date(e.creadoEn),
      notificadoEn: e.notificadoEn ? new Date(e.notificadoEn) : null,
    })),
  };
}

export type ResultadoCambio =
  | { ok: true; estado: EstadoPedido; numero: number }
  | { ok: false; motivo: MotivoBloqueo | "no_encontrado" };

/**
 * Cambia el estado y registra el evento en la misma transacción. Nunca lo uno sin lo otro:
 * `order.estado` dice dónde está el pedido y `order_status_event` dice cómo llegó ahí, y
 * un historial con huecos no sirve para reconstruir un turno.
 *
 * El estado actual se relee **dentro** de la transacción con `FOR UPDATE`. Sin eso, dos
 * empleados tocando el mismo pedido a la vez podrían aplicar ambos su cambio sobre la
 * misma lectura vieja, y el segundo pisaría al primero saltándose la validación.
 */
export async function cambiarEstadoPedido(
  storeId: string,
  pedidoId: string,
  nuevo: EstadoPedido,
  userId: string,
): Promise<ResultadoCambio> {
  return db.transaction(async (tx) => {
    const [actual] = await tx
      .select({
        id: order.id,
        numero: order.numero,
        estado: order.estado,
        tipo: order.tipo,
        metodoPago: order.metodoPago,
        comprobanteUrl: order.comprobanteUrl,
      })
      .from(order)
      .where(and(eq(order.storeId, storeId), eq(order.id, pedidoId)))
      .for("update");

    if (!actual) return { ok: false, motivo: "no_encontrado" };

    const permitido = validarCambioEstado(
      {
        estado: actual.estado,
        tipo: actual.tipo,
        metodoPago: actual.metodoPago,
        tieneComprobante: Boolean(actual.comprobanteUrl),
      },
      nuevo,
    );
    if (!permitido.ok) return { ok: false, motivo: permitido.motivo };

    await tx.update(order).set({ estado: nuevo }).where(eq(order.id, pedidoId));
    await tx.insert(orderStatusEvent).values({ storeId, orderId: pedidoId, estado: nuevo, userId });

    return { ok: true, estado: nuevo, numero: actual.numero };
  });
}

/**
 * Marca que ya se avisó de un estado (regla 11). Solo escribe si `notificado_en` estaba
 * vacío: si dos pestañas del panel pulsan "avisar" a la vez, la segunda no debe mover la
 * hora del envío real.
 *
 * Devuelve si esta llamada fue la que marcó, para que quien la hizo sepa si de verdad le
 * toca abrir WhatsApp.
 */
export async function marcarEstadoNotificado(
  storeId: string,
  pedidoId: string,
  estado: EstadoPedido,
): Promise<boolean> {
  const filas = await db
    .update(orderStatusEvent)
    .set({ notificadoEn: new Date().toISOString() })
    .where(
      and(
        eq(orderStatusEvent.storeId, storeId),
        eq(orderStatusEvent.orderId, pedidoId),
        eq(orderStatusEvent.estado, estado),
        isNull(orderStatusEvent.notificadoEn),
      ),
    )
    .returning({ id: orderStatusEvent.id });

  return filas.length > 0;
}
