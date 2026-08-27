"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  actualizarProducto,
  cambiarActivaCategoria,
  cambiarSlugProducto,
  cambiarVisibleProducto,
  crearCategoria,
  crearProducto,
  eliminarProducto,
  enganclesDeProducto,
  guardarBannerCategoria,
  guardarImagenesProducto,
  renombrarCategoria,
  reordenarCategorias,
  reordenarProductos,
  sincronizarEngancles,
  slugsDeCategoria,
  slugsDeProducto,
} from "@/db/queries/catalogo";
import { cambiarDisponibilidadProducto } from "@/db/queries/disponibilidad";
import { exigirRol } from "@/lib/autorizacion";
import { planificarEngancles } from "@/lib/catalogo/engancles";
import { esUrlDeFotoProducto, FOCOS, MAX_FOTOS } from "@/lib/imagenes";
import { borrarFotoProducto } from "@/lib/storage";
import { slugify, slugLibre } from "@/lib/texto";
import { idSchema } from "@/lib/validaciones";
import { porQueNoSeBorra } from "./borrado";

/**
 * El CRUD del catálogo. Casi todo es `exigirRol("admin")`: precios, altas, fotos y
 * enganches deciden cuánto se cobra y qué se ofrece. La única excepción es
 * `marcarDisponible` —el switch de agotado— que es la operación diaria del colaborador
 * (regla 12 y la tabla de permisos de CLAUDE.md).
 *
 * "Oculto" y "Agotado" son dos acciones distintas y no una sola con un enum, precisamente
 * porque tienen dueños distintos: colapsarlas obligaría a decidir el permiso mirando el
 * valor del parámetro, que es la clase de escalada implícita que termina en agujero.
 *
 * Todo cambio revalida `/`, que se sirve con ISR: sin eso, un precio nuevo tardaría hasta
 * un minuto en llegar a la carta y alguien pagaría el viejo.
 */

export type ResultadoCatalogo = { ok: true } | { ok: false; error: string };
export type ResultadoCreacion = { ok: true; id: string } | { ok: false; error: string };

/**
 * Los mensajes de Zod que llegan al admin van SIEMPRE en español.
 *
 * Estas acciones devuelven `parsed.error.issues[0]?.message` tal cual a la pantalla, así
 * que cualquier validador sin mensaje propio filtra el texto por defecto de la librería —en
 * inglés y en jerga— a un panel que está entero en español. Ya pasó una vez: un id que no
 * cumplía RFC 4122 pintó "Invalid UUID" al lado del botón de guardar.
 *
 * Estos topes no los puede alcanzar nadie desde la UI; si saltan es un bug nuestro. Aun
 * así llevan mensaje, porque el que los lea va a ser el dueño del negocio, no un
 * programador.
 */
const DEMASIADOS = "Son demasiados elementos";
const SWITCH = "Ese interruptor tiene un valor raro";


// ------------------------------------------------------------
// Estado del producto
// ------------------------------------------------------------

/** Lo único del catálogo que puede tocar un colaborador. */
export async function marcarDisponible(entrada: {
  id: string;
  disponible: boolean;
}): Promise<ResultadoCatalogo> {
  const sesion = await exigirRol("colaborador");

  const parsed = z.object({ id: idSchema, disponible: z.boolean() }).safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const cambiado = await cambiarDisponibilidadProducto(
    sesion.storeId,
    parsed.data.id,
    parsed.data.disponible,
  );
  if (!cambiado) return { ok: false, error: "Ese producto ya no existe." };

  revalidar();
  return { ok: true };
}

/** Sacar un producto de la carta o devolverlo. Es de admin: cambia lo que se ofrece. */
export async function marcarVisible(entrada: {
  id: string;
  activo: boolean;
}): Promise<ResultadoCatalogo> {
  const sesion = await exigirRol("admin");

  const parsed = z.object({ id: idSchema, activo: z.boolean() }).safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const cambiado = await cambiarVisibleProducto(sesion.storeId, parsed.data.id, parsed.data.activo);
  if (!cambiado) return { ok: false, error: "Ese producto ya no existe." };

  revalidar();
  return { ok: true };
}

// ------------------------------------------------------------
// Producto
// ------------------------------------------------------------

const nombreSchema = z
  .string()
  .trim()
  .min(1, "Ponle un nombre")
  .max(80, "Máximo 80 caracteres");

// El CHECK de la base dice `precio_base >= 0`; esto es para que el admin lea un mensaje
// en vez de un error de Postgres.
const precioSchema = z
  .number()
  .int("Sin decimales, los precios son pesos enteros")
  .min(0, "El precio no puede ser negativo")
  .max(10_000_000, "Ese precio no parece real");

const crearSchema = z.object({
  categoryId: idSchema,
  nombre: nombreSchema,
  precioBase: precioSchema,
});

export async function crearProductoNuevo(entrada: unknown): Promise<ResultadoCreacion> {
  const sesion = await exigirRol("admin");

  const parsed = crearSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const base = slugify(parsed.data.nombre);
  if (!base) return { ok: false, error: "Ese nombre no sirve para armar una URL." };

  const slug = slugLibre(base, await slugsDeProducto(sesion.storeId));

  try {
    const { id } = await crearProducto(sesion.storeId, { ...parsed.data, slug });
    revalidar();
    return { ok: true, id };
  } catch (error) {
    return traducir(error, "producto");
  }
}

const guardarSchema = z.object({
  id: idSchema,
  categoryId: idSchema,
  nombre: nombreSchema,
  descripcion: z
    .string()
    .trim()
    .max(500, "Máximo 500 caracteres")
    .nullable()
    .transform((v) => v || null),
  precioBase: precioSchema,
  recomendado: z.boolean(SWITCH),
  disponibleDelivery: z.boolean(SWITCH),
  disponiblePickup: z.boolean(SWITCH),
});

export async function guardarProducto(entrada: unknown): Promise<ResultadoCatalogo> {
  const sesion = await exigirRol("admin");

  const parsed = guardarSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const { id, ...datos } = parsed.data;

  // Un producto que no se vende ni a domicilio ni en tienda no está "guardado raro": está
  // fuera de la carta, y para eso existe el estado Oculto, que sí es reversible de un clic.
  if (!datos.disponibleDelivery && !datos.disponiblePickup) {
    return {
      ok: false,
      error: "Tiene que venderse al menos por un canal. Si no se vende, ponlo en Oculto.",
    };
  }

  try {
    const guardado = await actualizarProducto(sesion.storeId, id, datos);
    if (!guardado) return { ok: false, error: "Ese producto ya no existe." };
  } catch (error) {
    return traducir(error, "producto");
  }

  revalidar();
  return { ok: true };
}

/**
 * Cambiar la URL pública de un producto. Aparte del formulario a propósito: los clientes
 * comparten `/producto/<slug>` por WhatsApp, y renombrar un producto no debería romper
 * enlaces que ya circulan. Esto es una decisión consciente, con su propio botón y su aviso.
 */
export async function cambiarUrlProducto(entrada: unknown): Promise<ResultadoCatalogo> {
  const sesion = await exigirRol("admin");

  const parsed = z.object({ id: idSchema, slug: z.string().trim().min(1) }).safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const slug = slugify(parsed.data.slug);
  if (!slug) return { ok: false, error: "Esa URL no sirve." };

  try {
    const cambiado = await cambiarSlugProducto(sesion.storeId, parsed.data.id, slug);
    if (!cambiado) return { ok: false, error: "Ese producto ya no existe." };
  } catch (error) {
    return traducir(error, "producto");
  }

  revalidar();
  return { ok: true };
}

export async function reordenarProductosDeCategoria(entrada: {
  categoryId: string;
  ids: string[];
}): Promise<ResultadoCatalogo> {
  const sesion = await exigirRol("admin");

  const parsed = z
    .object({ categoryId: idSchema, ids: z.array(idSchema).max(500) })
    .safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  await reordenarProductos(sesion.storeId, parsed.data.categoryId, parsed.data.ids);

  revalidar();
  return { ok: true };
}

/**
 * El único DELETE del catálogo, y solo para lo que nunca se pidió. La regla y el porqué están en
 * la cabecera de `db/queries/catalogo.ts`; los textos del rechazo, en `borrado.ts`.
 *
 * Es de admin y con confirmación en la UI: es la única acción de esta pantalla sin vuelta atrás.
 */
export async function eliminarProductoDelCatalogo(entrada: {
  id: string;
}): Promise<ResultadoCatalogo> {
  const sesion = await exigirRol("admin");

  const parsed = z.object({ id: idSchema }).safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  let resultado;
  try {
    resultado = await eliminarProducto(sesion.storeId, parsed.data.id);
  } catch (error) {
    return traducirBorrado(error);
  }

  if (resultado.estado !== "ok") {
    return { ok: false, error: porQueNoSeBorra(resultado) };
  }

  // Las fotos del bucket, después de que el borrado esté confirmado y en best-effort, por los
  // mismos motivos que `borrarSobrantes`: la fuente de verdad es la fila, que ya no existe.
  await Promise.all(resultado.imagenes.map(borrarFotoProducto));

  revalidar();
  return { ok: true };
}

// ------------------------------------------------------------
// Fotos
// ------------------------------------------------------------

export async function guardarFotos(entrada: {
  id: string;
  urls: string[];
  focos: string[];
}): Promise<ResultadoCatalogo> {
  const sesion = await exigirRol("admin");

  const parsed = z
    .object({
      id: idSchema,
      urls: z
        .array(z.string("Esa foto no es válida"))
        .max(MAX_FOTOS, `Máximo ${MAX_FOTOS} fotos por producto`)
        // Las URLs vienen del navegador. Sin esta comprobación, la carta pública podría
        // terminar cargando una imagen —o un pixel de rastreo— de un host ajeno.
        .refine((urls) => urls.every(esUrlDeFotoProducto), "Alguna foto no es válida"),
      /**
       * El encuadre de cada foto, por índice.
       *
       * `z.enum` y no una cadena libre porque esto acaba en un atributo `style` de la carta
       * pública: aunque React escape el valor, una lista cerrada es lo que garantiza que ahí solo
       * entra una de las nueve posiciones. Mismo criterio que `esUrlDeFotoProducto` con las URLs.
       */
      focos: z.array(z.enum(FOCOS, "Ese encuadre no existe")),
    })
    // El foco vive por índice: uno de más describiría una foto que no está. Al revés sí vale —un
    // hueco es "nunca se eligió" y se lee como el centro—, y es lo que permite no migrar nada.
    .refine((v) => v.focos.length <= v.urls.length, {
      path: ["focos"],
      message: "Hay más encuadres que fotos",
    })
    .safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const guardado = await guardarImagenesProducto(
    sesion.storeId,
    parsed.data.id,
    parsed.data.urls,
    parsed.data.focos,
  );
  if (!guardado) return { ok: false, error: "Ese producto ya no existe." };

  await borrarSobrantes(guardado.previas, parsed.data.urls);

  revalidar();
  return { ok: true };
}

/**
 * Saca del bucket las fotos que dejaron de estar en la lista.
 *
 * Va DESPUÉS de escribir la columna y no antes: si el UPDATE falla, las fotos siguen
 * siendo válidas y borrarlas habría dejado al producto apuntando a objetos inexistentes.
 * Se ejecuta en best-effort —`borrarFotoProducto` traga sus propios errores— porque la
 * fuente de verdad es la columna: un objeto huérfano son 150 KB del free tier, mientras
 * que reventar aquí tumbaría un guardado que por lo demás salió bien.
 *
 * Se espera (`await`) a propósito: en una función serverless, disparar el fetch sin
 * esperarlo hace que la instancia muera antes de que salga la petición.
 */
async function borrarSobrantes(previas: string[], actuales: string[]): Promise<void> {
  const sobran = previas.filter((url) => !actuales.includes(url));
  await Promise.all(sobran.map(borrarFotoProducto));
}

// ------------------------------------------------------------
// Categorías
// ------------------------------------------------------------

export async function crearCategoriaNueva(entrada: unknown): Promise<ResultadoCreacion> {
  const sesion = await exigirRol("admin");

  const parsed = z.object({ nombre: nombreSchema }).safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const base = slugify(parsed.data.nombre);
  if (!base) return { ok: false, error: "Ese nombre no sirve para armar una URL." };

  const slug = slugLibre(base, await slugsDeCategoria(sesion.storeId));

  try {
    const { id } = await crearCategoria(sesion.storeId, { nombre: parsed.data.nombre, slug });
    revalidar();
    return { ok: true, id };
  } catch (error) {
    return traducir(error, "categoría");
  }
}

export async function renombrarCategoriaExistente(entrada: unknown): Promise<ResultadoCatalogo> {
  const sesion = await exigirRol("admin");

  const parsed = z.object({ id: idSchema, nombre: nombreSchema }).safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  try {
    const cambiada = await renombrarCategoria(sesion.storeId, parsed.data.id, parsed.data.nombre);
    if (!cambiada) return { ok: false, error: "Esa categoría ya no existe." };
  } catch (error) {
    return traducir(error, "categoría");
  }

  revalidar();
  return { ok: true };
}

export async function marcarCategoriaActiva(entrada: {
  id: string;
  activa: boolean;
}): Promise<ResultadoCatalogo> {
  const sesion = await exigirRol("admin");

  const parsed = z.object({ id: idSchema, activa: z.boolean() }).safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const cambiada = await cambiarActivaCategoria(sesion.storeId, parsed.data.id, parsed.data.activa);
  if (!cambiada) return { ok: false, error: "Esa categoría ya no existe." };

  revalidar();
  return { ok: true };
}

export async function reordenarCategoriasDelMenu(entrada: {
  ids: string[];
}): Promise<ResultadoCatalogo> {
  const sesion = await exigirRol("admin");

  const parsed = z.object({ ids: z.array(idSchema).max(100) }).safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  await reordenarCategorias(sesion.storeId, parsed.data.ids);

  revalidar();
  return { ok: true };
}

export async function guardarBanner(entrada: {
  id: string;
  url: string | null;
}): Promise<ResultadoCatalogo> {
  const sesion = await exigirRol("admin");

  const parsed = z
    .object({
      id: idSchema,
      url: z
        .string("Esa imagen no es válida")
        .refine(esUrlDeFotoProducto, "Esa imagen no es válida")
        .nullable(),
    })
    .safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const guardado = await guardarBannerCategoria(sesion.storeId, parsed.data.id, parsed.data.url);
  if (!guardado) return { ok: false, error: "Esa categoría ya no existe." };

  // Reemplazar un banner deja el anterior colgando en el bucket, igual que las fotos.
  await borrarSobrantes(
    guardado.previo ? [guardado.previo] : [],
    parsed.data.url ? [parsed.data.url] : [],
  );

  revalidar();
  return { ok: true };
}

// ------------------------------------------------------------
// Modificadores (regla 15)
// ------------------------------------------------------------

const modificadoresSchema = z
  .object({
    id: idSchema,
    incluidos: z
      .array(
        z.object({
          groupId: idSchema,
          cantidad: z
            .number()
            .int("Tiene que ser un número entero")
            .min(1, "Si no lleva ninguna, quita el grupo")
            .max(20, "Máximo 20"),
        }),
      )
      .max(20, DEMASIADOS),
    // Un tamaño no lleva ni cantidad ni precio: es siempre uno, y lo que cobra sale del
    // `precio_delta` de cada opción, que es lo que hace que el mediano valga más.
    variantes: z.array(z.object({ groupId: idSchema })).max(20, DEMASIADOS),
    adicionales: z
      .array(
        z.object({
          groupId: idSchema,
          hasta: z
            .number()
            .int("Tiene que ser un número entero")
            .min(1, "El tope tiene que ser al menos 1")
            .max(20, "Máximo 20"),
          // `null` = cada opción cobra su propio `precio_delta` (ver `engancles.ts`).
          precio: precioSchema.nullable(),
        }),
      )
      .max(20, DEMASIADOS),
    upsells: z.array(idSchema).max(20, DEMASIADOS),
  })
  .superRefine((v, ctx) => {
    // Dos filas del mismo grupo y el mismo modo colisionarían contra el UNIQUE de la base.
    // No se puede llegar aquí desde la UI, pero el mensaje es mejor que un 500.
    //
    // Las variantes entran en el mismo saco que los adicionales y los upsell: los tres se
    // guardan con `modo = 'adicional'`, así que un grupo puesto como tamaño Y como adicional
    // son dos filas con la misma clave. Aquí se dice con palabras en vez de dejar que reviente
    // el índice.
    for (const [lista, etiqueta] of [
      [v.incluidos.map((i) => i.groupId), "incluidos"],
      [
        [
          ...v.variantes.map((t) => t.groupId),
          ...v.adicionales.map((a) => a.groupId),
          ...v.upsells,
        ],
        "tamaños y adicionales",
      ],
    ] as const) {
      if (new Set(lista).size !== lista.length) {
        ctx.addIssue({ code: "custom", message: `Hay un grupo repetido en ${etiqueta}.` });
      }
    }
  });

/**
 * Guarda "Salsas incluidas: 2 · Toppings incluidos: 1 · ¿Permite adicionales?" y lo traduce
 * a filas de `product_modifier_group` (regla 15). La traducción vive en el servidor:
 * `planificarEngancles` decide qué escribir y qué borrar, y la query lo aplica en una
 * transacción.
 */
export async function guardarModificadores(entrada: unknown): Promise<ResultadoCatalogo> {
  const sesion = await exigirRol("admin");

  const parsed = modificadoresSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const { id, ...config } = parsed.data;

  const actuales = await enganclesDeProducto(sesion.storeId, id);
  if (!actuales) return { ok: false, error: "Ese producto ya no existe." };

  const plan = planificarEngancles(actuales, config);
  const resultado = await sincronizarEngancles(sesion.storeId, id, plan);

  if (resultado === "sin_producto") return { ok: false, error: "Ese producto ya no existe." };
  if (resultado === "grupo_ajeno") return { ok: false, error: "Ese grupo de opciones no existe." };

  revalidar();
  return { ok: true };
}

// ------------------------------------------------------------

function revalidar() {
  // La carta pública es ISR (regla: se revalida al guardar cualquier cambio de catálogo).
  revalidatePath("/");
  revalidatePath("/admin/productos");
  // "Qué hay hoy" mueve las mismas columnas `disponible`.
  revalidatePath("/admin/catalogo");
}

function traducir(error: unknown, que: "producto" | "categoría"): { ok: false; error: string } {
  const constraint = que === "producto" ? "product_store_id_slug_key" : "category_store_id_slug_key";

  if (violaConstraint(error, constraint)) {
    return { ok: false, error: `Ya existe otro ${que} con esa URL.` };
  }
  if (violaConstraint(error, "product_imagenes_check")) {
    return { ok: false, error: `Máximo ${MAX_FOTOS} fotos por producto.` };
  }
  if (violaConstraint(error, "product_precio_base_check")) {
    return { ok: false, error: "El precio no puede ser negativo." };
  }
  throw error;
}

/**
 * El segundo cierre del borrado. `eliminarProducto` ya comprueba las dos referencias que lo
 * impiden, pero entre la comprobación y el DELETE hay una rendija —la cierra el `FOR UPDATE`, no
 * la fe— y si alguna vez se colara, lo que llegaría al panel sería un error de Postgres en
 * inglés. Aquí sale el mismo texto que habría salido por el camino normal.
 */
function traducirBorrado(error: unknown): { ok: false; error: string } {
  if (violaConstraint(error, "order_item_product_id_fkey")) {
    return { ok: false, error: porQueNoSeBorra({ estado: "tiene_ventas" }) };
  }
  // Sin los nombres de las listas: el DELETE ya falló y consultarlas ahora sería otra ida a la
  // base para adornar un caso que no debería ocurrir. El sitio a donde ir se dice igual.
  if (violaConstraint(error, "modifier_option_producto_ref_fkey")) {
    return {
      ok: false,
      error: "Este producto se ofrece como acompañante en alguna lista. Quítalo de ahí en Opciones y vuelve a intentarlo.",
    };
  }
  throw error;
}

/**
 * Drizzle envuelve los errores del driver en un `Failed query:` genérico y deja el original
 * colgando de `cause`, así que buscar el nombre del constraint en el mensaje de arriba no
 * encuentra nada. Se recorre la cadena leyendo el `constraint_name` que expone postgres.js.
 */
function violaConstraint(error: unknown, nombre: string): boolean {
  let actual: unknown = error;

  for (let i = 0; i < 5 && actual instanceof Error; i++) {
    if ((actual as { constraint_name?: string }).constraint_name === nombre) return true;
    actual = actual.cause;
  }

  return false;
}
