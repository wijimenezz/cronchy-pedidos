import { CALIDAD_WEBP, LADO_MAXIMO } from "@/lib/imagenes";

/**
 * Reescala y recomprime la foto EN EL NAVEGADOR antes de subirla (CLAUDE.md: WebP, 1280 px,
 * ~450 KB). Una foto de cámara de teléfono son 4 MB, así que sigue habiendo mucho que recortar.
 *
 * Lo que sale de aquí es un **máster**, no lo que baja el cliente: el navegador de la carta
 * nunca pide este archivo, pide la variante que Next genera para cada hueco. Por eso el
 * objetivo aquí es guardar detalle —de ahí `CALIDAD_WEBP` a 0.92 y no a 0.82— y no ahorrar
 * bytes; los datos móviles los defiende el `sizes` de cada `<Image>`.
 *
 * Sin librería: `createImageBitmap` + un canvas es todo lo que hace falta, y meter una
 * dependencia de 40 KB para esto sería peor que el problema.
 *
 * El `lado` es parámetro porque el banner de categoría necesita más (`LADO_MAXIMO_BANNER`):
 * se muestra a ancho completo, no dentro de una tarjeta.
 *
 * Solo cliente — toca `document` y `createImageBitmap`.
 */
export async function comprimirImagen(archivo: File, lado = LADO_MAXIMO): Promise<Blob> {
  const bitmap = await createImageBitmap(archivo);

  try {
    const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;

    const ctx = lienzo.getContext("2d");
    if (!ctx) throw new Error("El navegador no permitió dibujar la imagen.");
    // Una foto de teléfono baja de ~4000 px a 1280 en UN solo paso, y con el filtro por
    // defecto ese salto deja aliasing justo donde más se nota: un churro es todo textura.
    ctx.imageSmoothingQuality = "high";
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
