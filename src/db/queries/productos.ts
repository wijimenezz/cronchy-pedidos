import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { product } from "@/db/schema";
import type { ProductoParaPrecio } from "@/lib/precios";

function mapProducto(p: {
  id: string;
  nombre: string;
  precioBase: number;
  activo: boolean;
  disponible: boolean;
  disponibleDelivery: boolean;
  disponiblePickup: boolean;
  productModifierGroups: {
    id: string;
    modo: "incluido" | "adicional";
    etiqueta: string | null;
    minSelect: number;
    maxSelect: number;
    precioUnitario: number | null;
    avisarIncompleto: boolean;
    modifierGroup: {
      nombre: string;
      permiteCantidad: boolean;
      maxPorOpcion: number | null;
      modifierOptions: {
        id: string;
        nombre: string;
        precioDelta: number;
        disponible: boolean;
      }[];
    };
  }[];
}): ProductoParaPrecio {
  return {
    id: p.id,
    nombre: p.nombre,
    precioBase: p.precioBase,
    activo: p.activo,
    disponible: p.disponible,
    disponibleDelivery: p.disponibleDelivery,
    disponiblePickup: p.disponiblePickup,
    engancles: p.productModifierGroups.map((pmg) => ({
      id: pmg.id,
      modo: pmg.modo,
      nombreGrupo: pmg.etiqueta ?? pmg.modifierGroup.nombre,
      minSelect: pmg.minSelect,
      maxSelect: pmg.maxSelect,
      precioUnitario: pmg.precioUnitario,
      avisarIncompleto: pmg.avisarIncompleto,
      permiteCantidad: pmg.modifierGroup.permiteCantidad,
      maxPorOpcion: pmg.modifierGroup.maxPorOpcion,
      opciones: pmg.modifierGroup.modifierOptions.map((o) => ({
        id: o.id,
        nombre: o.nombre,
        precioDelta: o.precioDelta,
        disponible: o.disponible,
      })),
    })),
  };
}

const conEngancles = {
  productModifierGroups: {
    with: {
      modifierGroup: {
        with: { modifierOptions: true },
      },
    },
  },
} as const;

export async function obtenerProductoConEngancles(
  storeId: string,
  productId: string,
): Promise<ProductoParaPrecio | null> {
  const p = await db.query.product.findFirst({
    where: and(eq(product.storeId, storeId), eq(product.id, productId)),
    with: conEngancles,
  });

  return p ? mapProducto(p) : null;
}

export async function obtenerProductosConEngancles(
  storeId: string,
  productIds: string[],
): Promise<Map<string, ProductoParaPrecio>> {
  if (productIds.length === 0) return new Map();

  const productos = await db.query.product.findMany({
    where: and(eq(product.storeId, storeId), inArray(product.id, productIds)),
    with: conEngancles,
  });

  return new Map(productos.map((p) => [p.id, mapProducto(p)]));
}
