"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guardarCorrecciones } from "@/db/queries/barrios";
import { actualizarLlaveNequi, guardarQrPago } from "@/db/queries/store";
import { exigirRol } from "@/lib/autorizacion";
import { esUrlDeFotoProducto } from "@/lib/imagenes";
import { borrarFotoProducto } from "@/lib/storage";

/**
 * Los datos con los que el cliente paga. Todo esto es de admin (regla 12): cambiar la llave
 * es cambiar a qué cuenta llega la plata de cada pedido.
 *
 * `revalidatePath("/checkout")` en las dos acciones aunque el checkout sea `force-dynamic`:
 * es la misma pareja que ya hace `guardarTiempoEstimado`, cuesta nada y cubre el día que esa
 * página deje de serlo.
 */

export type ResultadoAjuste = { ok: true } | { ok: false; error: string };

const llaveSchema = z.object({
  // Una llave Bre-B puede ser un número, un correo o una @arroba, así que no se valida el
  // formato: solo que quepa y no esté vacía. Inventar un patrón aquí sería rechazar llaves
  // legítimas el día que Bre-B añada un tipo nuevo.
  llave: z
    .string()
    .trim()
    .min(1, "Escribe la llave")
    .max(60, "Esa llave es demasiado larga")
    .nullable(),
  titular: z
    .string()
    .trim()
    .max(60, "Máximo 60 caracteres")
    .nullable()
    .transform((v) => v || null),
});

export async function guardarLlaveNequi(entrada: unknown): Promise<ResultadoAjuste> {
  const sesion = await exigirRol("admin");

  const parsed = llaveSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const guardado = await actualizarLlaveNequi(
    sesion.storeId,
    parsed.data.llave,
    parsed.data.titular,
  );
  if (!guardado) return { ok: false, error: "No pudimos guardar la llave." };

  revalidatePath("/checkout");
  revalidatePath("/admin/ajustes");

  return { ok: true };
}

const qrSchema = z.object({
  url: z
    .string("Esa imagen no es válida")
    .refine(esUrlDeFotoProducto, "Esa imagen no es válida")
    .nullable(),
});

export async function guardarQrNequi(entrada: unknown): Promise<ResultadoAjuste> {
  const sesion = await exigirRol("admin");

  const parsed = qrSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const guardado = await guardarQrPago(sesion.storeId, parsed.data.url);
  if (!guardado) return { ok: false, error: "No pudimos guardar el QR." };

  // Después de escribir la columna y no antes, igual que las fotos de la carta: si el UPDATE
  // falla, el QR anterior sigue siendo el bueno y borrarlo habría dejado el checkout
  // apuntando a un objeto inexistente. Best-effort — `borrarFotoProducto` traga sus errores.
  if (guardado.previo && guardado.previo !== parsed.data.url) {
    await borrarFotoProducto(guardado.previo);
  }

  revalidatePath("/checkout");
  revalidatePath("/admin/ajustes");

  return { ok: true };
}

/**
 * Los nombres de barrio que OSM devuelve mal (ver `src/lib/barrio.ts`).
 *
 * Solo viajan las filas que el admin tocó. `nombre` vacío se guarda como NULL: es la forma de
 * decir "este nombre no sirve, que lo escriba el cliente".
 *
 * **Sin `revalidatePath("/checkout")`**, al revés que sus dos vecinas: el barrio no se
 * renderiza en esa página, se pide a `/api/zonas/cotizar` cada vez que el pin se mueve. Ese
 * endpoint es `force-dynamic` y consulta el diccionario en cada llamada, así que una
 * corrección se ve en el siguiente arrastre sin revalidar nada.
 */
const correccionesSchema = z.object({
  correcciones: z
    .array(
      z.object({
        id: z.uuid("Barrio inválido"),
        nombre: z
          .string()
          .trim()
          .max(120, "Máximo 120 caracteres")
          .transform((v) => v || null),
      }),
    )
    .max(200, "Demasiados cambios de una vez"),
});

export async function guardarCorreccionesBarrio(entrada: unknown): Promise<ResultadoAjuste> {
  const sesion = await exigirRol("admin");

  const parsed = correccionesSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const guardado = await guardarCorrecciones(sesion.storeId, parsed.data.correcciones);
  if (!guardado) return { ok: false, error: "No pudimos guardar los barrios." };

  revalidatePath("/admin/ajustes");

  return { ok: true };
}
