import {
  cambioEstado,
  nuevoPedidoNegocio,
  type EstadoPedido,
  type PedidoParaMensaje,
  type Tienda,
} from "./plantillas";
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

/**
 * Lo que necesita cualquier aviso para armarse. Se declara una vez porque estaba escrito
 * literal en dos firmas, y añadir `programadoPara` a una y no a la otra rompió el build: los
 * campos que cambian de nombre al cruzar a las plantillas no los descubre la intersección.
 */
export type PedidoParaAviso = Pick<
  PedidoPublico,
  (keyof PedidoParaMensaje & keyof PedidoPublico) | "punto" | "programadoPara"
>;

/**
 * Del pedido guardado al pedido que entienden las plantillas — todo desde el snapshot.
 *
 * Toma la forma y no el tipo `PedidoPublico` cerrado, para que el panel pueda pasar su
 * propio `PedidoPanel` sin convertirlo: los dos salen de la misma fila, solo cambia
 * cuánto exponen.
 *
 * Los campos que se llaman igual en los dos tipos entran solos por la intersección; los que
 * cambian de nombre al cruzar a las plantillas hay que nombrarlos: `punto` → `ubicacion` y
 * `programadoPara` → `horaEntregaEstimada`.
 */
export function pedidoParaMensaje(pedido: PedidoParaAviso): PedidoParaMensaje {
  return {
    numero: pedido.numero,
    tokenPublico: pedido.tokenPublico,
    tipo: pedido.tipo,
    clienteNombre: pedido.clienteNombre,
    clienteTelefono: pedido.clienteTelefono,
    direccion: pedido.direccion,
    barrio: pedido.barrio,
    indicaciones: pedido.indicaciones,
    // El pin del cliente. Es lo que convierte la línea de Google Maps del aviso al negocio
    // en algo que el domiciliario puede abrir (regla 14).
    ubicacion: pedido.punto,
    // La hora que eligió el cliente, o `null` si quiso su pedido lo antes posible.
    //
    // El campo de las plantillas se llama `horaEntregaEstimada` porque nació para US22 —lo
    // que el NEGOCIO estima al aceptar el pedido—, que sigue pendiente. No son lo mismo: uno
    // es una promesa del local y el otro una petición del cliente. Se alimenta con lo segundo
    // porque es lo que hoy hay que decirle; si algún día llega US22, ese valor manda sobre
    // este y el campo pasa a significar lo que su nombre dice.
    horaEntregaEstimada: pedido.programadoPara,
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

/**
 * Si ese estado genera aviso o no. Existe aparte de `avisoCambioEstado` para poder
 * preguntarlo sin efectos: quien avisa tiene que cerrar el candado de idempotencia
 * (regla 11) ANTES de enviar nada, y para eso necesita saber de antemano si hay algo
 * que enviar.
 *
 * Usa un pedido de mentira porque `cambioEstado` solo mira el estado para decidirlo.
 */
export function puedeAvisarse(estado: EstadoPedido): boolean {
  const cualquiera = { tokenPublico: "x", horaEntregaEstimada: null } as PedidoParaMensaje;
  return cambioEstado(estado, cualquiera, { nombre: "x", baseUrl: "https://x" }) !== null;
}

/**
 * Aviso de cambio de estado dirigido al CLIENTE (US20). Aquí el destinatario sí es el
 * cliente: el link lo abre el negocio desde el panel, con el mensaje ya escrito.
 *
 * Devuelve `null` para los estados que no se notifican —`nuevo`, porque ya se avisó al
 * confirmar—; eso lo decide `cambioEstado`, y aquí solo se respeta.
 */
export async function avisoCambioEstado(
  estado: EstadoPedido,
  pedido: PedidoParaAviso,
  store: { nombre: string },
): Promise<ResultadoEnvio | null> {
  const texto = cambioEstado(estado, pedidoParaMensaje(pedido), tiendaParaMensaje(store));
  if (!texto) return null;

  return obtenerTransporte().preparar(pedido.clienteTelefono, texto);
}
