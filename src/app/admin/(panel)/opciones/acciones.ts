"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  actualizarOpcion,
  cambiarActivaLista,
  crearLista,
  crearOpcion,
  eliminarOpcion,
  guardarAyudaLista,
  listaDeOpcion,
  listarProductosParaUpsell,
  nombresDeListas,
  nombresDeOpciones,
  productosDeLista,
  renombrarLista,
  reordenarOpciones,
  tipoDeLista,
} from "@/db/queries/opciones";
import { cambiarDisponibilidadOpcion } from "@/db/queries/disponibilidad";
import { exigirRol } from "@/lib/autorizacion";
import { slugify } from "@/lib/texto";
import { idSchema } from "@/lib/validaciones";

/**
 * El CRUD de las listas de opciones: salsas, toppings, sabores.
 *
 * Todo es `exigirRol("admin")` menos `marcarOpcionDisponible`, que es la operación diaria
 * del colaborador —"hoy no hay mora"— exactamente igual que `marcarDisponible` en el CRUD de
 * productos (regla 12 y la tabla de permisos de CLAUDE.md). El `proxy.ts` protege la ruta,
 * pero quien de verdad corta es este `exigirRol`: una server action se puede invocar sin
 * pasar por la pantalla.
 *
 * Los mensajes van todos en español, incluidos los de Zod: se devuelven tal cual al panel.
 */

export type ResultadoOpciones = { ok: true } | { ok: false; error: string };
export type ResultadoCreacionOpciones = { ok: true; id: string } | { ok: false; error: string };

const nombreSchema = z.string().trim().min(1, "Ponle un nombre").max(80, "Máximo 80 caracteres");

/**
 * El `precio_delta` de una opción: lo que cuesta pedirla como adicional. Hoy las cinco
 * salsas y los cuatro toppings valen $2.000 aquí, y los sabores de helado $0.
 *
 * No siempre es lo que se cobra: en modo incluido el precio efectivo es 0, y en modo
 * adicional gana el `precio_unitario` que el producto haya fijado para toda la lista
 * (regla 3). Entero, como todo el dinero de este proyecto (regla 7).
 */
const precioSchema = z
  .number()
  .int("Sin decimales, los precios son pesos enteros")
  .min(0, "El precio no puede ser negativo")
  .max(10_000_000, "Ese precio no parece real");

// ------------------------------------------------------------
// Listas
// ------------------------------------------------------------

/**
 * El tipo se fija al crear y no se cambia después (ver `crearLista`). Por defecto, opciones
 * escritas: es lo que se crea casi siempre, y una lista de productos es la rareza.
 */
const tipoListaSchema = z.enum(["seleccion", "upsell"]).default("seleccion");

export async function crearListaNueva(entrada: unknown): Promise<ResultadoCreacionOpciones> {
  const sesion = await exigirRol("admin");

  const parsed = z.object({ nombre: nombreSchema, tipo: tipoListaSchema }).safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const ocupados = await nombresDeListas(sesion.storeId);
  if (repetido(parsed.data.nombre, ocupados)) {
    return { ok: false, error: "Ya existe una lista con ese nombre." };
  }

  const { id } = await crearLista(sesion.storeId, parsed.data.nombre, parsed.data.tipo);

  revalidar();
  return { ok: true, id };
}

export async function renombrarListaExistente(entrada: unknown): Promise<ResultadoOpciones> {
  const sesion = await exigirRol("admin");

  const parsed = z.object({ id: idSchema, nombre: nombreSchema }).safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const ocupados = await nombresDeListas(sesion.storeId);
  if (repetido(parsed.data.nombre, ocupados, parsed.data.id)) {
    return { ok: false, error: "Ya existe otra lista con ese nombre." };
  }

  const cambiada = await renombrarLista(sesion.storeId, parsed.data.id, parsed.data.nombre);
  if (!cambiada) return { ok: false, error: "Esa lista ya no existe." };

  revalidar();
  return { ok: true };
}

/**
 * Lo que el cliente lee bajo el título de la sección en la ficha.
 *
 * Vacío se guarda como `null` —"esta lista se entiende sola"—, que es el estado de casi todas.
 * El tope de 200 es de forma, no de dominio: esto es un subtítulo de una línea, y si hace falta
 * más párrafo el sitio es la descripción del producto.
 */
export async function guardarAyudaDeLista(entrada: unknown): Promise<ResultadoOpciones> {
  const sesion = await exigirRol("admin");

  const parsed = z
    .object({
      id: idSchema,
      ayuda: z
        .string()
        .max(200, "Máximo 200 caracteres: es un subtítulo, no un párrafo")
        .transform((v) => v.trim() || null),
    })
    .safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const cambiada = await guardarAyudaLista(sesion.storeId, parsed.data.id, parsed.data.ayuda);
  if (!cambiada) return { ok: false, error: "Esa lista ya no existe." };

  revalidar();
  return { ok: true };
}

/**
 * Archivar y desarchivar. A un clic y sin confirmación —como todos los interruptores del
 * panel— porque es reversible y no toca la carta: los productos que ya usan la lista la
 * siguen ofreciendo. Lo único que cambia es que deja de poder engancharse a productos
 * nuevos y desaparece de "Qué hay hoy".
 */
export async function archivarLista(entrada: {
  id: string;
  activo: boolean;
}): Promise<ResultadoOpciones> {
  const sesion = await exigirRol("admin");

  const parsed = z.object({ id: idSchema, activo: z.boolean() }).safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const cambiada = await cambiarActivaLista(sesion.storeId, parsed.data.id, parsed.data.activo);
  if (!cambiada) return { ok: false, error: "Esa lista ya no existe." };

  revalidar();
  return { ok: true };
}

// ------------------------------------------------------------
// Opciones
// ------------------------------------------------------------

/**
 * Lo que llega del formulario. Los tres campos son opcionales **aquí** porque cuáles hacen
 * falta lo decide el tipo de la lista, y ese se consulta en la base: una lista de salsas pide
 * nombre y precio, y una de upsell pide un producto.
 *
 * No es un `discriminatedUnion` sobre un campo del cliente a propósito. El navegador diría de
 * qué tipo es la lista y eso es justo lo que no se le puede creer — es la regla 1 leída sobre
 * el catálogo: manda **qué** quiere guardar, nunca **si** vale.
 */
const camposOpcion = {
  nombre: nombreSchema.optional(),
  precioDelta: precioSchema.optional(),
  productoRef: idSchema.optional(),
};

/**
 * Qué escribir en la fila, según el tipo de la lista.
 *
 * En una de **upsell** el producto es obligatorio: sin `producto_ref` el checkout no puede
 * calcular el pedido —`calcularItem` devuelve `upsell_sin_producto`— y el cliente se queda
 * mirando un error al confirmar.
 *
 * El `nombre` se copia del producto, y **el `precioDelta` también: se le escribe el
 * `precio_base`**. Parece redundante porque un upsell se cobra por el precio del producto
 * (regla 8) y esa cifra no se muestra en ningún sitio, pero no lo es: si la selección del
 * upsell llegara dentro de la del producto base en vez de como línea propia,
 * `calcularItem` la cobra por `precioEfectivoOpcion`, que es este delta. Dejarlo en 0 haría que
 * ese camino regalara la bebida. Copiar el precio lo deja diciendo la verdad por los dos lados.
 *
 * Ojo: esa copia envejece si luego suben el producto en la Carta. No se sincroniza sola —sería
 * un disparador sobre `product` para una cifra que hoy nadie lee— y no importa mientras el
 * checkout mande los upsell como líneas propias, que es lo que hace.
 */
type DatosDeOpcion = { nombre: string; precioDelta: number; productoRef?: string | null };

async function datosSegunTipo(
  storeId: string,
  tipo: "seleccion" | "upsell",
  campos: { nombre?: string; precioDelta?: number; productoRef?: string },
  opcionesDeLaLista: { id: string; productoRef: string | null }[],
  exceptoId?: string,
): Promise<{ ok: true; datos: DatosDeOpcion } | { ok: false; error: string }> {
  if (tipo === "seleccion") {
    if (campos.productoRef) {
      return { ok: false, error: "Esta lista es de opciones escritas, no de productos." };
    }
    if (!campos.nombre) return { ok: false, error: "Ponle un nombre" };

    return { ok: true, datos: { nombre: campos.nombre, precioDelta: campos.precioDelta ?? 0 } };
  }

  if (!campos.productoRef) return { ok: false, error: "Elige el producto que se va a ofrecer." };

  const yaOfrecido = opcionesDeLaLista.some(
    (o) => o.id !== exceptoId && o.productoRef === campos.productoRef,
  );
  if (yaOfrecido) {
    return { ok: false, error: "Esa lista ya ofrece ese producto." };
  }

  const producto = (await listarProductosParaUpsell(storeId)).find(
    (p) => p.id === campos.productoRef,
  );
  if (!producto) return { ok: false, error: "Ese producto ya no existe." };

  return {
    ok: true,
    datos: { nombre: producto.nombre, precioDelta: producto.precioBase, productoRef: producto.id },
  };
}

export async function crearOpcionNueva(entrada: unknown): Promise<ResultadoCreacionOpciones> {
  const sesion = await exigirRol("admin");

  const parsed = z.object({ groupId: idSchema, ...camposOpcion }).safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const { groupId, ...campos } = parsed.data;

  const tipo = await tipoDeLista(sesion.storeId, groupId);
  if (!tipo) return { ok: false, error: "Esa lista ya no existe." };

  const resuelto = await datosSegunTipo(
    sesion.storeId,
    tipo,
    campos,
    await productosDeLista(sesion.storeId, groupId),
  );
  if (!resuelto.ok) return resuelto;

  const ocupados = await nombresDeOpciones(sesion.storeId, groupId);
  if (repetido(resuelto.datos.nombre, ocupados)) {
    return { ok: false, error: "Esa lista ya tiene una opción con ese nombre." };
  }

  const creada = await crearOpcion(sesion.storeId, groupId, resuelto.datos);
  if (!creada) return { ok: false, error: "Esa lista ya no existe." };

  revalidar();
  return { ok: true, id: creada.id };
}

export async function guardarOpcion(entrada: unknown): Promise<ResultadoOpciones> {
  const sesion = await exigirRol("admin");

  const parsed = z.object({ id: idSchema, ...camposOpcion }).safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const { id, ...campos } = parsed.data;

  const lista = await listaDeOpcion(sesion.storeId, id);
  if (!lista) return { ok: false, error: "Esa opción ya no existe." };

  const resuelto = await datosSegunTipo(
    sesion.storeId,
    lista.tipo,
    campos,
    await productosDeLista(sesion.storeId, lista.id),
    id,
  );
  if (!resuelto.ok) return resuelto;

  const ocupados = await nombresDeOpciones(sesion.storeId, lista.id);
  if (repetido(resuelto.datos.nombre, ocupados, id)) {
    return { ok: false, error: "Esa lista ya tiene otra opción con ese nombre." };
  }

  const guardada = await actualizarOpcion(sesion.storeId, id, resuelto.datos);
  if (!guardada) return { ok: false, error: "Esa opción ya no existe." };

  revalidar();
  return { ok: true };
}

/**
 * Quitar un producto de una lista de upsell. Borra la fila de verdad.
 *
 * **Solo en las listas de upsell, y quien lo corta es esto y no la UI**: en una de salsas la
 * regla 9 sigue entera, así que el error nombra la salida —apagarla— igual que hace
 * `eliminarProducto` cuando toca decir "ocúltalo". El porqué de que aquí sí se pueda borrar
 * está en el docblock de `eliminarOpcion`.
 */
export async function quitarOpcion(entrada: { id: string }): Promise<ResultadoOpciones> {
  const sesion = await exigirRol("admin");

  const parsed = z.object({ id: idSchema }).safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const lista = await listaDeOpcion(sesion.storeId, parsed.data.id);
  if (!lista) return { ok: false, error: "Esa opción ya no existe." };

  if (lista.tipo !== "upsell") {
    return {
      ok: false,
      error: "Las opciones de esta lista no se quitan: apágala con el interruptor.",
    };
  }

  const quitada = await eliminarOpcion(sesion.storeId, parsed.data.id);
  if (!quitada) return { ok: false, error: "Esa opción ya no existe." };

  revalidar();
  return { ok: true };
}

export async function reordenarOpcionesDeLista(entrada: {
  groupId: string;
  ids: string[];
}): Promise<ResultadoOpciones> {
  const sesion = await exigirRol("admin");

  const parsed = z
    .object({ groupId: idSchema, ids: z.array(idSchema).max(200) })
    .safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  await reordenarOpciones(sesion.storeId, parsed.data.groupId, parsed.data.ids);

  revalidar();
  return { ok: true };
}

/** Lo único de esta pantalla que puede tocar un colaborador: el sabor que se acabó. */
export async function marcarOpcionDisponible(entrada: {
  id: string;
  disponible: boolean;
}): Promise<ResultadoOpciones> {
  const sesion = await exigirRol("colaborador");

  const parsed = z.object({ id: idSchema, disponible: z.boolean() }).safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const cambiada = await cambiarDisponibilidadOpcion(
    sesion.storeId,
    parsed.data.id,
    parsed.data.disponible,
  );
  if (!cambiada) return { ok: false, error: "Esa opción ya no existe." };

  revalidar();
  return { ok: true };
}

// ------------------------------------------------------------

function revalidar() {
  // La carta es ISR y cada ficha lista las opciones de sus grupos: sin esto, una salsa nueva
  // tardaría hasta un minuto en aparecer y una apagada se seguiría pudiendo pedir.
  revalidatePath("/");
  revalidatePath("/admin/opciones");
  // "Qué hay hoy" pinta estas mismas listas y mueve la misma columna `disponible`.
  revalidatePath("/admin/catalogo");
  // La Carta usa `listarGruposEnganchables` para el desplegable de adiciones.
  revalidatePath("/admin/productos");
}

/**
 * ¿Choca este nombre con alguno de los que ya hay? Se compara por `slugify`, no letra a
 * letra: "Salsas", "salsas" y "Sálsas" son la misma lista para cualquiera que las mire en un
 * desplegable, y tener las tres es peor que no poder crear la segunda.
 *
 * `exceptoId` es la propia fila al renombrar; sin él, confirmar el mismo nombre sin haberlo
 * tocado respondería "ya existe otra lista con ese nombre".
 */
function repetido(
  nombre: string,
  ocupados: { id: string; nombre: string }[],
  exceptoId?: string,
): boolean {
  const buscado = clave(nombre);

  return ocupados.some((o) => o.id !== exceptoId && clave(o.nombre) === buscado);
}

/** `slugify` devuelve "" para un nombre que sea solo emojis; ahí se cae al texto en crudo,
 *  que al menos distingue 🔥 de 🍫 en vez de declararlos iguales. */
function clave(nombre: string): string {
  return slugify(nombre) || nombre.trim().toLowerCase();
}
