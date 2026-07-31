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

  if (pedido.horaEntregaEstimada) {
    const etiqueta =
      pedido.tipo === "recoger" ? "Listo a las" : "Hora de entrega";
    partes.push(`*${etiqueta}:* ${fechaHora(pedido.horaEntregaEstimada)}`);
  }

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

const TEXTO_ESTADO: Partial<Record<EstadoPedido, (t: string) => string>> = {
  aceptado: (t) => `¡Tu pedido en *${t}* ya fue aceptado!`,
  preparando: (t) => `¡Tu pedido en *${t}* ya está en preparación!`,
  en_camino: (t) => `¡Tu pedido en *${t}* ya va en camino!`,
  listo: (t) => `¡Tu pedido en *${t}* ya está listo para recoger!`,
  entregado: (t) =>
    `¡Tu pedido en *${t}* fue entregado. Gracias por preferirnos!`,
  cancelado: (t) =>
    `Tu pedido en *${t}* fue cancelado. Te contactamos para explicarte.`,
};

/**
 * Devuelve null para los estados que NO se notifican (ej. 'nuevo', porque
 * ya se envió la confirmación). Quien llama debe respetar el null.
 */
export function cambioEstado(
  estado: EstadoPedido,
  pedido: PedidoParaMensaje,
  tienda: Tienda,
): string | null {
  const plantilla = TEXTO_ESTADO[estado];
  if (!plantilla) return null;

  const partes = [plantilla(tienda.nombre), ""];

  if (estado === "en_camino" && pedido.horaEntregaEstimada) {
    partes.push(
      `*Llega aproximadamente:* ${fechaHora(pedido.horaEntregaEstimada)}`,
    );
    partes.push("");
  }

  if (estado !== "entregado" && estado !== "cancelado") {
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
// Mensaje 5 — el cliente quedó fuera de cobertura
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
