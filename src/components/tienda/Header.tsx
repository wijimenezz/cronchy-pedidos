import Image from "next/image";
import { SelectorTipoPedido } from "@/components/tienda/SelectorTipoPedido";
import { Drawer } from "@/components/tienda/Drawer";

type Tienda = {
  nombre: string;
  telefono: string | null;
  direccion: string | null;
};

export function Header({ tienda }: { tienda: Tienda }) {
  return (
    <header className="flex flex-col items-center gap-2 px-2 pt-4 pb-3">
      <div className="flex w-full items-center justify-between gap-2">
        <Drawer tienda={tienda} />
        {/* logo-cronchy-recortado.png: recorte del PNG original (logo_cronchy.png)
            sin el margen en blanco integrado, para poder usar object-contain sin
            que el logo se vea diminuto dentro de la caja. */}
        <div className="relative h-20 w-40 shrink-0">
          <Image
            src="/logo-cronchy-recortado.png"
            alt={tienda.nombre}
            fill
            sizes="160px"
            priority
            className="object-contain"
          />
        </div>
        <span className="w-9 shrink-0" aria-hidden />
      </div>
      <SelectorTipoPedido />
    </header>
  );
}
