import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  category,
  modifierGroup,
  modifierOption,
  orderItem,
  product,
  productModifierGroup,
} from "@/db/schema";
import type { EngancheActual, PlanEngancles } from "@/lib/catalogo/engancles";
import { fotosConFoco, type FotoConFoco } from "@/lib/imagenes";

/**
 * El catálogo visto desde el panel: lo que alimenta el CRUD de `/admin/productos`.
 *
 * Es la contraparte de `menu.ts`, que sirve la carta pública.
 *
 * Las categorías no se borran: `activa = false` las saca de la carta y es reversible.
 *
 * Los productos sí, pero con una regla: **se borra lo que nunca se pidió; lo que se vendió se
 * oculta**. La diferencia no es un gusto, la marcan las tres FKs que apuntan a `product.id`, y
 * no significan lo mismo:
 *
 * - `product_modifier_group.product_id` es `ON DELETE CASCADE`. Son configuración —los
 *   enganches y las variantes de ESTE producto— y se van con él, que es lo correcto.
 * - `order_item.product_id` no lleva `ON DELETE`. Es historial: la regla 2 lo reserva para
 *   reportes agregados. Un producto vendido no se borra ni queriendo, y tampoco debe.
 * - `modifier_option.producto_ref` tampoco. Es el catálogo VIVO de otro producto: es lo que
 *   hace que un upsell se cobre por el `precio_base` de su bebida (regla 8).
 *
 * `eliminarProducto` comprueba las dos últimas y devuelve el motivo en vez de dejar que
 * reviente la base, porque un 500 de Postgres no le dice a nadie que la salida es "Oculto".
 */

// ------------------------------------------------------------
// Lecturas
// ------------------------------------------------------------

/** Un enganche con el nombre del grupo, para poder pintarlo sin una segunda consulta. */
export type EngancheDelPanel = EngancheActual & {
  nombreGrupo: string;
  tipoGrupo: "seleccion" | "upsell";
};

export type ProductoDelPanel = {
  id: string;
  categoryId: string;
  nombre: string;
  slug: string;
  descripcion: string | null;
  precioBase: number;
  fotos: FotoConFoco[];
  recomendado: boolean;
  activo: boolean;
  disponible: boolean;
  disponibleDelivery: boolean;
  disponiblePickup: boolean;
  orden: number;
  engancles: EngancheDelPanel[];
};

export type CategoriaPanel = {
  id: string;
  nombre: string;
  slug: string;
  bannerUrl: string | null;
  subtitulo: string | null;
  orden: number;
  activa: boolean;
  productos: ProductoDelPanel[];
};

/**
 * Todo el catálogo de una vez: categorías, sus productos y los enganches de cada uno.
 *
 * Se trae entero y no por categoría a propósito. Son cuatro categorías y unas decenas de
 * productos —el catálogo real de una churrería, no un marketplace—, así que cabe de sobra
 * en una respuesta y a cambio la pantalla no tiene un solo estado de carga: cambiar de
 * categoría o de producto es instantáneo. Si algún día esto creciera, el corte natural
 * sería cargar los productos por categoría bajo demanda.
 *
 * Sin filtrar por `activo` ni por `activa`: lo oculto tiene que verse en el panel, si no
 * sería imposible volver a encenderlo.
 */
export async function listarCatalogoDelPanel(storeId: string): Promise<CategoriaPanel[]> {
  const filas = await db.query.category.findMany({
    where: eq(category.storeId, storeId),
    orderBy: [asc(category.orden), asc(category.nombre)],
    with: {
      products: {
        orderBy: [asc(product.orden), asc(product.nombre)],
        with: {
          productModifierGroups: {
            orderBy: asc(productModifierGroup.orden),
            with: { modifierGroup: { columns: { nombre: true, tipo: true } } },
          },
        },
      },
    },
  });

  return filas.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    slug: c.slug,
    bannerUrl: c.bannerUrl,
    subtitulo: c.subtitulo,
    orden: c.orden,
    activa: c.activa,
    productos: c.products.map((p) => ({
      id: p.id,
      categoryId: p.categoryId,
      nombre: p.nombre,
      slug: p.slug,
      descripcion: p.descripcion,
      precioBase: p.precioBase,
      // El default viejo dejaba `{""}` en las filas sin foto. La migración 0011 las saneó,
      // pero filtrar aquí cuesta nada y evita que un hueco vacío llegue a la rejilla.
      // `fotosConFoco` filtra la pareja entera: filtrar solo las URLs correría los índices y
      // cada encuadre acabaría aplicado a la foto del vecino.
      fotos: fotosConFoco(p.imagenes, p.imagenesFoco),
      recomendado: p.recomendado,
      activo: p.activo,
      disponible: p.disponible,
      disponibleDelivery: p.disponibleDelivery,
      disponiblePickup: p.disponiblePickup,
      orden: p.orden,
      engancles: p.productModifierGroups.map((pmg) => ({
        id: pmg.id,
        groupId: pmg.groupId,
        modo: pmg.modo,
        minSelect: pmg.minSelect,
        maxSelect: pmg.maxSelect,
        precioUnitario: pmg.precioUnitario,
        colapsado: pmg.colapsado,
        nombreGrupo: pmg.modifierGroup.nombre,
        tipoGrupo: pmg.modifierGroup.tipo,
      })),
    })),
  }));
}

/**
 * Solo los enganches de un producto. Es lo que `planificarEngancles` necesita como "estado
 * actual" antes de aplicar un cambio, y traerse el catálogo entero para eso sería absurdo.
 */
export async function enganclesDeProducto(
  storeId: string,
  productId: string,
): Promise<EngancheActual[] | null> {
  const p = await db.query.product.findFirst({
    where: and(eq(product.storeId, storeId), eq(product.id, productId)),
    columns: { id: true },
    with: {
      productModifierGroups: {
        columns: {
          id: true,
          groupId: true,
          modo: true,
          minSelect: true,
          maxSelect: true,
          precioUnitario: true,
          colapsado: true,
        },
      },
    },
  });

  return p ? p.productModifierGroups : null;
}

export type GrupoEnganchable = {
  id: string;
  nombre: string;
  tipo: "seleccion" | "upsell";
  activo: boolean;
  totalOpciones: number;
};

/**
 * El catálogo de grupos que se pueden enganchar. Crearlos es cosa de `/admin/opciones`.
 *
 * Devuelve también los archivados (`activo = false`), y filtrarlos aquí sería un bug: esta
 * lista es además el diccionario con el que `Modificadores.tsx` resuelve el nombre de cada
 * enganche ya guardado, así que un producto enganchado a una lista archivada pasaría a
 * mostrar "Grupo desconocido". Quien filtra es la UI, y solo sobre lo que se puede AÑADIR.
 */
export async function listarGruposEnganchables(storeId: string): Promise<GrupoEnganchable[]> {
  return db
    .select({
      id: modifierGroup.id,
      nombre: modifierGroup.nombre,
      tipo: modifierGroup.tipo,
      activo: modifierGroup.activo,
      totalOpciones: count(modifierOption.id),
    })
    .from(modifierGroup)
    .leftJoin(modifierOption, eq(modifierOption.groupId, modifierGroup.id))
    .where(eq(modifierGroup.storeId, storeId))
    .groupBy(modifierGroup.id)
    .orderBy(asc(modifierGroup.nombre));
}

/** Los slugs ya tomados, para que `slugLibre()` proponga uno que no choque. */
export async function slugsDeProducto(storeId: string): Promise<string[]> {
  const filas = await db
    .select({ slug: product.slug })
    .from(product)
    .where(eq(product.storeId, storeId));

  return filas.map((f) => f.slug);
}

export async function slugsDeCategoria(storeId: string): Promise<string[]> {
  const filas = await db
    .select({ slug: category.slug })
    .from(category)
    .where(eq(category.storeId, storeId));

  return filas.map((f) => f.slug);
}

// ------------------------------------------------------------
// Mutaciones — productos
// ------------------------------------------------------------

/** El siguiente hueco al final de una categoría, calculado en la misma sentencia. */
function ordenAlFinal(storeId: string, categoryId: string) {
  return sql<number>`(SELECT COALESCE(MAX(orden) + 1, 0) FROM product WHERE store_id = ${storeId} AND category_id = ${categoryId})`;
}

export async function crearProducto(
  storeId: string,
  datos: { categoryId: string; nombre: string; slug: string; precioBase: number },
): Promise<{ id: string }> {
  const [fila] = await db
    .insert(product)
    .values({
      storeId,
      categoryId: datos.categoryId,
      nombre: datos.nombre,
      slug: datos.slug,
      precioBase: datos.precioBase,
      // Explícito y no por default: hasta la migración 0011 el default era `{""}`.
      imagenes: [],
      orden: ordenAlFinal(storeId, datos.categoryId),
    })
    .returning({ id: product.id });

  return fila;
}

export type DatosProducto = {
  categoryId: string;
  nombre: string;
  descripcion: string | null;
  precioBase: number;
  recomendado: boolean;
  disponibleDelivery: boolean;
  disponiblePickup: boolean;
};

/**
 * Guarda el formulario del detalle. Si el producto cambió de categoría se manda al final
 * de la nueva: dejarle el `orden` que traía lo metería en mitad de una lista ajena.
 *
 * El `slug` NO se toca aquí. Es una URL pública que los clientes comparten por WhatsApp, y
 * renombrar un producto no debería romper los enlaces que ya circulan; para cambiarla está
 * `cambiarSlugProducto`, que es una decisión aparte y consciente.
 */
export async function actualizarProducto(
  storeId: string,
  productId: string,
  datos: DatosProducto,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [previo] = await tx
      .select({ categoryId: product.categoryId })
      .from(product)
      .where(and(eq(product.storeId, storeId), eq(product.id, productId)));

    if (!previo) return false;

    const cambioDeCategoria = previo.categoryId !== datos.categoryId;

    const filas = await tx
      .update(product)
      .set({
        categoryId: datos.categoryId,
        nombre: datos.nombre,
        descripcion: datos.descripcion,
        precioBase: datos.precioBase,
        recomendado: datos.recomendado,
        disponibleDelivery: datos.disponibleDelivery,
        disponiblePickup: datos.disponiblePickup,
        ...(cambioDeCategoria ? { orden: ordenAlFinal(storeId, datos.categoryId) } : {}),
      })
      .where(and(eq(product.storeId, storeId), eq(product.id, productId)))
      .returning({ id: product.id });

    return filas.length > 0;
  });
}

/**
 * Nombre y precio, y nada más. Existe aparte de `actualizarProducto` porque quien la llama no es
 * el formulario del detalle sino el lápiz de una opción de upsell en `/admin/opciones`: ahí lo
 * que se está editando ES el producto (regla 8), y no hay categoría, descripción ni switches que
 * mandar. Pasar por el formulario entero obligaría a reenviar campos que nadie tocó.
 *
 * Los dos campos van juntos en un solo UPDATE porque el formulario los guarda de una.
 *
 * El `slug` no se toca, por el mismo motivo que en `actualizarProducto`: es una URL pública.
 */
export async function actualizarProductoOfrecido(
  storeId: string,
  productId: string,
  datos: { nombre: string; precioBase: number },
): Promise<boolean> {
  const filas = await db
    .update(product)
    .set({ nombre: datos.nombre, precioBase: datos.precioBase })
    .where(and(eq(product.storeId, storeId), eq(product.id, productId)))
    .returning({ id: product.id });

  return filas.length > 0;
}

export async function cambiarSlugProducto(
  storeId: string,
  productId: string,
  slug: string,
): Promise<boolean> {
  const filas = await db
    .update(product)
    .set({ slug })
    .where(and(eq(product.storeId, storeId), eq(product.id, productId)))
    .returning({ id: product.id });

  return filas.length > 0;
}

/**
 * El estado "Oculto" de la tabla de CLAUDE.md. Es distinto de `disponible` (agotado) y por
 * eso son dos columnas: agotado se ve en la carta con su etiqueta, oculto no aparece.
 */
export async function cambiarVisibleProducto(
  storeId: string,
  productId: string,
  activo: boolean,
): Promise<boolean> {
  const filas = await db
    .update(product)
    .set({ activo })
    .where(and(eq(product.storeId, storeId), eq(product.id, productId)))
    .returning({ id: product.id });

  return filas.length > 0;
}

/**
 * Reescribe el orden de una categoría entera según la lista recibida, igual que
 * `reordenarZonas`: mover un elemento cambia el número de varios vecinos, y hacerlo con
 * updates sueltos deja órdenes repetidos si algo falla a mitad.
 *
 * El `category_id` en el WHERE no es decorativo: impide que un id de otra categoría se
 * cuele en la lista y salga renumerado donde no toca.
 */
export async function reordenarProductos(
  storeId: string,
  categoryId: string,
  idsEnOrden: string[],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (let i = 0; i < idsEnOrden.length; i++) {
      await tx
        .update(product)
        .set({ orden: i })
        .where(
          and(
            eq(product.storeId, storeId),
            eq(product.categoryId, categoryId),
            eq(product.id, idsEnOrden[i]),
          ),
        );
    }
  });
}

/**
 * Devuelve las fotos que HABÍA, no las nuevas, y por eso no basta con un `RETURNING`: ese
 * da los valores ya escritos. Quien llama las necesita para borrar del bucket las que
 * dejaron de estar en la lista; sin eso, cada foto reemplazada queda ahí para siempre
 * comiéndose el free tier.
 *
 * `null` si el producto no existe, para distinguirlo de "existía y no tenía fotos".
 *
 * **Las dos columnas se escriben en el mismo `UPDATE`, y ese es el seguro del modelo.** El foco
 * va alineado por índice con la URL, así que si se pudieran guardar por separado acabarían
 * describiendo fotos distintas —reordenar la lista sin mover los focos deja cada encuadre en la
 * foto del vecino—. Aquí no hay forma de tocar una sin la otra.
 */
export async function guardarImagenesProducto(
  storeId: string,
  productId: string,
  urls: string[],
  focos: string[],
): Promise<{ previas: string[] } | null> {
  return db.transaction(async (tx) => {
    const [antes] = await tx
      .select({ imagenes: product.imagenes })
      .from(product)
      .where(and(eq(product.storeId, storeId), eq(product.id, productId)));

    if (!antes) return null;

    await tx
      .update(product)
      .set({ imagenes: urls, imagenesFoco: focos })
      .where(and(eq(product.storeId, storeId), eq(product.id, productId)));

    return { previas: antes.imagenes.filter(Boolean) };
  });
}

export type ResultadoBorrado =
  | { estado: "ok"; imagenes: string[] }
  | { estado: "sin_producto" }
  | { estado: "tiene_ventas" }
  | { estado: "es_acompanante"; listas: string[] };

/**
 * Borra un producto de verdad, y solo si se puede: la regla y sus motivos están en la cabecera
 * del archivo. Devuelve por qué no cuando no, para que el panel lo diga con palabras.
 *
 * Sus enganches se van solos por el CASCADE de `product_modifier_group`. Las fotos NO: son
 * objetos de Storage y hay que sacarlas del bucket, así que se devuelven aquí.
 */
export async function eliminarProducto(
  storeId: string,
  productId: string,
): Promise<ResultadoBorrado> {
  return db.transaction(async (tx): Promise<ResultadoBorrado> => {
    // `FOR UPDATE` y no un SELECT a secas: es lo que cierra la carrera con un pedido que entra
    // mientras se decide. Un `INSERT INTO order_item` necesita un `FOR KEY SHARE` sobre la fila
    // que referencia, así que espera a que esta transacción termine en vez de colarse entre la
    // comprobación de ventas y el DELETE. Mismo recurso que `cambiarEstadoPedido` (regla 19).
    const [fila] = await tx
      .select({ imagenes: product.imagenes })
      .from(product)
      .where(and(eq(product.storeId, storeId), eq(product.id, productId)))
      .for("update");

    if (!fila) return { estado: "sin_producto" };

    // Sin filtrar por `store_id`, a propósito: lo que bloquea el borrado es la FK, y una FK no
    // sabe de tiendas. Filtrar aquí diría "se puede borrar" y el DELETE reventaría después.
    const [venta] = await tx
      .select({ id: orderItem.id })
      .from(orderItem)
      .where(eq(orderItem.productId, productId))
      .limit(1);

    if (venta) return { estado: "tiene_ventas" };

    // Se devuelven los NOMBRES de las listas y no un booleano: quien intenta borrar tiene que
    // saber a dónde ir a quitarlo, y eso es `/admin/opciones`.
    const listas = await tx
      .selectDistinct({ nombre: modifierGroup.nombre })
      .from(modifierOption)
      .innerJoin(modifierGroup, eq(modifierGroup.id, modifierOption.groupId))
      .where(eq(modifierOption.productoRef, productId));

    if (listas.length > 0) {
      return { estado: "es_acompanante", listas: listas.map((l) => l.nombre) };
    }

    await tx.delete(product).where(and(eq(product.storeId, storeId), eq(product.id, productId)));

    // Las fotos se leyeron arriba, antes del DELETE: después ya no hay de dónde sacarlas. Es el
    // mismo motivo por el que `guardarImagenesProducto` devuelve `previas` en vez de un
    // `RETURNING`.
    return { estado: "ok", imagenes: fila.imagenes.filter(Boolean) };
  });
}

// ------------------------------------------------------------
// Mutaciones — categorías
// ------------------------------------------------------------

export async function crearCategoria(
  storeId: string,
  datos: { nombre: string; slug: string },
): Promise<{ id: string }> {
  const [fila] = await db
    .insert(category)
    .values({
      storeId,
      nombre: datos.nombre,
      slug: datos.slug,
      orden: sql<number>`(SELECT COALESCE(MAX(orden) + 1, 0) FROM category WHERE store_id = ${storeId})`,
    })
    .returning({ id: category.id });

  return fila;
}

/** Igual que en productos: renombrar no cambia el slug, que es una URL pública. */
export async function renombrarCategoria(
  storeId: string,
  categoryId: string,
  nombre: string,
): Promise<boolean> {
  const filas = await db
    .update(category)
    .set({ nombre })
    .where(and(eq(category.storeId, storeId), eq(category.id, categoryId)))
    .returning({ id: category.id });

  return filas.length > 0;
}

export async function cambiarActivaCategoria(
  storeId: string,
  categoryId: string,
  activa: boolean,
): Promise<boolean> {
  const filas = await db
    .update(category)
    .set({ activa })
    .where(and(eq(category.storeId, storeId), eq(category.id, categoryId)))
    .returning({ id: category.id });

  return filas.length > 0;
}

/**
 * La frase del hero. Sin transacción ni valor previo, al revés que el banner: aquí no queda
 * ningún objeto colgando en Storage que haya que borrar después.
 */
export async function guardarSubtituloCategoria(
  storeId: string,
  categoryId: string,
  subtitulo: string | null,
): Promise<boolean> {
  const filas = await db
    .update(category)
    .set({ subtitulo })
    .where(and(eq(category.storeId, storeId), eq(category.id, categoryId)))
    .returning({ id: category.id });

  return filas.length > 0;
}

/** Mismo trato que las fotos de producto: devuelve el banner ANTERIOR para poder borrarlo. */
export async function guardarBannerCategoria(
  storeId: string,
  categoryId: string,
  bannerUrl: string | null,
): Promise<{ previo: string | null } | null> {
  return db.transaction(async (tx) => {
    const [antes] = await tx
      .select({ bannerUrl: category.bannerUrl })
      .from(category)
      .where(and(eq(category.storeId, storeId), eq(category.id, categoryId)));

    if (!antes) return null;

    await tx
      .update(category)
      .set({ bannerUrl })
      .where(and(eq(category.storeId, storeId), eq(category.id, categoryId)));

    return { previo: antes.bannerUrl };
  });
}

export async function reordenarCategorias(storeId: string, idsEnOrden: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (let i = 0; i < idsEnOrden.length; i++) {
      await tx
        .update(category)
        .set({ orden: i })
        .where(and(eq(category.storeId, storeId), eq(category.id, idsEnOrden[i])));
    }
  });
}

// ------------------------------------------------------------
// Mutaciones — enganches (regla 15)
// ------------------------------------------------------------

export type ResultadoSincronizacion = "ok" | "sin_producto" | "grupo_ajeno";

/**
 * Aplica el plan que calculó `planificarEngancles`. Todo en una transacción: dejar la
 * mitad escrita significaría un producto que pide 2 salsas incluidas y ya no ofrece
 * ninguna, y eso bloquea el carrito de cualquiera que intente pedirlo.
 *
 * El upsert va contra el UNIQUE (product_id, group_id, modo), que es justo el constraint
 * que permite enganchar un mismo grupo dos veces —una incluida y una de pago (regla 3)—.
 */
export async function sincronizarEngancles(
  storeId: string,
  productId: string,
  plan: PlanEngancles,
): Promise<ResultadoSincronizacion> {
  return db.transaction(async (tx) => {
    const [existe] = await tx
      .select({ id: product.id })
      .from(product)
      .where(and(eq(product.storeId, storeId), eq(product.id, productId)));

    if (!existe) return "sin_producto";

    // Los groupId llegan del navegador. Sin esta comprobación, un admin podría enganchar
    // un grupo de otra tienda y el `store_id` de la fila nueva mentiría (regla 5).
    const idsPedidos = [...new Set(plan.guardar.map((f) => f.groupId))];
    if (idsPedidos.length > 0) {
      const propios = await tx
        .select({ id: modifierGroup.id })
        .from(modifierGroup)
        .where(and(eq(modifierGroup.storeId, storeId), inArray(modifierGroup.id, idsPedidos)));

      if (propios.length !== idsPedidos.length) return "grupo_ajeno";
    }

    if (plan.borrar.length > 0) {
      await tx
        .delete(productModifierGroup)
        .where(
          and(
            eq(productModifierGroup.storeId, storeId),
            eq(productModifierGroup.productId, productId),
            inArray(productModifierGroup.id, plan.borrar),
          ),
        );
    }

    for (const fila of plan.guardar) {
      await tx
        .insert(productModifierGroup)
        .values({
          storeId,
          productId,
          groupId: fila.groupId,
          modo: fila.modo,
          minSelect: fila.minSelect,
          maxSelect: fila.maxSelect,
          precioUnitario: fila.precioUnitario,
          avisarIncompleto: fila.avisarIncompleto,
          colapsado: fila.colapsado,
          orden: fila.orden,
        })
        .onConflictDoUpdate({
          target: [
            productModifierGroup.productId,
            productModifierGroup.groupId,
            productModifierGroup.modo,
          ],
          set: {
            minSelect: fila.minSelect,
            maxSelect: fila.maxSelect,
            precioUnitario: fila.precioUnitario,
            avisarIncompleto: fila.avisarIncompleto,
            colapsado: fila.colapsado,
            orden: fila.orden,
          },
        });
    }

    return "ok";
  });
}
