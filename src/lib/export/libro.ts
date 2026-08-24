import writeXlsxFile, { type Row, type SheetData } from "write-excel-file/node";
import type { PedidoParaExport } from "@/db/queries/resumen";
import { enHoraDeBogota, rotuloDeDia } from "@/lib/pedidos/dias";
import { METODO_PAGO_ETIQUETA } from "@/lib/pedidos/estados";
import {
  hojaClientes,
  hojaDetalle,
  hojaPedidos,
  hojaProductos,
  hojaResumen,
  totalesPorMetodo,
} from "./hojas";

/**
 * El archivo XLSX, a partir de las filas que arma `hojas.ts`.
 *
 * Aquí no hay ninguna regla de negocio: solo se traducen datos a celdas. Todo lo que se pueda
 * equivocar en las cifras se decide —y se prueba— en `hojas.ts`; lo que se puede equivocar aquí
 * es el formato, y de eso solo dos cosas importan de verdad:
 *
 * - **Los montos son números, no texto.** Un Excel donde el total es la cadena "$59.500" no se
 *   puede sumar con `=SUMA()`, que es justo para lo que se descarga. `pesos()` se queda en la
 *   pantalla; aquí va el entero con formato `#,##0`.
 * - **Las fechas pasan por `enHoraDeBogota`.** Excel guarda un número de días sin zona horaria,
 *   así que sin corregir se abriría todo cinco horas adelantado.
 */

/** Miles con separador y sin decimales: los pesos colombianos son enteros (regla 7). */
const PESOS = "#,##0";
const FECHA_HORA = "yyyy-mm-dd hh:mm";
const FECHA = "yyyy-mm-dd";

function titulo(texto: string): Row {
  return [{ value: texto, type: String, fontWeight: "bold" }];
}

function cabecera(nombres: string[]): Row {
  return nombres.map(
    (value): Row[number] => ({
      value,
      type: String,
      fontWeight: "bold",
      backgroundColor: "#F3E7DC",
    }),
  );
}

function dinero(valor: number | null, negrita = false): Row[number] {
  return { value: valor ?? 0, type: Number, format: PESOS, fontWeight: negrita ? "bold" : undefined };
}

function texto(valor: string | null): Row[number] {
  // `null` deja la celda vacía. Un "-" o un "N/A" se pega a los filtros de Excel y a las
  // fórmulas; una celda vacía no.
  return valor ? { value: valor, type: String } : null;
}

function momento(valor: Date | null, formato = FECHA_HORA): Row[number] {
  return valor ? { value: enHoraDeBogota(valor), type: Date, format: formato } : null;
}

// ------------------------------------------------------------

function datosResumen(
  pedidos: PedidoParaExport[],
  desde: string,
  hasta: string,
  lineasDescartadas: number,
): SheetData {
  const { dias, total } = hojaResumen(pedidos, desde, hasta);

  const filaCifras = (f: (typeof dias)[number], etiqueta: Row[number], negrita = false) => [
    etiqueta,
    { value: f.pedidos, type: Number, fontWeight: negrita ? ("bold" as const) : undefined },
    { value: f.cancelados, type: Number },
    { value: f.domicilios, type: Number },
    { value: f.recoger, type: Number },
    dinero(f.productos, negrita),
    dinero(f.domicilio, negrita),
    dinero(f.descuento, negrita),
    dinero(f.ventas, negrita),
  ];

  const filas: SheetData = [
    titulo(`Pedidos del ${desde} al ${hasta}`),
    [],
    cabecera([
      "Día",
      "Pedidos",
      "Cancelados",
      "Domicilios",
      "Recoger",
      "Productos",
      "Domicilios $",
      "Descuentos",
      "Total",
    ]),
    ...dias.map((d) =>
      filaCifras(d, { value: enHoraDeBogota(new Date(`${d.dia}T12:00:00Z`)), type: Date, format: FECHA }),
    ),
    filaCifras(total, { value: "TOTAL", type: String, fontWeight: "bold" }, true),
    [],
    titulo("Cuadre de caja — por método de pago"),
    cabecera(["Método", "Pedidos", "Total"]),
    ...totalesPorMetodo(pedidos).map((m) => [
      { value: METODO_PAGO_ETIQUETA[m.metodo] ?? m.metodo, type: String },
      { value: m.pedidos, type: Number },
      dinero(m.monto),
    ]),
  ];

  // Un total que no cuadra sin explicación es peor que uno con una nota al pie. En pantalla estas
  // líneas se descartan en silencio; en un archivo que va a contabilidad, no.
  if (lineasDescartadas > 0) {
    filas.push(
      [],
      titulo(
        `Atención: ${lineasDescartadas} línea(s) de producto no se pudieron leer y no están en las hojas de detalle.`,
      ),
    );
  }

  return filas;
}

function datosPedidos(pedidos: PedidoParaExport[]): SheetData {
  return [
    cabecera([
      "# Pedido",
      "Fecha y hora",
      "Cerrado en",
      "Estado",
      "Tipo",
      "Cliente",
      "Teléfono",
      "Recibe",
      "Teléfono recibe",
      "Barrio",
      "Dirección",
      "Indicaciones",
      "Latitud",
      "Longitud",
      "Zona de cobro",
      "Domiciliario",
      "Programado para",
      "Método de pago",
      "Paga con",
      "Productos",
      "Domicilio",
      "Descuento",
      // Junto a "Descuento" y no al final: quien lee la fila quiere el porqué al lado de la cifra.
      "Usó cupón",
      "Cupón",
      "Total",
      "Notas",
      // El consentimiento va al final: es metadato de auditoría, no operación del pedido.
      "Aceptó datos",
      "Aceptó el",
      "Versión política",
      "Avisos WhatsApp",
      "Id de orden",
    ]),
    ...hojaPedidos(pedidos).map((p) => [
      { value: p.numero, type: Number },
      momento(p.creadoEn),
      momento(p.cerradoEn),
      texto(p.estado),
      texto(p.tipo),
      texto(p.cliente),
      texto(p.telefono),
      texto(p.recibe),
      texto(p.telefonoRecibe),
      texto(p.barrio),
      texto(p.direccion),
      texto(p.indicaciones),
      // Seis decimales: es la precisión de un pin de mapa, y con menos no se distingue una casa.
      p.latitud === null ? null : { value: p.latitud, type: Number, format: "0.000000" },
      p.longitud === null ? null : { value: p.longitud, type: Number, format: "0.000000" },
      texto(p.zona),
      texto(p.domiciliario),
      momento(p.programadoPara),
      texto(p.metodoPago),
      p.pagaCon === null ? null : dinero(p.pagaCon),
      dinero(p.productos),
      dinero(p.domicilio),
      dinero(p.descuento),
      texto(p.usoCupon),
      texto(p.cupon),
      dinero(p.total),
      texto(p.notas),
      texto(p.aceptoDatos),
      momento(p.aceptoEl),
      texto(p.versionPolitica),
      texto(p.avisosWhatsapp),
      texto(p.id),
    ]),
  ];
}

function datosDetalle(pedidos: PedidoParaExport[]): SheetData {
  return [
    cabecera([
      "# Pedido",
      "Fecha y hora",
      "Estado",
      "Producto",
      "Cantidad",
      "Modificadores",
      "Subtotal",
      "Notas",
    ]),
    ...hojaDetalle(pedidos).map((d) => [
      { value: d.numero, type: Number },
      momento(d.creadoEn),
      texto(d.estado),
      texto(d.producto),
      { value: d.cantidad, type: Number },
      texto(d.modificadores),
      dinero(d.subtotal),
      texto(d.notas),
    ]),
  ];
}

function datosProductos(pedidos: PedidoParaExport[]): SheetData {
  return [
    cabecera(["Producto", "Cantidad vendida", "Cantidad cancelada", "Importe"]),
    ...hojaProductos(pedidos).map((p) => [
      texto(p.producto),
      { value: p.vendida, type: Number },
      { value: p.cancelada, type: Number },
      dinero(p.importe),
    ]),
  ];
}

function datosClientes(pedidos: PedidoParaExport[]): SheetData {
  return [
    cabecera([
      // Primero el teléfono: es lo que identifica al cliente, y el nombre solo lo acompaña.
      "Teléfono",
      "Cliente",
      "Pedidos",
      "Cancelados",
      "Gastado",
      "Aceptó datos",
      "Aceptó por primera vez",
      "Aceptó por última vez",
      "Avisos WhatsApp",
    ]),
    ...hojaClientes(pedidos).map((c) => [
      texto(c.telefono),
      texto(c.cliente),
      { value: c.pedidos, type: Number },
      { value: c.cancelados, type: Number },
      dinero(c.gastado),
      texto(c.aceptoDatos),
      momento(c.primeraAceptacion),
      momento(c.ultimaAceptacion),
      texto(c.aceptaAvisos),
    ]),
  ];
}

/**
 * Un ancho por columna, en el mismo orden que la cabecera.
 *
 * `write-excel-file` no se queja si el array no cuadra: si sobran anchos los ignora, y si faltan
 * deja el resto en el default de Excel. Eso ya pasó una vez —`pedidos` tenía 25 anchos para 26
 * columnas desde que se añadió "Cupón", así que el UUID de "Id de orden" salía estrecho y todo lo
 * demás corrido un puesto—, y como nada falla, la única forma de notarlo es contando. Al tocar una
 * cabecera hay que tocar su fila de aquí.
 */
const ANCHOS = {
  resumen: [16, 10, 12, 12, 10, 14, 14, 12, 14],
  // 31 columnas.
  pedidos: [
    10, 18, 18, 14, 18, 22, 16, 22, 16, 18, 34, 26, 12, 12, 16, 20, 18, 16, 12, 14, 12, 12, 12, 14,
    14, 30, 14, 18, 16, 16, 38,
  ],
  detalle: [10, 18, 14, 30, 10, 44, 14, 26],
  productos: [34, 18, 20, 14],
  // 9 columnas.
  clientes: [16, 22, 10, 12, 14, 14, 18, 18, 16],
};

export type LibroDePedidos = {
  buffer: Buffer;
  nombreArchivo: string;
};

/**
 * El libro completo: Resumen, Pedidos, Detalle, Productos vendidos y Clientes.
 *
 * `Clientes` va al final y no junto a `Pedidos` porque es la única que no se lee por pedido:
 * responde "quién compra aquí y qué consintió", que es la pregunta de una auditoría, no la del
 * cierre de caja.
 *
 * Falta una hoja que sí tiene el panel del que se tomó la referencia, y falta a propósito:
 * `Sedes`, porque aquí hay una sola tienda.
 *
 * `Domiciliarios` tampoco está, pero por otro motivo: los domiciliarios son una agenda de
 * contactos externos, no una nómina con turnos ni pagos que reportar. Quién llevó cada pedido sí
 * viaja, en su columna de la hoja `Pedidos`, que es donde sirve para cruzarlo con las ventas.
 */
export async function libroDePedidos(
  pedidos: PedidoParaExport[],
  desde: string,
  hasta: string,
  lineasDescartadas = 0,
): Promise<LibroDePedidos> {
  const buffer = await writeXlsxFile([
    {
      sheet: "Resumen",
      data: datosResumen(pedidos, desde, hasta, lineasDescartadas),
      columns: ANCHOS.resumen.map((width) => ({ width })),
    },
    {
      sheet: "Pedidos",
      data: datosPedidos(pedidos),
      columns: ANCHOS.pedidos.map((width) => ({ width })),
      // La cabecera se queda a la vista al bajar: son treinta y una columnas y sin esto no se
      // sabe qué se está mirando en la fila 200.
      stickyRowsCount: 1,
    },
    {
      sheet: "Detalle",
      data: datosDetalle(pedidos),
      columns: ANCHOS.detalle.map((width) => ({ width })),
      stickyRowsCount: 1,
    },
    {
      sheet: "Productos vendidos",
      data: datosProductos(pedidos),
      columns: ANCHOS.productos.map((width) => ({ width })),
      stickyRowsCount: 1,
    },
    {
      sheet: "Clientes",
      data: datosClientes(pedidos),
      columns: ANCHOS.clientes.map((width) => ({ width })),
      stickyRowsCount: 1,
    },
  ]).toBuffer();

  return { buffer, nombreArchivo: nombreDeArchivo(desde, hasta) };
}

/** "cronchy-pedidos-2025-12-09.xlsx" o "cronchy-pedidos-2025-12-05-a-2025-12-09.xlsx". */
function nombreDeArchivo(desde: string, hasta: string): string {
  return desde === hasta
    ? `cronchy-pedidos-${desde}.xlsx`
    : `cronchy-pedidos-${desde}-a-${hasta}.xlsx`;
}

/** Lo que se le dice al usuario en el diálogo antes de descargar. */
export function rotuloDeRango(desde: string, hasta: string, hoy: string): string {
  return desde === hasta
    ? rotuloDeDia(desde, hoy)
    : `${rotuloDeDia(desde, hoy)} — ${rotuloDeDia(hasta, hoy)}`;
}
