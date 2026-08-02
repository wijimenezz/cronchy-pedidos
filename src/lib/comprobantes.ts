import { EXTENSION, type TipoImagen } from "@/lib/imagenes";

/**
 * Reglas del comprobante de pago Nequi. Módulo puro: lo importan tanto el
 * navegador (para validar antes de subir) como `validaciones.ts` y el route
 * handler. No puede leer `process.env` ni tocar la red.
 *
 * Lo genérico a cualquier imagen —tipos permitidos, magic bytes, tope de peso— se mudó a
 * `imagenes.ts` cuando llegaron las fotos de producto. Se re-exporta desde aquí para que
 * los consumidores de este módulo no tuvieran que cambiar de import.
 */

export {
  detectarTipoImagen,
  MAX_BYTES,
  TIPOS_PERMITIDOS,
  type TipoImagen,
} from "@/lib/imagenes";

export const BUCKET_COMPROBANTES = "comprobantes";

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
