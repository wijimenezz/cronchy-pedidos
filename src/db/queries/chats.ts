import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversation, customer, message } from "@/db/schema";
import { normalizarTelefono } from "@/lib/notificaciones/transporte";
import { resumenDeMensaje, type TipoMensaje } from "@/lib/chat/evolution";

/** Cuántas conversaciones trae la bandeja. Ver la nota de `listarConversaciones`. */
const TOPE_BANDEJA = 100;

/** Cuántos mensajes trae un hilo al abrirlo. */
const TOPE_HILO = 200;

export type ConversacionEnLista = {
  id: string;
  telefono: string;
  /** El nombre del pedido si lo hay; si no, el de WhatsApp; si no, nada. */
  nombre: string | null;
  customerId: string | null;
  ultimoTexto: string | null;
  ultimoMensajeEn: Date;
  sinLeer: number;
};

export type MensajeDelHilo = {
  id: string;
  direccion: "entrante" | "saliente";
  tipo: TipoMensaje;
  texto: string | null;
  creadoEn: Date;
  orderId: string | null;
};

/**
 * La bandeja: conversaciones por actividad reciente.
 *
 * **No se filtra por día**, al revés que el tablero de pedidos. Un pedido terminado ya no se
 * opera, pero una conversación sigue viva mientras la persona espere respuesta — y una pregunta
 * de anoche sin contestar es justo lo que no puede desaparecer de la lista a medianoche.
 *
 * El tope existe por la misma razón que el del tablero: es una pantalla de trabajo, no un archivo.
 */
export async function listarConversaciones(storeId: string): Promise<ConversacionEnLista[]> {
  const filas = await db
    .select({
      id: conversation.id,
      telefono: conversation.telefono,
      nombreWa: conversation.nombreWa,
      nombreCliente: customer.nombre,
      customerId: conversation.customerId,
      ultimoTexto: conversation.ultimoTexto,
      ultimoMensajeEn: conversation.ultimoMensajeEn,
      sinLeer: conversation.sinLeer,
    })
    .from(conversation)
    .leftJoin(customer, eq(customer.id, conversation.customerId))
    .where(eq(conversation.storeId, storeId))
    .orderBy(desc(conversation.ultimoMensajeEn))
    .limit(TOPE_BANDEJA);

  return filas.map((f) => ({
    id: f.id,
    telefono: f.telefono,
    // El del pedido primero: es el nombre con el que el negocio lo conoce, y el de WhatsApp puede
    // ser un apodo o un emoji.
    nombre: f.nombreCliente ?? f.nombreWa,
    customerId: f.customerId,
    ultimoTexto: f.ultimoTexto,
    ultimoMensajeEn: new Date(f.ultimoMensajeEn),
    sinLeer: f.sinLeer,
  }));
}

export async function listarMensajes(
  storeId: string,
  conversationId: string,
): Promise<MensajeDelHilo[]> {
  const filas = await db
    .select({
      id: message.id,
      direccion: message.direccion,
      tipo: message.tipo,
      texto: message.texto,
      creadoEn: message.creadoEn,
      orderId: message.orderId,
    })
    .from(message)
    .where(and(eq(message.storeId, storeId), eq(message.conversationId, conversationId)))
    .orderBy(asc(message.creadoEn))
    .limit(TOPE_HILO);

  return filas.map((f) => ({ ...f, creadoEn: new Date(f.creadoEn) }));
}

/**
 * La conversación de un teléfono, creándola si hace falta.
 *
 * La llave es (storeId, teléfono normalizado), la misma de `customer`, así que el hilo de alguien
 * que escribe antes de pedir y el de quien ya pidió son el mismo. `customerId` se resuelve aquí y
 * no se exige: quien todavía no ha pedido no tiene ficha, y su conversación existe igual.
 */
export async function obtenerOCrearConversacion(
  storeId: string,
  telefonoCrudo: string,
  nombreWa: string | null,
): Promise<{ id: string }> {
  const telefono = normalizarTelefono(telefonoCrudo);

  const [cliente] = await db
    .select({ id: customer.id })
    .from(customer)
    .where(and(eq(customer.storeId, storeId), eq(customer.telefono, telefono)))
    .limit(1);

  const [fila] = await db
    .insert(conversation)
    .values({ storeId, telefono, customerId: cliente?.id ?? null, nombreWa })
    .onConflictDoUpdate({
      target: [conversation.storeId, conversation.telefono],
      set: {
        // El `customerId` solo se rellena, nunca se borra: una conversación que ya está enlazada
        // no puede desenlazarse porque un evento llegue antes de que exista la ficha.
        customerId: sql`coalesce(${conversation.customerId}, ${cliente?.id ?? null})`,
        nombreWa: sql`coalesce(${nombreWa}, ${conversation.nombreWa})`,
      },
    })
    .returning({ id: conversation.id });

  return fila;
}

/**
 * Guarda un mensaje y adelanta el resumen de su conversación.
 *
 * **Devuelve `false` si el mensaje ya estaba**, que es el candado de idempotencia: Evolution
 * reentrega sus eventos cuando el webhook tarda o falla, y el `UNIQUE (store_id, wa_message_id)`
 * es quien decide. Igual que `marcarEstadoNotificado`, gana quien escribe primero y el resto se
 * entera por el valor de retorno, no por una excepción.
 *
 * Los dos writes van en una transacción porque un mensaje guardado que no adelanta
 * `ultimo_mensaje_en` es un mensaje que no aparece arriba en la bandeja: existe y nadie lo ve.
 */
export async function guardarMensaje(entrada: {
  storeId: string;
  conversationId: string;
  direccion: "entrante" | "saliente";
  tipo: TipoMensaje;
  texto: string | null;
  waMessageId: string;
  userId?: string | null;
  orderId?: string | null;
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const filas = await tx
      .insert(message)
      .values({
        storeId: entrada.storeId,
        conversationId: entrada.conversationId,
        direccion: entrada.direccion,
        tipo: entrada.tipo,
        texto: entrada.texto,
        waMessageId: entrada.waMessageId,
        userId: entrada.userId ?? null,
        orderId: entrada.orderId ?? null,
      })
      .onConflictDoNothing({ target: [message.storeId, message.waMessageId] })
      .returning({ id: message.id });

    if (filas.length === 0) return false;

    await tx
      .update(conversation)
      .set({
        ultimoMensajeEn: sql`now()`,
        ultimoTexto: resumenDeMensaje(entrada.tipo, entrada.texto),
        // Lo saliente no suma sin leer: lo escribimos nosotros.
        sinLeer:
          entrada.direccion === "entrante"
            ? sql`${conversation.sinLeer} + 1`
            : conversation.sinLeer,
      })
      .where(
        and(eq(conversation.storeId, entrada.storeId), eq(conversation.id, entrada.conversationId)),
      );

    return true;
  });
}

/**
 * Deja constancia en el hilo de un mensaje que el sistema ya envió.
 *
 * Es lo que hace que el aviso de "va en camino" aparezca en la conversación junto a lo que
 * contesta el cliente, en vez de ser un evento invisible que solo existe como `notificado_en`.
 *
 * **No se propaga si falla.** El mensaje ya salió al cliente; reventar aquí convertiría un envío
 * exitoso en un error de la acción, y el panel volvería a ofrecer el botón de avisar para algo
 * que ya se mandó. Mismo criterio que `borrarSobrantes` con las fotos huérfanas: la fuente de
 * verdad es lo que ya ocurrió, no el registro.
 */
export async function registrarSaliente(entrada: {
  storeId: string;
  telefono: string;
  texto: string;
  waMessageId: string;
  userId?: string | null;
  orderId?: string | null;
}): Promise<void> {
  try {
    const { id } = await obtenerOCrearConversacion(entrada.storeId, entrada.telefono, null);

    await guardarMensaje({
      storeId: entrada.storeId,
      conversationId: id,
      direccion: "saliente",
      tipo: "texto",
      texto: entrada.texto,
      waMessageId: entrada.waMessageId,
      userId: entrada.userId,
      orderId: entrada.orderId,
    });
  } catch (error) {
    console.error("No se pudo registrar el mensaje saliente:", error);
  }
}

export async function marcarLeida(storeId: string, conversationId: string): Promise<void> {
  await db
    .update(conversation)
    .set({ sinLeer: 0 })
    .where(and(eq(conversation.storeId, storeId), eq(conversation.id, conversationId)));
}

/**
 * La conversación de un cliente por su teléfono, sin crearla.
 *
 * La usa el detalle del pedido para llevar a "escribirle" sin inventar un hilo vacío a quien
 * nunca ha escrito.
 */
export async function conversacionDeTelefono(
  storeId: string,
  telefonoCrudo: string,
): Promise<{ id: string } | null> {
  const telefono = normalizarTelefono(telefonoCrudo);

  const [fila] = await db
    .select({ id: conversation.id })
    .from(conversation)
    .where(and(eq(conversation.storeId, storeId), eq(conversation.telefono, telefono)))
    .limit(1);

  return fila ?? null;
}
