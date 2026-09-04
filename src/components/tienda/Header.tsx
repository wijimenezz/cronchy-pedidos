import Image from "next/image";
import { EstadoTienda } from "@/components/tienda/EstadoTienda";
import { SelectorTipoPedido } from "@/components/tienda/SelectorTipoPedido";
import { Drawer } from "@/components/tienda/Drawer";
import { CategoryNav } from "@/components/tienda/CategoryNav";
import { CartButton } from "@/components/tienda/CartButton";

type Tienda = {
  nombre: string;
  telefono: string | null;
  whatsappUrl: string | null;
  direccion: string | null;
  /** Solo lo consume el <Drawer>; el header no lo pinta. */
  googleResenasUrl: string | null;
};

type Categoria = { id: string; nombre: string; slug: string };

export function Header({
  tienda,
  categorias,
}: {
  tienda: Tienda;
  categorias: Categoria[];
}) {
  return (
    <header className="relative z-30 flex flex-col gap-2 bg-cafe px-2 pt-3 pb-2 text-crema lg:sticky lg:top-0 lg:flex-row lg:items-center lg:justify-between lg:gap-8 lg:px-8 lg:py-3">
      <div className="flex w-full items-center justify-between gap-2 lg:w-auto lg:gap-8">
        <div className="lg:hidden">
          <Drawer tienda={tienda} />
        </div>
        {/* logo-cronchy-recortado.png: recorte del PNG original (logo_cronchy.png)
            sin el margen en blanco integrado, para poder usar object-contain sin
            que el logo se vea diminuto dentro de la caja. */}
        <div className="relative h-28 w-56 shrink-0 lg:h-24 lg:w-52">
          <Image
            src="/logo_cronchy_blanco.png"
            alt={tienda.nombre}
            fill
            sizes="160px"
            priority
            className="object-contain"
          />
        </div>
        <CategoryNav categorias={categorias} variant="desktop" />
        <CartButton className="lg:hidden" />
      </div>

      {/* Rejilla de tres columnas en móvil y no un `flex`, para que el selector Domicilio/Recoger
          se quede donde estaba: la columna del medio en `auto` y las de los lados en `1fr`. Con un
          `flex justify-center` el personaje lo habría empujado a la derecha.

          **No es un centrado garantizado, y conviene saberlo antes de fiarse.** `1fr` es
          `minmax(auto, 1fr)`, así que la primera columna nunca baja de lo que mide el personaje
          con su letrero: en una pantalla estrecha (320–360 px) crece por encima de la tercera y el
          chip se corre a la derecha. No desborda —el reparto sigue cabiendo—, pero simétrico solo
          es mientras sobre sitio.

          Desde `lg` vuelve a ser el `flex` de siempre, donde el personaje ya no existe. */}
      <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 lg:flex lg:w-auto lg:justify-end">
        {/* Debajo de la hamburguesa, y vivo exactamente mientras ella: los dos son `lg:hidden`. */}
        <div className="justify-self-start lg:hidden">
          <EstadoTienda />
        </div>
        <SelectorTipoPedido />
        {/* La tercera columna existe para equilibrar la primera. Vacía a propósito. */}
        <div aria-hidden className="lg:hidden" />
        <CartButton className="hidden lg:flex" />
      </div>
    </header>
  );
}
