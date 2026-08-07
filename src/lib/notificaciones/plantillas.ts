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

const SEP = "--------------------------------";

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
  total: number;
  metodoPago: string;
  notas?: string | null;
};

export type Tienda = {
  nombre: string;
  baseUrl: string;
};

// ------------------------------------------------------------
// Formateo
// ------------------------------------------------------------

/** 14000 -> "$14.000" */
export function pesos(valor: number): string {
  return `$${valor.toLocaleString("es-CO")}`;
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

function bloqueTotales(pedido: PedidoParaMensaje): string {
  const lineas = [`*Subtotal:* ${pesos(pedido.subtotal)}`];

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
    pedido.horaEntregaEstimada ? cuandoCorto(pedido.horaEntregaEstimada) : "lo antes posible"
  }`;
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

  partes.push(lineaCuando(pedido, pedido.tipo === "recoger" ? "Listo" : "Hora de entrega"));

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
  aceptado: (t) => `¡Tu pedido en *${t}* fue aceptado y ya está en preparación!`,
  preparando: (t) => `¡Tu pedido en *${t}* fue aceptado y ya está en preparación!`,
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
 * Devuelve null para los estados que NO llevan mensaje. Quien llama debe respetar el null.
 *
 * Ninguno de estos sale solo: el transporte es un link `wa.me` que un empleado toca desde el
 * panel, porque enviar de verdad en automático exigiría la Cloud API con un número dedicado
 * y el del negocio se usa con proveedores (regla 10).
 */
export function cambioEstado(
  estado: EstadoPedido,
  pedido: PedidoParaMensaje,
  tienda: Tienda,
): string | null {
  const plantilla = TEXTO_ESTADO[estado];
  if (!plantilla) return null;

  const partes = [plantilla(tienda.nombre), ""];

  // El de aceptación es el primer mensaje que recibe el cliente, así que es donde va la
  // cifra: acaba de decidir gastarla y, si paga en efectivo, es lo que tiene que tener
  // listo cuando toquen el timbre.
  if (estado === "preparando" || estado === "aceptado") {
    partes.push(`*Pedido:* #${pedido.numero}`);
    partes.push(`*Total:* ${pesos(pedido.total)}`);
    partes.push(lineaCuando(pedido, pedido.tipo === "recoger" ? "Listo" : "Llega"));
    partes.push("");
  }

  if (estado === "en_camino" && pedido.horaEntregaEstimada) {
    partes.push(`*Llega aproximadamente:* ${cuandoCorto(pedido.horaEntregaEstimada)}`);
    partes.push("");
  }

  if (estado !== "cancelado") {
    partes.push(urlSeguimiento(tienda, pedido.tokenPublico));
    partes.push("");
    partes.push("¡Estaremos en contacto!");
  }

  return partes.join("\n");
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
  const hora = Number(
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
 * Un domiciliario que cobra un pedido ya pagado es un incidente con el cliente, no un descuido,
 * así que el "NO COBRAR" va solo y en negrita, sin ninguna cifra al lado que se pueda confundir
 * con algo a recibir.
 *
 * La devuelta se calcula porque `order.paga_con` existe exactamente para eso y hasta ahora no la
 * leía nadie: sin ella el domiciliario sale sin sencillo. Solo se escribe cuando de verdad hay
 * vuelto — si el cliente escribió un número menor que el total, se muestra tal cual y no se
 * inventa una devuelta negativa (mismo criterio que el panel, ver `validaciones.ts`).
 */
function bloqueCobro(pedido: PedidoParaDomiciliario): string[] {
  if (pedido.pagado) {
    return [`*NO COBRAR* — ya pagó ${NOMBRE_METODO[pedido.metodoPago] ?? pedido.metodoPago}`];
  }

  const lineas = [
    `*COBRAR:* ${pesos(pedido.total)} ${NOMBRE_METODO[pedido.metodoPago] ?? pedido.metodoPago}`,
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

  // Quien recibe solo se nombra si es otra persona: repetir al cliente aquí haría dudar de si
  // hay que buscar a dos.
  if (pedido.recibeNombre) {
    partes.push(`*Recibe:* ${pedido.recibeNombre}${pedido.recibeTelefono ? ` · ${pedido.recibeTelefono}` : ""}`);
  }

  if (pedido.direccion) partes.push(`*Dirección:* ${pedido.direccion}`);
  if (pedido.barrio) partes.push(`*Barrio:* ${pedido.barrio}`);
  if (pedido.indicaciones) partes.push(`*Detalles entrega:* ${pedido.indicaciones}`);
  if (pedido.ubicacion) partes.push(`*Google Maps:* ${mapsUrl(pedido.ubicacion)}`);

  partes.push(SEP);
  partes.push(...bloqueCobro(pedido));
  partes.push(SEP);
  partes.push("Cuando entregues, confirma aquí:");
  partes.push(urlEntrega(tienda, pedido.tokenEntrega));

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
  const lineas = carrito.items.map((item) => `• ${item.cantidad}x ${item.nombre}`);

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
