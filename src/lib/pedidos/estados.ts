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
 * Secuencia que se le muestra al cliente. Depende del tipo: un domicilio va "en camino"
 * y uno para recoger queda "listo" en el mostrador.
 */
export function pasosDelPedido(tipo: TipoPedido): EstadoPedido[] {
  return tipo === "domicilio"
    ? ["nuevo", "aceptado", "preparando", "en_camino", "entregado"]
    : ["nuevo", "aceptado", "preparando", "listo", "entregado"];
}

// ------------------------------------------------------------
// Hitos — los cuatro iconos de la barra del seguimiento
// ------------------------------------------------------------

/**
 * Lo que el cliente ve avanzar. Son cuatro y no cinco a propósito: `aceptado` y `preparando`
 * comparten hito porque, desde la acera, "ya lo confirmaron" y "ya lo están haciendo" son la
 * misma noticia — el pedido dejó de estar en el aire y la cocina lo tiene.
 *
 * La secuencia interna (`pasosDelPedido`) sigue teniendo los cinco estados y no cambia: el
 * panel opera con ellos y el historial los registra uno a uno. Esto es solo cómo se cuentan.
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
  const actual = pasos.indexOf(estado);
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
