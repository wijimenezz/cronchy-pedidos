import type { MetodoPago } from "@/lib/carrito";
import type { TipoPedido } from "@/lib/tienda/tipo-pedido";

/**
 * QUÉ FORMAS DE PAGO se pueden ofrecer. Puro y testeado, como `franjas.ts`.
 *
 * Es la regla 16 aplicada al dinero: el servidor genera la lista y al confirmar solo acepta
 * uno de los suyos. El navegador manda *cuál* eligió el cliente, nunca *si* vale.
 *
 * **Por qué no vive en `crearPedidoSchema`**: ese esquema es puro y compartido, no consulta la
 * base, así que no sabe si la tienda tiene llave configurada — y sin ese dato la regla sería
 * falsa justo en el caso del respaldo. Es el mismo motivo por el que las horas programadas no
 * se validan en Zod sino con `esFranjaOfrecida` en el route handler.
 *
 * **Recoger se paga por adelantado.** Preparar un pedido que nadie viene a recoger es comida
 * a la basura, así que quien recoge paga antes y el efectivo del mostrador desaparece.
 *
 * **Salvo que no haya con qué cobrar**: sin llave configurada, el efectivo vuelve como
 * respaldo. Un checkout sin ninguna forma de pagar no protege nada, solo pierde el pedido —y
 * lo perdería en silencio, que es lo peor de todo.
 */
export type OpcionesPago = {
  /** ¿La tienda tiene llave de pago cargada? Sin ella no se puede cobrar por adelantado. */
  llaveDisponible: boolean;
};

export function metodosDePago(tipo: TipoPedido, { llaveDisponible }: OpcionesPago): MetodoPago[] {
  if (tipo === "recoger") return llaveDisponible ? ["nequi"] : ["efectivo"];

  return llaveDisponible ? ["efectivo", "nequi"] : ["efectivo"];
}

/** Si esto dice que no, el pedido se rechaza: es lo que decide, no el radio de la pantalla. */
export function esMetodoOfrecido(
  metodo: string,
  tipo: TipoPedido,
  opciones: OpcionesPago,
): boolean {
  return (metodosDePago(tipo, opciones) as string[]).includes(metodo);
}
