import {
  cambioEstado,
  llevaAviso,
  nuevoPedidoNegocio,
  pedidoParaDomiciliario,
  type EstadoPedido,
  type PedidoParaMensaje,
  type Tienda,
} from "./plantillas";
import { obtenerTransporte, type ResultadoEnvio } from "./transporte";
import { resolverBaseUrl } from "@/lib/url";
import type { PedidoPublico } from "@/db/queries/pedidos";
import type { PedidoPanel } from "@/db/queries/panel";

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
 * **Hoy no lo llama nadie, y es a propósito.** Vivía en la pantalla de seguimiento como un
 * botón que el cliente pulsaba para avisar que había pedido — un apaño de cuando no existía
 * el panel. El panel ya existe y refresca cada 5 s, así que el negocio se entera solo y el
 * cliente dejó de hacer de mensajero.
 *
 * Se conserva porque es el único texto que arma un pedido completo para WhatsApp, y el día
 * que haga falta —un aviso nocturno, reenviarle el pedido a un domiciliario— está listo. Si
 * pasa un año y sigue sin llamarlo nadie, bórrese con su test.
 *
 * Ojo con la dirección del link: `wa.me/<numero>` abre un chat *con* ese número y deja el
 * texto listo para que lo envíe quien lo abre, no se lo manda a nadie.
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
 * El pedido para quien lo lleva (US: asignar domiciliario).
 *
 * El destinatario es el domiciliario, no el cliente: el link `wa.me` lo abre el panel con el
 * mensaje ya escrito y quien despacha solo pulsa enviar.
 *
 * Se alimenta del pedido del panel y no de `pedidoParaMensaje`: hacen falta `pagaCon` y si el
 * pago ya está confirmado, que son datos de caja y no tienen por qué existir en los avisos al
 * cliente.
 */
export async function avisoDomiciliario(
  pedido: PedidoPanel,
  domiciliario: { telefono: string },
  store: { nombre: string },
): Promise<ResultadoEnvio> {
  const texto = pedidoParaDomiciliario(
    {
      numero: pedido.numero,
      clienteNombre: pedido.clienteNombre,
      clienteTelefono: pedido.clienteTelefono,
      recibeNombre: pedido.recibeNombre,
      recibeTelefono: pedido.recibeTelefono,
      direccion: pedido.direccion,
      barrio: pedido.barrio,
      indicaciones: pedido.indicaciones,
      ubicacion: pedido.punto,
      total: pedido.total,
      metodoPago: pedido.metodoPago,
      pagaCon: pedido.pagaCon,
      // Un comprobante cargado es la única prueba de pago que maneja este negocio. En efectivo
      // nunca hay comprobante, así que siempre toca cobrar — que es justo lo correcto.
      pagado: Boolean(pedido.comprobanteUrl),
      tokenEntrega: pedido.tokenEntrega,
    },
    tiendaParaMensaje(store),
  );

  return obtenerTransporte().preparar(domiciliario.telefono, texto);
}

/**
 * Si ese estado genera aviso o no. Existe aparte de `avisoCambioEstado` para poder
 * preguntarlo sin efectos: quien avisa tiene que cerrar el candado de idempotencia
 * (regla 11) ANTES de enviar nada, y para eso necesita saber de antemano si hay algo
 * que enviar.
 *
 * Se limita a reexportar la respuesta de `plantillas.ts`, que es quien sabe qué estados
 * tienen texto.
 */
export function puedeAvisarse(estado: EstadoPedido): boolean {
  return llevaAviso(estado);
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
