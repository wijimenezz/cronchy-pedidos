import Image from "next/image";
import { SelectorTipoPedido } from "@/components/tienda/SelectorTipoPedido";
import { Drawer } from "@/components/tienda/Drawer";
import { CategoryNav } from "@/components/tienda/CategoryNav";
import { CartButton } from "@/components/tienda/CartButton";

type Tienda = {
  nombre: string;
  telefono: string | null;
  direccion: string | null;
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
    <header className="sticky top-0 z-30 flex flex-col gap-2 bg-cafe px-2 pt-3 pb-2 text-crema lg:flex-row lg:items-center lg:justify-between lg:gap-8 lg:px-8 lg:py-3">
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

      <div className="flex w-full items-center justify-center gap-2 lg:w-auto lg:justify-end">
        <SelectorTipoPedido />
        <CartButton className="hidden lg:flex" />
      </div>
    </header>
  );
}
