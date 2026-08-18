import type { Punto } from "@/lib/zonas";

/**
 * Buscar en el mapa la dirección escrita del local.
 *
 * Es la gemela de `barrioDelPunto` (`lib/barrio.ts`) al revés: aquella pregunta qué hay en un punto
 * y esta dónde está un texto. Comparten servicio —Nominatim, de OpenStreetMap— y las dos reglas que
 * ese servicio impone: identificarse con un `User-Agent` propio y no llamar desde el navegador.
 *
 * **Es un atajo para acercar el mapa, no una forma de acertar el punto.** Medido contra el local
 * real (Calle 17 # 7-44, Balmoral, cuyo pin está en 4.343243, -74.364824):
 *
 * | Búsqueda | Distancia al local |
 * | --- | --- |
 * | `Calle 17 # 7-44, Balmoral` | **1.045 m** |
 * | `Calle 17 7-44` | **789 m** (y lo sitúa en "Managua") |
 * | `Balmoral` | **1.132 m** |
 *
 * O sea: OSM tiene la **calle**, no el **número**, así que devuelve un punto cualquiera de la vía y
 * el error es de cuadras, no de metros. Es la misma pobreza de datos que la regla 14 ya documenta
 * para los barrios —incluido el reaparecer de "Managua", que no existe en la ciudad—, ahora medida
 * también sobre direcciones.
 *
 * Sirve igual: deja el mapa en el barrio correcto en vez de obligar a buscar a ojo por toda
 * Fusagasugá. Pero por eso quien la usa **solo mueve el pin y espera a que el admin lo arrastre**.
 * Guardar este resultado a ciegas sería dejar el local a un kilómetro, y de ese punto sale el mapa
 * que ve el cliente cuando el GPS le falla.
 */

/** El mismo que `barrio.ts`: la política de uso de Nominatim pide identificar la aplicación. */
const USER_AGENT = "CronchyPedidos/1.0 (https://cronchy.com.co)";

/**
 * Cinco segundos, no el segundo y medio de `barrioDelPunto`.
 *
 * Aquel cuelga del checkout del cliente, que está esperando ver el precio de su domicilio, y ahí
 * tardar se nota. Esto lo dispara un admin que acaba de pulsar un botón y sabe que está buscando:
 * cortar a 1,5 s solo conseguiría fallar en una búsqueda que habría salido bien.
 */
const TIMEOUT_MS = 5000;

/**
 * De la respuesta de Nominatim al punto, o `null`.
 *
 * Aparte de la petición para poder probarla con fixtures, igual que `barrioDeRespuesta`.
 *
 * **Todo lo que no sea un par de números creíbles acaba en `null`.** Nominatim manda las
 * coordenadas como texto, y `Number("por ahí")` es `NaN`: guardado como coordenada no falla en
 * ningún sitio, simplemente deja el local en mitad del océano hasta que alguien abre el mapa.
 */
export function puntoDeRespuesta(datos: unknown): Punto | null {
  if (!Array.isArray(datos) || datos.length === 0) return null;

  // El primero: Nominatim los devuelve ordenados por relevancia.
  const primero = datos[0] as { lat?: unknown; lon?: unknown };
  const lat = Number(primero?.lat);
  const lng = Number(primero?.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  return { lat, lng };
}

/**
 * Dónde queda esta dirección, según OpenStreetMap. **Nunca lanza**: cualquier fallo —timeout, 429,
 * un JSON inesperado, Nominatim caído— devuelve `null` y el admin arrastra el pin a mano.
 *
 * `ciudad` se le pega a la búsqueda y el país se fija a Colombia porque sin eso "Calle 17 # 7-44"
 * hace match en media Latinoamérica: la primera coincidencia por relevancia podría estar a mil
 * kilómetros y con la misma pinta de correcta.
 *
 * Vive en el servidor por lo mismo que `barrioDelPunto`: llamarlo desde el navegador expondría la IP
 * de quien lo usa a un tercero y dejaría el `User-Agent` fuera de nuestro control.
 */
export async function buscarUbicacion(direccion: string, ciudad: string): Promise<Punto | null> {
  const texto = direccion.trim();
  if (!texto) return null;

  const url =
    "https://nominatim.openstreetmap.org/search" +
    `?format=jsonv2&limit=1&countrycodes=co&q=${encodeURIComponent(`${texto}, ${ciudad}`)}`;

  try {
    const respuesta = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "es" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!respuesta.ok) return null;

    return puntoDeRespuesta(await respuesta.json());
  } catch {
    // En silencio y a propósito, igual que `barrioDelPunto`: quien llama traduce el `null` a "no
    // encontramos esa dirección", que es lo único accionable que se le puede decir al admin.
    return null;
  }
}
