import { BUCKET_COMPROBANTES, rutaComprobante } from "@/lib/comprobantes";
import {
  BUCKET_PRODUCTOS,
  rutaBannerCategoria,
  rutaFotoProducto,
  type TipoImagen,
} from "@/lib/imagenes";

/**
 * Subidas a Supabase Storage. SOLO SERVIDOR: usa la service role key, que da acceso
 * total a las tablas. Nunca importar este módulo desde un componente del navegador
 * ni prefijar sus variables con `NEXT_PUBLIC_`.
 *
 * Se habla con la REST API por `fetch` en vez de instalar `@supabase/supabase-js`:
 * la única operación que hace falta es un PUT de un objeto, y el SDK arrastraría el
 * cliente de realtime (WebSocket) y postgrest, que este proyecto no usa —el acceso a
 * datos es Drizzle— y que CLAUDE.md prohíbe. Además, si el SDK no está instalado es
 * imposible importarlo por error en el cliente y filtrar la llave.
 */

function entorno(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. Mira .env.example — son de servidor, sin NEXT_PUBLIC_.",
    );
  }
  return { url: url.replace(/\/$/, ""), key };
}

/**
 * Las DOS cabeceras, no una.
 *
 * `Authorization: Bearer` solo sirve si la llave es un JWT —el formato viejo,
 * `service_role`—. Las llaves nuevas de Supabase (`sb_secret_…`) no lo son, y Storage las
 * rechaza con un `400 Invalid Compact JWS` que no dice en ninguna parte que falte la
 * cabecera `apikey`. Perseguir ese error cuesta una tarde.
 *
 * `apikey` funciona con los dos formatos, así que mandar ambas cubre el presente y el
 * pasado y no hay nada que tocar el día que se rote la llave.
 */
function cabeceras(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}`, apikey: key };
}

/** Bucket privado: la URL que se guarda no abre sola, hay que pasar por el proxy del panel. */
export async function subirComprobante(
  bytes: ArrayBuffer,
  tipo: TipoImagen,
): Promise<{ url: string }> {
  return subir(BUCKET_COMPROBANTES, rutaComprobante(tipo), bytes, tipo, { publico: false });
}

/**
 * Sube una foto de producto al bucket PÚBLICO y devuelve la URL de lectura.
 *
 * Ojo con las dos rutas: se escribe en `/object/<bucket>/…` y se lee en
 * `/object/public/<bucket>/…`. Devolver la de escritura daría un 400 al cargarla, y es la
 * forma que `esUrlDeFotoProducto` y el `remotePattern` de `next.config.ts` reconocen.
 */
export async function subirFotoProducto(
  bytes: ArrayBuffer,
  tipo: TipoImagen,
  destino: { productId: string } | { categoryId: string },
): Promise<{ url: string }> {
  const ruta =
    "productId" in destino
      ? rutaFotoProducto(destino.productId, tipo)
      : rutaBannerCategoria(destino.categoryId, tipo);

  return subir(BUCKET_PRODUCTOS, ruta, bytes, tipo, { publico: true });
}

/**
 * Borra el objeto de una foto que el admin quitó. Es *best-effort* y por eso no lanza: la
 * fuente de verdad es la columna `imagenes`, no el bucket. Un objeto huérfano ocupa unos
 * KB del free tier; una excepción aquí, en cambio, haría fallar un guardado que por lo
 * demás fue correcto.
 */
export async function borrarFotoProducto(url: string): Promise<void> {
  try {
    const { key } = entorno();
    // La URL guardada es la de lectura; el DELETE va contra la de escritura.
    const destino = url.replace("/storage/v1/object/public/", "/storage/v1/object/");

    await fetch(destino, { method: "DELETE", headers: cabeceras(key) });
  } catch (error) {
    console.error("No se pudo borrar la foto de Storage:", error);
  }
}

async function subir(
  bucket: string,
  ruta: string,
  bytes: ArrayBuffer,
  tipo: TipoImagen,
  opciones: { publico: boolean },
): Promise<{ url: string }> {
  const { url, key } = entorno();
  const destino = `${url}/storage/v1/object/${bucket}/${ruta}`;

  const respuesta = await fetch(destino, {
    method: "POST",
    headers: {
      ...cabeceras(key),
      "Content-Type": tipo,
      "x-upsert": "false",
    },
    body: bytes,
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => "");
    throw new Error(`Supabase Storage respondió ${respuesta.status}: ${detalle.slice(0, 200)}`);
  }

  return {
    url: opciones.publico ? `${url}/storage/v1/object/public/${bucket}/${ruta}` : destino,
  };
}

/**
 * Lee un objeto del bucket privado. Sirve para que el panel muestre el comprobante sin
 * hacer público el bucket: la URL guardada no abre sola —no lleva `/public/`— y quien la
 * pide ya pasó por `exigirRol()`.
 *
 * Devuelve `null` si el objeto no está: un comprobante purgado a los 60 días no es un
 * error del servidor, es lo que tenía que pasar.
 */
export async function descargarComprobante(
  url: string,
): Promise<{ cuerpo: ArrayBuffer; tipo: string } | null> {
  const { key } = entorno();

  const respuesta = await fetch(url, { headers: cabeceras(key) });

  if (!respuesta.ok) {
    // OJO: Supabase NO responde 404 cuando falta el objeto. Manda un **400** con el 404
    // metido en el cuerpo (`{"statusCode":"404","code":"NoSuchKey"}`), así que mirar solo
    // `respuesta.status` deja pasar el caso normal —un comprobante ya purgado— como si
    // fuera una caída del servicio, y el panel devuelve un 500 en vez de su 410.
    const detalle = await respuesta.text().catch(() => "");
    if (respuesta.status === 404 || detalle.includes("NoSuchKey")) return null;

    throw new Error(
      `Supabase Storage respondió ${respuesta.status} al leer el comprobante: ${detalle.slice(0, 200)}`,
    );
  }

  return {
    cuerpo: await respuesta.arrayBuffer(),
    tipo: respuesta.headers.get("content-type") ?? "application/octet-stream",
  };
}
