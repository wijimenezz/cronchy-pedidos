import { and, asc, desc, eq, gte, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { order, orderItem, orderStatusEvent } from "@/db/schema";
import { itemSnapshotSchema } from "@/lib/validaciones";
import { siguienteEstado, validarCambioEstado, type MotivoBloqueo } from "@/lib/pedidos/estados";
import { puedeAvisarse } from "@/lib/notificaciones/avisos";
import { ahoraEnBogota, instanteEnBogota } from "@/lib/horario";
import { rangoDelDia } from "@/lib/pedidos/dias";
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
  /** La llave del domiciliario para confirmar la entrega. Otra que la del cliente, a propósito. */
  tokenEntrega: string;
  tipo: TipoPedido;
  estado: EstadoPedido;
  creadoEn: Date;
  /** La hora que pidió el cliente, o `null` si quiere su pedido lo antes posible. */
  programadoPara: Date | null;
  clienteNombre: string;
  clienteTelefono: string;
  /** Con qué ficha de cliente quedó enlazado, para poder mirar su historial. */
  customerId: string | null;
  recibeNombre: string | null;
  recibeTelefono: string | null;
  direccion: string | null;
  indicaciones: string | null;
  /** El barrio que escribió el cliente. Es lo que se le dice al domiciliario. */
  barrio: string | null;
  /**
   * La zona de cobertura que cobró el domicilio, congelada (reglas 2 y 13). Solo para el
   * detalle: explica **por qué** costó lo que costó y no se muestra como si fuera una
   * dirección — confundirla con el barrio era el bug que trajo la columna `barrio`.
   */
  zonaNombre: string | null;
  /** El pin que confirmó el cliente. Es lo que abre el domiciliario en Maps (regla 14). */
  punto: { lat: number; lng: number } | null;
  /** Quién lo lleva, congelado al asignar (regla 2). `null` si todavía no se asignó. */
  domiciliarioNombre: string | null;
  domiciliarioTelefono: string | null;
  metodoPago: string;
  /** Con cuánto paga, si lo dijo. La devuelta se calcula, no se guarda. */
  pagaCon: number | null;
  comprobanteUrl: string | null;
  /**
   * Si el pedido cuenta como pagado. Un comprobante cargado es la única prueba de pago que
   * maneja este negocio, así que es exactamente `comprobanteUrl != null` — pero se deriva aquí
   * y no en cada sitio que lo necesite, porque ese criterio decide dos cosas que no pueden
   * discrepar: lo que el cliente lee como "Estado del Pago" y si el domiciliario cobra.
   */
  tieneComprobante: boolean;
  /**
   * Si el cliente quiso los avisos por WhatsApp del estado de su pedido. En `false`, el panel no
   * ofrece el botón de avisar y `avisoCambioEstado` no arma ningún mensaje.
   *
   * Lo que NO apaga son "Llamar" y "Escribir" del detalle: resolver una novedad de la entrega es
   * contacto operativo —la finalidad 5 de la política—, no un aviso automático.
   */
  aceptaAvisos: boolean;
  notas: string | null;
  items: ItemSnapshot[];
  subtotal: number;
  costoDomicilio: number;
  descuento: number;
  /** El cupón que se usó, congelado (regla 2). `null` si no hubo. */
  cuponCodigo: string | null;
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
  | "aceptaAvisos"
> & {
  tieneComprobante: boolean;
  cantidadItems: number;
  /**
   * Qué hay que preparar, en una línea: "1× Cronchy Familiar · 1× Agua 600ml".
   *
   * Va en la tarjeta del tablero porque "1 producto" no le dice a nadie qué freír, y abrir
   * cada pedido para averiguarlo es lo que hace lenta una cocina. Sale del snapshot, que la
   * consulta ya carga para contar las unidades.
   */
  resumenItems: string;
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
 * "1× Cronchy Familiar · 2× Agua 600ml". Sin modificadores: en la tarjeta caben dos líneas y
 * lo que se busca es reconocer el pedido de un vistazo, no armarlo — para eso está el detalle.
 */
function resumirItems(items: ItemSnapshot[]): string {
  return items.map((i) => `${i.cantidad}× ${i.nombre}`).join(" · ");
}

const TERMINALES: EstadoPedido[] = ["entregado", "cancelado"];

/** Medianoche de hoy en Bogotá, como instante absoluto. La conversión es la única del
 *  proyecto (regla 6) y vive en `horario.ts`; aquí solo se usa. */
function inicioDeHoy(ahora = new Date()): Date {
  return instanteEnBogota(ahoraEnBogota(ahora).fecha, 0);
}

/** Las columnas que las dos consultas de lista necesitan cargar del pedido. */
const RELACIONES_DE_LISTA = {
  orderItems: { columns: { cantidad: true, snapshot: true } },
  orderStatusEvents: { columns: { estado: true, notificadoEn: true } },
} as const;

type FilaDeLista = {
  id: string;
  numero: number;
  tipo: TipoPedido;
  estado: EstadoPedido;
  creadoEn: string;
  programadoPara: string | null;
  clienteNombre: string;
  clienteTelefono: string;
  barrio: string | null;
  metodoPago: string;
  total: number;
  comprobanteUrl: string | null;
  aceptaAvisos: boolean;
  orderItems: { cantidad: number; snapshot: unknown }[];
  orderStatusEvents: { estado: EstadoPedido; notificadoEn: string | null }[];
};

/** Fila cruda -> lo que pinta la pantalla. Compartido por las dos consultas de lista. */
function aPedidoEnLista(fila: FilaDeLista): PedidoEnLista {
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
    barrio: fila.barrio,
    metodoPago: fila.metodoPago,
    total: fila.total,
    tieneComprobante: Boolean(fila.comprobanteUrl),
    aceptaAvisos: fila.aceptaAvisos,
    cantidadItems: fila.orderItems.reduce((n, i) => n + i.cantidad, 0),
    resumenItems: resumirItems(aItems(fila.orderItems)),
    // Quien no quiso avisos no tiene ninguno pendiente: sin esto el tablero seguiría ofreciendo
    // el botón ámbar y el empleado lo pulsaría de buena fe contra un cliente que dijo que no.
    avisoPendiente:
      fila.aceptaAvisos &&
      puedeAvisarse(fila.estado) &&
      !yaAvisados.includes(fila.estado),
    siguiente: siguienteEstado(fila.estado, fila.tipo),
  };
}

/**
 * Lo que el tablero necesita ver: **todo lo vivo, más lo que terminó hoy**.
 *
 * Las dos mitades tienen razones distintas. Lo vivo no se filtra por fecha porque un pedido
 * programado para mañana ya entró y hay que verlo. Lo terminado sí, porque la columna
 * "Terminados" con los entregados de toda la semana deja de informar y se vuelve un archivo.
 *
 * El corte va en la consulta y no después: con `limit` y sin filtro, un día movido empujaría
 * fuera de las 100 filas justo los pedidos vivos, que son los que no pueden faltar.
 */
export async function listarPedidos(
  storeId: string,
  opciones: { desde?: Date } = {},
): Promise<PedidoEnLista[]> {
  const desde = opciones.desde ?? inicioDeHoy();

  const filas = await db.query.order.findMany({
    where: and(
      eq(order.storeId, storeId),
      or(
        notInArray(order.estado, TERMINALES),
        gte(order.creadoEn, desde.toISOString()),
      ),
    ),
    orderBy: desc(order.creadoEn),
    limit: 100,
    with: RELACIONES_DE_LISTA,
  });

  return filas.map(aPedidoEnLista);
}

/**
 * Tope de la consulta de un día. Alto a propósito y distinto del `limit` del tablero.
 *
 * Con 100 y orden descendente, un día movido cortaría **los primeros pedidos del día** —los de
 * la tarde temprano— sin que nadie lo note: la lista se vería completa y la suma del día saldría
 * corta. En el tablero ese mismo corte es inofensivo porque lo vivo va primero por construcción.
 */
const TOPE_DIA = 300;

/**
 * Los pedidos que **entraron** ese día en Bogotá, todos, sin importar cómo terminaron.
 *
 * Es otra pregunta que la del tablero, y por eso es otra función y no una bandera: aquí no entra
 * la rama de "lo vivo", que arrastraría a esta vista los pedidos abiertos de hoy. Un día pasado
 * es un día cerrado, y lo que se consulta es qué pasó en él.
 *
 * El criterio es `creadoEn` y no `programadoPara`: la pregunta es qué se pidió ese día. Un pedido
 * tomado el lunes para el martes cuenta como del lunes, que es cuando entró la plata al turno.
 */
export async function listarPedidosDelDia(
  storeId: string,
  dia: string,
): Promise<PedidoEnLista[]> {
  const { desde, hasta } = rangoDelDia(dia);

  const filas = await db.query.order.findMany({
    where: and(
      eq(order.storeId, storeId),
      gte(order.creadoEn, desde.toISOString()),
      // Estrictamente menor: `hasta` es la medianoche del día siguiente y ya pertenece a él.
      lt(order.creadoEn, hasta.toISOString()),
    ),
    orderBy: desc(order.creadoEn),
    limit: TOPE_DIA,
    with: RELACIONES_DE_LISTA,
  });

  return filas.map(aPedidoEnLista);
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
      tokenEntrega: fila.tokenEntrega,
      tipo: fila.tipo,
      estado: fila.estado,
      creadoEn: new Date(fila.creadoEn),
      programadoPara: fila.programadoPara ? new Date(fila.programadoPara) : null,
      clienteNombre: fila.clienteNombre,
      clienteTelefono: fila.clienteTelefono,
      customerId: fila.customerId,
      recibeNombre: fila.recibeNombre,
      recibeTelefono: fila.recibeTelefono,
      direccion: fila.direccion,
      indicaciones: fila.indicaciones,
      barrio: fila.barrio,
      zonaNombre: fila.zonaNombre,
      punto: puntoDesdeGeoJSON(fila.puntoGeo),
      domiciliarioNombre: fila.domiciliarioNombre,
      domiciliarioTelefono: fila.domiciliarioTelefono,
      metodoPago: fila.metodoPago,
      pagaCon: fila.pagaCon,
      comprobanteUrl: fila.comprobanteUrl,
      tieneComprobante: fila.comprobanteUrl !== null,
      aceptaAvisos: fila.aceptaAvisos,
      notas: fila.notas,
      items: aItems(fila.orderItems),
      subtotal: fila.subtotal,
      costoDomicilio: fila.costoDomicilio,
      descuento: fila.descuento,
      cuponCodigo: fila.cuponCodigo,
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
