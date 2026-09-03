// ============================================================
// src/lib/notificaciones/plantillas.ts
//
// FUENTE ÚNICA del contenido de los mensajes.
// Este archivo NO envía nada: solo arma texto. El envío vive en
// transporte.ts. Así, el día que migres a la Cloud API, aquí no
// se toca una sola línea.
//
// Todo se genera desde el snapshot del pedido, nunca consultando
// precios actuales (regla 2 del CLAUDE.md).
// ============================================================

import { comoLlegarUrl, type Local } from "@/lib/tienda/local";

const SEP = "--------------------------------";

/**
 * Lo que el cliente le escribe al negocio desde "Contáctanos" —el menú lateral y el pie de la
 * carta—, precargado en el chat de WhatsApp.
 *
 * Es el único mensaje de este archivo que va en la dirección contraria: lo manda el cliente, no
 * el negocio. Vive aquí igual, porque la regla 10 es que el TEXTO no se escribe suelto en un
 * componente; hasta ahora estaba duplicado literalmente en el Drawer y en el Footer.
 *
 * No se interpola el nombre de la tienda: quien lo lee ya sabe a qué negocio le escribió, y "vengo
 * de la app de pedidos" es justo el dato que el mostrador no puede deducir del chat.
 */
export const SALUDO_CONTACTO =
  "Holii Cronchy 🥰 Vengo de la app de pedidos y quería preguntarte algo";

/**
 * Lo que el cliente le escribe desde el seguimiento de SU pedido.
 *
 * Aparte de `SALUDO_CONTACTO` porque el número es justo lo que hace útil el mensaje: quien
 * escribe desde ahí tiene una duda de ese pedido, no del negocio en general, y sin el número el
 * mostrador tiene que preguntarlo.
 */
export function saludoPorPedido(numero: number): string {
  return `Hola, escribo por mi pedido #${numero}.`;
}

// ------------------------------------------------------------
// Tipos
// ------------------------------------------------------------

export type TipoPedido = "domicilio" | "recoger";

export type EstadoPedido =
  | "nuevo"
  | "aceptado"
  | "preparando"
  | "en_camino"
  | "listo"
  | "entregado"
  | "cancelado";

export type ModificadorSnapshot = {
  grupo: string; // "Salsa incluida" | "Agregar más salsas"
  nombre: string; // "Arequipe"
  cantidad: number;
  precio: number; // 0 cuando va incluido
};

export type ItemSnapshot = {
  nombre: string;
  cantidad: number;
  subtotal: number;
  modificadores: ModificadorSnapshot[];
  notas?: string | null;
  /**
   * La portada del producto tal como estaba al comprar. Los mensajes de WhatsApp son texto
   * plano y la ignoran; existe para el seguimiento del cliente. Opcional porque los pedidos
   * anteriores a esta columna no la tienen.
   */
  imagen?: string | null;
};

export type PedidoParaMensaje = {
  numero: number;
  tokenPublico: string;
  tipo: TipoPedido;
  clienteNombre: string;
  clienteTelefono: string;
  direccion?: string | null;
  barrio?: string | null;
  indicaciones?: string | null;
  ubicacion?: { lat: number; lng: number } | null;
  horaEntregaEstimada?: Date | null;
  items: ItemSnapshot[];
  subtotal: number;
  costoDomicilio: number;
  descuento: number;
  /**
   * Con qué cupón se descontó, congelado en el pedido (regla 2). `null` cuando no hubo cupón, o
   * cuando el descuento fue un ajuste manual del negocio — que no tiene código que nombrar.
   */
  cuponCodigo?: string | null;
  total: number;
  metodoPago: string;
  /**
   * Si el pedido cuenta como pagado, que es tener comprobante cargado. Decide el "Estado del
   * Pago" que lee el cliente, y es el mismo criterio con el que el domiciliario sabe si cobra.
   */
  pagado: boolean;
  notas?: string | null;
};

export type Tienda = {
  nombre: string;
  baseUrl: string;
};

/**
 * El "llega en 30–45 min" que se edita en `/admin/pedidos`.
 *
 * Va como parámetro del único mensaje que lo usa y **no dentro de `Tienda`**: ese tipo lo
 * construyen sitios que no tienen nada que ver con esto —el checkout arma uno a mano para el
 * mensaje de fuera de cobertura—, y obligarlos a cargar un dato que no van a escribir solo
 * consigue que alguien ponga un número inventado para que compile.
 */
export type EstimadoEntrega = { min: number; max: number };

// ------------------------------------------------------------
// Formateo
// ------------------------------------------------------------

/** 14000 -> "$14.000" */
export function pesos(valor: number): string {
  return `$${valor.toLocaleString("es-CO")}`;
}

/**
 * Lo que valen los productos **ya con el cupón aplicado**, antes del domicilio.
 *
 * Es una resta, y aun así tiene nombre propio porque es lo que la palabra "Subtotal" significa
 * ahora en las cinco pantallas que enseñan plata —el detalle del panel, el seguimiento del cliente
 * y los tres mensajes—. Antes cada una escribía el desglose a su manera y el descuento iba después
 * del domicilio, así que no había ninguna línea que dijera esto y había que hacer la cuenta a ojo.
 *
 * El domicilio NO entra, y no es un olvido: por la regla 20 el cupón nunca descuenta sobre el
 * envío, así que sumarlo aquí sería insinuar que sí.
 *
 * Para el domiciliario esta es, además, **la única cifra de productos que ve** (ver
 * `pedidoParaDomiciliario`): él no cobra un descuento, cobra un número.
 */
export function subtotalConDescuento(
  subtotal: number,
  descuento: number,
): number {
  return subtotal - descuento;
}

/**
 * Cómo se llama cada método de pago cuando lo lee el CLIENTE.
 *
 * `nequi` se rotula "Nequi o Bre-B" porque el QR es el interoperable y la llave sirve desde la
 * app de cualquier entidad: el enum sigue diciendo `nequi` —es historial ya escrito— y el
 * rótulo es de la pantalla, igual que en el checkout.
 *
 * Es hermano de `NOMBRE_METODO`, que dice lo mismo en la forma que necesita el domiciliario
 * ("en efectivo", "por Nequi"). Un método desconocido sale tal cual: se ve raro, no se ve mal.
 */
const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo",
  nequi: "Nequi o Bre-B",
  transferencia: "Transferencia",
  datafono: "Datáfono",
};

export function etiquetaMetodo(metodo: string): string {
  return ETIQUETA_METODO[metodo] ?? metodo;
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** -> "3:45 PM, 23 julio 2026" (siempre en hora de Bogotá) */
export function fechaHora(fecha: Date): string {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(fecha);

  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "";
  const mes = MESES[Number(p("month")) - 1];

  return `${p("hour")}:${p("minute")} ${p("dayPeriod")}, ${p("day")} ${mes} ${p("year")}`;
}

/** -> "14 de agosto de 2026". La fecha sola, para cuando la hora no aporta nada. */
export function fechaLarga(fecha: Date): string {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(fecha);

  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "";

  return `${p("day")} de ${MESES[Number(p("month")) - 1]} de ${p("year")}`;
}

/** -> "7:00 pm". Para donde el día ya se sabe por el contexto, como los chips del selector. */
export function horaCorta(fecha: Date): string {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(fecha);

  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "";

  return `${p("hour")}:${p("minute")} ${p("dayPeriod").toLowerCase()}`;
}

/** El día de Bogotá de un instante, "YYYY-MM-DD". Local a este módulo para no arrastrar
 *  `horario.ts` —y con él toda la capa de base de datos— dentro de las plantillas. */
function diaEnBogota(fecha: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha);
}

/**
 * -> "hoy 7:00 pm" / "mañana 7:00 pm" / "23 julio, 7:00 pm".
 *
 * El día NO es opcional en ningún sitio donde se lea fuera del selector: "7:00 pm" a secas, en
 * un pedido hecho a las once de la noche, se lee como "dentro de un rato", y eso es alguien
 * friendo churros doce horas antes. La tercera forma no debería salir con el horizonte de dos
 * días de hoy, pero un pedido viejo en el panel sí la alcanza.
 */
export function cuandoCorto(fecha: Date, ahora: Date = new Date()): string {
  const hoy = diaEnBogota(ahora);
  const manana = diaEnBogota(new Date(ahora.getTime() + 24 * 60 * 60 * 1000));
  const dia = diaEnBogota(fecha);

  if (dia === hoy) return `hoy ${horaCorta(fecha)}`;
  if (dia === manana) return `mañana ${horaCorta(fecha)}`;

  const [, mes, numero] = dia.split("-").map(Number);

  return `${numero} ${MESES[mes - 1]}, ${horaCorta(fecha)}`;
}

export function mapsUrl(ubicacion: { lat: number; lng: number }): string {
  return `https://maps.google.com/maps?q=${ubicacion.lat},${ubicacion.lng}`;
}

function urlSeguimiento(tienda: Tienda, token: string): string {
  return `${tienda.baseUrl}/pedido/${token}`;
}

// ------------------------------------------------------------
// Detalle del pedido (compartido por el mensaje del cliente y el del negocio)
// ------------------------------------------------------------

function lineasItem(item: ItemSnapshot): string[] {
  const lineas = [
    `▼ ${item.cantidad}x ${item.nombre} — ${pesos(item.subtotal)}`,
  ];

  // Agrupar modificadores por grupo, respetando el orden en que llegaron
  const grupos = new Map<string, ModificadorSnapshot[]>();
  for (const m of item.modificadores) {
    const lista = grupos.get(m.grupo) ?? [];
    lista.push(m);
    grupos.set(m.grupo, lista);
  }

  for (const [grupo, mods] of grupos) {
    const texto = mods
      .map((m) => {
        const cant = m.cantidad > 1 ? `${m.cantidad}x ` : "";
        const extra = m.precio > 0 ? ` (${pesos(m.precio * m.cantidad)})` : "";
        return `${cant}${m.nombre}${extra}`;
      })
      .join(", ");
    lineas.push(`   ${grupo}: ${texto}`);
  }

  if (item.notas) lineas.push(`   Nota: ${item.notas}`);

  return lineas;
}

/**
 * IMPORTANTE: cuando el cliente NO eligió sus incluidas, hay que decirlo
 * explícito. Si se omite la línea, en cocina asumen que se imprimió mal.
 */
function lineasFaltantes(item: ItemSnapshot, esperados: string[]): string[] {
  const presentes = new Set(item.modificadores.map((m) => m.grupo));
  return esperados
    .filter((g) => !presentes.has(g))
    .map((g) => `   >> SIN ${g.toUpperCase()} (el cliente no eligió)`);
}

function bloqueItems(pedido: PedidoParaMensaje): string {
  return pedido.items.flatMap((i) => lineasItem(i)).join("\n");
}

/**
 * El resumen corto de la plata, en el mismo orden que todas las demás pantallas: los productos,
 * lo que quita el cupón, lo que queda, el envío y el total.
 *
 * **El descuento va ANTES del domicilio y no después**, porque es el orden en que las cifras se
 * forman: el cupón se aplica sobre los productos y el envío se suma al final (regla 20 — el
 * domicilio nunca entra en la base del descuento). Al revés había que hacer la cuenta a ojo para
 * saber de dónde salía el total.
 *
 * A diferencia del recibo del cliente, aquí las líneas que valen cero no se escriben: esto es un
 * resumen, no un recibo.
 */
function bloqueTotales(pedido: PedidoParaMensaje): string {
  const lineas = [`*Productos:* ${pesos(pedido.subtotal)}`];

  // Las dos van juntas o no va ninguna: sin descuento, "Subtotal" sería la misma cifra de arriba
  // repetida, y una línea que repite a la anterior se lee como un error.
  if (pedido.descuento > 0) {
    lineas.push(
      pedido.cuponCodigo
        ? `*Descuento (${pedido.cuponCodigo}):* -${pesos(pedido.descuento)}`
        : `*Descuento:* -${pesos(pedido.descuento)}`,
    );
    lineas.push(
      `*Subtotal:* ${pesos(subtotalConDescuento(pedido.subtotal, pedido.descuento))}`,
    );
  }

  if (pedido.costoDomicilio > 0) {
    lineas.push(`*Domicilio:* ${pesos(pedido.costoDomicilio)}`);
  }

  lineas.push(`*Total:* ${pesos(pedido.total)}`);
  lineas.push(`*Pago:* ${pedido.metodoPago}`);

  return lineas.join("\n");
}

/**
 * Cuándo lo quiere el cliente. Se escribe SIEMPRE, también cuando es para ya: en un mensaje
 * que se lee de un vistazo, la ausencia de línea se lee como un olvido, no como "para ahora".
 *
 * Lleva el día y no solo la hora porque hoy y mañana conviven en la misma bandeja: "7:00 pm"
 * a secas, en un pedido que entró a las once de la noche, es alguien friendo doce horas antes.
 */
function lineaCuando(pedido: PedidoParaMensaje, etiqueta: string): string {
  return `*${etiqueta}:* ${
    pedido.horaEntregaEstimada
      ? cuandoCorto(pedido.horaEntregaEstimada)
      : "lo antes posible"
  }`;
}

/**
 * El desglose de la plata, tal como lo lee el cliente cuando le aceptan el pedido.
 *
 * El orden es el de todas las demás pantallas —productos, descuento, lo que queda, envío, total—
 * porque es el orden en que las cifras se forman: el cupón se aplica sobre los productos y el
 * domicilio se suma al final (regla 20). Antes el descuento iba después del envío y el cliente
 * tenía que hacer la resta de cabeza para cuadrar el total.
 *
 * **La línea de descuento se escribe aunque valga cero**: es un recibo, y en un recibo su ausencia
 * no se lee como "no hubo descuento" sino como "aquí falta algo". La de `Subtotal`, en cambio,
 * solo aparece cuando hubo — sin descuento repetiría la cifra de arriba. Y el domicilio se calla
 * cuando el cliente recoge, porque ahí no existe el concepto.
 *
 * Las cifras salen del snapshot del pedido y no se recalculan (regla 2), así que suman solas:
 * productos − descuento + domicilio = total.
 */
function bloqueRecibo(pedido: PedidoParaMensaje): string[] {
  const lineas = [`*Valor Productos:* ${pesos(pedido.subtotal)}`];

  // El código va entre paréntesis cuando lo hubo: en un recibo, un descuento sin explicación es
  // una cifra que el cliente no sabe de dónde salió, y el cupón es justo lo que la explica.
  const etiquetaDescuento = pedido.cuponCodigo
    ? `Descuento (${pedido.cuponCodigo})`
    : "Descuento";

  // El signo menos solo cuando hay algo que restar: "-$0" no es una cifra, es un adorno.
  lineas.push(
    pedido.descuento > 0
      ? `*${etiquetaDescuento}:* -${pesos(pedido.descuento)}`
      : `*${etiquetaDescuento}:* ${pesos(0)}`,
  );

  if (pedido.descuento > 0) {
    lineas.push(
      `*Subtotal:* ${pesos(subtotalConDescuento(pedido.subtotal, pedido.descuento))}`,
    );
  }

  if (pedido.tipo === "domicilio") {
    lineas.push(`*Domicilio:* ${pesos(pedido.costoDomicilio)}`);
  }

  lineas.push(`*Total:* ${pesos(pedido.total)}`);
  lineas.push(`*Método de Pago:* ${etiquetaMetodo(pedido.metodoPago)}`);
  lineas.push(`*Estado del Pago:* ${pedido.pagado ? "Pagado" : "Pendiente"}`);

  return lineas;
}

/**
 * Cuándo llega, con el rango que promete la tienda.
 *
 * El "(30-45 min)" solo acompaña a "lo antes posible": con una hora elegida, añadirlo diria dos
 * cosas distintas sobre el mismo pedido. El rango sale de la tienda y no de una constante porque
 * se sube desde el panel el dia que la cocina va lenta, y el mensaje tiene que ir detrás.
 */
function lineaLlegada(
  pedido: PedidoParaMensaje,
  estimado: EstimadoEntrega,
  etiqueta: string,
  ahora: Date,
): string {
  if (pedido.horaEntregaEstimada) {
    // El mismo `ahora` con el que se escribió la fecha de entrega dos líneas más arriba: si uno
    // mirara el reloj y el otro no, el mensaje podría decir "mañana 7:00 pm" bajo una fecha de
    // hoy. Y de paso deja de depender del día en que se corran los tests.
    return `*${etiqueta}:* ${cuandoCorto(pedido.horaEntregaEstimada, ahora)}`;
  }

  return `*${etiqueta}:* lo antes posible (${estimado.min}-${estimado.max} min)`;
}

function bloqueEntrega(pedido: PedidoParaMensaje): string {
  if (pedido.tipo === "recoger") {
    return "*Tipo:* Recoger en tienda";
  }

  const lineas = ["*Tipo:* Domicilio"];
  if (pedido.direccion) lineas.push(`*Dirección:* ${pedido.direccion}`);
  if (pedido.barrio) lineas.push(`*Barrio:* ${pedido.barrio}`);
  if (pedido.indicaciones)
    lineas.push(`*Detalles entrega:* ${pedido.indicaciones}`);
  if (pedido.ubicacion)
    lineas.push(`*Google Maps:* ${mapsUrl(pedido.ubicacion)}`);

  return lineas.join("\n");
}

// ------------------------------------------------------------
// Mensaje 1 — confirmación al CLIENTE
// ------------------------------------------------------------

export function confirmacionCliente(
  pedido: PedidoParaMensaje,
  tienda: Tienda,
): string {
  const partes: string[] = [];

  partes.push(
    `¡Hola ${pedido.clienteNombre}, te informamos que *${tienda.nombre}* recibió tu pedido!`,
  );
  partes.push("");
  partes.push(`*Pedido:* #${pedido.numero}`);
  partes.push(bloqueEntrega(pedido));

  partes.push(
    lineaCuando(
      pedido,
      pedido.tipo === "recoger" ? "Listo" : "Hora de entrega",
    ),
  );

  partes.push(SEP);
  partes.push("*Tu pedido:*");
  partes.push(bloqueItems(pedido));
  partes.push(SEP);
  partes.push(bloqueTotales(pedido));

  if (pedido.notas) {
    partes.push(SEP);
    partes.push(`*Notas:* ${pedido.notas}`);
  }

  partes.push(SEP);
  partes.push("Sigue tu pedido en tiempo real aquí:");
  partes.push(urlSeguimiento(tienda, pedido.tokenPublico));
  partes.push("");
  partes.push("¡Estaremos en contacto!");

  return partes.join("\n");
}

// ------------------------------------------------------------
// Mensaje 2 — pedido nuevo al NEGOCIO
// ------------------------------------------------------------

/** Grupos que deben aparecer explícitos aunque el cliente no los haya elegido. */
const GRUPOS_INCLUIDOS = [
  "Salsa incluida",
  "Salsas incluidas",
  "Topping incluido",
  "Toppings incluidos",
];

export function nuevoPedidoNegocio(
  pedido: PedidoParaMensaje,
  tienda: Tienda,
): string {
  const partes: string[] = [];

  partes.push(`🔔 *NUEVO PEDIDO #${pedido.numero}*`);
  partes.push("");
  // Arriba del todo, antes incluso del tipo y la dirección: es lo primero que hay que saber
  // para decidir si este pedido se pone al fuego ahora o se deja para las siete.
  partes.push(lineaCuando(pedido, "Cuándo"));
  partes.push(bloqueEntrega(pedido));
  partes.push(SEP);
  partes.push(`*Cliente:* ${pedido.clienteNombre}`);
  partes.push(`*Teléfono:* ${pedido.clienteTelefono}`);
  partes.push(SEP);
  partes.push("*Pedido:*");

  partes.push(
    pedido.items
      .flatMap((i) => [
        ...lineasItem(i),
        ...lineasFaltantes(i, GRUPOS_INCLUIDOS),
      ])
      .join("\n"),
  );

  partes.push(SEP);
  partes.push(bloqueTotales(pedido));

  if (pedido.notas) {
    partes.push(SEP);
    partes.push(`*Notas:* ${pedido.notas}`);
  }

  partes.push(SEP);
  partes.push(`Gestionar: ${tienda.baseUrl}/admin/pedidos/${pedido.numero}`);

  return partes.join("\n");
}

// ------------------------------------------------------------
// Mensaje 3 — cambios de estado al CLIENTE
// ------------------------------------------------------------

/**
 * Los estados que faltan aquí son los que **no** llevan mensaje, y falta cada uno por su
 * motivo:
 *
 * - `nuevo`: el pedido entró a la base pero nadie en el local lo ha mirado. Lo único honesto
 *   que se podría decir es "pendiente de confirmar", y eso obliga a un segundo WhatsApp medio
 *   minuto después para decir que sí. Al cliente le llegaban dos mensajes donde va uno: el de
 *   aceptación, que ahora es el primero y por eso carga el resumen del pedido.
 * - `entregado`: el cliente acaba de recibir la comida en la mano. Un WhatsApp que le informe
 *   de eso no le dice nada que no sepa.
 */
const TEXTO_ESTADO: Partial<Record<EstadoPedido, (t: string) => string>> = {
  // `aceptado` ya no se genera —aceptar un pedido lo pone en `preparando` de una vez, ver
  // `pasosDelPedido`—, pero conserva su texto por si algún pedido guardado con él sigue sin
  // avisar. Dice lo mismo que `preparando`, porque significaba lo mismo.
  aceptado: (t) =>
    `¡Holii, Tu pedido en *${t}* fue aceptado y ya está en preparación!`,
  preparando: (t) =>
    `¡Holii, Tu pedido en *${t}* fue aceptado y ya está en preparación!`,
  en_camino: (t) => `¡Tu pedido en *${t}* ya va en camino!`,
  listo: (t) => `¡Tu pedido en *${t}* ya está listo para recoger!`,
  cancelado: (t) =>
    `Tu pedido en *${t}* fue cancelado. Te contactamos para explicarte.`,
};

/**
 * Si un estado lleva mensaje al cliente. Se pregunta sin armar el texto porque quien avisa
 * tiene que cerrar el candado de idempotencia ANTES de enviar nada (regla 11), y para eso
 * necesita saberlo de antemano.
 *
 * Antes se resolvía llamando a `cambioEstado` con un pedido de mentira y mirando si devolvía
 * null. Eso funcionaba mientras ninguna plantilla leyera un campo del pedido; en cuanto la de
 * la aceptación empezó a escribir el total, el pedido de mentira reventaba.
 */
export function llevaAviso(estado: EstadoPedido): boolean {
  return Boolean(TEXTO_ESTADO[estado]);
}

/**
 * Dónde queda el local, para el que viene a recogerlo.
 *
 * Devuelve cero, una o dos líneas: sin dirección ni pin no se escribe nada, porque una etiqueta
 * sin valor detrás se lee como un dato que se perdió por el camino.
 *
 * Solo entra en los mensajes de un pedido **para recoger**. Al de domicilio no le sirve —no se
 * mueve de su casa— y al negocio menos, que ya está ahí.
 */
function lineasDelLocal(local: Local): string[] {
  const lineas: string[] = [];

  const direccion = local.direccion?.trim();
  if (direccion) lineas.push(`*Dirección:* ${direccion}`);

  const url = comoLlegarUrl(local);
  if (url) lineas.push(`*Cómo llegar:* ${url}`);

  return lineas;
}

/**
 * Devuelve null para los estados que NO llevan mensaje. Quien llama debe respetar el null.
 *
 * Ninguno de estos sale solo: el transporte es un link `wa.me` que un empleado toca desde el
 * panel, porque enviar de verdad en automático exigiría la Cloud API con un número dedicado
 * y el del negocio se usa con proveedores (regla 10).
 */
/**
 * Lo que se puede recortar cuando el mensaje no cabe.
 *
 * `sinDetalle` quita la lista de productos del aviso de aceptación. Es lo único que crece con el
 * pedido —lo demás son líneas fijas—, así que es lo único que sirve recortar. El cliente no se
 * queda sin el detalle: el mismo mensaje lleva el link de seguimiento, que lo muestra entero.
 */
export type OpcionesCambioEstado = { sinDetalle?: boolean };

export function cambioEstado(
  estado: EstadoPedido,
  pedido: PedidoParaMensaje,
  tienda: Tienda,
  estimado: EstimadoEntrega,
  recogida: Local,
  ahora: Date = new Date(),
  opciones: OpcionesCambioEstado = {},
): string | null {
  const titulo = TEXTO_ESTADO[estado]?.(tienda.nombre);
  if (!titulo) return null;

  const enlace = urlSeguimiento(tienda, pedido.tokenPublico);
  const local = pedido.tipo === "recoger" ? lineasDelLocal(recogida) : [];

  // El de aceptación es el primer mensaje que recibe el cliente, así que es donde va el recibo
  // entero: acaba de decidir gastar esa plata y, si paga en efectivo, es lo que tiene que tener
  // listo cuando toquen el timbre.
  if (estado === "preparando" || estado === "aceptado") {
    return [
      titulo,
      "",

      `🧾 *Pedido #${pedido.numero}*`,

      // Solo mostrar el tipo si ayuda a identificar cómo recibirá el pedido.
      pedido.tipo === "recoger"
        ? "*Tipo:* Recoger en tienda"
        : "*Tipo:* Domicilio",

      // Mostrar fecha solo cuando el cliente programó una hora específica.
      pedido.horaEntregaEstimada
        ? `*Fecha de entrega:* ${fechaLarga(pedido.horaEntregaEstimada)}`
        : null,

      SEP,
      `*Cliente:* ${pedido.clienteNombre}`,
      `*Teléfono:* ${pedido.clienteTelefono}`,

      "",

      // El detalle completo, que es lo que hace largo a este mensaje. Cuando no cabe en la URL
      // de `wa.me`, quien lo manda vuelve a pedirlo con `sinDetalle` — ver `avisoCambioEstado`.
      ...(opciones.sinDetalle ? [] : ["*Tu pedido:*", bloqueItems(pedido)]),

      SEP,

      // El total va DENTRO del desglose y no repetido debajo. Estuvo en los dos sitios, y con
      // un cupón de por medio las dos cifras se leían como si una corrigiera a la otra.
      // `bloqueRecibo` lo cierra porque ahí es su resultado: productos − descuento + domicilio.
      "💰 *Resumen de pago*",
      ...bloqueRecibo(pedido),

      SEP,

      `🛵 *${pedido.tipo === "recoger" ? "Recogida" : "Entrega"}*`,
      lineaLlegada(
        pedido,
        estimado,
        pedido.tipo === "recoger" ? "Listo" : "Llega",
        ahora,
      ),

      // Dónde recogerlo, junto a cuándo estará listo.
      ...local,

      "",

      "📍 Sigue tu pedido en tiempo real aquí:",
      "",
      enlace,
      "",
      "¡Estaremos en contacto! 🍫",
    ]
      .filter((linea): linea is string => linea !== null)
      .join("\n");
  }

  if (estado === "en_camino") {
    return [
      titulo,
      "Gracias por tu Compra, esperamos que te gusten",
      "",
      "Sigue El estado de tu Pedido Aquí:",
      "",
      enlace,
      "",
      "¡Sonríe que la Vida es Churrisima!",
    ].join("\n");
  }

  // Un pedido cancelado no lleva link: no hay nada que seguir, y el mensaje ya dice que
  // llamamos a explicar.
  if (estado === "cancelado") return titulo;

  // `listo`: está en el mostrador, y este es el momento en que la persona sale de su casa. Aquí la
  // dirección vale más que en ningún otro mensaje — antes solo iba el link de seguimiento, que
  // obliga a abrir el navegador para saber a dónde ir.
  return [
    titulo,
    "",
    ...local,
    local.length > 0 ? "" : null,
    enlace,
    "",
    "¡Estaremos en contacto!",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

// ------------------------------------------------------------
// Mensaje 4 — cambio de hora de entrega
// ------------------------------------------------------------

export function cambioHoraEntrega(
  pedido: PedidoParaMensaje,
  nuevaHora: Date,
  tienda: Tienda,
): string {
  return [
    `¡Tu pedido a *${tienda.nombre}* tuvo un cambio en la hora de entrega!`,
    "",
    `*Nueva hora estimada:* ${fechaHora(nuevaHora)}`,
    "",
    urlSeguimiento(tienda, pedido.tokenPublico),
    "",
    "¡Estaremos en contacto!",
  ].join("\n");
}

// ------------------------------------------------------------
// Versión corta — para cuando el mensaje no cabe en un link wa.me
// ------------------------------------------------------------

/**
 * Los links wa.me llevan el texto en la URL y se rompen si crece demasiado.
 * Si el pedido tiene muchos items, mandamos un resumen y el link de
 * seguimiento, donde el cliente ve el detalle completo.
 */
export function confirmacionClienteCorta(
  pedido: PedidoParaMensaje,
  tienda: Tienda,
): string {
  const cantidad = pedido.items.reduce((n, i) => n + i.cantidad, 0);

  return [
    `¡Hola ${pedido.clienteNombre}, *${tienda.nombre}* recibió tu pedido!`,
    "",
    `*Pedido:* #${pedido.numero}`,
    `*Productos:* ${cantidad}`,
    `*Total:* ${pesos(pedido.total)}`,
    pedido.tipo === "domicilio"
      ? "*Tipo:* Domicilio"
      : "*Tipo:* Recoger en tienda",
    "",
    "Mira el detalle completo y sigue tu pedido aquí:",
    urlSeguimiento(tienda, pedido.tokenPublico),
    "",
    "¡Estaremos en contacto!",
  ].join("\n");
}

// ------------------------------------------------------------
// Mensaje 5 — el pedido para el DOMICILIARIO
// ------------------------------------------------------------

/**
 * Lo que hay que saber para llevar un pedido. Tiene su propio tipo y no reusa
 * `PedidoParaMensaje` porque necesita dos cosas que los mensajes del cliente no deben tocar:
 * con cuánto paga y si ya pagó. Estirar aquel tipo metería datos de caja en los tres avisos al
 * cliente.
 */
export type PedidoParaDomiciliario = {
  numero: number;
  clienteNombre: string;
  clienteTelefono: string;
  recibeNombre?: string | null;
  recibeTelefono?: string | null;
  direccion?: string | null;
  barrio?: string | null;
  indicaciones?: string | null;
  ubicacion?: { lat: number; lng: number } | null;
  /** De qué se compone lo que va a cobrar. No cambia cuánto es: lo explica. */
  subtotal: number;
  costoDomicilio: number;
  /** Lo que descontó el cupón. Sin esto el desglose no sumaría el total (regla 20). */
  descuento: number;
  total: number;
  metodoPago: string;
  /** Con cuánto billete paga, para calcular la devuelta. `null` = no lo dijo. */
  pagaCon?: number | null;
  /** Si el pago ya está confirmado. Decide entre "COBRAR" y "NO COBRAR". */
  pagado: boolean;
  tokenEntrega: string;
};

/**
 * El saludo según la hora de Bogotá.
 *
 * Se calcula con `Intl` aquí mismo y **no** importando `horario.ts`: ese módulo arrastra la capa
 * de base de datos, y este archivo la evita a propósito (mismo motivo que `diaEnBogota`).
 *
 * Vale la pena calcularlo: un "buena tarde" fijo a las ocho de la noche delata que el mensaje lo
 * escribió una máquina, y este se manda veinte veces al día a la misma persona.
 */
function saludo(ahora: Date): string {
  const hora =
    Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Bogota",
        hour: "2-digit",
        hour12: false,
      }).format(ahora),
    ) % 24;

  if (hora < 12) return "Buenos días";
  if (hora < 19) return "Buenas tardes";

  return "Buenas noches";
}

const NOMBRE_METODO: Record<string, string> = {
  efectivo: "en efectivo",
  nequi: "por Nequi",
  transferencia: "por transferencia",
  datafono: "con datáfono",
};

/**
 * El bloque de plata, que es la razón de ser de este mensaje.
 *
 * **El domiciliario no se entera del cupón.** Él no cobra un descuento, cobra un número, así que
 * "Valor Productos" aquí es el subtotal **ya descontado** — al contrario que en el recibo del
 * cliente, donde el descuento es justo lo que hay que explicar. De paso las dos líneas del
 * desglose suman exactamente el Total Cobrar, y por eso desapareció la línea `*Descuento:*` que
 * existía solo para que las cuentas cuadraran.
 *
 * **Un pedido ya pagado no lleva ninguna cifra de cobro**, porque cobrarle a quien ya pagó es un
 * incidente con el cliente y no un descuido: sale el aviso, con qué pagó, y nada más que se pueda
 * confundir con algo a recibir. Lo único que sí acompaña es el **costo del domicilio**, que no es
 * una cifra a cobrar sino lo que él gana por el viaje — el courier es externo al negocio (regla
 * 13) y tiene que saberlo lleve o no plata de vuelta.
 *
 * La devuelta se calcula porque `order.paga_con` existe exactamente para eso y hasta ahora no la
 * leía nadie: sin ella el domiciliario sale sin sencillo. Solo se escribe cuando de verdad hay
 * vuelto — si el cliente escribió un número menor que el total, se muestra tal cual y no se
 * inventa una devuelta negativa (mismo criterio que el panel, ver `validaciones.ts`).
 */
function bloqueCobro(pedido: PedidoParaDomiciliario): string[] {
  const domicilio = `*Costo Domicilio:* ${pesos(pedido.costoDomicilio)}`;

  if (pedido.pagado) {
    return [
      `*NO COBRAR* — ya pagó ${NOMBRE_METODO[pedido.metodoPago] ?? pedido.metodoPago}`,
      domicilio,
    ];
  }

  const lineas = [
    `*Valor Productos:* ${pesos(subtotalConDescuento(pedido.subtotal, pedido.descuento))}`,
    domicilio,
    // La línea en blanco y la negrita son lo que separa el desglose de la cifra que hay que
    // cobrar. El desglose iba DEBAJO para que quien lee esto de una ojeada en la moto encontrara
    // primero un solo número; ahora va encima y sigue siendo seguro porque esas dos líneas suman
    // exactamente el Total Cobrar, así que ya no pueden contradecirlo.
    "",
    `*Total Cobrar:* ${pesos(pedido.total)} ${NOMBRE_METODO[pedido.metodoPago] ?? pedido.metodoPago}`,
  ];

  if (pedido.pagaCon) {
    lineas.push(`*Paga con:* ${pesos(pedido.pagaCon)}`);
    if (pedido.pagaCon > pedido.total) {
      lineas.push(`*Devuelta:* ${pesos(pedido.pagaCon - pedido.total)}`);
    }
  }

  return lineas;
}

/**
 * El pedido tal como lo necesita quien lo lleva.
 *
 * **No lleva el detalle de productos, y es a propósito.** El domiciliario no arma el pedido, lo
 * lleva; y el texto viaja dentro de una URL `wa.me`, que se rompe si crece — el mismo motivo por
 * el que existe `confirmacionClienteCorta`. Lo que sí lleva es todo lo que hace falta para
 * llegar, cobrar bien y avisar que llegó.
 */
export function pedidoParaDomiciliario(
  pedido: PedidoParaDomiciliario,
  tienda: Tienda,
  ahora: Date = new Date(),
): string {
  const partes = [`${saludo(ahora)}, un domicilio por favor 🛵`, ""];

  partes.push(`*Pedido #${pedido.numero}*`);
  partes.push(`*Cliente:* ${pedido.clienteNombre}`);
  partes.push(`*Tel:* ${pedido.clienteTelefono}`);
  partes.push("");

  // Quien recibe solo se nombra si es otra persona: repetir al cliente aquí haría dudar de si
  // hay que buscar a dos.
  if (pedido.recibeNombre) {
    partes.push(
      `*Recibe:* ${pedido.recibeNombre}${pedido.recibeTelefono ? ` · ${pedido.recibeTelefono}` : ""}`,
    );
  }

  if (pedido.direccion) partes.push(`*Dirección:* ${pedido.direccion}`);
  if (pedido.barrio) partes.push(`*Barrio:* ${pedido.barrio}`);
  if (pedido.indicaciones)
    partes.push(`*Detalles entrega:* ${pedido.indicaciones}`);
  if (pedido.ubicacion)
    partes.push(`*Google Maps:* ${mapsUrl(pedido.ubicacion)}`);

  partes.push(SEP);
  // Desglose y cobro salen juntos de `bloqueCobro`: son la misma decisión —qué cifras ve quien
  // lleva el pedido— y partirlos en dos sitios fue lo que dejó un "Descuento" para el domiciliario,
  // que no cobra descuentos.
  partes.push(...bloqueCobro(pedido));
  partes.push(SEP);
  partes.push("Cuando entregues, confirma aquí Por Favor:");
  partes.push(urlEntrega(tienda, pedido.tokenEntrega));
  partes.push("");
  partes.push("Gracias!!");

  return partes.join("\n");
}

/** El link que confirma la entrega. Otra llave que la del cliente: ver `order.token_entrega`. */
function urlEntrega(tienda: Tienda, token: string): string {
  return `${tienda.baseUrl}/entrega/${token}`;
}

// ------------------------------------------------------------
// Mensaje 6 — el cliente quedó fuera de cobertura
// ------------------------------------------------------------

/**
 * Lo que el cliente le escribe a la tienda cuando su pin no cae en ninguna zona (regla 14).
 *
 * El pedido NO existe todavía: no hay número ni token, y por eso este mensaje no se parece a
 * los otros. Va el carrito para que la tienda sepa de cuánto hablamos, y el link de Maps
 * para que pueda decidir si le sirve el viaje. Si acepta, ese pedido se gestiona por chat.
 *
 * Se manda corto a propósito: viaja dentro de una URL `wa.me`, que se rompe si crece.
 */
export function fueraDeCobertura(
  carrito: { items: ItemSnapshot[]; subtotal: number },
  ubicacion: { lat: number; lng: number },
  tienda: Tienda,
): string {
  const lineas = carrito.items.map(
    (item) => `• ${item.cantidad}x ${item.nombre}`,
  );

  return [
    `¡Hola! Quiero pedir en *${tienda.nombre}* pero mi dirección quedó fuera de cobertura.`,
    "",
    ...lineas,
    "",
    `*Subtotal:* ${pesos(carrito.subtotal)}`,
    "",
    "Mi ubicación:",
    mapsUrl(ubicacion),
    "",
    "¿Me pueden cotizar el domicilio?",
  ].join("\n");
}

// ------------------------------------------------------------
// Mensaje 7 — el pedido nuevo por Telegram (canal interno)
// ------------------------------------------------------------

/**
 * Lo que hace falta para contar un pedido recién entrado.
 *
 * Tiene su propio tipo, como el del domiciliario, porque este mensaje mezcla dos mundos que los
 * avisos al cliente mantienen separados: la caja (con cuánto paga, si ya pagó) y la cocina (qué
 * lleva cada plato). Es el único que puede, porque no sale del local.
 */
export type PedidoParaTelegram = {
  numero: number;
  tipo: TipoPedido;
  /** La hora que pidió el cliente, o `null` si lo quiere lo antes posible. */
  programadoPara?: Date | null;
  clienteNombre: string;
  clienteTelefono: string;
  /** Primera vez que pide. Es cuándo vale la pena meter un detalle extra en la bolsa. */
  esClienteNuevo: boolean;
  direccion?: string | null;
  barrio?: string | null;
  indicaciones?: string | null;
  /** La zona que cobró el domicilio. Va al lado del costo para poder cuadrarlo de una ojeada. */
  zonaNombre?: string | null;
  items: ItemSnapshot[];
  costoDomicilio: number;
  total: number;
  metodoPago: string;
  pagaCon?: number | null;
  pagado: boolean;
  notas?: string | null;
  creadoEn: Date;
};

/**
 * Telegram corta el mensaje en 4.096 caracteres y responde con error si te pasas, o sea que un
 * pedido enorme no llegaría en absoluto. Se recorta antes, con margen.
 */
const TOPE_TELEGRAM = 4000;

/**
 * El nombre, la dirección y las notas los escribe el cliente, y este mensaje va con
 * `parse_mode: HTML`. Un `<` suelto en "casa <esquina>" no se ve raro: Telegram **rechaza el
 * mensaje entero**, así que el aviso no llega y nadie se entera de por qué.
 */
function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Los modificadores de un item en una línea: "con Arequipe, Oreo ×2". */
function modificadoresEnLinea(item: ItemSnapshot): string {
  if (item.modificadores.length === 0) return "";

  const nombres = item.modificadores.map((m) =>
    m.cantidad > 1 ? `${m.nombre} ×${m.cantidad}` : m.nombre,
  );

  return ` con ${escaparHtml(nombres.join(", "))}`;
}

/**
 * Cómo se paga, en una línea. **Es la segunda del mensaje a propósito**: junto con la primera es
 * todo lo que se lee en la pantalla bloqueada, y con eso quien está en la freidora ya sabe si
 * tiene que preparar la devuelta o si el pedido viene pagado.
 *
 * Un método que no es efectivo y llega sin comprobante no dice "contra entrega": recoger se paga
 * por adelantado, así que ahí hay un pago que perseguir y el mensaje tiene que decirlo.
 */
function lineaPago(pedido: PedidoParaTelegram): string {
  const metodo = etiquetaMetodo(pedido.metodoPago).toUpperCase();

  if (pedido.pagado) return `✅ ${metodo} — comprobante adjunto`;

  if (pedido.metodoPago === "efectivo") {
    if (pedido.pagaCon && pedido.pagaCon > pedido.total) {
      return `💵 ${metodo} — paga con ${pesos(pedido.pagaCon)}, devolver ${pesos(pedido.pagaCon - pedido.total)}`;
    }
    return `💵 ${metodo} — contra entrega`;
  }

  return `⚠️ ${metodo} — SIN comprobante`;
}

/**
 * El pedido nuevo, para el chat interno del equipo.
 *
 * **Lo que manda el orden es la pantalla bloqueada**: ahí solo se leen las dos primeras líneas,
 * así que arriba va lo que permite decidir sin abrir el chat —tipo de entrega, número, total y
 * cómo se paga— y ni un dato del cliente, que es la misma doctrina del payload del Web Push. Lo
 * que hay que leer para preparar el pedido viene después, y lo que solo sirve para llegar a la
 * puerta, al final.
 *
 * Un pedido programado antepone su línea, sola: es lo único que impide que alguien fría veinte
 * churros a las ocho de la noche para una entrega de mañana.
 *
 * Devuelve el texto y la URL del panel por separado porque el botón no viaja dentro del mensaje:
 * es un `inline_keyboard` de la Bot API, y armarlo es cosa de quien envía.
 */
export function pedidoNuevoTelegram(
  pedido: PedidoParaTelegram,
  tienda: Tienda,
  ahora: Date = new Date(),
): { texto: string; urlPanel: string } {
  const lineas: string[] = [];

  if (pedido.programadoPara) {
    lineas.push(
      `⏰ <b>PROGRAMADO — ${cuandoCorto(pedido.programadoPara, ahora)}</b>`,
    );
  }

  const cabecera =
    pedido.tipo === "domicilio" ? "🛵 DOMICILIO" : "🏪 RECOGE EN TIENDA";
  lineas.push(
    `<b>${cabecera} · #${pedido.numero} · ${pesos(pedido.total)}</b>`,
  );
  lineas.push(lineaPago(pedido));

  lineas.push("");
  pedido.items.forEach((item, i) => {
    const sangria = i === 0 ? "🧾 " : "   ";
    lineas.push(
      `${sangria}${item.cantidad}× ${escaparHtml(item.nombre)}${modificadoresEnLinea(item)}`,
    );
    // La nota va debajo de SU item y no toda junta al final, que es donde se pierde. El checkout
    // todavía no las pide, así que hoy no aparece nunca; el día que las pida, ya está.
    if (item.notas) lineas.push(`      ↳ ${escaparHtml(item.notas)}`);
  });

  if (pedido.notas) {
    lineas.push("", `📝 "${escaparHtml(pedido.notas)}"`);
  }

  // En recoger no hay nada que ubicar: el cliente viene.
  if (pedido.tipo === "domicilio") {
    lineas.push("", `📍 ${escaparHtml(pedido.direccion ?? "sin dirección")}`);

    // Barrio y zona son cosas distintas (regla 14) y van juntas justamente para poder cuadrarlas:
    // el barrio lo escribió el cliente y la zona es la que cobró.
    const ubicacion = [
      pedido.barrio ? escaparHtml(pedido.barrio) : null,
      pedido.zonaNombre
        ? `${escaparHtml(pedido.zonaNombre)} (${pesos(pedido.costoDomicilio)})`
        : null,
    ].filter(Boolean);

    if (ubicacion.length > 0) lineas.push(`   ${ubicacion.join(" · ")}`);
    if (pedido.indicaciones)
      lineas.push(`   Ref: ${escaparHtml(pedido.indicaciones)}`);
  }

  lineas.push(
    "",
    `👤 ${escaparHtml(pedido.clienteNombre)} · ${escaparHtml(pedido.clienteTelefono)}`,
  );
  lineas.push(
    `🕐 ${horaCorta(pedido.creadoEn)}${pedido.esClienteNuevo ? " · Cliente nuevo" : ""}`,
  );

  return {
    texto: lineas.join("\n").slice(0, TOPE_TELEGRAM),
    urlPanel: `${tienda.baseUrl}/admin/pedidos/${pedido.numero}`,
  };
}
