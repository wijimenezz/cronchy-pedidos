import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { order, orderItem } from "@/db/schema";
import { itemSnapshotSchema } from "@/lib/validaciones";
import { rangoDeDias, rangoDelDia } from "@/lib/pedidos/dias";
import { puntoDesdeGeoJSON } from "@/lib/zonas";
import type { EstadoPedido, ItemSnapshot, TipoPedido } from "@/lib/notificaciones/plantillas";

/**
 * Las cifras del turno y los datos para la descarga.
 *
 * Vive aparte de `panel.ts` porque responde otra pregunta: aquel sirve pantallas de operación
 * —qué hay que preparar ahora— y este sirve para cerrar la caja y llevar los números a
 * contabilidad. Comparten tabla y nada más.
 */

/** Los cuatro métodos del enum `metodo_pago`, en el orden en que se muestran. */
export const METODOS_PAGO = ["efectivo", "nequi", "transferencia", "datafono"] as const;

export type TotalPorMetodo = {
  metodo: (typeof METODOS_PAGO)[number];
  pedidos: number;
  monto: number;
};

export type ResumenDelDia = {
  /** Todos los que entraron ese día, cancelados incluidos. */
  pedidos: number;
  cancelados: number;
  /** Los no cancelados, partidos por tipo. `domicilios + recoger + cancelados = pedidos`. */
  domicilios: number;
  recoger: number;
  /** Dinero, siempre **sin** los cancelados: esa plata no entró. */
  productos: number;
  domicilio: number;
  descuento: number;
  /** `ventas = productos + domicilio − descuento`. Si no cuadra, hay un pedido mal escrito. */
  ventas: number;
  /** Los cuatro métodos, siempre, aunque alguno esté en cero. */
  porMetodo: TotalPorMetodo[];
};

/**
 * `SUM` de una columna `integer` devuelve `bigint` en Postgres, y el driver entrega los bigint
 * como **string** para no perder precisión. El `::int` los trae de vuelta a number; los montos
 * de esta tienda caben de sobra. Lo mismo con `count(*)`.
 */
const NO_CANCELADO = sql`${order.estado} <> 'cancelado'`;

const CIFRAS = {
  pedidos: sql<number>`count(*)::int`,
  cancelados: sql<number>`(count(*) FILTER (WHERE ${order.estado} = 'cancelado'))::int`,
  domicilios: sql<number>`(count(*) FILTER (WHERE ${NO_CANCELADO} AND ${order.tipo} = 'domicilio'))::int`,
  recoger: sql<number>`(count(*) FILTER (WHERE ${NO_CANCELADO} AND ${order.tipo} = 'recoger'))::int`,
  productos: sql<number>`COALESCE(SUM(${order.subtotal}) FILTER (WHERE ${NO_CANCELADO}), 0)::int`,
  domicilio: sql<number>`COALESCE(SUM(${order.costoDomicilio}) FILTER (WHERE ${NO_CANCELADO}), 0)::int`,
  descuento: sql<number>`COALESCE(SUM(${order.descuento}) FILTER (WHERE ${NO_CANCELADO}), 0)::int`,
  ventas: sql<number>`COALESCE(SUM(${order.total}) FILTER (WHERE ${NO_CANCELADO}), 0)::int`,
};

const VACIO: Omit<ResumenDelDia, "porMetodo"> = {
  pedidos: 0,
  cancelados: 0,
  domicilios: 0,
  recoger: 0,
  productos: 0,
  domicilio: 0,
  descuento: 0,
  ventas: 0,
};

/**
 * Las cifras de un día en Bogotá.
 *
 * **Se agrega en SQL y no sobre la lista que ya está en pantalla**, y esa decisión es lo único
 * delicado de este módulo. En un día pasado daría igual, pero en **hoy** el tablero muestra "lo
 * vivo siempre, más lo terminado de hoy": esa lista arrastra pedidos vivos creados **ayer** y
 * está topada en 100 filas. Sumarla daría una cifra que no es la del día y que además se corta
 * sola justo el día que más se factura.
 *
 * Aquí la pregunta es exacta —los pedidos **creados** ese día— y la respuesta es una fila que no
 * depende de ningún `limit`.
 */
export async function resumenDelDia(storeId: string, dia: string): Promise<ResumenDelDia> {
  const { desde, hasta } = rangoDelDia(dia);
  const delDia = and(
    eq(order.storeId, storeId),
    gte(order.creadoEn, desde.toISOString()),
    // Estrictamente menor: `hasta` es la medianoche del día siguiente y ya pertenece a él.
    lt(order.creadoEn, hasta.toISOString()),
  );

  const [totales, metodos] = await Promise.all([
    db.select(CIFRAS).from(order).where(delDia),
    db
      .select({
        metodo: order.metodoPago,
        pedidos: sql<number>`count(*)::int`,
        monto: sql<number>`COALESCE(SUM(${order.total}), 0)::int`,
      })
      .from(order)
      // El cuadre de caja es de lo que se cobró: un pedido cancelado no dejó plata en el cajón.
      .where(and(delDia, NO_CANCELADO))
      .groupBy(order.metodoPago),
  ]);

  const porMetodo = new Map(metodos.map((m) => [m.metodo, m]));

  return {
    ...(totales[0] ?? VACIO),
    // Los cuatro van siempre, incluidos los que quedaron en cero: una fila que desaparece se lee
    // como un olvido, y "Datáfono $0" es información para quien cierra.
    porMetodo: METODOS_PAGO.map((metodo) => ({
      metodo,
      pedidos: porMetodo.get(metodo)?.pedidos ?? 0,
      monto: porMetodo.get(metodo)?.monto ?? 0,
    })),
  };
}

// ------------------------------------------------------------
// Los pedidos del rango — lo que alimenta el XLSX
// ------------------------------------------------------------

/** Todo lo que se puede decir de un pedido cerrado. Es el ancho de la hoja de cálculo. */
export type PedidoParaExport = {
  id: string;
  numero: number;
  tipo: TipoPedido;
  estado: EstadoPedido;
  creadoEn: Date;
  /** Cuándo se entregó o se canceló, del último evento terminal. `null` si sigue vivo. */
  cerradoEn: Date | null;
  programadoPara: Date | null;
  clienteNombre: string;
  clienteTelefono: string;
  recibeNombre: string | null;
  recibeTelefono: string | null;
  barrio: string | null;
  direccion: string | null;
  indicaciones: string | null;
  zonaNombre: string | null;
  punto: { lat: number; lng: number } | null;
  /** Quién lo llevó, congelado al asignar (regla 2). */
  domiciliarioNombre: string | null;
  metodoPago: string;
  pagaCon: number | null;
  notas: string | null;
  subtotal: number;
  costoDomicilio: number;
  descuento: number;
  /** Con qué cupón se descontó, congelado (regla 2). `null` si no hubo. */
  cuponCodigo: string | null;
  total: number;
  items: ItemSnapshot[];
};

export type PedidosDelRango = {
  pedidos: PedidoParaExport[];
  /**
   * Cuántas líneas se cayeron por tener un snapshot que no valida.
   *
   * En pantalla eso se descarta en silencio y es tolerable. En un archivo que va a contabilidad
   * no: un total que no cuadra sin explicación es peor que uno con una nota al pie.
   */
  lineasDescartadas: number;
};

const TERMINALES: EstadoPedido[] = ["entregado", "cancelado"];

/**
 * Los pedidos creados en un rango de días, con todo lo que hay que saber de ellos.
 *
 * **No reusa `listarPedidosDelDia`**, y no por gusto: aquella tiene `TOPE_DIA = 300` y un export
 * que descarta filas en silencio es peor que uno lento — el Excel se vería completo y la suma
 * saldría corta. Aquí el tope es el del rango (`MAXIMO_DIAS_RANGO`), que sí se le puede decir a
 * quien descarga.
 */
export async function pedidosDelRango(
  storeId: string,
  desdeDia: string,
  hastaDia: string,
): Promise<PedidosDelRango> {
  const { desde, hasta } = rangoDeDias(desdeDia, hastaDia);

  const filas = await db.query.order.findMany({
    where: and(
      eq(order.storeId, storeId),
      gte(order.creadoEn, desde.toISOString()),
      lt(order.creadoEn, hasta.toISOString()),
    ),
    // Un select normal sobre `geometry` devuelve WKB en hexadecimal, así que el punto se pide
    // aparte ya convertido — igual que en `obtenerPedidoPorNumero`.
    extras: { puntoGeo: sql<string | null>`ST_AsGeoJSON(${order.punto})`.as("punto_geo") },
    orderBy: asc(order.creadoEn),
    with: {
      orderItems: { columns: { cantidad: true, snapshot: true }, orderBy: asc(orderItem.orden) },
      orderStatusEvents: { columns: { estado: true, creadoEn: true } },
    },
  });

  let lineasDescartadas = 0;

  const pedidos = filas.map((fila) => {
    const items = fila.orderItems.flatMap((item) => {
      const parsed = itemSnapshotSchema.safeParse(item.snapshot);
      if (!parsed.success) {
        lineasDescartadas += 1;
        return [];
      }
      return [parsed.data];
    });

    // El evento terminal es único por construcción (`entregado` y `cancelado` no tienen salida),
    // pero se toma el más tardío por si algún día deja de serlo.
    const cierres = fila.orderStatusEvents
      .filter((e) => TERMINALES.includes(e.estado))
      .map((e) => new Date(e.creadoEn).getTime());

    return {
      id: fila.id,
      numero: fila.numero,
      tipo: fila.tipo,
      estado: fila.estado,
      creadoEn: new Date(fila.creadoEn),
      cerradoEn: cierres.length > 0 ? new Date(Math.max(...cierres)) : null,
      programadoPara: fila.programadoPara ? new Date(fila.programadoPara) : null,
      clienteNombre: fila.clienteNombre,
      clienteTelefono: fila.clienteTelefono,
      recibeNombre: fila.recibeNombre,
      recibeTelefono: fila.recibeTelefono,
      barrio: fila.barrio,
      direccion: fila.direccion,
      indicaciones: fila.indicaciones,
      zonaNombre: fila.zonaNombre,
      punto: puntoDesdeGeoJSON(fila.puntoGeo),
      domiciliarioNombre: fila.domiciliarioNombre,
      metodoPago: fila.metodoPago,
      pagaCon: fila.pagaCon,
      notas: fila.notas,
      subtotal: fila.subtotal,
      costoDomicilio: fila.costoDomicilio,
      descuento: fila.descuento,
      cuponCodigo: fila.cuponCodigo,
      total: fila.total,
      items,
    };
  });

  return { pedidos, lineasDescartadas };
}
