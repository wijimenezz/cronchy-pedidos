"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getStore } from "@/db/queries/store";
import {
  cambiarEstadoPedido,
  marcarEstadoNotificado,
  obtenerPedidoPorNumero,
} from "@/db/queries/panel";
import { exigirRol } from "@/lib/autorizacion";
import { avisoCambioEstado, puedeAvisarse } from "@/lib/notificaciones/avisos";
import { MENSAJE_BLOQUEO } from "@/lib/pedidos/estados";
import { idSchema } from "@/lib/validaciones";

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

export async function cambiarEstado(entrada: {
  pedidoId: string;
  estado: string;
}): Promise<ResultadoAccion> {
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
