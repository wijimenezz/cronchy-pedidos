import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { modifierGroup, modifierOption } from "@/db/schema";

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
 * Nada se borra (regla 9). No hay DELETE de lista ni de opción: `activo = false` archiva la
 * lista y `disponible = false` apaga la opción, y las dos cosas son reversibles de un clic.
 * Borrar además sería destructivo de verdad: las dos FK que apuntan a `modifier_group` son
 * ON DELETE CASCADE, así que quitar una lista se llevaría en silencio los enganches de todos
 * los productos que la usaban.
 */

// ------------------------------------------------------------
// Lecturas
// ------------------------------------------------------------

export type OpcionDelPanel = {
  id: string;
  nombre: string;
  precioDelta: number;
  disponible: boolean;
  orden: number;
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
        columns: { id: true, nombre: true, precioDelta: true, disponible: true, orden: true },
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
    opciones: g.modifierOptions,
  }));
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

/** La lista a la que pertenece una opción, para poder buscar sus hermanas al renombrarla. */
export async function listaDeOpcion(storeId: string, opcionId: string): Promise<string | null> {
  const [fila] = await db
    .select({ groupId: modifierOption.groupId })
    .from(modifierOption)
    .where(and(eq(modifierOption.storeId, storeId), eq(modifierOption.id, opcionId)));

  return fila?.groupId ?? null;
}

// ------------------------------------------------------------
// Mutaciones — listas
// ------------------------------------------------------------

/**
 * Una lista nace vacía y de tipo `seleccion`.
 *
 * `upsell` no se crea desde aquí: sus opciones no son texto sino productos de la carta
 * (regla 8), y eso es otro editor. Las que ya existen se leen, pero no se crean.
 */
export async function crearLista(storeId: string, nombre: string): Promise<{ id: string }> {
  const [fila] = await db
    .insert(modifierGroup)
    .values({ storeId, nombre, tipo: "seleccion" })
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
  datos: { nombre: string; precioDelta: number },
): Promise<{ id: string } | null> {
  return db.transaction(async (tx) => {
    const [lista] = await tx
      .select({ id: modifierGroup.id })
      .from(modifierGroup)
      .where(and(eq(modifierGroup.storeId, storeId), eq(modifierGroup.id, groupId)));

    if (!lista) return null;

    const [fila] = await tx
      .insert(modifierOption)
      .values({
        storeId,
        groupId,
        nombre: datos.nombre,
        precioDelta: datos.precioDelta,
        orden: ordenAlFinal(groupId),
      })
      .returning({ id: modifierOption.id });

    return fila;
  });
}

/**
 * El `group_id` no se puede cambiar: mover una opción de lista cambiaría lo que ofrece cada
 * producto enganchado a las dos, sin que nadie lo pidiera. Se apaga y se crea en la otra.
 */
export async function actualizarOpcion(
  storeId: string,
  opcionId: string,
  datos: { nombre: string; precioDelta: number },
): Promise<boolean> {
  const filas = await db
    .update(modifierOption)
    .set({ nombre: datos.nombre, precioDelta: datos.precioDelta })
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
