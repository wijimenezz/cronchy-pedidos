import { and, asc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { order, orderItem, orderStatusEvent } from "@/db/schema";
import { itemSnapshotSchema } from "@/lib/validaciones";
import { rangoDeDias, rangoDelDia } from "@/lib/pedidos/dias";
import { puntoDesdeGeoJSON } from "@/lib/zonas";
import type { EstadoPedido, ItemSnapshot, TipoPedido } from "@/lib/notificaciones/plantillas";
import type { PromedioEntrega } from "@/lib/pedidos/tiempos";

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
  /**
   * Cuánto se tardó de media entre que entró el pedido y se entregó, en minutos.
   *
   * `null` cuando no hubo ninguna entrega que medir ese día: un "0 min" sería una cifra falsa, no
   * un dato que falta. Los pedidos **programados quedan fuera** — ver `pedidos/tiempos.ts`.
   */
  tiempos: PromedioEntrega | null;
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

/** Un día sin un solo pedido. `porMetodo` y `tiempos` los pone el `return`, no esta constante. */
const VACIO: Omit<ResumenDelDia, "porMetodo" | "tiempos"> = {
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
 * Cuánto se tardó de media en entregar, en total y por tipo.
 *
 * **Se agrega en SQL como todo lo demás de este módulo**, y no llamando a `promedioDeEntrega`:
 * eso obligaría a traerse los pedidos del día enteros para sacar una cifra, que es justo lo que el
 * docblock de `resumenDelDia` explica que no se hace. El precio es que el criterio vive en dos
 * idiomas —aquí y en `lib/pedidos/tiempos.ts`, que es el que usa el XLSX— así que **si cambia uno,
 * cambia el otro**. Son dos: entregado, y no programado.
 *
 * `JOIN LATERAL` con `max` y no un join a secas: si algún día un pedido llegara a tener dos
 * eventos `entregado`, un join lo contaría dos veces y el promedio saldría mal sin avisar de nada.
 *
 * Puede separarse **un minuto** de lo que da `promedioDeEntrega` sobre los mismos pedidos, y no
 * es un error: aquí se promedian segundos y se redondea al final, y allí cada pedido se trunca a
 * minutos antes de promediar. Medido sobre un día real: 1137 contra 1136. Si alguna vez cuadra
 * mal por más que eso, el problema es otro.
 *
 * `programado_para IS NULL` es la mitad que no se ve venir. Un pedido tomado a las 9 de la noche
 * para el día siguiente a las 2 pm da 17 horas aunque la cocina tardara veinte minutos, y con dos
 * o tres al mes esta cifra dejaría de medir el local.
 */
async function tiemposDelDia(delDia: SQL | undefined): Promise<PromedioEntrega | null> {
  const filas = await db
    .select({
      tipo: order.tipo,
      entregados: sql<number>`count(*)::int`,
      minutos: sql<number>`AVG(EXTRACT(EPOCH FROM (ev.entregado_en - ${order.creadoEn})) / 60)::int`,
    })
    .from(order)
    .innerJoin(
      sql`LATERAL (
        SELECT max(${orderStatusEvent.creadoEn}) AS entregado_en
        FROM ${orderStatusEvent}
        WHERE ${orderStatusEvent.orderId} = ${order.id} AND ${orderStatusEvent.estado} = 'entregado'
      ) ev`,
      sql`ev.entregado_en IS NOT NULL`,
    )
    .where(and(delDia, sql`${order.programadoPara} IS NULL`))
    .groupBy(order.tipo);

  const entregados = filas.reduce((n, f) => n + f.entregados, 0);
  if (entregados === 0) return null;

  const deTipo = (tipo: TipoPedido) => filas.find((f) => f.tipo === tipo)?.minutos ?? null;
  // El general se recompone ponderando por tipo, no promediando los dos promedios: nueve
  // domicilios y un recoger no pesan lo mismo.
  const total = filas.reduce((n, f) => n + f.minutos * f.entregados, 0);

  return {
    general: Math.round(total / entregados),
    domicilio: deTipo("domicilio"),
    recoger: deTipo("recoger"),
    entregados,
  };
}

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

  const [totales, metodos, tiempos] = await Promise.all([
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
    tiemposDelDia(delDia),
  ]);

  const porMetodo = new Map(metodos.map((m) => [m.metodo, m]));

  return {
    ...(totales[0] ?? VACIO),
    tiempos,
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
  /**
   * Cuándo se entregó, y solo eso. `null` en lo cancelado y en lo que sigue vivo.
   *
   * Aparte de `cerradoEn` porque aquel mezcla los dos finales: sirve para "¿cuándo dejó de estar
   * abierto?", no para medir cuánto tarda el local. La duración del pedido sale de aquí.
   */
  entregadoEn: Date | null;
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
  /**
   * Cuándo aceptó el cliente el tratamiento de datos, sellado por el servidor. `null` cuando no
   * hay consentimiento registrado, que es el caso de todo lo cobrado antes de que se guardara.
   */
  politicaAceptadaEn: Date | null;
  /** Qué versión del documento aceptó. `null` en lo anterior a que se guardara. */
  politicaVersion: string | null;
  /** Si quiso los avisos por WhatsApp del estado de su pedido. */
  aceptaAvisos: boolean;
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
    const entregas = fila.orderStatusEvents
      .filter((e) => e.estado === "entregado")
      .map((e) => new Date(e.creadoEn).getTime());

    return {
      id: fila.id,
      numero: fila.numero,
      tipo: fila.tipo,
      estado: fila.estado,
      creadoEn: new Date(fila.creadoEn),
      cerradoEn: cierres.length > 0 ? new Date(Math.max(...cierres)) : null,
      entregadoEn: entregas.length > 0 ? new Date(Math.max(...entregas)) : null,
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
      politicaAceptadaEn: fila.politicaAceptadaEn ? new Date(fila.politicaAceptadaEn) : null,
      politicaVersion: fila.politicaVersion,
      aceptaAvisos: fila.aceptaAvisos,
      items,
    };
  });

  return { pedidos, lineasDescartadas };
}
