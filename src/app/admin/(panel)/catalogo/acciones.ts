"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  cambiarDisponibilidadOpcion,
  cambiarDisponibilidadProducto,
} from "@/db/queries/disponibilidad";
import { exigirRol } from "@/lib/autorizacion";

/**
 * Los switches de agotado (US21). Es lo único del catálogo que puede tocar un colaborador
 * (regla 12): precios, fotos y altas de producto son de admin y llegan con el CRUD.
 *
 * Cada cambio revalida el menú público, que se sirve con ISR: sin esto, un sabor agotado
 * seguiría ofreciéndose hasta un minuto después, y alguien lo pediría.
 */

const schema = z.object({ id: z.string().uuid(), disponible: z.boolean() });

export type ResultadoToggle = { ok: true } | { ok: false; error: string };

export async function marcarProductoDisponible(entrada: {
  id: string;
  disponible: boolean;
}): Promise<ResultadoToggle> {
  const sesion = await exigirRol("colaborador");

  const parsed = schema.safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const cambiado = await cambiarDisponibilidadProducto(
    sesion.storeId,
    parsed.data.id,
    parsed.data.disponible,
  );
  if (!cambiado) return { ok: false, error: "Ese producto ya no existe." };

  revalidarMenu();
  return { ok: true };
}

export async function marcarOpcionDisponible(entrada: {
  id: string;
  disponible: boolean;
}): Promise<ResultadoToggle> {
  const sesion = await exigirRol("colaborador");

  const parsed = schema.safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const cambiado = await cambiarDisponibilidadOpcion(
    sesion.storeId,
    parsed.data.id,
    parsed.data.disponible,
  );
  if (!cambiado) return { ok: false, error: "Esa opción ya no existe." };

  revalidarMenu();
  return { ok: true };
}

function revalidarMenu() {
  revalidatePath("/");
  revalidatePath("/admin/catalogo");
}
