// ============================================================
// src/lib/notificaciones/transporte.ts
//
// El ÚNICO lugar que sabe CÓMO se envía un mensaje.
// Hoy: links wa.me que el panel abre con un toque.
// Mañana: Cloud API, sin tocar plantillas.ts.
// ============================================================

import {
  confirmacionCliente,
  confirmacionClienteCorta,
  SALUDO_CONTACTO,
  type PedidoParaMensaje,
  type Tienda,
} from "./plantillas";

// Límite conservador. Los links wa.me llevan el texto codificado en la
// URL; pasado cierto tamaño WhatsApp lo trunca o el navegador lo rechaza.
/**
 * Lo que puede medir la URL de `wa.me` antes de dejar de ser fiable.
 *
 * Se exporta porque **el mensaje que hoy crece es el de la aceptación**, y ese no pasa por
 * `prepararConfirmacion`: lo arma `avisoCambioEstado`, que comprueba esto por su cuenta. Un tope
 * que solo vigilara una función dejó pasar durante un tiempo un mensaje de 3.652 caracteres.
 */
export const MAX_LONGITUD_URL = 1800;

export type ResultadoEnvio =
  /** Requiere que un humano toque el botón en el panel. */
  | { modo: "link"; url: string; texto: string }
  /** Se envió solo. */
  | { modo: "automatico"; id: string };

export interface Transporte {
  preparar(telefono: string, texto: string): Promise<ResultadoEnvio>;
}

// ------------------------------------------------------------
// Normalización de teléfonos colombianos
// ------------------------------------------------------------

/**
 * wa.me exige solo dígitos con indicativo de país: nada de +, espacios,
 * guiones ni paréntesis.
 *
 *   "300 123 4567"   -> "573001234567"
 *   "+57 300 1234567"-> "573001234567"
 *   "3001234567"     -> "573001234567"
 */
export function normalizarTelefono(entrada: string): string {
  const digitos = entrada.replace(/\D/g, "");

  // Celular colombiano sin indicativo: 10 dígitos empezando por 3
  if (digitos.length === 10 && digitos.startsWith("3")) {
    return `57${digitos}`;
  }

  // Fijo de Fusagasugá sin indicativo
  if (digitos.length === 7) {
    return `571${digitos}`;
  }

  return digitos;
}

/**
 * Un celular colombiano y nada más: indicativo 57 + 10 dígitos que empiezan por 3.
 *
 * Se compara contra el número YA normalizado, así que da igual cómo lo escriba el
 * cliente ("3116435036", "311 643 5036", "+57 311 643 5036").
 *
 * El `length >= 12` de antes dejaba pasar cualquier basura que empezara por 57
 * ("5799999999999999"), y un fijo de 7 dígitos no sirve para avisar por WhatsApp.
 */
export function esTelefonoValido(entrada: string): boolean {
  return /^573\d{9}$/.test(normalizarTelefono(entrada));
}

type TiendaContactable = { whatsappUrl?: string | null; telefono?: string | null };

/**
 * El link de "Contáctanos" que ve el cliente. Vive aquí para que el footer y el menú
 * lateral no puedan terminar apuntando a chats distintos.
 *
 * **Se arma con el teléfono aunque la tienda tenga su link corto de WhatsApp Business**
 * (`wa.me/message/XXXX`), y esa prioridad es al revés de lo que parece razonable. El corto lleva
 * al mismo chat, pero su saludo se configura dentro de la app del celular y es **uno solo para
 * todos los canales**: la bio de Instagram, la ficha de Google y las tarjetas entran por ahí. Un
 * `?text=` propio es la única forma de que quien escribe desde la app de pedidos se presente como
 * tal sin cambiárselo a todos los demás; ese formato no lo admite, así que se descarta.
 *
 * El corto sigue como respaldo porque `store.telefono` es nullable: sin número, un saludo genérico
 * es mejor que ningún botón.
 *
 * El texto no se recibe por parámetro a propósito (`SALUDO_CONTACTO`, regla 10): mientras se
 * pudiera pasar, el menú lateral y el pie podían volver a decir cosas distintas, que es justo de
 * donde se viene.
 */
export function linkContactoWhatsapp(tienda: TiendaContactable): string | null {
  return linkWhatsappNegocio(tienda, SALUDO_CONTACTO);
}

/**
 * Lo mismo, pero para un mensaje que NO es el saludo genérico: hoy solo el seguimiento del
 * pedido, que escribe con su número (`saludoPorPedido`).
 *
 * Existe aparte para que quien quiera un texto propio tenga que decidirlo aquí y no acabe
 * pasándoselo a `linkContactoWhatsapp`, que es lo que dejaba al menú lateral y al pie diciendo
 * cosas distintas.
 */
export function linkWhatsappNegocio(
  tienda: TiendaContactable,
  mensaje: string,
): string | null {
  if (tienda.telefono) {
    const numero = normalizarTelefono(tienda.telefono);
    return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
  }

  return tienda.whatsappUrl ?? null;
}

// ------------------------------------------------------------
// Adaptador: link wa.me
// ------------------------------------------------------------

export const transporteWaLink: Transporte = {
  async preparar(telefono, texto) {
    const numero = normalizarTelefono(telefono);
    const url = `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;

    return { modo: "link", url, texto };
  },
};

// ------------------------------------------------------------
// Adaptador: Cloud API (pendiente — requiere número dedicado)
// ------------------------------------------------------------

export const transporteCloudApi: Transporte = {
  async preparar() {
    throw new Error(
      "Cloud API no configurada. Requiere un número dedicado y plantillas " +
        "aprobadas por Meta. Ver regla 10 del CLAUDE.md.",
    );
  },
};

// ------------------------------------------------------------
// Selección del transporte activo
// ------------------------------------------------------------

export function obtenerTransporte(): Transporte {
  return process.env.WHATSAPP_MODO === "api"
    ? transporteCloudApi
    : transporteWaLink;
}

// ------------------------------------------------------------
// Helper de alto nivel
// ------------------------------------------------------------

/**
 * Arma la confirmación del pedido y devuelve lo que el panel necesita
 * para enviarla. Si el mensaje largo no cabe en la URL, cae automáticamente
 * a la versión corta que apunta al link de seguimiento.
 */
export async function prepararConfirmacion(
  pedido: PedidoParaMensaje,
  tienda: Tienda,
): Promise<ResultadoEnvio> {
  const transporte = obtenerTransporte();

  const largo = confirmacionCliente(pedido, tienda);
  const resultado = await transporte.preparar(pedido.clienteTelefono, largo);

  if (resultado.modo === "link" && resultado.url.length > MAX_LONGITUD_URL) {
    const corto = confirmacionClienteCorta(pedido, tienda);
    return transporte.preparar(pedido.clienteTelefono, corto);
  }

  return resultado;
}
