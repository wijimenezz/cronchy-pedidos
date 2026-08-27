import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  category,
  modifierGroup,
  modifierOption,
  product,
  productModifierGroup,
} from "@/db/schema";
import { fotosConFoco, type FotoConFoco } from "@/lib/imagenes";
import { esVariante, precioEfectivoOpcion } from "@/lib/precios-calculo";

export type ProductoDeMenu = {
  id: string;
  nombre: string;
  slug: string;
  descripcion: string | null;
  precioBase: number;
  fotos: FotoConFoco[];
  recomendado: boolean;
  disponible: boolean;
  /**
   * Por qué canales se vende. `calcularItem` ya rechaza el que no corresponda, pero sin estos
   * dos datos la carta no puede avisar y el cliente lo descubre al final, después de haber
   * configurado el producto entero.
   */
  disponibleDelivery: boolean;
  disponiblePickup: boolean;
  /** Si tiene al menos un enganche de modificadores, "Agregar" debe abrir la
   * ficha del producto en vez de meterlo directo al carrito. */
  tieneModificadores: boolean;
  /**
   * El precio más barato al que se puede llevar el producto, o `null` si no hay varios.
   *
   * **Es un precio, no un booleano, y esa es la corrección que importa.** Un tamaño obligatorio
   * se puede modelar de dos formas igual de razonables: base $4.000 con el mediano sumando
   * $4.000, o base $0 con cada tamaño cobrando su precio entero. Con un booleano la tarjeta
   * pintaba `precio_base` y la segunda forma anunciaba **"desde $0"**. Sumando el mínimo de
   * cada grupo de tamaños al base, las dos dan $4.000.
   *
   * `null` cuando no hay nada más caro que elegir: si todos los tamaños cuestan lo mismo,
   * "desde" sobra. Se decide aquí y no en el componente porque hace falta ver los enganches y
   * sus opciones, que es justo lo que la tarjeta no tiene.
   */
  precioDesde: number | null;
};

export type CategoriaDeMenu = {
  id: string;
  nombre: string;
  slug: string;
  bannerUrl: string | null;
  productos: ProductoDeMenu[];
};

/**
 * Catálogo para el menú público. Filtra solo por `activo` — `disponible=false`
 * (agotado) NO se excluye, se sigue mostrando pero apagado (regla 9: apagar, no
 * borrar/ocultar).
 */
/**
 * Cuánto hay que sumarle al precio base para llegar al más barato de verdad, por producto.
 *
 * Solo aparecen los productos donde **hay algo más caro que elegir**: si todos los tamaños
 * cuestan lo mismo no hay rango que anunciar y "desde" sería ruido.
 *
 * **Va en su propia consulta y no anidada dentro del menú**, aunque anidarla parezca lo natural
 * con la API relacional. Colgar las opciones del grupo del enganche del producto de la categoría
 * genera un alias de más de 63 caracteres, Postgres lo trunca y lo avisa por el log en cada
 * revalidación de la carta. Dos consultas planas se leen mejor que una anidada que el motor
 * tiene que recortar.
 *
 * Solo cuentan las opciones **disponibles**: con el pequeño agotado, el mínimo real es el
 * mediano, y anunciar el del pequeño sería prometer un precio que nadie puede pedir.
 */
async function conPrecioDesde(storeId: string): Promise<Map<string, number>> {
  const filas = await db
    .select({
      productId: productModifierGroup.productId,
      engancheId: productModifierGroup.id,
      modo: productModifierGroup.modo,
      minSelect: productModifierGroup.minSelect,
      precioUnitario: productModifierGroup.precioUnitario,
      tipo: modifierGroup.tipo,
      precioDelta: modifierOption.precioDelta,
    })
    .from(productModifierGroup)
    .innerJoin(modifierGroup, eq(modifierGroup.id, productModifierGroup.groupId))
    .innerJoin(
      modifierOption,
      and(
        eq(modifierOption.groupId, modifierGroup.id),
        eq(modifierOption.disponible, true),
      ),
    )
    .where(eq(productModifierGroup.storeId, storeId));

  // El rango de cada grupo de tamaños. Quién es una variante lo decide `esVariante`, y cuánto
  // cobra cada opción `precioEfectivoOpcion`: los dos salen de `precios-calculo` y no se
  // reescriben aquí, que es el mismo criterio con el que la ficha pinta y el servidor cobra.
  const porEnganche = new Map<string, { productId: string; min: number; max: number }>();
  for (const fila of filas) {
    if (!esVariante(fila)) continue;

    const precio = precioEfectivoOpcion(fila, fila);
    const previo = porEnganche.get(fila.engancheId);

    porEnganche.set(fila.engancheId, {
      productId: fila.productId,
      min: previo ? Math.min(previo.min, precio) : precio,
      max: previo ? Math.max(previo.max, precio) : precio,
    });
  }

  // Un producto puede llevar más de un grupo obligatorio —tamaño y presentación—, y entonces
  // el más barato es la suma de los mínimos de todos. Basta con que UNO tenga rango para que
  // el precio sea un "desde".
  const minimo = new Map<string, number>();
  const conRango = new Set<string>();
  for (const { productId, min, max } of porEnganche.values()) {
    minimo.set(productId, (minimo.get(productId) ?? 0) + min);
    if (max > min) conRango.add(productId);
  }

  return new Map([...conRango].map((id) => [id, minimo.get(id) ?? 0]));
}

export async function obtenerMenu(storeId: string): Promise<CategoriaDeMenu[]> {
  const [categorias, extraMinimo] = await Promise.all([
    db.query.category.findMany({
      where: and(eq(category.storeId, storeId), eq(category.activa, true)),
      orderBy: asc(category.orden),
      with: {
        products: {
          where: eq(product.activo, true),
          orderBy: asc(product.orden),
          with: {
            // Solo para saber si existe al menos un enganche — no se necesitan
            // sus datos aquí, eso lo trae `obtenerProductoParaFicha` al abrir.
            productModifierGroups: { columns: { id: true }, limit: 1 },
          },
        },
      },
    }),
    conPrecioDesde(storeId),
  ]);

  return categorias.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    slug: c.slug,
    bannerUrl: c.bannerUrl,
    productos: c.products.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      slug: p.slug,
      descripcion: p.descripcion,
      precioBase: p.precioBase,
      fotos: fotosConFoco(p.imagenes, p.imagenesFoco),
      recomendado: p.recomendado,
      disponible: p.disponible,
      disponibleDelivery: p.disponibleDelivery,
      disponiblePickup: p.disponiblePickup,
      tieneModificadores: p.productModifierGroups.length > 0,
      // El base más el mínimo de cada tamaño obligatorio: da igual si el precio real está en el
      // producto o repartido en las opciones.
      precioDesde: extraMinimo.has(p.id) ? p.precioBase + extraMinimo.get(p.id)! : null,
    })),
  }));
}
