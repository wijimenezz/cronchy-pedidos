import { gruposIncompletos } from "@/lib/precios-calculo";
import type { ItemCarrito } from "@/lib/carrito";
import type {
  GrupoIncompleto,
  ItemCalculado,
  ItemSolicitado,
  ProductoParaPrecio,
  SeleccionEnganche,
} from "@/lib/precios-calculo";

// Traducciones entre las tres representaciones de un pedido: la ficha de producto,
// el carrito y el payload de la API. Viven fuera de los componentes a propósito: aquí
// se decide qué se cobra y qué no, y eso tiene que poder probarse.

/**
 * Quita de la selección los grupos de tipo `upsell`. La ficha los incluye para calcular
 * el total en vivo, pero al carrito el upsell entra como línea propia (regla 8). Si se
 * guardara en los dos lados, el checkout mandaría la bebida dentro de la selección del
 * churro *y* como item suelto, y el servidor la cobraría dos veces.
 */
export function seleccionSinUpsells(
  seleccion: SeleccionEnganche[],
  engancles: { id: string; tipo: "seleccion" | "upsell" }[],
): SeleccionEnganche[] {
  const idsUpsell = new Set(engancles.filter((e) => e.tipo === "upsell").map((e) => e.id));
  return seleccion.filter((s) => !idsUpsell.has(s.productModifierGroupId));
}

/**
 * Precio de un upsell en la UI. Al convertirse en su propio order_item, el servidor lo
 * cobra por el `precioBase` del producto real y no por el `precioDelta` del enganche,
 * así que la ficha y el carrito tienen que mostrar ese mismo número.
 */
export function precioUpsell(
  productosUpsell: Record<string, { precioBase: number }>,
  productoRef: string,
  respaldo: number,
): number {
  return productosUpsell[productoRef]?.precioBase ?? respaldo;
}

// ------------------------------------------------------------
// Bebidas de upsell con sus propias opciones
// ------------------------------------------------------------

/**
 * Una bebida ya elegida en la ficha del churro, con el producto real que el servidor va a
 * cobrar (regla 8) y lo que el cliente configuró para ella sin salir de la ficha.
 */
export type BebidaElegida<P extends ProductoParaPrecio = ProductoParaPrecio> = {
  producto: P;
  cantidad: number;
  seleccion: SeleccionEnganche[];
};

/**
 * Reúne las tres piezas que viven separadas: qué bebidas eligió el cliente y cuántas
 * (eso lo dice `calcularItem` del churro), el producto real detrás de cada una, y la
 * selección anidada que hizo dentro de la ficha.
 *
 * Una bebida cuyo `productoRef` no esté en el mapa se omite: sin el producto real no se
 * puede ni cotizar ni validar, y arrastrarla produciría un 422 en el checkout.
 */
export function bebidasElegidas<P extends ProductoParaPrecio>(
  upsells: Pick<ItemCalculado, "productId" | "cantidad">[],
  productosUpsell: Record<string, P>,
  seleccionesPorBebida: Record<string, SeleccionEnganche[]>,
): BebidaElegida<P>[] {
  return upsells.flatMap((u) => {
    const producto = productosUpsell[u.productId];
    if (!producto) return [];
    return [
      {
        producto,
        cantidad: u.cantidad,
        seleccion: seleccionesPorBebida[u.productId] ?? [],
      },
    ];
  });
}

export type PendienteFicha = GrupoIncompleto & {
  /** null = grupo del propio producto de la ficha; si no, el nombre de la bebida. */
  nombreProducto: string | null;
};

/**
 * Todo lo que impide añadir: los grupos incompletos del producto de la ficha MÁS los de
 * cada bebida de upsell elegida.
 *
 * Sin esto la bebida viajaría con `seleccion: []` y el servidor la rechazaría con un 422
 * recién en el checkout, donde el cliente ya no puede reconfigurarla (reglas 4 y 8).
 *
 * Los del producto van primero porque son los que el cliente ve arriba en la ficha: es el
 * orden en que puede resolverlos.
 */
export function pendientesDeFicha(
  producto: Pick<ProductoParaPrecio, "engancles">,
  seleccion: SeleccionEnganche[],
  bebidas: {
    producto: Pick<ProductoParaPrecio, "engancles" | "nombre">;
    seleccion: SeleccionEnganche[];
  }[],
): PendienteFicha[] {
  return [
    ...gruposIncompletos(producto, seleccion).map((g) => ({ ...g, nombreProducto: null })),
    ...bebidas.flatMap((b) =>
      gruposIncompletos(b.producto, b.seleccion).map((g) => ({
        ...g,
        nombreProducto: b.producto.nombre,
      })),
    ),
  ];
}

/**
 * Traduce el carrito del navegador al payload de `POST /api/pedidos`.
 *
 * Solo viajan ids y cantidades: qué eligió el cliente, nunca cuánto cuesta
 * (regla 1 de CLAUDE.md). El `precioUnitarioEstimado` del carrito se queda en la UI.
 */
export type MapeoCarrito = {
  items: ItemSolicitado[];
  /**
   * Índice en `items` → `lineId` de la línea del carrito que lo originó. El servidor
   * reporta los errores por `itemIndex`; sin esta tabla el checkout no podría decir
   * *cuál* de los productos del carrito es el que ya no está disponible.
   */
  lineIdPorIndice: string[];
};

export function carritoAItems(items: ItemCarrito[]): MapeoCarrito {
  return {
    items: items.map((i) => ({
      productId: i.productoId,
      cantidad: i.cantidad,
      seleccion: i.seleccion,
      notas: i.notas ?? null,
    })),
    lineIdPorIndice: items.map((i) => i.lineId),
  };
}
