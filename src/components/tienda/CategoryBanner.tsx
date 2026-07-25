import Image from "next/image";

export function CategoryBanner({
  nombre,
  bannerUrl,
}: {
  nombre: string;
  bannerUrl?: string | null;
}) {
  return (
    <div className="relative h-36 w-full overflow-hidden rounded-md shadow-tarjeta sm:h-44">
      {bannerUrl ? (
        <Image
          src={bannerUrl}
          alt={nombre}
          fill
          sizes="(max-width: 520px) 100vw, 520px"
          className="object-cover"
        />
      ) : (
        // Sin foto todavía: textura de marca como relleno temporal.
        <div className="absolute inset-0 bg-naranja/90 bg-[url('/textura-happy-cronchy.png')] bg-[length:260px_auto] bg-repeat bg-blend-multiply" />
      )}
      <div className="absolute inset-0 flex items-center justify-center bg-cafe/10">
        <span className="-rotate-2 rounded-lg bg-naranja px-6 py-1.5 font-titulo text-xl font-semibold tracking-wide text-crema uppercase shadow-tarjeta">
          {nombre}
        </span>
      </div>
    </div>
  );
}
