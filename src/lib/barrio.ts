import type { Punto } from "@/lib/zonas";

/**
 * Qué barrio hay en un punto, según OpenStreetMap.
 *
 * Es una **sugerencia para rellenar un campo, nunca una fuente de verdad**. Lo que se guarda
 * en el pedido es lo que el cliente deja escrito, porque el destinatario real de ese texto es
 * el domiciliario y lo que importa es el nombre que él reconoce. OSM dice "El Centro" donde
 * medio Fusagasugá dice "Centro", y un pin veinte metros corrido cae en el barrio vecino.
 *
 * Nada que ver con `zonas.ts`: aquí no se decide ni un peso. La zona de cobertura sigue
 * saliendo de los polígonos que dibuja el admin (regla 13), y esto solo evita que el cliente
 * teclee lo que el mapa ya sabe.
 *
 * Es OSM y no Google, igual que los mapas y el cálculo de cobertura.
 */

/** Se identifica la app, como exige la política de uso de Nominatim. */
const USER_AGENT = "CronchyPedidos/1.0 (https://cronchy.com.co)";

/**
 * Corto a propósito. Esto cuelga de la cotización del domicilio, que es lo que el cliente
 * está esperando para ver su precio: más de esto y se nota el tirón por un dato que es un
 * lujo. Si no contesta a tiempo, el campo se queda vacío y se escribe a mano.
 */
const TIMEOUT_MS = 1500;

/** Cuánto se recuerda una coordenada ya consultada. Un barrio no se mueve; el tope existe
 *  para que el proceso no acumule memoria eternamente. */
const VIDA_CACHE_MS = 60 * 60 * 1000;

/**
 * Lo que Nominatim devuelve en `address`. Se declara solo lo que se usa: el resto del objeto
 * es enorme y cambia entre versiones.
 */
type DireccionOSM = {
  neighbourhood?: string;
  suburb?: string;
  [clave: string]: unknown;
};

/**
 * De la respuesta al nombre del barrio, o `null`.
 *
 * **Solo `neighbourhood`.** `suburb` en Colombia trae la comuna ("Comuna Occidental") y las
 * veredas llegan como `village`: los dos son divisiones administrativas, exactamente el
 * mismo error que estamos corrigiendo al dejar de mostrar "zona 2" como barrio. Un
 * domiciliario no encuentra una casa con el nombre de una comuna.
 *
 * Está aparte de la petición para poder probarlo con fixtures, sin red.
 */
export function barrioDeRespuesta(datos: unknown): string | null {
  if (!datos || typeof datos !== "object") return null;

  const direccion = (datos as { address?: DireccionOSM }).address;
  const barrio = direccion?.neighbourhood;

  if (typeof barrio !== "string") return null;

  const limpio = barrio.trim();

  // Un nombre absurdamente largo no lo escribió un vecino: no cabe en el campo y no le sirve
  // a nadie. Mejor vacío, que se ve y se corrige, que un texto que hay que borrar entero.
  return limpio.length > 0 && limpio.length <= 120 ? limpio : null;
}

/** Redondear a 4 decimales (~11 m) es la clave del memo: arrastrar el pin unos metros no
 *  vuelve a preguntar, y así una ráfaga de arrastres no choca contra el límite de 1 req/s. */
function clave(punto: Punto): string {
  return `${punto.lat.toFixed(4)},${punto.lng.toFixed(4)}`;
}

const cache = new Map<string, { barrio: string | null; expira: number }>();

/**
 * Pregunta por el barrio del punto. **Nunca lanza**: cualquier fallo —timeout, 429, un JSON
 * que no esperábamos, Nominatim caído— devuelve `null` y el cliente escribe su barrio.
 *
 * Vive en el servidor. Llamarlo desde el navegador expondría la IP del cliente a un tercero
 * y dejaría el `User-Agent` fuera de nuestro control, que es lo que la política de Nominatim
 * pide para no bloquear a nadie.
 */
export async function barrioDelPunto(punto: Punto): Promise<string | null> {
  const k = clave(punto);
  const guardado = cache.get(k);
  if (guardado && guardado.expira > Date.now()) return guardado.barrio;

  const url =
    "https://nominatim.openstreetmap.org/reverse" +
    `?format=jsonv2&lat=${punto.lat}&lon=${punto.lng}&zoom=18&addressdetails=1`;

  let barrio: string | null = null;

  try {
    const respuesta = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "es" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (respuesta.ok) barrio = barrioDeRespuesta(await respuesta.json());
  } catch {
    // A propósito en silencio: esto es un lujo colgado del camino del pedido, y un servicio
    // comunitario gratuito que no contesta no es un incidente que valga la pena registrar
    // por cada pin que alguien arrastra.
  }

  // Se guarda también el `null`: si acaba de fallar o si ahí de verdad no hay barrio mapeado,
  // reintentar en el siguiente arrastre solo suma peticiones que ya sabemos cómo terminan.
  cache.set(k, { barrio, expira: Date.now() + VIDA_CACHE_MS });

  return barrio;
}
