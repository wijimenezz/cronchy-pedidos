import { CALIDAD_WEBP, LADO_MAXIMO } from "@/lib/imagenes";

/**
 * Reescala y recomprime la foto EN EL NAVEGADOR antes de subirla (CLAUDE.md: WebP, ~800px,
 * ~100–150 KB). Una foto de cámara de teléfono son 4 MB; la misma imagen así queda en unos
 * 120 KB, y los clientes de la carta entran desde datos móviles.
 *
 * Sin librería: `createImageBitmap` + un canvas es todo lo que hace falta, y meter una
 * dependencia de 40 KB para esto sería peor que el problema.
 *
 * Solo cliente — toca `document` y `createImageBitmap`.
 */
export async function comprimirImagen(archivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(archivo);

  try {
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;

    const ctx = lienzo.getContext("2d");
    if (!ctx) throw new Error("El navegador no permitió dibujar la imagen.");
    ctx.drawImage(bitmap, 0, 0, ancho, alto);

    const blob = await new Promise<Blob | null>((resolve) =>
      lienzo.toBlob(resolve, "image/webp", CALIDAD_WEBP),
    );
    if (!blob) throw new Error("No se pudo convertir la imagen.");

    return blob;
  } finally {
    // El bitmap ocupa memoria hasta que se cierra, y una tanda de 3 fotos de 12 MP no es
    // poca cosa en un teléfono.
    bitmap.close();
  }
}
