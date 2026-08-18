"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { violaConstraint } from "@/db/errores";
import { cambiarActivoCupon, guardarCupon, soltarAnuncio } from "@/db/queries/cupones";
import { exigirRol } from "@/lib/autorizacion";
import { normalizarCodigo } from "@/lib/cupones";
import { idSchema } from "@/lib/validaciones";

/**
 * Cupones de descuento. **Todo aquí es de admin** (`exigirRol("admin")`): un cupón decide cuánto se
 * cobra, igual que una zona o la llave de pago.
 *
 * Regla 15 — el panel traduce: quien usa esta pantalla escribe un código, elige un porcentaje y
 * marca a qué aplica. Que por debajo eso sea un `alcance` enum más dos tablas de enganche no
 * aparece por ningún lado.
 */

export type ResultadoCupon = { ok: true } | { ok: false; error: string };

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const cuponSchema = z
  .object({
    id: idSchema.optional(),
    codigo: z
      .string()
      .trim()
      .min(3, "Mínimo 3 caracteres")
      .max(24, "Máximo 24 caracteres")
      .transform(normalizarCodigo)
      // Sin espacios ni tildes: esto se dicta por WhatsApp y se teclea en un celular. Un cupón que
      // hay que escribir con acento es un cupón que la mitad de la gente no va a poder usar.
      .refine((c) => /^[A-Z0-9]+$/.test(c), "Usa solo letras y números, sin espacios ni tildes"),
    // El tope de 50 también está como CHECK en la base; esto es para que el admin lea una frase en
    // vez de un error de Postgres.
    porcentaje: z
      .number()
      .int("Sin decimales")
      .min(1, "Mínimo 1%")
      .max(50, "Máximo 50% — más que eso se regala el producto"),
    alcance: z.enum(["todo", "seleccion"]),
    venceEl: z
      .string()
      .regex(FECHA, "Fecha inválida")
      .nullable()
      .transform((v) => v || null),
    anuncio: z
      .string()
      .trim()
      .max(120, "Máximo 120 caracteres")
      .nullable()
      .transform((v) => v || null),
    categoriaIds: z.array(idSchema).max(50),
    productoIds: z.array(idSchema).max(300),
  })
  .superRefine((datos, ctx) => {
    // Un cupón acotado sin nada marcado no descontaría nunca (`sin_items_elegibles`), así que se
    // corta aquí: guardarlo sería dejar creado un cupón que no funciona y no dice por qué.
    if (
      datos.alcance === "seleccion" &&
      datos.categoriaIds.length === 0 &&
      datos.productoIds.length === 0
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Marca al menos una categoría o un producto, o elige «Toda la carta»",
      });
    }
  });

export async function guardar(entrada: unknown): Promise<ResultadoCupon> {
  const sesion = await exigirRol("admin");

  const parsed = cuponSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const { id, ...datos } = parsed.data;

  // La carta tiene un solo sitio para el aviso y la base lo garantiza con un índice único parcial.
  // Ese índice es un muro, no una cola: sin soltar el anterior, poner el aviso en un segundo cupón
  // fallaría con un error de base en vez de reemplazarlo, que es lo que espera quien lo escribe.
  if (datos.anuncio) {
    await soltarAnuncio(sesion.storeId, id ?? null);
  }

  try {
    const guardado = await guardarCupon(sesion.storeId, id ?? null, datos);
    if (!guardado) return { ok: false, error: "Ese cupón ya no existe." };
  } catch (error) {
    // El UNIQUE (store_id, codigo) es la colisión que el admin va a provocar de verdad, creando
    // otra vez un cupón que ya tenía.
    if (violaConstraint(error, "cupon_store_id_codigo_key")) {
      return { ok: false, error: "Ya existe un cupón con ese código." };
    }
    throw error;
  }

  revalidar();
  return { ok: true };
}

/**
 * Apagar y encender. Es lo que se hace en vez de borrar (regla 9): un pedido viejo tiene que poder
 * decir con qué cupón se pagó, y la FK de `order.cupon_id` no lleva `ON DELETE` justo por eso.
 */
export async function cambiarActivo(entrada: {
  id: string;
  activo: boolean;
}): Promise<ResultadoCupon> {
  const sesion = await exigirRol("admin");

  const parsed = z.object({ id: idSchema, activo: z.boolean() }).safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const cambiado = await cambiarActivoCupon(sesion.storeId, parsed.data.id, parsed.data.activo);
  if (!cambiado) return { ok: false, error: "Ese cupón ya no existe." };

  revalidar();
  return { ok: true };
}

function revalidar() {
  revalidatePath("/admin/cupones");
  // La carta muestra el aviso del cupón anunciado y se sirve con ISR: sin esto, apagar un cupón
  // dejaría el aviso en pantalla hasta que expirara el plazo de revalidación.
  revalidatePath("/");
  // Y el checkout, por la misma pareja que ya hacen zonas y ajustes.
  revalidatePath("/checkout");
}
