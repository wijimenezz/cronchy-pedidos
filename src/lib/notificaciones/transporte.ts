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

export function esTelefonoValido(entrada: string): boolean {
  const n = normalizarTelefono(entrada);
  return n.startsWith("57") && n.length >= 12;
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
