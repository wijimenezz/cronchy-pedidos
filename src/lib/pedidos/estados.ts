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
