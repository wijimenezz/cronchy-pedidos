/**
 * Reglas comunes a toda imagen que entra al sistema, más las propias de las fotos de
 * producto. Módulo puro: lo importan el navegador (para validar y comprimir antes de
 * subir), el route handler y `storage.ts`. No puede leer `process.env` ni tocar la red.
 *
 * Lo genérico —tipos permitidos, magic bytes, tope de peso— vivía en `comprobantes.ts`,
 * que es donde apareció primero. Se mudó aquí al llegar la segunda clase de imagen;
 * `comprobantes.ts` lo re-exporta para no obligar a tocar a sus consumidores.
 */

export type TipoImagen = "image/jpeg" | "image/png" | "image/webp";

export const TIPOS_PERMITIDOS: TipoImagen[] = ["image/jpeg", "image/png", "image/webp"];

/** Por debajo del límite de 4.5 MB que Vercel impone al body de una función serverless. */
export const MAX_BYTES = 4_000_000;

export const EXTENSION: Record<TipoImagen, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Detecta el tipo por los magic bytes del archivo, NO por `file.type`: ese lo
 * controla el navegador y un cliente hostil puede declarar `image/jpeg` sobre
 * cualquier cosa. Aquí solo entra lo que realmente es una imagen.
 */
export function detectarTipoImagen(bytes: Uint8Array): TipoImagen | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  // WEBP: "RIFF" .... "WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

// ------------------------------------------------------------
// Fotos de producto y banners de categoría
// ------------------------------------------------------------

/**
 * Bucket PÚBLICO, a diferencia del de comprobantes. Estas fotos salen en la carta que ve
 * cualquiera sin sesión, así que servirlas por un proxy autenticado no tendría sentido y
 * además gastaría una función serverless por cada miniatura.
 */
export const BUCKET_PRODUCTOS = "productos";

/** CLAUDE.md: máximo 3 por producto, la primera es la portada. */
export const MAX_FOTOS = 3;

/**
 * Lado mayor al que se reescala antes de subir.
 *
 * **Es un techo duro, no una sugerencia**: el optimizador de Next reescala con
 * `withoutEnlargement`, así que nunca agranda. Con los 800 px que había aquí, la ficha en un
 * teléfono de 390 px a DPR 3 pedía ~1170 px y recibía 800. Eso era el "las fotos se ven de
 * mala calidad", y no se arreglaba comprimiendo menos: el detalle no estaba guardado.
 *
 * **Y ojo, porque limita el lado LARGO mientras que lo que se ve es el CORTO.** Todas las cajas
 * que muestran una foto usan `object-cover`, así que recortan: la tarjeta es cuadrada y la caja
 * de la ficha en móvil es apaisada, pero las fotos del negocio son verticales. Medido sobre las
 * dos que había subidas, con el tope en 800 quedaron en **450×800 y 600×800** — o sea 450 y 600
 * px útiles, no 800, para una tarjeta que en un teléfono a DPR 3 pide 720. Era peor de lo que
 * parecía leyendo esta constante.
 *
 * Con 1280, una foto 9:16 deja 720 px de lado corto y una 3:4 deja 960. Si algún día la ficha
 * se sigue viendo blanda, el número a mover es este —no `CALIDAD_WEBP`—, y lo que cuesta es
 * Storage, nunca los datos del cliente.
 */
export const LADO_MAXIMO = 1280;

/**
 * El banner de categoría no es una miniatura: es un hero a ancho completo, que en escritorio
 * ocupa hasta ~1016 px (`max-w-contenido` de 1080 menos el `lg:px-8`).
 *
 * Hoy coincide con `LADO_MAXIMO` —lo llevaba de antes, cuando la foto de producto se guardaba
 * a 800 y aquí se veía blanda—, y aun así sigue siendo una constante propia: responde a otra
 * pregunta (cuánto mide el hero) y nada obliga a que las dos se muevan juntas.
 */
export const LADO_MAXIMO_BANNER = 1280;

/**
 * Calidad del WebP guardado. **Este archivo ya no es lo que ve el cliente**: el navegador
 * nunca lo descarga, descarga la variante que Next genera para cada hueco. Es un máster, y
 * por eso 0.92 no es despilfarro —era 0.82— sino lo que impide que las dos compresiones se
 * acumulen: al bajar de 1280 a 640 px para una tarjeta, los artefactos del máster se
 * promedian y desaparecen. Comprimirlo fuerte aquí los dejaba grabados antes de empezar.
 *
 * Sube el peso de ~120 KB a ~450 KB por foto, que contra el 1 GB de Supabase no es nada y
 * se queda muy por debajo de `MAX_BYTES`. Lo que baja el cliente no depende de esto, sino
 * del `sizes` de cada `<Image>`.
 */
export const CALIDAD_WEBP = 0.92;

/**
 * Ruta dentro del bucket, agrupada por producto: así se ve de un vistazo a quién pertenece
 * cada objeto y una limpieza futura puede borrar por prefijo.
 */
export function rutaFotoProducto(productId: string, tipo: TipoImagen): string {
  return `${productId}/${crypto.randomUUID()}.${EXTENSION[tipo]}`;
}

/** Los banners de categoría van al mismo bucket, en su propia carpeta. */
export function rutaBannerCategoria(categoryId: string, tipo: TipoImagen): string {
  return `categorias/${categoryId}/${crypto.randomUUID()}.${EXTENSION[tipo]}`;
}

/**
 * Lo que es de la tienda entera y no de un producto: hoy solo el QR de pago.
 *
 * Va al bucket público como las fotos —el QR se le enseña a cualquiera que vaya a pagar, no
 * hay nada que proteger— pero en su propia carpeta, para que se distinga de un vistazo de las
 * fotos de la carta.
 */
export function rutaImagenTienda(storeId: string, tipo: TipoImagen): string {
  return `tienda/${storeId}/${crypto.randomUUID()}.${EXTENSION[tipo]}`;
}

/**
 * La lista de fotos llega desde el navegador, así que hay que comprobar que cada URL sea
 * una que produjo esta aplicación. Sin esto, un admin podría guardar el dominio de un
 * tercero y la carta pública terminaría cargando imágenes ajenas —o un pixel de rastreo—
 * desde un host que `next.config.ts` ni siquiera tiene permitido.
 *
 * Lleva `/public/`, al revés que el comprobante: este bucket sí se lee sin credenciales.
 */
const PATRON_URL = new RegExp(
  `^https://[a-z0-9]+\\.supabase\\.co/storage/v1/object/public/${BUCKET_PRODUCTOS}/` +
    `(categorias/|tienda/)?[0-9a-f-]{36}/[0-9a-f-]{36}\\.(jpg|png|webp)$`,
);

export function esUrlDeFotoProducto(url: string): boolean {
  return PATRON_URL.test(url);
}
