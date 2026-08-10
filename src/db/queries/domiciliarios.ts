import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { courier, order, orderStatusEvent } from "@/db/schema";
import { esTelefonoValido, normalizarTelefono } from "@/lib/notificaciones/transporte";
import { validarCambioEstado } from "@/lib/pedidos/estados";
import type { EstadoPedido, TipoPedido } from "@/lib/notificaciones/plantillas";

/**
 * La agenda de domiciliarios y a quién lleva cada pedido.
 *
 * No son empleados: el domicilio lo ejecuta un courier externo (regla 13). Esto es la lista de a
 * quién se le puede pasar un pedido por WhatsApp, y nada más — no hay turnos, ni disponibilidad,
 * ni asignación automática.
 */

export type Domiciliario = {
  id: string;
  nombre: string;
  /** Normalizado: "573116435036". */
  telefono: string;
};

/** Los que se pueden elegir hoy. Los archivados no salen (regla 9: se apagan, no se borran). */
export async function listarDomiciliarios(storeId: string): Promise<Domiciliario[]> {
  return db
    .select({ id: courier.id, nombre: courier.nombre, telefono: courier.telefono })
    .from(courier)
    .where(and(eq(courier.storeId, storeId), eq(courier.activo, true)))
    .orderBy(asc(courier.nombre));
}

export type ResultadoCrear =
  | { ok: true; domiciliario: Domiciliario }
  | { ok: false; error: string };

/**
 * Añade a alguien a la agenda, o lo revive si ya estaba archivado.
 *
 * El teléfono se guarda normalizado y es la identidad de la persona, igual que en `customer`: el
 * mismo número escrito de tres formas distintas no puede crear tres domiciliarios. Por eso el
 * conflicto sobre `(store_id, telefono)` no es un error sino un reencuentro — el caso real es el
 * que se archivó en enero y vuelve en marzo.
 */
export async function crearDomiciliario(
  storeId: string,
  nombreCrudo: string,
  telefonoCrudo: string,
): Promise<ResultadoCrear> {
  const nombre = nombreCrudo.trim();
  if (!nombre) return { ok: false, error: "Ponle un nombre." };

  // El mismo criterio que para el teléfono del cliente: un celular colombiano de verdad. Un
  // número mal escrito no falla al guardarlo, falla al abrir un WhatsApp que no existe.
  if (!esTelefonoValido(telefonoCrudo)) {
    return { ok: false, error: "Ese no parece un celular colombiano (3XX XXX XXXX)." };
  }

  const [fila] = await db
    .insert(courier)
    .values({ storeId, nombre, telefono: normalizarTelefono(telefonoCrudo) })
    .onConflictDoUpdate({
      target: [courier.storeId, courier.telefono],
      set: { nombre, activo: true },
    })
    .returning({ id: courier.id, nombre: courier.nombre, telefono: courier.telefono });

  return { ok: true, domiciliario: fila };
}

/** Sale de la lista pero no de la historia: los pedidos que llevó siguen diciendo su nombre. */
export async function archivarDomiciliario(storeId: string, id: string): Promise<boolean> {
  const filas = await db
    .update(courier)
    .set({ activo: false })
    .where(and(eq(courier.storeId, storeId), eq(courier.id, id)))
    .returning({ id: courier.id });

  return filas.length > 0;
}

/**
 * Quién lleva este pedido.
 *
 * Guarda el id **y** el nombre y teléfono como snapshot (regla 2), igual que `zona_nombre`:
 * archivar o renombrar a alguien de la agenda no puede cambiar lo que dice un pedido ya
 * despachado, y el export no debería necesitar un JOIN para escribir una columna.
 *
 * **No cambia el estado del pedido**, y eso es del negocio: entre que se llama al domiciliario y
 * que llega pasan entre cinco y quince minutos, y durante esa espera el pedido sigue en
 * preparación. Ponerlo "en camino" al asignar sería decirle al cliente que ya salió cuando aún
 * está en el mostrador.
 *
 * Reasignar simplemente sobrescribe: quién lo llevó al final es lo que importa, y el historial de
 * reasignaciones no es una pregunta que este negocio se haga.
 */
export async function asignarDomiciliario(
  storeId: string,
  pedidoId: string,
  courierId: string,
): Promise<Domiciliario | null> {
  const elegido = await db.query.courier.findFirst({
    where: and(eq(courier.storeId, storeId), eq(courier.id, courierId)),
    columns: { id: true, nombre: true, telefono: true },
  });
  if (!elegido) return null;

  const filas = await db
    .update(order)
    .set({
      courierId: elegido.id,
      domiciliarioNombre: elegido.nombre,
      domiciliarioTelefono: elegido.telefono,
    })
    .where(and(eq(order.storeId, storeId), eq(order.id, pedidoId)))
    .returning({ id: order.id });

  return filas.length > 0 ? elegido : null;
}

// ------------------------------------------------------------
// La confirmación de entrega — el único write sin sesión del panel
// ------------------------------------------------------------

/** Lo poco que ve el domiciliario en su pantalla: lo justo para saber que es el pedido correcto. */
export type PedidoParaEntrega = {
  id: string;
  numero: number;
  estado: EstadoPedido;
  tipo: TipoPedido;
  clienteNombre: string;
  direccion: string | null;
  barrio: string | null;
};

/**
 * El pedido detrás de un `token_entrega`.
 *
 * **No devuelve teléfono, ni total, ni items**: quien abre este link ya recibió todo eso por
 * WhatsApp, así que la pantalla no tiene por qué volver a exponerlo. Un link reenviado por error
 * enseña un número de pedido y una calle, no la ficha de un cliente.
 *
 * No filtra por tienda porque el token es global y único; es la llave la que identifica la fila.
 */
export async function pedidoPorTokenEntrega(token: string): Promise<PedidoParaEntrega | null> {
  const fila = await db.query.order.findFirst({
    where: eq(order.tokenEntrega, token),
    columns: {
      id: true,
      numero: true,
      estado: true,
      tipo: true,
      clienteNombre: true,
      direccion: true,
      barrio: true,
    },
  });

  return fila ?? null;
}

export type ResultadoEntrega =
  | { ok: true; yaEstaba: boolean }
  | { ok: false; motivo: "no_encontrado" | "no_permitido" };

/**
 * El domiciliario confirma que entregó.
 *
 * **Lo que protege esto no es el token, es `validarCambioEstado`.** El token dice de qué pedido
 * hablamos; la máquina de estados dice qué se puede hacer con él, y solo admite
 * `en_camino → entregado`. Un link filtrado no puede cancelar, ni adelantar un pedido que aún se
 * está preparando, ni servir dos veces.
 *
 * El `SELECT … FOR UPDATE` es el mismo seguro que en el panel: si el domiciliario y el mostrador
 * pulsan a la vez, uno gana y el otro lee el estado ya cambiado.
 *
 * `yaEstaba` distingue "lo acabas de entregar" de "esto ya estaba entregado", que es un caso
 * normal —el link se pulsa dos veces— y no un error que haya que mostrar en rojo.
 *
 * El evento se registra con `user_id` NULL: no lo tocó nadie del panel. Quién lo llevaba se sabe
 * por `order.domiciliario_nombre`.
 */
export async function confirmarEntrega(token: string): Promise<ResultadoEntrega> {
  return db.transaction(async (tx) => {
    const [actual] = await tx
      .select({
        id: order.id,
        storeId: order.storeId,
        estado: order.estado,
        tipo: order.tipo,
        metodoPago: order.metodoPago,
        comprobanteUrl: order.comprobanteUrl,
      })
      .from(order)
      .where(eq(order.tokenEntrega, token))
      .for("update");

    if (!actual) return { ok: false, motivo: "no_encontrado" };
    if (actual.estado === "entregado") return { ok: true, yaEstaba: true };

    const permitido = validarCambioEstado(
      {
        estado: actual.estado,
        tipo: actual.tipo,
        metodoPago: actual.metodoPago,
        tieneComprobante: Boolean(actual.comprobanteUrl),
      },
      "entregado",
    );
    if (!permitido.ok) return { ok: false, motivo: "no_permitido" };

    await tx.update(order).set({ estado: "entregado" }).where(eq(order.id, actual.id));
    await tx.insert(orderStatusEvent).values({
      storeId: actual.storeId,
      orderId: actual.id,
      estado: "entregado",
    });

    return { ok: true, yaEstaba: false };
  });
}
