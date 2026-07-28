import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { modifierOption, product, productModifierGroup } from "@/db/schema";
import type { EngancheParaPrecio, OpcionParaPrecio, ProductoParaPrecio } from "@/lib/precios";

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
      tipo: "seleccion" | "upsell";
      permiteCantidad: boolean;
      maxPorOpcion: number | null;
      modifierOptions: {
        id: string;
        nombre: string;
        precioDelta: number;
        disponible: boolean;
        productoRef: string | null;
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
      tipo: pmg.modifierGroup.tipo,
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
        productoRef: o.productoRef,
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

// ------------------------------------------------------------
// Ficha de producto (para el modal de la tienda) — no lo usa el motor de
// precios, así que no toca `obtenerProductoConEngancles`/`ProductoParaPrecio`
// ni sus tests. Es un superset aditivo pensado para mostrar la UI completa
// (fotos, colapsado, íconos de opción, productos reales detrás de un upsell).
// ------------------------------------------------------------

export type OpcionParaFicha = OpcionParaPrecio & {
  imagenUrl: string | null;
  recomendado: boolean;
  orden: number;
};

export type EngancheParaFicha = Omit<EngancheParaPrecio, "opciones"> & {
  colapsado: boolean;
  opciones: OpcionParaFicha[];
};

export type ProductoUpsellRef = {
  id: string;
  nombre: string;
  precioBase: number;
  imagen: string | null;
};

export type ProductoParaFicha = Omit<ProductoParaPrecio, "engancles"> & {
  descripcion: string | null;
  imagenes: string[];
  engancles: EngancheParaFicha[];
  /** Info real de los productos referenciados por opciones de tipo upsell, por id. */
  productosUpsell: Record<string, ProductoUpsellRef>;
};

const conEnganclesFicha = {
  productModifierGroups: {
    orderBy: asc(productModifierGroup.orden),
    with: {
      modifierGroup: {
        with: { modifierOptions: { orderBy: asc(modifierOption.orden) } },
      },
    },
  },
} as const;

function mapProductoParaFicha(
  p: {
    id: string;
    nombre: string;
    descripcion: string | null;
    precioBase: number;
    imagenes: string[];
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
      colapsado: boolean;
      modifierGroup: {
        nombre: string;
        tipo: "seleccion" | "upsell";
        permiteCantidad: boolean;
        maxPorOpcion: number | null;
        modifierOptions: {
          id: string;
          nombre: string;
          precioDelta: number;
          disponible: boolean;
          productoRef: string | null;
          imagenUrl: string | null;
          recomendado: boolean;
          orden: number;
        }[];
      };
    }[];
  },
  productosUpsell: Record<string, ProductoUpsellRef>,
): ProductoParaFicha {
  const base = mapProducto(p);
  return {
    ...base,
    descripcion: p.descripcion,
    imagenes: p.imagenes,
    productosUpsell,
    engancles: base.engancles.map((enganche, i) => ({
      ...enganche,
      colapsado: p.productModifierGroups[i].colapsado,
      opciones: enganche.opciones.map((opcion, j) => ({
        ...opcion,
        imagenUrl: p.productModifierGroups[i].modifierGroup.modifierOptions[j].imagenUrl,
        recomendado: p.productModifierGroups[i].modifierGroup.modifierOptions[j].recomendado,
        orden: p.productModifierGroups[i].modifierGroup.modifierOptions[j].orden,
      })),
    })),
  };
}

export async function obtenerProductoParaFicha(
  storeId: string,
  productId: string,
): Promise<ProductoParaFicha | null> {
  const p = await db.query.product.findFirst({
    where: and(eq(product.storeId, storeId), eq(product.id, productId)),
    with: conEnganclesFicha,
  });
  if (!p) return null;

  const refIds = [
    ...new Set(
      p.productModifierGroups.flatMap((pmg) =>
        pmg.modifierGroup.modifierOptions.map((o) => o.productoRef).filter((id): id is string => id !== null),
      ),
    ),
  ];

  const productosRef =
    refIds.length > 0
      ? await db.query.product.findMany({
          where: and(eq(product.storeId, storeId), inArray(product.id, refIds)),
          columns: { id: true, nombre: true, precioBase: true, imagenes: true },
        })
      : [];

  const productosUpsell = Object.fromEntries(
    productosRef.map((pr) => [
      pr.id,
      { id: pr.id, nombre: pr.nombre, precioBase: pr.precioBase, imagen: pr.imagenes[0] || null },
    ]),
  );

  return mapProductoParaFicha(p, productosUpsell);
}
