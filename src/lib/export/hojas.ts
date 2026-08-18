import type { PedidoParaExport } from "@/db/queries/resumen";
import { METODOS_PAGO, type TotalPorMetodo } from "@/db/queries/resumen";
import type { ItemSnapshot } from "@/lib/notificaciones/plantillas";
import { ETIQUETA_ESTADO, METODO_PAGO_ETIQUETA } from "@/lib/pedidos/estados";
import { diaDeBogota, diasDelRango } from "@/lib/pedidos/dias";

/**
 * Las cuatro hojas de la descarga, como datos.
 *
 * Puro y sin base de datos ni XLSX: recibe los pedidos y devuelve filas. Se separa del armado
 * del archivo (`libro.ts`) porque lo que hay que poder probar es **qué dice** el Excel, no cómo
 * se comprime — y una invariante que no cuadre aquí es plata mal contada en la contabilidad del
 * negocio.
 *
 * La regla que gobierna todo el módulo: **un pedido cancelado aparece pero no suma**. Se ve en
 * la hoja de pedidos, se cuenta en su columna de cancelados, y queda fuera de cualquier importe.
 */

function esCancelado(pedido: PedidoParaExport): boolean {
  return pedido.estado === "cancelado";
}

// ------------------------------------------------------------
// Hoja 1 — Resumen
// ------------------------------------------------------------

export type FilaResumen = {
  dia: string;
  pedidos: number;
  cancelados: number;
  domicilios: number;
  recoger: number;
  productos: number;
  domicilio: number;
  descuento: number;
  ventas: number;
};

function cifrasDe(pedidos: PedidoParaExport[], dia: string): FilaResumen {
  const cobrados = pedidos.filter((p) => !esCancelado(p));
  const suma = (f: (p: PedidoParaExport) => number) => cobrados.reduce((n, p) => n + f(p), 0);

  return {
    dia,
    pedidos: pedidos.length,
    cancelados: pedidos.length - cobrados.length,
    domicilios: cobrados.filter((p) => p.tipo === "domicilio").length,
    recoger: cobrados.filter((p) => p.tipo === "recoger").length,
    productos: suma((p) => p.subtotal),
    domicilio: suma((p) => p.costoDomicilio),
    descuento: suma((p) => p.descuento),
    ventas: suma((p) => p.total),
  };
}

/**
 * Una fila por día del rango, más la de totales.
 *
 * Los días sin pedidos salen en cero en vez de faltar: un hueco en la tabla se lee como un dato
 * perdido, y "ese lunes no se abrió" es información.
 */
export function hojaResumen(
  pedidos: PedidoParaExport[],
  desde: string,
  hasta: string,
): { dias: FilaResumen[]; total: FilaResumen } {
  const porDia = new Map<string, PedidoParaExport[]>();
  for (const pedido of pedidos) {
    const dia = diaDeBogota(pedido.creadoEn);
    porDia.set(dia, [...(porDia.get(dia) ?? []), pedido]);
  }

  return {
    dias: diasDelRango(desde, hasta).map((dia) => cifrasDe(porDia.get(dia) ?? [], dia)),
    total: cifrasDe(pedidos, `${desde} a ${hasta}`),
  };
}

/** El cuadre de caja del rango: cuánto entró por cada medio. Los cuatro van siempre. */
export function totalesPorMetodo(pedidos: PedidoParaExport[]): TotalPorMetodo[] {
  const cobrados = pedidos.filter((p) => !esCancelado(p));

  return METODOS_PAGO.map((metodo) => {
    const suyos = cobrados.filter((p) => p.metodoPago === metodo);

    return {
      metodo,
      pedidos: suyos.length,
      monto: suyos.reduce((n, p) => n + p.total, 0),
    };
  });
}

// ------------------------------------------------------------
// Hoja 2 — Pedidos
// ------------------------------------------------------------

export type FilaPedido = {
  numero: number;
  creadoEn: Date;
  cerradoEn: Date | null;
  estado: string;
  tipo: string;
  cliente: string;
  telefono: string;
  recibe: string | null;
  telefonoRecibe: string | null;
  barrio: string | null;
  direccion: string | null;
  indicaciones: string | null;
  latitud: number | null;
  longitud: number | null;
  zona: string | null;
  domiciliario: string | null;
  programadoPara: Date | null;
  metodoPago: string;
  pagaCon: number | null;
  productos: number;
  domicilio: number;
  descuento: number;
  /**
   * El código del cupón, junto al monto que descontó. La columna que CLAUDE.md tenía prometida.
   *
   * `null` cuando no hubo cupón: en una hoja de cálculo, la celda vacía al lado de un descuento en
   * $0 se lee bien, y la del descuento manual del negocio también — no hay código que poner.
   */
  cupon: string | null;
  total: number;
  notas: string | null;
  id: string;
};

/**
 * Una fila por pedido, con todo lo que se puede decir de él.
 *
 * Los montos van como número y las fechas como `Date`: en `libro.ts` se escriben como celdas
 * numéricas y de fecha de verdad. Un Excel donde el total es la cadena "$59.500" no se puede
 * sumar, que es justo para lo que se descarga.
 */
export function hojaPedidos(pedidos: PedidoParaExport[]): FilaPedido[] {
  return pedidos.map((p) => ({
    numero: p.numero,
    creadoEn: p.creadoEn,
    cerradoEn: p.cerradoEn,
    estado: ETIQUETA_ESTADO[p.estado],
    tipo: p.tipo === "domicilio" ? "Domicilio" : "Recoge en tienda",
    cliente: p.clienteNombre,
    telefono: p.clienteTelefono,
    recibe: p.recibeNombre,
    telefonoRecibe: p.recibeTelefono,
    barrio: p.barrio,
    direccion: p.direccion,
    indicaciones: p.indicaciones,
    latitud: p.punto?.lat ?? null,
    longitud: p.punto?.lng ?? null,
    zona: p.zonaNombre,
    domiciliario: p.domiciliarioNombre,
    programadoPara: p.programadoPara,
    metodoPago: METODO_PAGO_ETIQUETA[p.metodoPago] ?? p.metodoPago,
    pagaCon: p.pagaCon,
    productos: p.subtotal,
    domicilio: p.costoDomicilio,
    descuento: p.descuento,
    cupon: p.cuponCodigo,
    total: p.total,
    notas: p.notas,
    id: p.id,
  }));
}

// ------------------------------------------------------------
// Hoja 3 — Detalle
// ------------------------------------------------------------

export type FilaDetalle = {
  numero: number;
  creadoEn: Date;
  estado: string;
  producto: string;
  cantidad: number;
  modificadores: string;
  subtotal: number;
  notas: string | null;
};

/**
 * Los modificadores en una celda: "Salsa incluida: Arequipe · Topping: Oreo".
 *
 * Se agrupan por su grupo, como en el ticket de WhatsApp, porque "Arequipe, Oreo" suelto no dice
 * cuál era la salsa y cuál el topping. Un `x2` solo aparece cuando de verdad se pidió doble.
 */
function textoModificadores(item: ItemSnapshot): string {
  const grupos = new Map<string, string[]>();

  for (const m of item.modificadores) {
    const texto = m.cantidad > 1 ? `${m.nombre} x${m.cantidad}` : m.nombre;
    grupos.set(m.grupo, [...(grupos.get(m.grupo) ?? []), texto]);
  }

  return [...grupos].map(([grupo, nombres]) => `${grupo}: ${nombres.join(", ")}`).join(" · ");
}

/** Una fila por línea de pedido. Con una tabla dinámica responde "¿qué salsa se pide más?". */
export function hojaDetalle(pedidos: PedidoParaExport[]): FilaDetalle[] {
  return pedidos.flatMap((p) =>
    p.items.map((item) => ({
      numero: p.numero,
      creadoEn: p.creadoEn,
      estado: ETIQUETA_ESTADO[p.estado],
      producto: item.nombre,
      cantidad: item.cantidad,
      modificadores: textoModificadores(item),
      subtotal: item.subtotal,
      notas: item.notas ?? null,
    })),
  );
}

// ------------------------------------------------------------
// Hoja 4 — Productos vendidos
// ------------------------------------------------------------

export type FilaProducto = {
  producto: string;
  vendida: number;
  cancelada: number;
  importe: number;
};

/**
 * Cuánto salió de cada producto, ordenado de más a menos.
 *
 * Se agrupa **por nombre de producto** y no por la configuración completa: la pregunta de
 * compras es "¿cuántos Cronchy Mega salieron?", no "¿cuántos con arequipe y oreo?". Ese desglose
 * está en la hoja de detalle, donde una tabla dinámica lo saca.
 *
 * Lo cancelado va en su propia columna en vez de desaparecer: es lo que se preparó de más o lo
 * que se dejó de vender, y ninguna de las dos cosas se ve en el importe.
 */
export function hojaProductos(pedidos: PedidoParaExport[]): FilaProducto[] {
  const acumulado = new Map<string, FilaProducto>();

  for (const pedido of pedidos) {
    const cancelado = esCancelado(pedido);

    for (const item of pedido.items) {
      const fila = acumulado.get(item.nombre) ?? {
        producto: item.nombre,
        vendida: 0,
        cancelada: 0,
        importe: 0,
      };

      if (cancelado) {
        fila.cancelada += item.cantidad;
      } else {
        fila.vendida += item.cantidad;
        fila.importe += item.subtotal;
      }

      acumulado.set(item.nombre, fila);
    }
  }

  return [...acumulado.values()].sort(
    (a, b) => b.vendida - a.vendida || a.producto.localeCompare(b.producto, "es"),
  );
}
