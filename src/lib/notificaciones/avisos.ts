import { nuevoPedidoNegocio, type PedidoParaMensaje, type Tienda } from "./plantillas";
import { obtenerTransporte, type ResultadoEnvio } from "./transporte";
import { resolverBaseUrl } from "@/lib/url";
import type { PedidoPublico } from "@/db/queries/pedidos";

/**
 * Compone plantilla + transporte. Existe para que ni un route handler ni un componente
 * tengan que saber cómo se arma un aviso (regla 10): solo piden "avísale al negocio".
 */

export function tiendaParaMensaje(store: { nombre: string }): Tienda {
  return { nombre: store.nombre, baseUrl: resolverBaseUrl() };
}

/** Del pedido guardado al pedido que entienden las plantillas — todo desde el snapshot. */
export function pedidoParaMensaje(pedido: PedidoPublico): PedidoParaMensaje {
  return {
    numero: pedido.numero,
    tokenPublico: pedido.tokenPublico,
    tipo: pedido.tipo,
    clienteNombre: pedido.clienteNombre,
    clienteTelefono: pedido.clienteTelefono,
    direccion: pedido.direccion,
    barrio: pedido.barrio,
    indicaciones: pedido.indicaciones,
    items: pedido.items,
    subtotal: pedido.subtotal,
    costoDomicilio: pedido.costoDomicilio,
    total: pedido.total,
    metodoPago: pedido.metodoPago,
    notas: pedido.notas,
  };
}

/**
 * Aviso de pedido nuevo dirigido al NEGOCIO (US23).
 *
 * Ojo con la dirección del link: `wa.me/<numero>` abre un chat *con* ese número y deja el
 * texto listo para que lo envíe quien lo abre. Aquí el número es el del negocio y quien
 * abre es el cliente, desde su pantalla de seguimiento. Es decir: el cliente hace de
 * mensajero, el destinatario sigue siendo el negocio.
 *
 * Esto no contradice "los pedidos NO se reciben por WhatsApp": el pedido ya está en la
 * base con su número y su token; esto es solo el aviso de que llegó, mientras no exista
 * el panel (Fase C).
 *
 * Devuelve null si la tienda no tiene teléfono cargado, para que la UI oculte el botón
 * en vez de ofrecer un link roto.
 */
export async function avisoNuevoPedido(
  pedido: PedidoPublico,
  store: { nombre: string; telefono: string | null },
): Promise<ResultadoEnvio | null> {
  if (!store.telefono) return null;

  const tienda = tiendaParaMensaje(store);
  const texto = nuevoPedidoNegocio(pedidoParaMensaje(pedido), tienda);

  return obtenerTransporte().preparar(store.telefono, texto);
}
