import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { category, modifierGroup, modifierOption, product } from "@/db/schema";

/**
 * Lo que el panel enciende y apaga a diario (US21): "hoy no hay helado de mora".
 *
 * Nunca se borra nada aquí (regla 9): un sabor que desaparece rompe la trazabilidad de
 * los pedidos que lo llevaban. Solo se mueve el switch `disponible`.
 */

export type ProductoDisponibilidad = {
  id: string;
  nombre: string;
  disponible: boolean;
};

export type GrupoDisponibilidad = {
  id: string;
  nombre: string;
  opciones: { id: string; nombre: string; disponible: boolean }[];
};

/** Agrupado por categoría, que es como el negocio piensa la carta. */
export async function listarProductosParaDisponibilidad(
  storeId: string,
): Promise<{ categoria: string; productos: ProductoDisponibilidad[] }[]> {
  const categorias = await db.query.category.findMany({
    where: and(eq(category.storeId, storeId), eq(category.activa, true)),
    orderBy: asc(category.orden),
    with: {
      products: {
        where: eq(product.activo, true),
        orderBy: asc(product.orden),
        columns: { id: true, nombre: true, disponible: true },
      },
    },
  });

  return categorias
    .filter((c) => c.products.length > 0)
    .map((c) => ({ categoria: c.nombre, productos: c.products }));
}

export async function listarOpcionesParaDisponibilidad(
  storeId: string,
): Promise<GrupoDisponibilidad[]> {
  const grupos = await db.query.modifierGroup.findMany({
    where: eq(modifierGroup.storeId, storeId),
    orderBy: asc(modifierGroup.nombre),
    with: {
      modifierOptions: {
        orderBy: asc(modifierOption.orden),
        columns: { id: true, nombre: true, disponible: true },
      },
    },
  });

  return grupos
    .filter((g) => g.modifierOptions.length > 0)
    .map((g) => ({ id: g.id, nombre: g.nombre, opciones: g.modifierOptions }));
}

/** Devuelve false si no se tocó ninguna fila: id inventado o de otra tienda (regla 5). */
export async function cambiarDisponibilidadProducto(
  storeId: string,
  productId: string,
  disponible: boolean,
): Promise<boolean> {
  const filas = await db
    .update(product)
    .set({ disponible })
    .where(and(eq(product.storeId, storeId), eq(product.id, productId)))
    .returning({ id: product.id });

  return filas.length > 0;
}

export async function cambiarDisponibilidadOpcion(
  storeId: string,
  opcionId: string,
  disponible: boolean,
): Promise<boolean> {
  const filas = await db
    .update(modifierOption)
    .set({ disponible })
    .where(and(eq(modifierOption.storeId, storeId), eq(modifierOption.id, opcionId)))
    .returning({ id: modifierOption.id });

  return filas.length > 0;
}
