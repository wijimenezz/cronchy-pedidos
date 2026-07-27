import Image from "next/image";

export default function TiendaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex flex-1 flex-col">
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div className="relative mx-auto h-full w-full max-w-[520px] lg:max-w-contenido">
          <Image
            src="/foto_local.png"
            alt=""
            fill
            sizes="(min-width: 1024px) 1152px, 100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-crema/65" />
        </div>
      </div>
      <div className="relative z-10 flex flex-1 flex-col">{children}</div>
    </div>
  );
}
