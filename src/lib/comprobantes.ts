/**
 * Reglas del comprobante de pago Nequi. Módulo puro: lo importan tanto el
 * navegador (para validar antes de subir) como `validaciones.ts` y el route
 * handler. No puede leer `process.env` ni tocar la red.
 */

export const BUCKET_COMPROBANTES = "comprobantes";

export type TipoImagen = "image/jpeg" | "image/png" | "image/webp";

export const TIPOS_PERMITIDOS: TipoImagen[] = ["image/jpeg", "image/png", "image/webp"];

/** Por debajo del límite de 4.5 MB que Vercel impone al body de una función serverless. */
export const MAX_BYTES = 4_000_000;

const EXTENSION: Record<TipoImagen, string> = {
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

/** Ruta dentro del bucket, particionada por mes para que la purga a 60 días sea barata. */
export function rutaComprobante(tipo: TipoImagen, ahora = new Date()): string {
  const anio = ahora.getUTCFullYear();
  const mes = String(ahora.getUTCMonth() + 1).padStart(2, "0");
  return `${anio}/${mes}/${crypto.randomUUID()}.${EXTENSION[tipo]}`;
}

/**
 * El pedido llega con una `comprobanteUrl` que el cliente controla. Sin esto podría
 * apuntar a cualquier dominio y el panel terminaría abriendo un link ajeno. Solo se
 * acepta la forma exacta que produce `subirComprobante`.
 *
 * Nótese que NO lleva `/public/`: el bucket es privado y el objeto solo se lee con
 * credenciales de servidor.
 */
const PATRON_URL = new RegExp(
  `^https://[a-z0-9]+\\.supabase\\.co/storage/v1/object/${BUCKET_COMPROBANTES}/\\d{4}/\\d{2}/[0-9a-f-]{36}\\.(jpg|png|webp)$`,
);

export function esUrlDeComprobante(url: string): boolean {
  return PATRON_URL.test(url);
}
