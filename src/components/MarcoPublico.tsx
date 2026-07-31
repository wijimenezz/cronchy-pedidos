import Image from "next/image";

/**
 * La columna angosta del storefront, con sus dos personajes al costado.
 *
 * Estuvo en el root layout hasta que apareció el panel: ahí envolvía absolutamente todo,
 * y `/admin` habría nacido dentro de una columna de 520 px. Ahora lo aplican solo las
 * rutas del cliente —el menú y el seguimiento del pedido— y el root queda con lo que de
 * verdad es global: el idioma, las fuentes y el `<body>`.
 */
export function MarcoPublico({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-full">
      <Image
        src="/churro-gorra.png"
        alt=""
        width={318}
        height={456}
        className="pointer-events-none fixed top-28 left-10 hidden w-36 drop-shadow-xl"
      />
      <Image
        src="/helado.png"
        alt=""
        width={326}
        height={432}
        className="pointer-events-none fixed right-10 bottom-24 hidden w-32 drop-shadow-xl"
      />

      <div className="relative mx-auto flex min-h-full w-full max-w-[520px] flex-col bg-gutter shadow-modal lg:max-w-none lg:shadow-none">
        {children}
      </div>
    </div>
  );
}
