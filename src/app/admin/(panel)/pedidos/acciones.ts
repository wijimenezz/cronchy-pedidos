"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actualizarTiempoEstimado, getStore } from "@/db/queries/store";
import {
  cambiarEstadoPedido,
  marcarEstadoNotificado,
  obtenerPedidoPorNumero,
} from "@/db/queries/panel";
import {
  asignarDomiciliario,
  crearDomiciliario,
  type Domiciliario,
} from "@/db/queries/domiciliarios";
import { exigirRol } from "@/lib/autorizacion";
import {
  avisoCambioEstado,
  avisoDomiciliario,
  puedeAvisarse,
} from "@/lib/notificaciones/avisos";
import { MENSAJE_BLOQUEO } from "@/lib/pedidos/estados";
import { comanda } from "@/lib/impresion/comanda";
import { enlaceImpresion } from "@/lib/impresion/enlace";
import { recibo } from "@/lib/impresion/recibo";
import { idSchema } from "@/lib/validaciones";
import type { PedidoPanel } from "@/db/queries/panel";

/**
 * Mutaciones del panel de pedidos.
 *
 * Son server actions y no route handlers —el resto del proyecto usa route handlers— porque
 * aquí no hay ningún cliente externo que consumir: son botones de una pantalla propia, y
 * así se revalida en el mismo viaje, sin exponer una API pública ni escribir `fetch` a mano.
 *
 * **Cada una abre con `exigirRol()`** (regla 12). Una server action es un endpoint POST
 * como cualquier otro: se puede invocar sin pasar jamás por la pantalla que la contiene,
 * y el proxy que protege `/admin/*` no la ve.
 */

const ESTADOS = [
  "nuevo",
  "aceptado",
  "preparando",
  "en_camino",
  "listo",
  "entregado",
  "cancelado",
] as const;

// El id llega del navegador: se valida como cualquier entrada, aunque venga de un botón
// que nosotros mismos pintamos.
const cambioSchema = z.object({
  pedidoId: idSchema,
  estado: z.enum(ESTADOS),
});

export type ResultadoAccion = { ok: true } | { ok: false; error: string };

export type ResultadoAvance =
  | {
      ok: true;
      /** El WhatsApp que hay que abrir, o null si ese estado no lleva mensaje. */
      url: string | null;
      /** El deep link de la comanda, o null si este avance no imprime nada. */
      urlImpresion: string | null;
    }
  | { ok: false; error: string };

/**
 * Avanza el pedido **y**, en el mismo toque, deja listo el aviso al cliente.
 *
 * Antes eran dos botones: uno movía la tarjeta y otro abría WhatsApp. Es un solo momento —el
 * pedido salió, hay que decírselo al cliente— y separarlo hacía que el segundo toque se olvidara.
 *
 * La idempotencia (regla 11) no se relaja, y aquí queda protegida por partida doble:
 * `cambiarEstadoPedido` reserva la fila con `SELECT … FOR UPDATE` y valida la transición, así que
 * de dos pestañas pulsando a la vez **solo una gana el cambio de estado** — y solo la que gana
 * llega a pedir el aviso. El candado de `marcarEstadoNotificado` sigue ahí como segundo cierre.
 *
 * El orden importa y es el de siempre: se marca antes de enviar, porque `wa.me` no devuelve
 * ningún acuse (ver `prepararAviso`). Si el navegador bloquea la ventana, la URL ya está en el
 * cliente y la tarjeta ofrece abrirla a mano.
 */
export async function cambiarEstado(entrada: {
  pedidoId: string;
  estado: string;
}): Promise<ResultadoAvance> {
  // Cambiar estados es la operación diaria: la hace cualquiera del mostrador.
  const sesion = await exigirRol("colaborador");

  const parsed = cambioSchema.safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const resultado = await cambiarEstadoPedido(
    sesion.storeId,
    parsed.data.pedidoId,
    parsed.data.estado,
    sesion.sub,
  );

  if (!resultado.ok) {
    return {
      ok: false,
      error:
        resultado.motivo === "no_encontrado"
          ? "Ese pedido ya no existe."
          : MENSAJE_BLOQUEO[resultado.motivo],
    };
  }

  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${resultado.numero}`);

  // El pedido avanzó pase lo que pase con lo que viene después: si armar el aviso o la comanda
  // falla, el estado ya está guardado y quedan los botones como reintento. Nunca al revés.
  const { url, urlImpresion } = await loQueSigueAlAvance(
    sesion.storeId,
    resultado.numero,
    resultado.estado,
  );

  return { ok: true, url, urlImpresion };
}

/**
 * Lo que hay que disparar hacia fuera del navegador tras un avance: el WhatsApp al cliente y,
 * si el pedido acaba de entrar en cocina, su comanda.
 *
 * **La comanda se dispara al ENTRAR en `preparando`, y no al salir de `nuevo`.** Da lo mismo de
 * dónde venga —a `preparando` solo se llega desde `nuevo` y desde el `aceptado` retirado—, y así
 * la regla no depende de un estado anterior que la consulta no devuelve.
 *
 * Aquí no hay candado de idempotencia: reimprimir es normal, como reasignar un domiciliario
 * (regla 18). El de la regla 11 protege los avisos al cliente, que son los que no se repiten.
 */
async function loQueSigueAlAvance(
  storeId: string,
  numero: number,
  estado: (typeof ESTADOS)[number],
): Promise<{ url: string | null; urlImpresion: string | null }> {
  const vaComanda = estado === "preparando";
  const nada = { url: null, urlImpresion: null };

  if (!puedeAvisarse(estado) && !vaComanda) return nada;

  const tienda = await getStore();
  const encontrado = await obtenerPedidoPorNumero(storeId, numero);
  if (!encontrado) return nada;

  return {
    url: await avisoDelAvance(storeId, encontrado.pedido, estado, tienda),
    urlImpresion: vaComanda ? enlaceImpresion(comanda(encontrado.pedido)) : null,
  };
}

/** El WhatsApp que toca abrir tras un avance, o null si ese estado no lleva mensaje. */
async function avisoDelAvance(
  storeId: string,
  pedido: PedidoPanel,
  estado: (typeof ESTADOS)[number],
  tienda: Awaited<ReturnType<typeof getStore>>,
): Promise<string | null> {
  if (!puedeAvisarse(estado)) return null;

  // Antes de marcar, igual que la comprobación de arriba y por la misma razón: quemar el candado
  // de un aviso que nunca se envía dejaría ese estado contado como notificado para siempre.
  if (!pedido.aceptaAvisos) return null;

  const marcado = await marcarEstadoNotificado(storeId, pedido.id, estado);
  if (!marcado) return null;

  const aviso = await avisoCambioEstado(estado, pedido, tienda);

  return aviso?.modo === "link" ? aviso.url : null;
}

const estimadoSchema = z
  .object({
    min: z
      .number()
      .int("Tiene que ser un número entero de minutos")
      .min(1, "Tiene que ser al menos 1 minuto")
      .max(600, "Eso son más de diez horas"),
    max: z
      .number()
      .int("Tiene que ser un número entero de minutos")
      .min(1, "Tiene que ser al menos 1 minuto")
      .max(600, "Eso son más de diez horas"),
  })
  .refine((v) => v.max >= v.min, {
    path: ["max"],
    message: "El máximo no puede ser menor que el mínimo",
  });

/**
 * Cambiar el "llega en 30–45 min" en caliente. Es de admin: mueve lo que se le promete al
 * cliente en la carta, y además corre la primera franja que se puede programar.
 */
export async function guardarTiempoEstimado(entrada: unknown): Promise<ResultadoAccion> {
  const sesion = await exigirRol("admin");

  const parsed = estimadoSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const guardado = await actualizarTiempoEstimado(sesion.storeId, parsed.data.min, parsed.data.max);
  if (!guardado) return { ok: false, error: "No pudimos guardar el tiempo estimado." };

  // El checkout es `force-dynamic`, pero la carta pública es ISR y muestra el mismo dato en
  // cuanto lo pinte; revalidar las dos cuesta nada y evita prometer un tiempo viejo.
  revalidatePath("/");
  revalidatePath("/checkout");
  revalidatePath("/admin/pedidos");

  return { ok: true };
}

export type ResultadoAviso =
  /** `url` null = el transporte lo envió solo y no hay nada que abrir. */
  | { ok: true; url: string | null }
  | { ok: false; error: string };

/**
 * Prepara el aviso al cliente y lo marca como notificado (regla 11).
 *
 * El orden importa y es este a propósito: **primero se cierra el candado, después se
 * envía**. `marcarEstadoNotificado` solo escribe si `notificado_en` estaba vacío, así que
 * es un candado atómico: si dos pestañas del panel pulsan "avisar" a la vez, solo una
 * pasa. Al revés —enviar y luego marcar— las dos enviarían y el cliente recibiría el
 * mensaje repetido, que es justo lo que la regla prohíbe.
 *
 * Se marca antes de que el negocio llegue a abrir WhatsApp porque `wa.me` no devuelve
 * ningún acuse: en cuanto se abre el link el control se va a otra app y no vuelve. Esperar
 * a una confirmación que nunca llega dejaría el aviso eternamente sin marcar.
 */
export async function prepararAviso(entrada: {
  numero: number;
  estado: string;
}): Promise<ResultadoAviso> {
  await exigirRol("colaborador");

  const parsed = z
    .object({ numero: z.number().int().positive(), estado: z.enum(ESTADOS) })
    .safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  // Se pregunta antes de marcar: marcar un estado que no lleva aviso lo dejaría contado
  // como notificado sin que nadie recibiera nada.
  if (!puedeAvisarse(parsed.data.estado)) {
    return { ok: false, error: "Ese estado no lleva aviso." };
  }

  const tienda = await getStore();
  const encontrado = await obtenerPedidoPorNumero(tienda.id, parsed.data.numero);
  if (!encontrado) return { ok: false, error: "Ese pedido ya no existe." };

  // El botón no debería estar en pantalla —`avisoPendiente` ya lo apaga—, pero una server action
  // se invoca sin pasar por la UI. Y va antes del candado por lo mismo que el resto.
  if (!encontrado.pedido.aceptaAvisos) {
    return { ok: false, error: "Este cliente no quiso avisos por WhatsApp." };
  }

  const marcado = await marcarEstadoNotificado(
    tienda.id,
    encontrado.pedido.id,
    parsed.data.estado,
  );
  if (!marcado) return { ok: false, error: "Ese aviso ya se envió." };

  const aviso = await avisoCambioEstado(parsed.data.estado, encontrado.pedido, tienda);

  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${parsed.data.numero}`);

  return { ok: true, url: aviso?.modo === "link" ? aviso.url : null };
}

// ------------------------------------------------------------
// Impresión
// ------------------------------------------------------------

export type FormatoTicket = "comanda" | "recibo";

export type ResultadoImpresion =
  /** El deep link que hay que entregarle al sistema para que imprima. */
  | { ok: true; url: string }
  | { ok: false; error: string };

const impresionSchema = z.object({
  numero: z.number().int().positive(),
  formato: z.enum(["comanda", "recibo"]),
});

/**
 * Arma el ticket y devuelve el deep link que lo imprime.
 *
 * **No muta nada**: ni columna, ni evento, ni `revalidatePath`. Imprimir es una lectura que
 * termina en papel, y reimprimir es un caso normal —el ticket se mojó, el domiciliario se lo
 * llevó, salió cortado—, así que aquí no hay candado que quemar.
 *
 * Los bytes se arman en el servidor y no en el navegador por lo de siempre: el ticket sale del
 * `snapshot` completo del pedido (regla 2), y la lista del tablero solo trae un resumen.
 *
 * **Y esta acción nunca sabrá si el papel salió.** Igual que con `wa.me`, en cuanto la URL se
 * entrega el control se va a otra app y no vuelve; el acuse lo da el `Toast` de la app de
 * impresión. No inventes aquí una confirmación que no existe.
 */
export async function prepararImpresion(entrada: {
  numero: number;
  formato: string;
}): Promise<ResultadoImpresion> {
  // Imprimir es operación diaria: la tabla de permisos ya se lo daba al colaborador.
  const sesion = await exigirRol("colaborador");

  const parsed = impresionSchema.safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const encontrado = await obtenerPedidoPorNumero(sesion.storeId, parsed.data.numero);
  if (!encontrado) return { ok: false, error: "Ese pedido ya no existe." };

  const { pedido } = encontrado;

  if (parsed.data.formato === "comanda") {
    return { ok: true, url: enlaceImpresion(comanda(pedido)) };
  }

  const tienda = await getStore();

  return {
    ok: true,
    url: enlaceImpresion(
      recibo(
        // `pagado` es exactamente `tieneComprobante`, y por eso se traduce aquí en vez de
        // enseñarle esa columna al módulo del recibo: un comprobante cargado es la única prueba
        // de pago que maneja este negocio, y ese criterio ya lo deriva `PedidoPanel`.
        { ...pedido, pagado: pedido.tieneComprobante },
        {
          nombre: tienda.nombre,
          direccion: tienda.direccion,
          telefono: tienda.telefono,
        },
      ),
    ),
  };
}

// ------------------------------------------------------------
// Domiciliarios
// ------------------------------------------------------------

const nuevoDomiciliarioSchema = z.object({
  nombre: z.string().min(1).max(60),
  telefono: z.string().min(7).max(20),
});

export type ResultadoDomiciliario =
  | { ok: true; domiciliario: Domiciliario }
  | { ok: false; error: string };

/**
 * Añade a alguien a la agenda de domiciliarios.
 *
 * Es de **colaborador** y no de admin: el domiciliario nuevo aparece en plena operación, un
 * viernes a las ocho, y quien despacha tiene que poder anotarlo sin llamar al dueño. Archivar sí
 * es de admin — eso sí es limpieza, no turno.
 */
export async function crearDomiciliarioAccion(entrada: {
  nombre: string;
  telefono: string;
}): Promise<ResultadoDomiciliario> {
  const sesion = await exigirRol("colaborador");

  const parsed = nuevoDomiciliarioSchema.safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  return crearDomiciliario(sesion.storeId, parsed.data.nombre, parsed.data.telefono);
}

export type ResultadoAsignacion =
  | { ok: true; url: string | null; domiciliario: Domiciliario }
  | { ok: false; error: string };

/**
 * Asigna el pedido a un domiciliario y deja listo su WhatsApp.
 *
 * **No cambia el estado del pedido**, y eso no es un olvido: entre que se llama al domiciliario y
 * que llega pasan entre cinco y quince minutos. Ponerlo "en camino" al asignar sería avisarle al
 * cliente que ya salió cuando todavía está en el mostrador.
 *
 * Reasignar sobrescribe y vuelve a devolver el link: mandar dos veces el mismo pedido es un caso
 * normal —el primero no contestó—, no un error, así que aquí no hay candado de idempotencia. El de
 * la regla 11 protege los avisos al **cliente**, que son los que no se pueden repetir.
 */
export async function asignarDomiciliarioAccion(entrada: {
  pedidoId: string;
  numero: number;
  courierId: string;
}): Promise<ResultadoAsignacion> {
  const sesion = await exigirRol("colaborador");

  const parsed = z
    .object({ pedidoId: idSchema, numero: z.number().int().positive(), courierId: idSchema })
    .safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const asignado = await asignarDomiciliario(
    sesion.storeId,
    parsed.data.pedidoId,
    parsed.data.courierId,
  );
  if (!asignado) return { ok: false, error: "No pudimos asignar ese domiciliario." };

  const tienda = await getStore();
  const encontrado = await obtenerPedidoPorNumero(sesion.storeId, parsed.data.numero);
  if (!encontrado) return { ok: false, error: "Ese pedido ya no existe." };

  const aviso = await avisoDomiciliario(encontrado.pedido, asignado, tienda);

  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${parsed.data.numero}`);

  return {
    ok: true,
    url: aviso.modo === "link" ? aviso.url : null,
    domiciliario: asignado,
  };
}
