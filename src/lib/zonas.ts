import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * CÁLCULO DEL DOMICILIO — fuente única de verdad (regla 13 de CLAUDE.md).
 *
 * Mismo trato que `precios.ts`: si necesitas saber qué zona cubre un punto, importa desde
 * aquí. No repliques el `ST_Covers` en una query suelta.
 *
 * La geometría se lee y se escribe siempre con SQL explícito (`ST_AsGeoJSON` /
 * `ST_GeomFromGeoJSON`). El `customType` de `db/tipos-geo.ts` existe solo para que
 * drizzle-kit conozca la columna: un `select` normal devolvería WKB en hexadecimal, que no
 * le sirve ni al mapa ni a nadie.
 */

export type Punto = { lat: number; lng: number };

/**
 * Quien ejecuta la consulta: `db` o una transacción.
 *
 * Existe para los tests, que crean zonas de prueba y hacen ROLLBACK — sin esto tendrían que
 * escribir en la base de verdad y limpiar después, o mockear la query, que no probaría nada
 * porque aquí el cálculo *es* la query.
 */
type Ejecutor = Pick<typeof db, "execute">;

export type ZonaResuelta = {
  id: string;
  nombre: string;
  precio: number;
};

/** Un punto que no es un punto (NaN, fuera de rango) nunca debe llegar a PostGIS. */
export function esPuntoValido(punto: Punto): boolean {
  return (
    Number.isFinite(punto.lat) &&
    Number.isFinite(punto.lng) &&
    punto.lat >= -90 &&
    punto.lat <= 90 &&
    punto.lng >= -180 &&
    punto.lng <= 180
  );
}

/**
 * Qué zona cubre este punto, o `null` si ninguna — que significa fuera de cobertura y, por
 * la regla 14, checkout bloqueado.
 *
 * Decisiones que están en la regla 13 y conviene no tocar sin releerla:
 *
 * - **`ST_Covers` y no `ST_Contains`**: un punto sobre el borde del polígono cuenta como
 *   dentro. `ST_Contains` lo deja fuera, y una casa justo en la frontera de un barrio
 *   quedaría sin cobertura por unos metros.
 * - **Gana la de menor `prioridad`, nunca la más barata.** Los solapamientos son válidos y
 *   deliberados: así se modela "este conjunto cerrado, aunque esté dentro del Centro, se
 *   cobra distinto". Elegir por precio rompería esa intención.
 * - El desempate por `id` hace determinista el resultado cuando dos zonas comparten
 *   prioridad; sin él Postgres puede devolver cualquiera de las dos entre ejecuciones.
 * - Se filtra por `poligono IS NOT NULL`: una zona recién creada y todavía sin dibujar no
 *   cubre nada, y sin este filtro el índice GiST igual la descartaría, pero dejarlo escrito
 *   evita que alguien lo lea como un descuido.
 */
export async function resolverZona(
  storeId: string,
  punto: Punto,
  ejecutor: Ejecutor = db,
): Promise<ZonaResuelta | null> {
  if (!esPuntoValido(punto)) return null;

  const filas = await ejecutor.execute<ZonaResuelta>(sql`
    SELECT id, nombre, precio
      FROM delivery_zone
     WHERE store_id = ${storeId}
       AND activa
       AND poligono IS NOT NULL
       AND ST_Covers(poligono, ST_SetSRID(ST_MakePoint(${punto.lng}, ${punto.lat}), 4326))
     ORDER BY prioridad, id
     LIMIT 1
  `);

  return filas[0] ?? null;
}

/** El link que abre el domiciliario. Google Maps aquí es un link, no una API (regla: nada de sus SDK). */
export function urlMapa(punto: Punto): string {
  return `https://www.google.com/maps?q=${punto.lat},${punto.lng}`;
}

/**
 * Del GeoJSON que devuelve `ST_AsGeoJSON` al par que usa el resto del código.
 *
 * GeoJSON guarda las coordenadas como [lng, lat] y casi todo lo demás las nombra al revés;
 * invertirlas mal es un error silencioso —el punto aterriza en otro continente— así que la
 * conversión vive en un solo sitio.
 */
export function puntoDesdeGeoJSON(geojson: string | null | undefined): Punto | null {
  if (!geojson) return null;

  try {
    const { coordinates } = JSON.parse(geojson) as { coordinates: [number, number] };
    const punto = { lat: coordinates[1], lng: coordinates[0] };

    return esPuntoValido(punto) ? punto : null;
  } catch {
    return null;
  }
}
