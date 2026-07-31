"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  actualizarZona,
  cambiarActivaZona,
  crearZona,
  guardarUbicacionTienda,
  reordenarZonas,
  validarPoligono,
} from "@/db/queries/zonas";
import { exigirRol } from "@/lib/autorizacion";
import { esPuntoValido } from "@/lib/zonas";

/**
 * Zonas de cobertura. **Todo aquí es de admin** (`exigirRol("admin")`): la tabla de
 * permisos de CLAUDE.md le niega al colaborador hasta la lectura, porque estas figuras
 * deciden cuánto se cobra.
 *
 * Regla 15 — el panel traduce: quien usa esta pantalla dibuja, nombra y pone un precio.
 * Que por debajo eso sea un `geometry(Polygon,4326)` con índice GiST no aparece por ningún
 * lado, y `prioridad` se maneja reordenando la lista, nunca escribiendo el número.
 */

export type ResultadoZona = { ok: true } | { ok: false; error: string };

const HEX = /^#[0-9a-fA-F]{6}$/;

const zonaSchema = z.object({
  id: z.string().uuid().optional(),
  nombre: z.string().trim().min(1, "Ponle un nombre").max(60, "Máximo 60 caracteres"),
  // Regla 13: no existe zona a $0. El CHECK de la base dice lo mismo; esto es para que el
  // admin lea un mensaje en vez de un error de Postgres.
  precio: z.number().int("Sin decimales").positive("El domicilio siempre se cobra"),
  color: z.string().regex(HEX, "Color inválido").nullable(),
  poligono: z.string().min(1, "Dibuja la zona en el mapa"),
});

export async function guardarZona(entrada: unknown): Promise<ResultadoZona> {
  const sesion = await exigirRol("admin");

  const parsed = zonaSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const { id, ...datos } = parsed.data;

  // Antes de tocar la tabla: PostGIS es el único que sabe si el contorno se cruza.
  const figura = await validarPoligono(datos.poligono);
  if (!figura.ok) return { ok: false, error: figura.motivo };

  try {
    if (id) {
      const cambiada = await actualizarZona(sesion.storeId, id, datos);
      if (!cambiada) return { ok: false, error: "Esa zona ya no existe." };
    } else {
      await crearZona(sesion.storeId, datos);
    }
  } catch (error) {
    // El UNIQUE (store_id, nombre) es la colisión que el admin va a provocar de verdad,
    // repitiendo un barrio sin darse cuenta.
    if (violaConstraint(error, "delivery_zone_store_id_nombre_key")) {
      return { ok: false, error: "Ya existe una zona con ese nombre." };
    }
    throw error;
  }

  revalidar();
  return { ok: true };
}

export async function cambiarActiva(entrada: {
  id: string;
  activa: boolean;
}): Promise<ResultadoZona> {
  const sesion = await exigirRol("admin");

  const parsed = z.object({ id: z.string().uuid(), activa: z.boolean() }).safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const cambiada = await cambiarActivaZona(sesion.storeId, parsed.data.id, parsed.data.activa);
  if (!cambiada) return { ok: false, error: "Esa zona ya no existe." };

  revalidar();
  return { ok: true };
}

export async function reordenar(entrada: { ids: string[] }): Promise<ResultadoZona> {
  const sesion = await exigirRol("admin");

  const parsed = z.object({ ids: z.array(z.string().uuid()).max(200) }).safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  await reordenarZonas(sesion.storeId, parsed.data.ids);

  revalidar();
  return { ok: true };
}

export async function fijarUbicacionTienda(entrada: {
  lat: number;
  lng: number;
}): Promise<ResultadoZona> {
  const sesion = await exigirRol("admin");

  if (!esPuntoValido(entrada)) return { ok: false, error: "Ubicación inválida" };

  await guardarUbicacionTienda(sesion.storeId, entrada);

  revalidar();
  return { ok: true };
}

function revalidar() {
  revalidatePath("/admin/zonas");
  // El checkout muestra el costo del domicilio: si cambia una zona, tiene que enterarse.
  revalidatePath("/checkout");
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
