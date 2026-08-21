import type { PedidoEnLista } from "@/db/queries/panel";
import { pesos, subtotalConDescuento } from "@/lib/notificaciones/plantillas";

/**
 * De qué se compone el total de un pedido a domicilio: los productos y el envío.
 *
 * Existe **para no tener que abrir el pedido** solo para saber cuánto se le paga al domiciliario.
 * El courier es externo al negocio (regla 13), así que esa cifra se consulta decenas de veces al
 * día y hasta ahora vivía únicamente en la ficha.
 *
 * Vive suelto porque lo pintan **dos pantallas** —el tablero de hoy y la consulta de un día
 * pasado— y lo que no puede desincronizarse es la redacción: son dos sitios diciendo la misma
 * frase sobre la misma plata.
 *
 * **La cifra de productos es la que se cobró, no la de la carta**: sale de `subtotalConDescuento`,
 * la misma función de la que beben el detalle, el seguimiento del cliente y los tres mensajes. Aquí
 * no se recalcula nada; el snapshot ya trae las tres columnas (regla 2).
 *
 * No lleva la palabra "productos" y es una decisión de ancho, no de estilo: con ella la línea mide
 * ~205 px a 11 px de letra y la tarjeta de la tablet deja ~200, así que envolvería justo en la
 * pantalla más apretada. La que lleva nombre es la del envío, que es la que se va a buscar; la otra
 * se lee por contraste.
 */
export function DesgloseDomicilio({
  pedido,
}: {
  pedido: Pick<PedidoEnLista, "tipo" | "subtotal" | "costoDomicilio" | "descuento">;
}) {
  // Un pedido para recoger no tiene envío que separar ni domiciliario a quien pagarle. La condición
  // vive aquí y no en quien llama para que las dos pantallas no la repitan —ni se olvide una.
  if (pedido.tipo !== "domicilio") return null;

  return (
    <p className="font-cuerpo text-[11px] text-cafe-tenue">
      {pesos(subtotalConDescuento(pedido.subtotal, pedido.descuento))} +{" "}
      {pesos(pedido.costoDomicilio)} domicilio
    </p>
  );
}
