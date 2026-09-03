import Image from "next/image";

/**
 * El hero que abre cada categoría en la carta: foto, nombre y una frase.
 *
 * **No lleva botón, y eso es una decisión.** Tuvo un "Ver todos los churros" cuyo enlace
 * apuntaba a la rejilla de productos que está justo debajo, ya visible en la misma pantalla:
 * ocupaba el tercio inferior del hero para hacer un scroll de 40 px. Además su texto se
 * generaba con `Ver todos los ${nombre.toLowerCase()}`, que en las demás categorías producía
 * cosas como "Ver todos los bebidas".
 *
 * `subtitulo` sale de `category.subtitulo` y es opcional: sin frase, el hero muestra solo el
 * nombre. Se edita desde /admin/productos, en el mismo modal que la foto.
 */
export function CategoryBanner({
  nombre,
  bannerUrl,
  subtitulo,
}: {
  nombre: string;
  bannerUrl?: string | null;
  subtitulo?: string | null;
}) {
  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-md shadow-tarjeta sm:aspect-[21/9]">
      {bannerUrl ? (
        <Image
          src={bannerUrl}
          alt={nombre}
          fill
          sizes="(max-width: 1024px) calc(100vw - 2rem), 1080px"
          // Igual que el resto de la tienda pública: el archivo de Storage ya viene casi sin
          // pérdida, así que el 75 por defecto le daba una segunda pasada agresiva de balde.
          quality={82}
          className="object-cover"
        />
      ) : (
        // Sin foto todavía: textura de marca como relleno temporal.
        <div className="absolute inset-0 bg-naranja/90 bg-[url('/textura-happy-cronchy.png')] bg-[length:260px_auto] bg-repeat bg-blend-multiply" />
      )}

      {/* Velo degradado izquierda (opaco, café) → derecha (transparente). */}
      <div className="absolute inset-0 bg-gradient-to-r from-cafe/85 via-cafe/40 to-transparent" />

      {/* Doodles sutiles de fondo, opacidad baja (DESIGN.md §4). */}
      <div className="pointer-events-none absolute inset-0 bg-[url('/textura-happy-cronchy.png')] bg-[length:220px_auto] bg-repeat opacity-[0.08]" />

      <div className="relative flex h-full max-w-[80%] flex-col justify-center gap-2 px-5 sm:max-w-[55%] sm:px-10">
        <h2 className="font-titulo text-4xl leading-none font-bold tracking-tight text-crema uppercase sm:text-6xl">
          {nombre}
        </h2>
        {subtitulo && (
          <p className="text-sm text-crema/90 sm:text-base">{subtitulo}</p>
        )}
      </div>
    </div>
  );
}
