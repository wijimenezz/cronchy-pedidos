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
