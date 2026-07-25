import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { category, product } from "@/db/schema";

export type ProductoDeMenu = {
  id: string;
  nombre: string;
  slug: string;
  descripcion: string | null;
  precioBase: number;
  imagenes: string[];
  recomendado: boolean;
  disponible: boolean;
};

export type CategoriaDeMenu = {
  id: string;
  nombre: string;
  slug: string;
  productos: ProductoDeMenu[];
};

/**
 * Catálogo para el menú público. Filtra solo por `activo` — `disponible=false`
 * (agotado) NO se excluye, se sigue mostrando pero apagado (regla 9: apagar, no
 * borrar/ocultar).
 */
export async function obtenerMenu(storeId: string): Promise<CategoriaDeMenu[]> {
  const categorias = await db.query.category.findMany({
    where: and(eq(category.storeId, storeId), eq(category.activa, true)),
    orderBy: asc(category.orden),
    with: {
      products: {
        where: eq(product.activo, true),
        orderBy: asc(product.orden),
      },
    },
  });

  return categorias.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    slug: c.slug,
    productos: c.products.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      slug: p.slug,
      descripcion: p.descripcion,
      precioBase: p.precioBase,
      imagenes: p.imagenes,
      recomendado: p.recomendado,
      disponible: p.disponible,
    })),
  }));
}
