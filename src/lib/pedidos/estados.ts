import type { EstadoPedido, TipoPedido } from "@/lib/notificaciones/plantillas";

/** Cómo se le nombra cada estado al cliente. El panel (Fase C) reutiliza esto. */
export const ETIQUETA_ESTADO: Record<EstadoPedido, string> = {
  nuevo: "Recibido",
  aceptado: "Aceptado",
  preparando: "En preparación",
  en_camino: "En camino",
  listo: "Listo para recoger",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

/**
 * Cómo se rotula el botón que **lleva** a cada estado, en la tarjeta del tablero.
 *
 * No es `ETIQUETA_ESTADO` con otro nombre: aquel dice cómo se le llama al estado **al cliente**,
 * y aquí quien lee es quien fríe. La diferencia se nota en dos sitios. `preparando` no se rotula
 * "En preparación" sino "Aceptar", que es la acción y no el destino —era un ternario suelto en el
 * componente, y el ternario no sabía que `aceptado` también cae ahí—. Y `listo` se acorta a
 * "Listo": "Listo para recoger" es la promesa que se le hace al cliente y no cabe en los ~115 px
 * que le deja la fila de acciones, donde ahora comparte línea con los iconos.
 *
 * Exhaustivo como el resto de los `Record` del módulo, aunque `nuevo` y `aceptado` no sean destino
 * de ningún avance: `pasosDelPedido` arranca en el primero y ya no genera el segundo.
 *
 * El detalle del pedido (`AccionesPedido`) NO usa esto: ahí sobra el ancho y dice "Aceptar pedido".
 */
export const ETIQUETA_AVANCE: Record<EstadoPedido, string> = {
  nuevo: "Recibido",
  aceptado: "Aceptar",
  preparando: "Aceptar",
  en_camino: "En camino",
  listo: "Listo",
  entregado: "Entregado",
  cancelado: "Cancelar",
};

/** Frase que acompaña al estado en el seguimiento. */
export const DETALLE_ESTADO: Record<EstadoPedido, string> = {
  nuevo: "Tu pedido llegó. Estamos por confirmarlo.",
  aceptado: "¡Confirmado! Ya lo vamos a preparar.",
  preparando: "Tus churros están en el fuego.",
  en_camino: "Tu pedido va en camino.",
  listo: "Tu pedido está listo, te esperamos.",
  entregado: "¡Que lo disfrutes!",
  cancelado: "Este pedido fue cancelado.",
};

/**
 * Secuencia que recorre un pedido. Depende del tipo: un domicilio va "en camino"
 * y uno para recoger queda "listo" en el mostrador.
 *
 * **`aceptado` no está, y no es un olvido.** Era un paso entre "nuevo" y "preparando" que no
 * describía nada: caía en la misma columna del tablero y en el mismo hito del seguimiento
 * que `preparando`, así que pulsarlo no movía la tarjeta ni cambiaba lo que veía el cliente.
 * Quien acepta un pedido lo acepta *porque* lo va a preparar; aceptar es empezarlo.
 *
 * El valor sigue en el enum de la base y en los mapas de este módulo porque hay pedidos e
 * historial escritos con él. Lo que dejó de existir es la forma de generarlo.
 */
export function pasosDelPedido(tipo: TipoPedido): EstadoPedido[] {
  return tipo === "domicilio"
    ? ["nuevo", "preparando", "en_camino", "entregado"]
    : ["nuevo", "preparando", "listo", "entregado"];
}

// ------------------------------------------------------------
// Hitos — los cuatro iconos de la barra del seguimiento
// ------------------------------------------------------------

/**
 * Lo que el cliente ve avanzar: cuatro hitos, uno por columna del tablero.
 *
 * Que `aceptado` y `preparando` compartieran hito fue la primera señal de que sobraba un
 * estado: desde la acera, "ya lo confirmaron" y "ya lo están haciendo" son la misma noticia
 * —el pedido dejó de estar en el aire y la cocina lo tiene—, y en el local también lo eran.
 * Hoy `pasosDelPedido` tiene cuatro estados vivos y esta lista sigue teniendo cuatro hitos.
 */
export type Hito = "recibido" | "preparando" | "saliendo" | "entregado";

/** El tercer hito se llama distinto según cómo llega el pedido a su dueño. */
export function hitosDelPedido(tipo: TipoPedido): { hito: Hito; etiqueta: string }[] {
  return [
    { hito: "recibido", etiqueta: "Recibido" },
    { hito: "preparando", etiqueta: "En preparación" },
    {
      hito: "saliendo",
      etiqueta: tipo === "domicilio" ? "En camino" : "Listo",
    },
    { hito: "entregado", etiqueta: tipo === "domicilio" ? "Entregado" : "Recogido" },
  ];
}

const HITO_DE_ESTADO: Record<EstadoPedido, Hito | null> = {
  nuevo: "recibido",
  // `aceptado` ya no se genera (ver `pasosDelPedido`), pero un pedido guardado con él tiene
  // que seguir cayendo donde caía: en la columna y el hito de preparación.
  aceptado: "preparando",
  preparando: "preparando",
  en_camino: "saliendo",
  listo: "saliendo",
  entregado: "entregado",
  // Cancelado no es un punto del recorrido, es salirse de él: la barra no se pinta.
  cancelado: null,
};

/**
 * En qué hito está el pedido, como índice de `hitosDelPedido`. `-1` = no hay barra que pintar.
 *
 * Función pura y testeada como el resto del módulo: es lo único que traduce el modelo a lo
 * que el cliente cree que está pasando, y equivocarse aquí es decirle que su comida va en
 * camino cuando nadie la ha empezado.
 */
export function indiceDeHito(estado: EstadoPedido, tipo: TipoPedido): number {
  const hito = HITO_DE_ESTADO[estado];
  if (!hito) return -1;

  return hitosDelPedido(tipo).findIndex((h) => h.hito === hito);
}

// ------------------------------------------------------------
// Columnas del tablero del panel
// ------------------------------------------------------------

/**
 * Las cuatro columnas del tablero de pedidos. Son **los mismos cuatro grupos** que los hitos
 * del seguimiento, y eso no es casualidad: si la cocina y el cliente contaran el pedido en
 * fases distintas, uno de los dos estaría viendo algo que no está pasando.
 *
 * Lo que cambia son las palabras, porque cambia quién lee: el cliente ve "Recibido" y quien
 * fríe ve "Sin aceptar", que es lo que le pide una acción. Por eso la agrupación se comparte
 * (`indiceDeHito`) y los rótulos no.
 */
export const COLUMNAS_TABLERO = [
  { titulo: "Sin aceptar", vacio: "Nada pendiente por aceptar." },
  { titulo: "En preparación", vacio: "Nada en el fuego." },
  { titulo: "En camino / Listos", vacio: "Nada saliendo." },
  { titulo: "Terminados", vacio: "Todavía nada terminado hoy." },
] as const;

/**
 * En qué columna del tablero va un pedido. Siempre devuelve una: aquí no hay pedidos sin
 * sitio, a diferencia del seguimiento del cliente, donde un pedido cancelado simplemente no
 * pinta barra.
 *
 * `cancelado` cae en "Terminados" y esa es la única diferencia con `indiceDeHito`: para el
 * cliente cancelar es salirse del recorrido, pero para la cocina es un pedido que ya no toca,
 * que es justo lo que significa esa columna.
 */
export function columnaDeTablero(estado: EstadoPedido, tipo: TipoPedido): number {
  if (estado === "cancelado") return COLUMNAS_TABLERO.length - 1;

  return indiceDeHito(estado, tipo);
}

export type ToneEstado = "activo" | "exito" | "cancelado";

export function toneDeEstado(estado: EstadoPedido): ToneEstado {
  if (estado === "cancelado") return "cancelado";
  if (estado === "entregado") return "exito";
  return "activo";
}

export const METODO_PAGO_ETIQUETA: Record<string, string> = {
  efectivo: "Efectivo",
  nequi: "Nequi",
  transferencia: "Transferencia",
  datafono: "Datáfono",
};

// ------------------------------------------------------------
// Transiciones — qué puede pasar después de qué
// ------------------------------------------------------------

/**
 * Dónde se lee cada estado retirado dentro del recorrido vigente.
 *
 * Sin esto, un pedido guardado en `aceptado` no aparecería en `pasosDelPedido` y quedaría
 * atascado: `indexOf` devolvería -1, no habría avance que ofrecer y la única salida sería
 * cancelarlo. Se lee como lo que `aceptado` siempre significó — un pedido que la cocina ya
 * tiene—, así que ofrece el mismo siguiente paso que `preparando`.
 */
const ESTADO_RETIRADO: Partial<Record<EstadoPedido, EstadoPedido>> = {
  aceptado: "preparando",
};

/**
 * Un pedido avanza por los pasos de su tipo, uno a uno, y se puede cancelar en cualquier
 * momento antes de entregarlo. No retrocede: un estado que vuelve atrás dispararía avisos
 * repetidos al cliente (regla 11) y dejaría un historial que no cuadra con lo que pasó.
 *
 * `entregado` y `cancelado` son terminales. Si un pedido entregado hay que corregirlo, es
 * un caso raro que se atiende a mano en la base, no una función del panel: darle al
 * empleado un botón para "des-entregar" invita a usarlo por accidente en plena operación.
 */
export function transicionesPosibles(estado: EstadoPedido, tipo: TipoPedido): EstadoPedido[] {
  if (estado === "entregado" || estado === "cancelado") return [];

  const pasos = pasosDelPedido(tipo);
  const actual = pasos.indexOf(ESTADO_RETIRADO[estado] ?? estado);
  const siguiente = actual >= 0 && actual < pasos.length - 1 ? [pasos[actual + 1]] : [];

  return [...siguiente, "cancelado"];
}

/** El avance natural: lo que hace el botón principal de la tarjeta, a un toque. */
export function siguienteEstado(estado: EstadoPedido, tipo: TipoPedido): EstadoPedido | null {
  return transicionesPosibles(estado, tipo).find((e) => e !== "cancelado") ?? null;
}

export type PedidoParaTransicion = {
  estado: EstadoPedido;
  tipo: TipoPedido;
  metodoPago: string;
  tieneComprobante: boolean;
};

export type MotivoBloqueo = "transicion_invalida" | "nequi_sin_comprobante";

export const MENSAJE_BLOQUEO: Record<MotivoBloqueo, string> = {
  transicion_invalida: "Ese cambio de estado no es válido para este pedido.",
  nequi_sin_comprobante: "Este pedido es Nequi y todavía no tiene comprobante.",
};

/**
 * Única puerta para cambiar el estado de un pedido. Se valida aquí, sin tocar la base,
 * para poder probar todas las combinaciones.
 *
 * La regla de Nequi es del PRD: un pedido que dice pagarse por Nequi y no trae comprobante
 * no puede aceptarse. Bloquea solo la salida de `nuevo` —cancelarlo sí se puede, y de
 * hecho es lo que se hará con el que nunca suba el comprobante.
 */
export function validarCambioEstado(
  pedido: PedidoParaTransicion,
  nuevo: EstadoPedido,
): { ok: true } | { ok: false; motivo: MotivoBloqueo } {
  if (!transicionesPosibles(pedido.estado, pedido.tipo).includes(nuevo)) {
    return { ok: false, motivo: "transicion_invalida" };
  }

  if (
    pedido.estado === "nuevo" &&
    nuevo !== "cancelado" &&
    pedido.metodoPago === "nequi" &&
    !pedido.tieneComprobante
  ) {
    return { ok: false, motivo: "nequi_sin_comprobante" };
  }

  return { ok: true };
}
