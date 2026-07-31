import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { deliveryZone, store } from "@/db/schema";

/**
 * Las zonas vistas desde el panel. El cálculo del domicilio NO vive aquí: eso es
 * `src/lib/zonas.ts` (regla 13). Esto es solo el CRUD que alimenta el mapa.
 *
 * La geometría viaja siempre como GeoJSON en texto, porque es lo que Leaflet entiende y lo
 * único que sobrevive al salto servidor → navegador. Convertir es cosa de PostGIS
 * (`ST_AsGeoJSON` al leer, `ST_GeomFromGeoJSON` al escribir).
 */

export type ZonaDelPanel = {
  id: string;
  nombre: string;
  precio: number;
  prioridad: number;
  color: string | null;
  activa: boolean;
  /** GeoJSON del polígono, o null si todavía no se ha dibujado. */
  poligono: string | null;
};

export async function listarZonas(storeId: string): Promise<ZonaDelPanel[]> {
  const filas = await db.execute<ZonaDelPanel>(sql`
    SELECT id, nombre, precio, prioridad, color, activa,
           ST_AsGeoJSON(poligono) AS poligono
      FROM delivery_zone
     WHERE store_id = ${storeId}
     ORDER BY prioridad, nombre
  `);

  return [...filas];
}

/**
 * Un polígono que se cruza a sí mismo hace que `ST_Covers` responda cualquier cosa, así que
 * se rechaza antes de guardarlo. `ST_IsValid` es de PostGIS: no hay forma honesta de
 * comprobarlo en JavaScript.
 *
 * También se descarta lo que no sea un polígono —Geoman puede emitir líneas o círculos— y
 * el GeoJSON malformado, que haría fallar a `ST_GeomFromGeoJSON` con un error de driver en
 * vez de un mensaje que el admin entienda.
 */
export async function validarPoligono(
  geojson: string,
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  try {
    const [fila] = await db.execute<{ valido: boolean; tipo: string; razon: string | null }>(sql`
      SELECT ST_IsValid(g) AS valido,
             GeometryType(g) AS tipo,
             ST_IsValidReason(g) AS razon
        FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON(${geojson}), 4326) AS g) t
    `);

    if (!fila) return { ok: false, motivo: "No se pudo leer la figura." };
    if (fila.tipo !== "POLYGON") {
      return { ok: false, motivo: "La zona tiene que ser un polígono cerrado." };
    }
    if (!fila.valido) {
      return { ok: false, motivo: `El contorno se cruza a sí mismo (${fila.razon}).` };
    }

    return { ok: true };
  } catch {
    return { ok: false, motivo: "No se pudo leer la figura." };
  }
}

export async function crearZona(
  storeId: string,
  datos: { nombre: string; precio: number; color: string | null; poligono: string },
): Promise<{ id: string }> {
  // La prioridad de una zona nueva la deja al final: recién dibujada no debería ganarle a
  // ninguna de las que ya estaban afinadas.
  const [fila] = await db.execute<{ id: string }>(sql`
    INSERT INTO delivery_zone (store_id, nombre, precio, color, prioridad, poligono)
    VALUES (
      ${storeId}, ${datos.nombre}, ${datos.precio}, ${datos.color},
      (SELECT COALESCE(MAX(prioridad) + 1, 0) FROM delivery_zone WHERE store_id = ${storeId}),
      ST_SetSRID(ST_GeomFromGeoJSON(${datos.poligono}), 4326)
    )
    RETURNING id
  `);

  return fila;
}

export async function actualizarZona(
  storeId: string,
  zonaId: string,
  datos: { nombre: string; precio: number; color: string | null; poligono: string },
): Promise<boolean> {
  const filas = await db.execute<{ id: string }>(sql`
    UPDATE delivery_zone
       SET nombre = ${datos.nombre},
           precio = ${datos.precio},
           color = ${datos.color},
           poligono = ST_SetSRID(ST_GeomFromGeoJSON(${datos.poligono}), 4326)
     WHERE store_id = ${storeId} AND id = ${zonaId}
     RETURNING id
  `);

  return filas.length > 0;
}

/** Apagar, nunca borrar (regla 9): un pedido viejo perdería la traza de dónde se entregó. */
export async function cambiarActivaZona(
  storeId: string,
  zonaId: string,
  activa: boolean,
): Promise<boolean> {
  const filas = await db
    .update(deliveryZone)
    .set({ activa })
    .where(and(eq(deliveryZone.storeId, storeId), eq(deliveryZone.id, zonaId)))
    .returning({ id: deliveryZone.id });

  return filas.length > 0;
}

/**
 * Reescribe la prioridad de todas las zonas según el orden recibido.
 *
 * Se guarda la lista entera y no "sube esta una posición" a propósito: mover un elemento
 * cambia el número de varios vecinos, y hacerlo con updates sueltos deja estados
 * intermedios con prioridades repetidas si algo falla a mitad.
 */
export async function reordenarZonas(storeId: string, idsEnOrden: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (let i = 0; i < idsEnOrden.length; i++) {
      await tx
        .update(deliveryZone)
        .set({ prioridad: i })
        .where(and(eq(deliveryZone.storeId, storeId), eq(deliveryZone.id, idsEnOrden[i])));
    }
  });
}

/** El punto de la tienda, en GeoJSON, para centrar los mapas. */
export async function obtenerUbicacionTienda(storeId: string): Promise<string | null> {
  const [fila] = await db.execute<{ ubicacion: string | null }>(sql`
    SELECT ST_AsGeoJSON(ubicacion) AS ubicacion FROM store WHERE id = ${storeId}
  `);

  return fila?.ubicacion ?? null;
}

export async function guardarUbicacionTienda(
  storeId: string,
  punto: { lat: number; lng: number },
): Promise<void> {
  await db
    .update(store)
    .set({ ubicacion: sql`ST_SetSRID(ST_MakePoint(${punto.lng}, ${punto.lat}), 4326)` })
    .where(eq(store.id, storeId));
}
