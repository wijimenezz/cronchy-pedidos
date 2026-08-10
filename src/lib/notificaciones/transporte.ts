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
  type PedidoParaMensaje,
  type Tienda,
} from "./plantillas";

// Límite conservador. Los links wa.me llevan el texto codificado en la
// URL; pasado cierto tamaño WhatsApp lo trunca o el navegador lo rechaza.
const MAX_LONGITUD_URL = 1800;

export type ResultadoEnvio =
  /** Requiere que un humano toque el botón en el panel. */
  | { modo: "link"; url: string; texto: string }
  /** Se envió solo. `texto` viaja en las dos ramas porque quien envía también lo registra. */
  | { modo: "automatico"; id: string; texto: string };

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

/**
 * El link de "Contáctanos" que ve el cliente. Vive aquí para que el footer y el menú
 * lateral no puedan terminar apuntando a chats distintos.
 *
 * Si la tienda tiene su link corto de WhatsApp Business (`wa.me/message/XXXX`) se usa
 * tal cual: ese formato ya trae configurado su propio mensaje de bienvenida y no acepta
 * `?text=`. Si no hay link corto, se arma uno con el teléfono.
 */
export function linkContactoWhatsapp(
  tienda: { whatsappUrl?: string | null; telefono?: string | null },
  mensaje: string,
): string | null {
  if (tienda.whatsappUrl) return tienda.whatsappUrl;
  if (!tienda.telefono) return null;

  return `https://wa.me/${normalizarTelefono(tienda.telefono)}?text=${encodeURIComponent(mensaje)}`;
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
// Adaptador: Evolution API
// ------------------------------------------------------------

/**
 * Manda el mensaje de verdad, sin que nadie toque nada.
 *
 * Evolution corre en su propio servidor (Railway) y habla el protocolo de WhatsApp Web: el número
 * de pedidos está vinculado ahí como un dispositivo más, así que el teléfono con el SIM conserva
 * su WhatsApp funcionando. Es un cliente **no oficial**, y por eso el número enlazado es uno
 * dedicado y no el del negocio — ver CLAUDE.md.
 *
 * No hay `MAX_LONGITUD_URL` que valga aquí: el texto va en el cuerpo de un POST, así que el
 * mensaje largo del pedido cabe entero y el fallback a la versión corta deja de hacer falta.
 */
export const transporteEvolution: Transporte = {
  async preparar(telefono, texto) {
    const { url, apiKey, instancia } = configEvolution();

    const respuesta = await fetch(`${url}/message/sendText/${instancia}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number: normalizarTelefono(telefono), text: texto }),
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => "");
      throw new Error(`Evolution respondió ${respuesta.status}: ${detalle.slice(0, 200)}`);
    }

    const datos = (await respuesta.json()) as { key?: { id?: string } };
    const id = datos.key?.id;
    // Sin id no hay candado de idempotencia posible al guardar el saliente, y un mensaje que se
    // envió pero no se puede registrar es peor que uno que falló en voz alta.
    if (!id) throw new Error("Evolution no devolvió el id del mensaje.");

    return { modo: "automatico", id, texto };
  },
};

function configEvolution(): { url: string; apiKey: string; instancia: string } {
  const url = process.env.EVOLUTION_URL?.replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instancia = process.env.EVOLUTION_INSTANCIA;

  if (!url || !apiKey || !instancia) {
    throw new Error(
      "Falta configurar Evolution: EVOLUTION_URL, EVOLUTION_API_KEY y EVOLUTION_INSTANCIA.",
    );
  }

  return { url, apiKey, instancia };
}

// ------------------------------------------------------------
// Selección del transporte activo
// ------------------------------------------------------------

/**
 * `link` sigue siendo el default a propósito: mientras no se cambie la variable, el panel se
 * comporta exactamente como antes de que existiera Evolution.
 */
export function obtenerTransporte(): Transporte {
  return process.env.WHATSAPP_MODO === "evolution" ? transporteEvolution : transporteWaLink;
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
