/**
 * Lo que manda Evolution API, traducido a lo que este proyecto guarda.
 *
 * Módulo puro: no toca la red ni la base, y por eso es lo único de la integración que se puede
 * testear de verdad. El webhook se queda con el trabajo aburrido —autenticar, escribir— y toda la
 * decisión de "¿qué es esto y de quién viene?" vive aquí.
 *
 * El formato es el evento `messages.upsert` de Evolution v2, que a su vez es el objeto crudo de
 * Baileys con una capa encima. Se valida con Zod en el borde, como todo lo que entra (convención
 * del proyecto), y se descarta en silencio lo que no sepamos manejar: un webhook que responde 400
 * ante un sticker haría que Evolution lo reintente para siempre.
 */

import { z } from "zod";
import { normalizarTelefono } from "@/lib/notificaciones/transporte";

export type TipoMensaje = "texto" | "imagen" | "audio" | "otro";

export type MensajeEntrante = {
  /** Ya normalizado a `573XXXXXXXXX`, la misma llave que usa `customer`. */
  telefono: string;
  /** El id de WhatsApp. Es el candado de idempotencia. */
  waMessageId: string;
  tipo: TipoMensaje;
  /** El texto, o `null` cuando no lo hay (una foto sin pie, una nota de voz). */
  texto: string | null;
  /** El `pushName`: cómo se llama esa persona en su propio perfil de WhatsApp. */
  nombreWa: string | null;
};

/**
 * Solo lo que se usa. Evolution manda muchísimo más en cada evento y declararlo entero sería
 * fijar en un esquema propio la forma de una API de terceros que cambia sin avisar.
 */
const eventoSchema = z.object({
  event: z.string(),
  data: z.object({
    key: z.object({
      remoteJid: z.string(),
      fromMe: z.boolean(),
      id: z.string().min(1),
    }),
    pushName: z.string().nullish(),
    message: z.record(z.string(), z.unknown()).nullish(),
    messageType: z.string().nullish(),
  }),
});

/** `573001234567@s.whatsapp.net` -> `573001234567`. Los grupos terminan en `@g.us`. */
const JID_INDIVIDUAL = /^(\d+)@s\.whatsapp\.net$/;

/**
 * El texto vive en sitios distintos según cómo se haya escrito: suelto en `conversation`, dentro
 * de `extendedTextMessage` si lleva formato o responde a otro, y como `caption` si acompaña a una
 * foto. Se miran los tres porque para quien atiende los tres son lo mismo: lo que dijo el cliente.
 */
function extraerTexto(message: Record<string, unknown>): string | null {
  const conversation = message.conversation;
  if (typeof conversation === "string" && conversation.trim()) return conversation.trim();

  for (const clave of ["extendedTextMessage", "imageMessage", "videoMessage"]) {
    const nodo = message[clave];
    if (nodo && typeof nodo === "object") {
      const texto = (nodo as Record<string, unknown>).text ?? (nodo as Record<string, unknown>).caption;
      if (typeof texto === "string" && texto.trim()) return texto.trim();
    }
  }

  return null;
}

function clasificar(message: Record<string, unknown>): TipoMensaje {
  if ("conversation" in message || "extendedTextMessage" in message) return "texto";
  if ("imageMessage" in message) return "imagen";
  if ("audioMessage" in message || "pttMessage" in message) return "audio";
  return "otro";
}

/**
 * Devuelve el mensaje entrante, o `null` si el evento no es uno que nos toque guardar.
 *
 * Se descarta —sin ruido y con 200— todo esto:
 * - eventos que no son `messages.upsert`;
 * - lo que sale de nosotros (`fromMe`), porque el saliente ya se guardó al enviarlo y volver a
 *   escribirlo aquí lo duplicaría con otro id;
 * - los grupos y los estados (`@g.us`, `status@broadcast`): el WhatsApp de pedidos atiende
 *   personas, y un grupo en la bandeja sería ruido que nadie va a contestar;
 * - cualquier cosa cuyo teléfono no quede como un celular colombiano válido.
 */
export function leerEventoEvolution(crudo: unknown): MensajeEntrante | null {
  const parsed = eventoSchema.safeParse(crudo);
  if (!parsed.success) return null;

  const { event, data } = parsed.data;
  if (event !== "messages.upsert") return null;
  if (data.key.fromMe) return null;

  const jid = JID_INDIVIDUAL.exec(data.key.remoteJid);
  if (!jid) return null;

  const telefono = normalizarTelefono(jid[1]);
  if (!/^573\d{9}$/.test(telefono)) return null;

  const message = data.message ?? {};

  return {
    telefono,
    waMessageId: data.key.id,
    tipo: clasificar(message),
    texto: extraerTexto(message),
    nombreWa: data.pushName?.trim() || null,
  };
}

/**
 * Lo que se muestra en la lista de conversaciones como "último mensaje".
 *
 * Una foto sin pie no puede dejar la fila en blanco: quien mira la bandeja tiene que ver que pasó
 * algo. No se descarga el archivo (ver la nota del webhook), así que se dice qué llegó y dónde
 * abrirlo — el teléfono del SIM conserva su WhatsApp, porque Evolution es un dispositivo
 * vinculado y no un reemplazo.
 */
export function resumenDeMensaje(tipo: TipoMensaje, texto: string | null): string {
  if (texto) return texto;

  switch (tipo) {
    case "imagen":
      return "📎 Envió una imagen";
    case "audio":
      return "🎤 Envió una nota de voz";
    default:
      return "📎 Envió un archivo";
  }
}
