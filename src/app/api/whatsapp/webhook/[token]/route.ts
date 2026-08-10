import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getStore } from "@/db/queries/store";
import { guardarMensaje, obtenerOCrearConversacion } from "@/db/queries/chats";
import { leerEventoEvolution } from "@/lib/chat/evolution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Un cuerpo de webhook razonable. Corte barato antes de leerlo entero en memoria. */
const MAX_BYTES = 256_000;

/**
 * Lo que Evolution API manda cuando alguien le escribe al WhatsApp de pedidos.
 *
 * **Es el segundo write público sin sesión de panel** (el primero es `/api/entrega/[token]`), y
 * sigue el mismo molde a propósito. Lo que lo sostiene:
 *
 * 1. **La llave va en la ruta**, porque Evolution no firma sus webhooks como sí hace Meta. Es un
 *    secreto largo de `WHATSAPP_WEBHOOK_TOKEN`, comparado en tiempo constante, y un token
 *    equivocado responde exactamente lo mismo que una ruta inexistente.
 * 2. **Lo que decide qué se guarda no es el token sino `leerEventoEvolution`**: solo mensajes
 *    entrantes, de chats individuales, con un celular colombiano válido. Un evento cualquiera no
 *    puede escribir nada más que una fila de conversación.
 * 3. **La idempotencia la cierra la base**, con el `UNIQUE (store_id, wa_message_id)`. Evolution
 *    reentrega cuando el webhook tarda, y aquí eso no duplica nada.
 *
 * **Todo lo que no se sepa manejar se descarta con 200**, no con 400: Evolution reintenta lo que
 * falla, así que responder error a un sticker lo convertiría en un reintento infinito. El único
 * 404 es el del token.
 *
 * Este proyecto no tiene rate limiting en ningún endpoint y esto no lo inventa: lo que sostiene la
 * puerta es que la ruta no se puede adivinar.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!tokenValido(token)) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const declarado = Number(request.headers.get("content-length") ?? 0);
  if (declarado > MAX_BYTES) {
    return NextResponse.json({ error: "Cuerpo demasiado grande" }, { status: 413 });
  }

  const crudo = await request.json().catch(() => null);
  const entrante = leerEventoEvolution(crudo);
  // No es un mensaje que nos toque guardar (un estado de conexión, un grupo, algo nuestro).
  if (!entrante) return NextResponse.json({ ok: true });

  const tienda = await getStore();

  const { id: conversationId } = await obtenerOCrearConversacion(
    tienda.id,
    entrante.telefono,
    entrante.nombreWa,
  );

  await guardarMensaje({
    storeId: tienda.id,
    conversationId,
    direccion: "entrante",
    tipo: entrante.tipo,
    texto: entrante.texto,
    waMessageId: entrante.waMessageId,
  });

  return NextResponse.json({ ok: true });
}

/**
 * Comparación en tiempo constante. Con `===` el tiempo de respuesta filtra cuántos caracteres
 * acertó quien prueba, que es todo lo que hace falta para adivinar un secreto a fuerza de
 * intentos.
 */
function tokenValido(recibido: string): boolean {
  const esperado = process.env.WHATSAPP_WEBHOOK_TOKEN;
  // Sin secreto configurado la puerta se queda cerrada, no abierta: es el mismo criterio que la
  // purga de comprobantes, que falla a propósito antes que borrar a medias.
  if (!esperado) return false;

  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}
