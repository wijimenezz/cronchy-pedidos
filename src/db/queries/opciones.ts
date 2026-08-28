import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { category, modifierGroup, modifierOption, product } from "@/db/schema";

/**
 * Las listas de opciones vistas desde el panel: lo que alimenta `/admin/opciones`.
 *
 * En el modelo son `modifier_group` + `modifier_option`; en la pantalla son "Salsas",
 * "Toppings" y "Sabor de helado" (regla 15). Aquí abajo se sigue usando el nombre del
 * esquema porque esto es la capa de datos; la traducción al idioma del negocio la hacen los
 * tipos que se exportan y la UI.
 *
 * Va en su propio archivo y no dentro de `catalogo.ts` porque son otro agregado: aquel es el
 * árbol categoría → producto → enganche, y este es el catálogo de opciones que aquel
 * engancha. Lo único que comparten es que ambos se editan desde el panel.
 *
 * Una LISTA no se borra nunca (regla 9): `activo = false` la archiva, y es reversible de un
 * clic. Borrarla sería destructivo de verdad, además: las dos FK que apuntan a
 * `modifier_group` son ON DELETE CASCADE, así que quitar una se llevaría en silencio las
 * opciones **y** los enganches de todos los productos que la usaban.
 *
 * Una OPCIÓN tampoco, salvo en las listas de tipo `upsell` — ver `eliminarOpcion`, que es el
 * único DELETE del archivo y lleva escrito el porqué.
 */

// ------------------------------------------------------------
// Lecturas
// ------------------------------------------------------------

/**
 * El producto al que apunta una opción de upsell, **tal como está hoy**.
 *
 * Vivo y no congelado: la regla 2 es para pedidos ya hechos, y esto es el catálogo que se está
 * editando. Si mañana sube el Mini Churros, el panel tiene que decir el precio nuevo — el que
 * se guardó en `modifier_option.nombre` el día que se enganchó no le sirve a nadie.
 */
export type ProductoDeUpsell = {
  id: string;
  nombre: string;
  precioBase: number;
  /** Si sigue visible en la carta. Ofrecer como upsell algo oculto es una trampa que se ve aquí. */
  activo: boolean;
};

export type OpcionDelPanel = {
  id: string;
  nombre: string;
  precioDelta: number;
  disponible: boolean;
  orden: number;
  /**
   * A qué producto de la carta apunta (regla 8). Solo lo llevan las opciones de las listas
   * `upsell`; en una de salsas es `null` y tiene que seguir siéndolo.
   */
  productoRef: string | null;
  /** Ese producto, ya resuelto. `null` si la opción no apunta a ninguno o si se borró. */
  producto: ProductoDeUpsell | null;
};

export type ListaDelPanel = {
  id: string;
  nombre: string;
  tipo: "seleccion" | "upsell";
  /** Lo que se le explica al cliente en la ficha, o `null` si la lista se entiende sola. */
  ayuda: string | null;
  activo: boolean;
  /** En cuántos PRODUCTOS se usa. Es lo que el admin necesita saber antes de archivarla. */
  usadaEn: number;
  opciones: OpcionDelPanel[];
};

/**
 * Todas las listas con sus opciones, de una sola consulta. Son unas pocas listas con unas
 * pocas opciones cada una —salsas, toppings, sabores—, así que traerlo entero sale más
 * barato que paginar y deja la pantalla sin un solo estado de carga, igual que
 * `listarCatalogoDelPanel`.
 *
 * Incluye las archivadas: si se filtraran aquí no habría forma de volver a encenderlas.
 *
 * Orden alfabético y no por una columna `orden`: dentro de la ficha del cliente, el orden de
 * las secciones lo manda `product_modifier_group.orden` (que es por producto), así que un
 * orden global de listas no significaría nada. Alfabético es lo que ya hacen
 * `listarGruposEnganchables` y `listarOpcionesParaDisponibilidad`.
 */
export async function listarListasDelPanel(storeId: string): Promise<ListaDelPanel[]> {
  const filas = await db.query.modifierGroup.findMany({
    where: eq(modifierGroup.storeId, storeId),
    orderBy: asc(modifierGroup.nombre),
    with: {
      modifierOptions: {
        orderBy: [asc(modifierOption.orden), asc(modifierOption.nombre)],
        columns: {
          id: true,
          nombre: true,
          precioDelta: true,
          disponible: true,
          orden: true,
          productoRef: true,
        },
        // El producto real de las opciones de upsell, en el mismo viaje. Son dos o tres por
        // lista, así que no hay nada que paginar ni que cargar aparte.
        with: {
          product: { columns: { id: true, nombre: true, precioBase: true, activo: true } },
        },
      },
      productModifierGroups: { columns: { productId: true } },
    },
  });

  return filas.map((g) => ({
    id: g.id,
    nombre: g.nombre,
    tipo: g.tipo,
    ayuda: g.ayuda,
    activo: g.activo,
    // El Set no es decorativo: un mismo grupo se engancha DOS veces al mismo producto —una
    // incluida y una de pago (regla 3)—, así que contar filas diría "2 productos" donde hay
    // uno solo.
    usadaEn: new Set(g.productModifierGroups.map((pmg) => pmg.productId)).size,
    opciones: g.modifierOptions.map(({ product, ...o }) => ({ ...o, producto: product })),
  }));
}

/**
 * Los productos de la carta que se pueden ofrecer como upsell, para el selector del panel.
 *
 * Consulta propia y no `listarCatalogoDelPanel` a propósito: aquella arrastra fotos y los
 * enganches de todo el árbol para llenar un desplegable de dos docenas de filas.
 *
 * Devuelve **también los ocultos** (`activo = false`), misma doctrina que
 * `listarGruposEnganchables`: esta lista es además el diccionario con el que la pantalla
 * resuelve el nombre de un upsell ya guardado, así que filtrar aquí dejaría filas sin nombre.
 * Quien filtra es la UI, y solo sobre lo que se puede AÑADIR.
 */
export type ProductoOfrecible = ProductoDeUpsell & { categoria: string };

export async function listarProductosParaUpsell(storeId: string): Promise<ProductoOfrecible[]> {
  return db
    .select({
      id: product.id,
      nombre: product.nombre,
      precioBase: product.precioBase,
      activo: product.activo,
      categoria: category.nombre,
    })
    .from(product)
    .innerJoin(category, eq(category.id, product.categoryId))
    .where(eq(product.storeId, storeId))
    .orderBy(asc(category.orden), asc(category.nombre), asc(product.orden), asc(product.nombre));
}

/**
 * Los nombres ya tomados, para que la acción rechace un duplicado con un mensaje claro en
 * vez de dejar dos "Salsas" indistinguibles en el desplegable de la Carta.
 *
 * Va con el `id` al lado porque al renombrar hay que excluir la propia fila: si no,
 * confirmar el mismo nombre sin tocarlo daría "ya existe otra lista con ese nombre".
 */
export async function nombresDeListas(storeId: string): Promise<{ id: string; nombre: string }[]> {
  return db
    .select({ id: modifierGroup.id, nombre: modifierGroup.nombre })
    .from(modifierGroup)
    .where(eq(modifierGroup.storeId, storeId));
}

/** Lo mismo dentro de UNA lista. Dos "Arequipe" en Salsas es el error que sí se comete. */
export async function nombresDeOpciones(
  storeId: string,
  groupId: string,
): Promise<{ id: string; nombre: string }[]> {
  return db
    .select({ id: modifierOption.id, nombre: modifierOption.nombre })
    .from(modifierOption)
    .where(and(eq(modifierOption.storeId, storeId), eq(modifierOption.groupId, groupId)));
}

/**
 * De qué tipo es una lista. `null` si no existe o es de otra tienda.
 *
 * Lo consulta el servidor antes de crear una opción: qué campos son obligatorios depende de
 * esto, y el navegador manda **qué** quiere guardar, nunca **si** vale (regla 1 aplicada al
 * catálogo).
 */
export async function tipoDeLista(
  storeId: string,
  groupId: string,
): Promise<"seleccion" | "upsell" | null> {
  const [fila] = await db
    .select({ tipo: modifierGroup.tipo })
    .from(modifierGroup)
    .where(and(eq(modifierGroup.storeId, storeId), eq(modifierGroup.id, groupId)));

  return fila?.tipo ?? null;
}

/** Los productos ya ofrecidos por una lista, para no enganchar el mismo dos veces. */
export async function productosDeLista(
  storeId: string,
  groupId: string,
): Promise<{ id: string; productoRef: string | null }[]> {
  return db
    .select({ id: modifierOption.id, productoRef: modifierOption.productoRef })
    .from(modifierOption)
    .where(and(eq(modifierOption.storeId, storeId), eq(modifierOption.groupId, groupId)));
}

/**
 * La lista a la que pertenece una opción, para poder buscar sus hermanas al renombrarla.
 *
 * Devuelve el **tipo** al lado y no solo el id: qué se puede hacer con una opción depende de
 * si su lista ofrece texto o productos —guardar valida cosas distintas y quitar solo existe en
 * las de upsell—, y eso se decide en el servidor, nunca creyéndole al navegador.
 */
export async function listaDeOpcion(
  storeId: string,
  opcionId: string,
): Promise<{ id: string; tipo: "seleccion" | "upsell" } | null> {
  const [fila] = await db
    .select({ id: modifierGroup.id, tipo: modifierGroup.tipo })
    .from(modifierOption)
    .innerJoin(modifierGroup, eq(modifierGroup.id, modifierOption.groupId))
    .where(and(eq(modifierOption.storeId, storeId), eq(modifierOption.id, opcionId)));

  return fila ?? null;
}

// ------------------------------------------------------------
// Mutaciones — listas
// ------------------------------------------------------------

/**
 * Una lista nace vacía, del tipo que se le pida.
 *
 * El `tipo` decide qué son sus opciones y no se puede cambiar después: en una `seleccion` son
 * texto con precio —salsas, toppings, sabores— y en una `upsell` son punteros a productos de
 * la carta (regla 8). Convertir una en otra dejaría opciones que no significan nada en su
 * nuevo tipo; se archiva la vieja y se crea la nueva.
 */
export async function crearLista(
  storeId: string,
  nombre: string,
  tipo: "seleccion" | "upsell" = "seleccion",
): Promise<{ id: string }> {
  const [fila] = await db
    .insert(modifierGroup)
    .values({ storeId, nombre, tipo })
    .returning({ id: modifierGroup.id });

  return fila;
}

export async function renombrarLista(
  storeId: string,
  groupId: string,
  nombre: string,
): Promise<boolean> {
  const filas = await db
    .update(modifierGroup)
    .set({ nombre })
    .where(and(eq(modifierGroup.storeId, storeId), eq(modifierGroup.id, groupId)))
    .returning({ id: modifierGroup.id });

  return filas.length > 0;
}

/**
 * El texto que explica la lista en la ficha del cliente.
 *
 * `null` borra la explicación, y es lo que llega cuando el campo se deja vacío: así "sin texto"
 * es un solo valor y no dos —la cadena vacía pintaría un párrafo de cero altura con su margen.
 */
export async function guardarAyudaLista(
  storeId: string,
  groupId: string,
  ayuda: string | null,
): Promise<boolean> {
  const filas = await db
    .update(modifierGroup)
    .set({ ayuda })
    .where(and(eq(modifierGroup.storeId, storeId), eq(modifierGroup.id, groupId)))
    .returning({ id: modifierGroup.id });

  return filas.length > 0;
}

/**
 * Archivar o desarchivar. No saca la lista de los productos que ya la usan —eso dejaría un
 * churro exigiendo una salsa que no puede ofrecer (regla 4)—: solo la esconde de donde se
 * eligen listas nuevas.
 */
export async function cambiarActivaLista(
  storeId: string,
  groupId: string,
  activo: boolean,
): Promise<boolean> {
  const filas = await db
    .update(modifierGroup)
    .set({ activo })
    .where(and(eq(modifierGroup.storeId, storeId), eq(modifierGroup.id, groupId)))
    .returning({ id: modifierGroup.id });

  return filas.length > 0;
}

// ------------------------------------------------------------
// Mutaciones — opciones
// ------------------------------------------------------------

/** El siguiente hueco al final de una lista, calculado en la misma sentencia. */
function ordenAlFinal(groupId: string) {
  return sql<number>`(SELECT COALESCE(MAX(orden) + 1, 0) FROM modifier_option WHERE group_id = ${groupId})`;
}

/**
 * `null` si la lista no existe o es de otra tienda.
 *
 * La comprobación no es paranoia: el `groupId` llega del navegador, y sin ella una opción
 * entraría en el grupo de otra tienda llevando NUESTRO `store_id`, que es justo la mentira
 * que la regla 5 existe para evitar. `sincronizarEngancles` hace lo mismo con los suyos.
 */
export async function crearOpcion(
  storeId: string,
  groupId: string,
  datos: { nombre: string; precioDelta: number; productoRef?: string | null },
): Promise<{ id: string } | null> {
  return db.transaction(async (tx) => {
    const [lista] = await tx
      .select({ id: modifierGroup.id })
      .from(modifierGroup)
      .where(and(eq(modifierGroup.storeId, storeId), eq(modifierGroup.id, groupId)));

    if (!lista) return null;

    // El producto que se ofrece se comprueba por lo mismo que el grupo: llega del navegador, y
    // sin esto una opción podría apuntar al producto de otra tienda (regla 5). La FK sola no
    // basta — es a `product.id`, que no sabe de tiendas.
    if (datos.productoRef && !(await esProductoDeLaTienda(tx, storeId, datos.productoRef))) {
      return null;
    }

    const [fila] = await tx
      .insert(modifierOption)
      .values({
        storeId,
        groupId,
        nombre: datos.nombre,
        precioDelta: datos.precioDelta,
        productoRef: datos.productoRef ?? null,
        orden: ordenAlFinal(groupId),
      })
      .returning({ id: modifierOption.id });

    return fila;
  });
}

/** Si ese producto existe y es de esta tienda. Ver la llamada en `crearOpcion`. */
async function esProductoDeLaTienda(
  tx: Pick<typeof db, "select">,
  storeId: string,
  productId: string,
): Promise<boolean> {
  const [fila] = await tx
    .select({ id: product.id })
    .from(product)
    .where(and(eq(product.storeId, storeId), eq(product.id, productId)));

  return Boolean(fila);
}

/**
 * El `group_id` no se puede cambiar: mover una opción de lista cambiaría lo que ofrece cada
 * producto enganchado a las dos, sin que nadie lo pidiera. Se apaga y se crea en la otra.
 */
export async function actualizarOpcion(
  storeId: string,
  opcionId: string,
  datos: { nombre: string; precioDelta: number; productoRef?: string | null },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    if (datos.productoRef && !(await esProductoDeLaTienda(tx, storeId, datos.productoRef))) {
      return false;
    }

    const filas = await tx
      .update(modifierOption)
      .set({
        nombre: datos.nombre,
        precioDelta: datos.precioDelta,
        // `undefined` deja la columna como está: así una opción de salsa, que nunca manda este
        // campo, no puede perder por accidente un `producto_ref` que no le corresponde tener.
        productoRef: datos.productoRef,
      })
      .where(and(eq(modifierOption.storeId, storeId), eq(modifierOption.id, opcionId)))
      .returning({ id: modifierOption.id });

    return filas.length > 0;
  });
}

/**
 * El ÚNICO DELETE del archivo, y solo lo usan las listas de upsell — quien lo hace cumplir es
 * `quitarOpcion` en las acciones.
 *
 * **No contradice la regla 9, que habla de catálogo.** Una salsa o un sabor son catálogo: al
 * borrarlos se pierde lo que significaba un pedido viejo, y por eso se apagan. Una opción de
 * upsell es *configuración de la oferta*: un puntero a un producto que sigue entero en la
 * Carta con toda su historia, y lo único que desaparece al quitarla es que se ofrezca encima
 * de un churro. Es el mismo trato que ya reciben los enganches, que `sincronizarEngancles`
 * borra sin más al apagar un upsell en un producto.
 *
 * Y no rompe nada hacia atrás: **ninguna tabla apunta a `modifier_option.id`** —no hay una sola
 * FK— porque lo que el pedido guarda son nombres y precios dentro del snapshot (regla 2).
 */
export async function eliminarOpcion(storeId: string, opcionId: string): Promise<boolean> {
  const filas = await db
    .delete(modifierOption)
    .where(and(eq(modifierOption.storeId, storeId), eq(modifierOption.id, opcionId)))
    .returning({ id: modifierOption.id });

  return filas.length > 0;
}

/**
 * Reescribe el orden de una lista entera, igual que `reordenarProductos`: mover un elemento
 * cambia el número de varios vecinos, y hacerlo con updates sueltos deja órdenes repetidos
 * si algo falla a mitad.
 *
 * El `group_id` en el WHERE impide que un id de otra lista se cuele y salga renumerado.
 */
export async function reordenarOpciones(
  storeId: string,
  groupId: string,
  idsEnOrden: string[],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (let i = 0; i < idsEnOrden.length; i++) {
      await tx
        .update(modifierOption)
        .set({ orden: i })
        .where(
          and(
            eq(modifierOption.storeId, storeId),
            eq(modifierOption.groupId, groupId),
            eq(modifierOption.id, idsEnOrden[i]),
          ),
        );
    }
  });
}
