import Image from "next/image";
import { ArrowRight } from "lucide-react";

export function CategoryBanner({
  nombre,
  bannerUrl,
  subtitulo,
  ctaHref,
  ctaLabel = "Ver todos",
}: {
  nombre: string;
  bannerUrl?: string | null;
  subtitulo?: string | null;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-md shadow-tarjeta sm:aspect-[21/9]">
      {bannerUrl ? (
        <Image
          src={bannerUrl}
          alt={nombre}
          fill
          sizes="100vw"
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
        {subtitulo && <p className="text-sm text-crema/90 sm:text-base">{subtitulo}</p>}
        {ctaHref && (
          <a
            href={ctaHref}
            className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-naranja px-5 py-2 font-cuerpo text-sm font-bold text-crema transition-colors hover:bg-naranja-osc"
          >
            {ctaLabel}
            <ArrowRight className="size-4" />
          </a>
        )}
      </div>
    </div>
  );
}
