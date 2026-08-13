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
 *
 * **El archivo tiene dos mitades y corren en sitios distintos:**
 *
 * - `barrioDelPunto` sale a Nominatim y es **solo de servidor** (ver su propia nota).
 * - `decidirBarrio` es puro y lo importa el checkout, que es un componente de cliente. No
 *   arrastra nada al navegador: no hay driver de base de datos aquí, y el `Punto` de
 *   `zonas.ts` entra como `import type`, que se borra al compilar.
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

/**
 * Lo que la tienda dice de un nombre de OSM: cómo se llama aquí, o `null` para no sugerirlo.
 * `undefined` es "ese nombre no está en el diccionario", que no es lo mismo (ver abajo).
 */
export type CorreccionBarrio = { nombre: string | null } | undefined;

/**
 * Del nombre que devuelve OSM al que se le enseña al cliente.
 *
 * Existe porque **OSM tiene los 90 barrios de Fusagasugá como nodos sueltos, ninguno con
 * polígono**. Sin áreas, Nominatim no puede decir "este punto está dentro de Balmoral" y
 * responde por proximidad y peso interno, que a esta escala es casi azar: medido sobre dos
 * pedidos reales separados 60 m, devolvió las dos veces el barrio **más lejano** de los dos
 * candidatos, y uno de esos nombres —"Managua"— no existe en la ciudad.
 *
 * Traducir nombres arregla los que están mal *siempre*, que son los que no existen. NO
 * arregla que un pin reciba el nombre de un barrio vecino que sí existe; eso lo sigue
 * corrigiendo el cliente sobre el campo, que por eso se queda editable (regla 14).
 *
 * Los tres casos, que no son dos:
 *
 * - **hay fila con nombre** → se muestra el corregido;
 * - **hay fila con `nombre` NULL** → alguien decidió que ese nombre no sirve: campo vacío y lo
 *   escribe el cliente;
 * - **no hay fila** → un barrio que OSM añadió después del seed. Se pasa tal cual, que es el
 *   comportamiento de siempre: una sugerencia sin revisar es mejor que ninguna, y el cliente
 *   la corrige si no le cuadra.
 */
export function resolverNombreBarrio(
  nombreOsm: string | null,
  correccion: CorreccionBarrio,
): string | null {
  if (!nombreOsm) return null;
  if (correccion === undefined) return nombreOsm;

  return correccion.nombre;
}

/**
 * Por qué se está consultando el barrio. **La decisión de escribirlo o no depende de esto**,
 * y no de quién escribió lo que ya hay.
 *
 * Montar la página con el pin guardado no es cambiar de dirección: es el mismo sitio de
 * siempre, así que lo que el cliente dejó escrito manda. Mover el pin **sí** es cambiar de
 * dirección, y ahí el barrio tiene que seguir al pin.
 */
export type MotivoConsulta = "montaje" | "pin-movido";

export type DecisionBarrio = {
  /** Lo que hay ahora mismo en el campo. */
  actual: string;
  /** Lo que dice el mapa de este punto, o `null` si no supo. */
  sugerido: string | null;
  /** La última sugerencia recibida en esta sesión, escrita o no. */
  ultimaSugerencia: string | null;
  motivo: MotivoConsulta;
};

/**
 * Qué escribir en el campo del barrio, o `null` para no tocarlo.
 *
 * Existe como función pura, y no dentro del componente, porque el bug que vino a arreglar no
 * se ve leyendo el código: se ve simulando una segunda visita. La versión anterior decidía
 * comparando el campo con "la última sugerencia que escribimos", pero esa memoria vivía en un
 * `useRef` —muere al recargar— mientras el campo vive en localStorage —sobrevive—. En la
 * segunda visita el campo traía el barrio del pedido pasado y el ref arrancaba vacío, así que
 * ninguna rama se cumplía y el campo quedaba congelado: mover el pin no lo cambiaba y había
 * que borrarlo a mano.
 */
export function decidirBarrio({
  actual,
  sugerido,
  ultimaSugerencia,
  motivo,
}: DecisionBarrio): string | null {
  // OSM no supo, o falló. Nunca se borra lo que haya: el campo es obligatorio y vaciarlo
  // dejaría al cliente con un error que él no provocó.
  if (!sugerido) return null;

  // Un hueco se llena venga de donde venga la consulta: no hay nada que pisar.
  if (actual.trim() === "") return sugerido;

  // Mismo pin, misma dirección. Lo que el cliente dejó escrito —incluida una corrección al
  // nombre que usa OSM— vale más que volver a sugerir lo mismo.
  if (motivo === "montaje") return null;

  // El pin se movió. Si el barrio sugerido cambió, el cliente cambió de dirección y el campo
  // tiene que seguirlo. Si es el mismo, fue un ajuste de unos metros dentro del mismo barrio
  // y no hay razón para borrar una corrección hecha a mano.
  return sugerido === ultimaSugerencia ? null : sugerido;
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
