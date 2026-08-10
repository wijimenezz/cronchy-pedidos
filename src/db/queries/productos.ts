import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { modifierOption, product, productModifierGroup } from "@/db/schema";
import type { EngancheParaPrecio, OpcionParaPrecio, ProductoParaPrecio } from "@/lib/precios";

function mapProducto(p: {
  id: string;
  nombre: string;
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
    // La portada, igual que en `mapProductoUpsellRef`. Se congela en el snapshot del pedido,
    // que es lo que pinta el seguimiento del cliente.
    imagen: p.imagenes[0] || null,
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

/**
 * El producto real detrás de una opción de upsell, con TODO lo que el servidor le va a
 * exigir cuando llegue como item propio (regla 8).
 *
 * Está tipado como superset de `ProductoParaPrecio` a propósito: así la ficha puede
 * llamar `calcularItem()` sobre una bebida igual que sobre el churro, y el precio y la
 * validación que ve el cliente son el mismo cómputo que hará el servidor (regla 1).
 *
 * No lleva `productosUpsell`: la anidación se corta en un nivel por construcción del
 * tipo, así que una bebida que referenciara otra no puede producir recursión.
 *
 * Nota: si dos opciones del mismo grupo apuntaran al mismo `producto_ref`, compartirían
 * configuración y producirían dos líneas idénticas en el carrito. Es una configuración
 * absurda, pero el modelo la permite.
 */
export type ProductoUpsellRef = Omit<ProductoParaPrecio, "engancles"> & {
  imagen: string | null;
  /** Invariante: los grupos `tipo: "upsell"` de una bebida siempre llevan `minSelect = 0`. */
  engancles: EngancheParaFicha[];
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

/** Fila de `product_modifier_group` tal como la devuelve `conEnganclesFicha`. */
type FilaEngancheFicha = {
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
};

/**
 * Enganche completo para la UI, en una sola pasada.
 *
 * Antes esto se reconstruía emparejando por índice el resultado de `mapProducto` con la
 * fila cruda. Funcionaba solo porque ambos preservan el orden: bastaba con que alguien
 * metiera un `filter` en `mapProducto` para que `imagenUrl` y `recomendado` se
 * desalinearan en silencio.
 */
function mapEngancheParaFicha(pmg: FilaEngancheFicha): EngancheParaFicha {
  return {
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
    colapsado: pmg.colapsado,
    opciones: pmg.modifierGroup.modifierOptions.map((o) => ({
      id: o.id,
      nombre: o.nombre,
      precioDelta: o.precioDelta,
      disponible: o.disponible,
      productoRef: o.productoRef,
      imagenUrl: o.imagenUrl,
      recomendado: o.recomendado,
      orden: o.orden,
    })),
  };
}

type FilaProductoFicha = {
  id: string;
  nombre: string;
  descripcion: string | null;
  precioBase: number;
  imagenes: string[];
  activo: boolean;
  disponible: boolean;
  disponibleDelivery: boolean;
  disponiblePickup: boolean;
  productModifierGroups: FilaEngancheFicha[];
};

function mapProductoParaFicha(
  p: FilaProductoFicha,
  productosUpsell: Record<string, ProductoUpsellRef>,
): ProductoParaFicha {
  return {
    id: p.id,
    nombre: p.nombre,
    precioBase: p.precioBase,
    activo: p.activo,
    disponible: p.disponible,
    disponibleDelivery: p.disponibleDelivery,
    disponiblePickup: p.disponiblePickup,
    descripcion: p.descripcion,
    imagenes: p.imagenes,
    productosUpsell,
    engancles: p.productModifierGroups.map(mapEngancheParaFicha),
  };
}

function mapProductoUpsellRef(pr: {
  id: string;
  nombre: string;
  precioBase: number;
  imagenes: string[];
  activo: boolean;
  disponible: boolean;
  disponibleDelivery: boolean;
  disponiblePickup: boolean;
  productModifierGroups: FilaEngancheFicha[];
}): ProductoUpsellRef {
  return {
    id: pr.id,
    nombre: pr.nombre,
    precioBase: pr.precioBase,
    activo: pr.activo,
    disponible: pr.disponible,
    disponibleDelivery: pr.disponibleDelivery,
    disponiblePickup: pr.disponiblePickup,
    imagen: pr.imagenes[0] || null,
    engancles: pr.productModifierGroups.map(mapEngancheParaFicha),
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

  // Los enganches de la bebida vienen completos: la ficha necesita poder validar y
  // cotizar la bebida igual que el servidor. NO se calculan los refIds de esta segunda
  // tanda, así que la anidación se corta aquí y no hay recursión posible.
  const productosRef =
    refIds.length > 0
      ? await db.query.product.findMany({
          where: and(eq(product.storeId, storeId), inArray(product.id, refIds)),
          columns: {
            id: true,
            nombre: true,
            precioBase: true,
            imagenes: true,
            activo: true,
            disponible: true,
            disponibleDelivery: true,
            disponiblePickup: true,
          },
          with: conEnganclesFicha,
        })
      : [];

  const productosUpsell = Object.fromEntries(
    productosRef.map((pr) => [pr.id, mapProductoUpsellRef(pr)]),
  );

  return mapProductoParaFicha(p, productosUpsell);
}
