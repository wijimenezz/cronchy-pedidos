import type { EstadoPedido, TipoPedido } from "@/lib/notificaciones/plantillas";

/**
 * Qué botones lleva una tarjeta del tablero.
 *
 * Está aparte del componente y es puro porque desde que los secundarios son **iconos sin texto**,
 * un botón de más no se lee como un error: se lee como un botón. Ofrecerle "asignar domiciliario"
 * a un pedido para recoger, o a uno que nadie ha aceptado todavía, es de las cosas que nadie nota
 * mirando el JSX y sí notaría quien opera el local.
 *
 * Lo que decide de verdad sigue siendo el servidor —`validarCambioEstado` y `exigirRol`—; esto
 * solo dice qué se pinta.
 */
export type AccionesTarjeta = {
  /** El ticket de cocina. Sale mientras el pedido siga vivo; ya entregado no hay nada que armar. */
  imprimir: boolean;
  /**
   * Llamar al domiciliario, o cambiarlo. Solo en domicilio y solo desde que la cocina tiene el
   * pedido: antes de aceptarlo no hay a quién mandar, y asignar no lo acepta (regla 18).
   */
  asignar: boolean;
  /** El reintento del aviso al cliente. Lo decide el servidor, aquí solo se traslada. */
  avisar: boolean;
  /** El estado al que lleva el botón naranja, o `null` si el pedido ya terminó. */
  avanzar: EstadoPedido | null;
};

/** Los dos estados sin vuelta: ni se preparan ni se reparten. */
const TERMINALES: EstadoPedido[] = ["entregado", "cancelado"];

/**
 * Desde qué estados hay a quién asignarle el pedido.
 *
 * `en_camino` está a propósito: reasignar es raro, pero el caso existe —el domiciliario no
 * apareció— y el tablero es donde se descubre. `aceptado` también, y esa es la que se rompe sola:
 * ya no se genera, pero hay pedidos guardados con él y el módulo entero lo lee como `preparando`
 * (ver `ESTADO_RETIRADO` en `lib/pedidos/estados.ts`). Olvidarlo aquí dejaría uno de esos pedidos
 * sin forma de llamar al domiciliario desde el tablero.
 */
const CON_DOMICILIARIO: EstadoPedido[] = ["aceptado", "preparando", "en_camino"];

export function accionesDeTarjeta({
  estado,
  tipo,
  siguiente,
  avisoPendiente,
}: {
  estado: EstadoPedido;
  tipo: TipoPedido;
  /** El avance natural, tal cual lo calculó el servidor (`siguienteEstado`). */
  siguiente: EstadoPedido | null;
  /** Si queda un aviso por mandar en el estado actual (regla 11, y `aceptaAvisos` ya aplicado). */
  avisoPendiente: boolean;
}): AccionesTarjeta {
  const vivo = !TERMINALES.includes(estado);

  return {
    imprimir: vivo,
    asignar: vivo && tipo === "domicilio" && CON_DOMICILIARIO.includes(estado),
    avisar: avisoPendiente,
    avanzar: siguiente,
  };
}
