/**
 * EL RECIBO DEL CLIENTE — lo que se cobró, en papel.
 *
 * Hermano de `comanda.ts` y con el mismo trato: puro, sin base de datos y alimentado solo por el
 * `snapshot` congelado (regla 2). Reimprimir un pedido de la semana pasada saca lo que el cliente
 * pagó, no los precios de hoy.
 *
 * **El desglose es el mismo que el del WhatsApp** (`bloqueRecibo` en `plantillas.ts`), hasta en
 * qué líneas se callan: productos, descuento, lo que queda, envío y total, en ese orden, porque
 * es el orden en que las cifras se forman — el cupón se aplica sobre los productos y el domicilio
 * se suma al final (regla 20). Que el papel y el mensaje contaran la misma plata de dos maneras
 * distintas sería un reclamo esperando a pasar.
 */

import { ANCHO, ajustar, centrar, crearTicket, derecha, envolver } from "./escpos";
import { agruparModificadores } from "@/lib/pedidos/modificadores";
import {
  etiquetaMetodo,
  fechaHora,
  pesos,
  subtotalConDescuento,
  type ItemSnapshot,
  type TipoPedido,
} from "@/lib/notificaciones/plantillas";

/** El encabezado: quién cobra y dónde encontrarlo. Sale de `store` (`/admin/ajustes`). */
export type LocalDelRecibo = {
  nombre: string;
  direccion: string | null;
  telefono: string | null;
};

/**
 * Lo que el recibo necesita saber.
 *
 * Tipo propio y no `PedidoPanel`, por lo mismo que `PedidoParaComanda`: este módulo no depende
 * de la capa de base de datos, y la lista de campos documenta qué acaba en el papel.
 */
export type PedidoParaRecibo = {
  numero: number;
  tipo: TipoPedido;
  creadoEn: Date;
  clienteNombre: string;
  /**
   * La dirección de entrega del pedido. **No es `local.direccion`**, que es la del negocio: aquí
   * conviven las dos, igual que `order.barrio` y `order.zona_nombre` en el panel, y confundirlas
   * sería mandar al cliente a su propia casa a recoger.
   */
  direccion?: string | null;
  items: ItemSnapshot[];
  subtotal: number;
  descuento: number;
  /** El cupón congelado (regla 2), o `null` si no hubo — o si fue un ajuste manual. */
  cuponCodigo?: string | null;
  costoDomicilio: number;
  total: number;
  metodoPago: string;
  /** Si cuenta como pagado, que en este negocio es tener comprobante cargado. */
  pagado: boolean;
};

/**
 * Las cuatro columnas de la tabla de ítems, en 48 caracteres.
 *
 * `PRECIO` y `SUBTOTAL` van anchas porque una cifra no se recorta: antes se lleva la columna
 * vecina, que se ve, que perder un dígito, que no.
 */
const COL_PRODUCTO = 20;
const COL_CANTIDAD = 5;
const COL_PRECIO = 11;
const COL_SUBTOTAL = ANCHO - COL_PRODUCTO - COL_CANTIDAD - COL_PRECIO;

/**
 * Lo que este papel es y lo que no.
 *
 * Va como **datos y no como maquetación**, misma doctrina que `plantillas.ts`: el texto de un
 * documento que se entrega al cliente cambia sin tocar la función que lo imprime.
 *
 * Los saltos de línea son los que se pidieron y no los que decidiría `envolver`, así que se emite
 * línea a línea con `linea` y no con `envuelto`. Las tres caben en las 48 columnas; si alguna
 * creciera, el test de ancho lo dice antes que la impresora.
 *
 * En texto normal a propósito: es una advertencia legal al pie, no puede competir con el TOTAL.
 */
const PIE_LEGAL = [
  "RECIBO DE CAJA",
  "Este documento es un comprobante",
  "de pago y no constituye una factura",
  "de venta.",
];

function filaItem(nombre: string, cantidad: string, precio: string, subtotal: string): string {
  return (
    ajustar(nombre, COL_PRODUCTO) +
    centrar(cantidad, COL_CANTIDAD) +
    derecha(precio, COL_PRECIO) +
    derecha(subtotal, COL_SUBTOTAL)
  );
}

/**
 * El precio de UNA unidad, deducido del subtotal de la línea.
 *
 * No hay columna que lo guarde: el snapshot congela `subtotal = precioUnitario × cantidad`, y
 * ese `precioUnitario` ya trae dentro los modificadores cobrados. El redondeo es por si acaso —
 * la división siempre es exacta— y prefiere un peso de diferencia a un recibo con decimales.
 */
function precioUnitario(item: ItemSnapshot): number {
  return item.cantidad > 0 ? Math.round(item.subtotal / item.cantidad) : item.subtotal;
}

export function recibo(pedido: PedidoParaRecibo, local: LocalDelRecibo): Uint8Array {
  const ticket = crearTicket();

  // `envuelto` y no `linea`: a doble ancho la línea son 24 columnas, y el nombre del negocio
  // —"Cronchy - Churros y Helados", 27 caracteres— mide 54 en el papel. `linea` no envuelve, así
  // que la impresora lo partía a media palabra en todos los recibos.
  ticket
    .separador("=")
    .envuelto(local.nombre, { tamano: "doble", centrado: true, negrita: true });

  // Cada línea solo si hay qué escribir: un "Tel:" con el hueco vacío no se lee como "no hay
  // teléfono", se lee como un dato que se perdió por el camino.
  if (local.direccion) ticket.envuelto(local.direccion, { centrado: true });
  if (local.telefono) ticket.linea(`Tel: ${local.telefono}`, { centrado: true });

  ticket
    .separador("=")
    .dato("Pedido:", `#${pedido.numero}`)
    .dato("Fecha:", fechaHora(pedido.creadoEn))
    .dato("Cliente:", pedido.clienteNombre);

  // Solo en domicilio, mismo criterio que el barrio de la comanda: en un recoger no hay a dónde
  // llevarlo, y una dirección bajo el nombre de quien vino al mostrador solo puede confundir.
  // `dato` y no `fila`: aquella recorta la izquierda para salvar la derecha, que es lo correcto
  // con una cifra y desastroso con una dirección de sesenta caracteres.
  if (pedido.tipo === "domicilio" && pedido.direccion) {
    ticket.dato("Dirección:", pedido.direccion);
  }

  ticket
    .separador()
    .linea(filaItem("Producto", "Cant", "Precio", "Subtotal"), { negrita: true })
    .separador();

  for (const item of pedido.items) {
    const [primera, ...resto] = envolver(item.nombre, COL_PRODUCTO);

    ticket.linea(
      filaItem(
        primera ?? "",
        String(item.cantidad),
        pesos(precioUnitario(item)),
        pesos(item.subtotal),
      ),
    );

    // El nombre completo se reparte en líneas propias en vez de recortarse: en un recibo hay
    // que poder reconocer qué se compró.
    for (const trozo of resto) ticket.linea(ajustar(trozo, COL_PRODUCTO));

    const { incluidos, extras } = agruparModificadores(item.modificadores);

    for (const grupo of incluidos) {
      ticket.envuelto(`${grupo.etiqueta}: ${grupo.valores.join(", ")}`, { sangria: 2 });
    }

    // Con su precio ya multiplicado, igual que en el WhatsApp del cliente: esa plata está
    // dentro del subtotal de la línea, y sin nombrarla el cliente no sabe de dónde salió.
    for (const extra of extras) {
      const cantidad = extra.cantidad > 1 ? ` x${extra.cantidad}` : "";
      ticket.envuelto(`+ ${extra.nombre}${cantidad} (${pesos(extra.total)})`, { sangria: 2 });
    }
  }

  ticket.separador("=").fila("Valor Productos:", pesos(pedido.subtotal));

  // El código entre paréntesis cuando lo hubo: un descuento sin explicación es una cifra que el
  // cliente no sabe de dónde salió, y el cupón es justo lo que la explica.
  const etiquetaDescuento = pedido.cuponCodigo
    ? `Descuento (${pedido.cuponCodigo}):`
    : "Descuento:";

  // La línea se escribe aunque valga cero —es un recibo, y su ausencia se leería como que falta
  // algo—, pero el signo menos solo cuando hay algo que restar: "-$0" no es una cifra.
  ticket.fila(
    etiquetaDescuento,
    pedido.descuento > 0 ? `-${pesos(pedido.descuento)}` : pesos(0),
  );

  // Sin descuento, "Subtotal" repetiría la cifra de arriba, y una línea que repite a la anterior
  // se lee como un error.
  if (pedido.descuento > 0) {
    ticket.fila("Subtotal:", pesos(subtotalConDescuento(pedido.subtotal, pedido.descuento)));
  }

  if (pedido.tipo === "domicilio") {
    ticket.fila("Domicilio:", pesos(pedido.costoDomicilio));
  }

  ticket
    .fila("TOTAL:", pesos(pedido.total), ANCHO, { negrita: true })
    .separador()
    .dato("Método de Pago:", etiquetaMetodo(pedido.metodoPago))
    .dato("Estado del Pago:", pedido.pagado ? "Pagado" : "Pendiente")
    .separador("=")
    .linea("¡Gracias por tu compra!", { centrado: true })
    .linea("Sonríe, que la vida es churrísima", { centrado: true })
    .linea();

  for (const renglon of PIE_LEGAL) ticket.linea(renglon, { centrado: true });

  return ticket.cortar().bytes();
}
