import { and, asc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { category, cupon, cuponCategoria, cuponProducto, order, product } from "@/db/schema";
import type { CuponVigente } from "@/lib/cupones";

/**
 * Los cupones, desde la base.
 *
 * La aritmética del descuento NO está aquí: vive en `src/lib/cupones.ts`, que es puro y probado
 * (regla 1 aplicada al cupón). Este archivo solo busca y escribe.
 *
 * Lo que sí decide este archivo es **cómo se expande el alcance**: un cupón acotado guarda
 * categorías y productos, y aquí se traduce a un conjunto de ids de producto. Se expande en cada
 * lectura y no al guardar, para que un producto que entre mañana a una categoría cubierta quede
 * cubierto solo, sin que nadie tenga que volver a editar el cupón.
 */

/** Un cupón listo para `aplicarCupon`, más los nombres de lo que cubre para poder explicarlo. */
export type CuponResuelto = CuponVigente & {
  /**
   * Cómo se le nombra al cliente lo que el cupón cubre: ["Churros con helado", "Latte frío"].
   * Vacío cuando cubre toda la carta — ahí no hay nada que aclarar.
   *
   * Existe para el mensaje de `sin_items_elegibles`: «CHURRO10 aplica solo a Churros con helado»
   * le dice al cliente qué agregar, y «ese cupón no aplica» lo deja adivinando.
   */
  aplicaA: string[];
};

/**
 * Busca un cupón por su código. Devuelve `null` si no existe.
 *
 * **No decide nada más**: si está vencido, apagado o no cubre nada de este pedido lo dice
 * `aplicarCupon`, que es donde están los tests. Aquí se devuelve tal como está en la base,
 * incluidos los apagados, precisamente para que el módulo puro pueda distinguir "no existe" de
 * "existe pero está apagado" — dos mensajes distintos para el cliente.
 *
 * El código tiene que llegar ya normalizado (`normalizarCodigo`): el UNIQUE es sobre lo guardado.
 */
export async function buscarCuponPorCodigo(
  storeId: string,
  codigo: string,
): Promise<CuponResuelto | null> {
  const [fila] = await db
    .select()
    .from(cupon)
    .where(and(eq(cupon.storeId, storeId), eq(cupon.codigo, codigo)))
    .limit(1);

  if (!fila) return null;

  const base = {
    id: fila.id,
    codigo: fila.codigo,
    porcentaje: fila.porcentaje,
    venceEl: fila.venceEl,
    activo: fila.activo,
  };

  if (fila.alcance === "todo") {
    return { ...base, productosElegibles: null, aplicaA: [] };
  }

  return { ...base, ...(await expandirAlcance(storeId, fila.id)) };
}

/**
 * De categorías y productos elegidos a un conjunto de ids de producto.
 *
 * Las dos primeras consultas van en paralelo porque son independientes; la tercera necesita los
 * ids de las categorías. Un cupón acotado que se quedó sin nada marcado devuelve un conjunto
 * vacío, y eso hace que `aplicarCupon` lo rechace con `sin_items_elegibles` — que es lo correcto:
 * un cupón que no cubre nada no descuenta nada, y desde luego no descuenta sobre todo.
 */
async function expandirAlcance(
  storeId: string,
  cuponId: string,
): Promise<{ productosElegibles: Set<string>; aplicaA: string[] }> {
  const [categorias, productos] = await Promise.all([
    db
      .select({ id: category.id, nombre: category.nombre })
      .from(cuponCategoria)
      .innerJoin(category, eq(category.id, cuponCategoria.categoryId))
      .where(eq(cuponCategoria.cuponId, cuponId)),
    db
      .select({ id: product.id, nombre: product.nombre })
      .from(cuponProducto)
      .innerJoin(product, eq(product.id, cuponProducto.productId))
      .where(eq(cuponProducto.cuponId, cuponId)),
  ]);

  const deCategorias =
    categorias.length > 0
      ? await db
          .select({ id: product.id })
          .from(product)
          .where(
            and(
              eq(product.storeId, storeId),
              inArray(
                product.categoryId,
                categorias.map((c) => c.id),
              ),
            ),
          )
      : [];

  return {
    productosElegibles: new Set([
      ...productos.map((p) => p.id),
      ...deCategorias.map((p) => p.id),
    ]),
    // Las categorías primero: es lo que agrupa, y leer "Churros con helado" dice más que la lista
    // de los seis churros que contiene.
    aplicaA: [...categorias.map((c) => c.nombre), ...productos.map((p) => p.nombre)],
  };
}

/**
 * El cupón que se anuncia en la carta, si hay alguno vivo.
 *
 * Filtra aquí lo que la carta no puede saber: apagado o vencido no se anuncia. El índice único
 * parcial garantiza que no haya dos, así que el `limit(1)` no está eligiendo entre candidatos.
 */
export async function cuponAnunciado(
  storeId: string,
  hoy: string,
): Promise<{ codigo: string; porcentaje: number; anuncio: string } | null> {
  const [fila] = await db
    .select({ codigo: cupon.codigo, porcentaje: cupon.porcentaje, anuncio: cupon.anuncio })
    .from(cupon)
    .where(
      and(
        eq(cupon.storeId, storeId),
        eq(cupon.activo, true),
        isNotNull(cupon.anuncio),
        or(isNull(cupon.venceEl), sql`${cupon.venceEl} >= ${hoy}`),
      ),
    )
    .limit(1);

  return fila?.anuncio ? { ...fila, anuncio: fila.anuncio } : null;
}

// ------------------------------------------------------------
// El panel
// ------------------------------------------------------------

export type CuponDelPanel = {
  id: string;
  codigo: string;
  porcentaje: number;
  alcance: "todo" | "seleccion";
  venceEl: string | null;
  anuncio: string | null;
  activo: boolean;
  categoriaIds: string[];
  productoIds: string[];
  /** Pedidos no cancelados que lo usaron, y cuánto se descontó en total. */
  usos: number;
  descontado: number;
};

/**
 * Todos los cupones con su alcance y sus cifras de uso.
 *
 * Incluye los apagados y los vencidos: si se filtraran, no habría forma de volver a encender uno
 * ni de consultar qué rindió la promo del mes pasado — que es justo para lo que se mira esto.
 *
 * **Las cifras se agregan en SQL**, por lo mismo que el resumen del día: contar sobre una lista
 * traída a memoria daría igual hoy y se cortaría sola el día que haya volumen. Un pedido cancelado
 * no cuenta: esa plata no entró y ese cupón, en la práctica, no se gastó.
 */
export async function listarCupones(storeId: string): Promise<CuponDelPanel[]> {
  const [filas, categorias, productos, uso] = await Promise.all([
    db
      .select()
      .from(cupon)
      .where(eq(cupon.storeId, storeId))
      .orderBy(asc(cupon.codigo)),
    db
      .select({ cuponId: cuponCategoria.cuponId, categoryId: cuponCategoria.categoryId })
      .from(cuponCategoria)
      .innerJoin(cupon, eq(cupon.id, cuponCategoria.cuponId))
      .where(eq(cupon.storeId, storeId)),
    db
      .select({ cuponId: cuponProducto.cuponId, productId: cuponProducto.productId })
      .from(cuponProducto)
      .innerJoin(cupon, eq(cupon.id, cuponProducto.cuponId))
      .where(eq(cupon.storeId, storeId)),
    db
      .select({
        cuponId: order.cuponId,
        usos: sql<number>`count(*)::int`,
        descontado: sql<number>`COALESCE(SUM(${order.descuento}), 0)::int`,
      })
      .from(order)
      .where(
        and(
          eq(order.storeId, storeId),
          isNotNull(order.cuponId),
          sql`${order.estado} <> 'cancelado'`,
        ),
      )
      .groupBy(order.cuponId),
  ]);

  const porCupon = new Map(uso.map((u) => [u.cuponId, u]));

  return filas.map((f) => ({
    id: f.id,
    codigo: f.codigo,
    porcentaje: f.porcentaje,
    alcance: f.alcance,
    venceEl: f.venceEl,
    anuncio: f.anuncio,
    activo: f.activo,
    categoriaIds: categorias.filter((c) => c.cuponId === f.id).map((c) => c.categoryId),
    productoIds: productos.filter((p) => p.cuponId === f.id).map((p) => p.productId),
    usos: porCupon.get(f.id)?.usos ?? 0,
    descontado: porCupon.get(f.id)?.descontado ?? 0,
  }));
}

export type DatosCupon = {
  codigo: string;
  porcentaje: number;
  alcance: "todo" | "seleccion";
  venceEl: string | null;
  anuncio: string | null;
  categoriaIds: string[];
  productoIds: string[];
};

/**
 * Crea o actualiza un cupón junto con su alcance, en una transacción.
 *
 * El alcance se reescribe entero (borrar e insertar) en vez de calcular diferencias: son un puñado
 * de filas sin datos propios que conservar, así que un diff solo añadiría formas de equivocarse.
 *
 * Devuelve `null` si el id no existe o es de otra tienda (regla 5). El choque de código lo deja
 * salir como excepción: lo traduce la acción con `violaConstraint`, que es quien puede decir "ya
 * existe un cupón con ese código" sin adivinar.
 */
export async function guardarCupon(
  storeId: string,
  id: string | null,
  datos: DatosCupon,
): Promise<{ id: string } | null> {
  return db.transaction(async (tx) => {
    const valores = {
      codigo: datos.codigo,
      porcentaje: datos.porcentaje,
      alcance: datos.alcance,
      venceEl: datos.venceEl,
      anuncio: datos.anuncio,
    };

    let cuponId: string;

    if (id) {
      const [fila] = await tx
        .update(cupon)
        .set(valores)
        .where(and(eq(cupon.storeId, storeId), eq(cupon.id, id)))
        .returning({ id: cupon.id });

      if (!fila) return null;
      cuponId = fila.id;

      await tx.delete(cuponCategoria).where(eq(cuponCategoria.cuponId, cuponId));
      await tx.delete(cuponProducto).where(eq(cuponProducto.cuponId, cuponId));
    } else {
      const [fila] = await tx
        .insert(cupon)
        .values({ storeId, ...valores })
        .returning({ id: cupon.id });

      cuponId = fila.id;
    }

    // Solo se escribe el alcance de un cupón acotado. En `todo` las filas no significarían nada y
    // quedarían como basura que confundiría al siguiente que lea la tabla.
    if (datos.alcance === "seleccion") {
      if (datos.categoriaIds.length > 0) {
        await tx
          .insert(cuponCategoria)
          .values(datos.categoriaIds.map((categoryId) => ({ cuponId, categoryId })));
      }
      if (datos.productoIds.length > 0) {
        await tx
          .insert(cuponProducto)
          .values(datos.productoIds.map((productId) => ({ cuponId, productId })));
      }
    }

    return { id: cuponId };
  });
}

/** Apagar y encender, que es lo que se hace en vez de borrar (regla 9). */
export async function cambiarActivoCupon(
  storeId: string,
  id: string,
  activo: boolean,
): Promise<boolean> {
  const filas = await db
    .update(cupon)
    .set({ activo })
    .where(and(eq(cupon.storeId, storeId), eq(cupon.id, id)))
    .returning({ id: cupon.id });

  return filas.length > 0;
}

/**
 * Quita el aviso de la carta de cualquier otro cupón de la tienda.
 *
 * Existe porque el índice único parcial es un muro, no una cola: sin esto, poner el aviso en un
 * segundo cupón fallaría con un error de base en vez de reemplazar al anterior, que es lo que
 * espera quien lo está escribiendo. Se llama antes de guardar, dentro de la misma acción.
 */
export async function soltarAnuncio(storeId: string, exceptoId: string | null): Promise<void> {
  await db
    .update(cupon)
    .set({ anuncio: null })
    .where(
      and(
        eq(cupon.storeId, storeId),
        isNotNull(cupon.anuncio),
        exceptoId ? sql`${cupon.id} <> ${exceptoId}` : sql`true`,
      ),
    );
}
