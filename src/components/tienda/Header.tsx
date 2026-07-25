import Image from "next/image";
import { SelectorTipoPedido } from "@/components/tienda/SelectorTipoPedido";
import { Drawer } from "@/components/tienda/Drawer";

type Tienda = { nombre: string; telefono: string | null; direccion: string | null };

export function Header({ tienda }: { tienda: Tienda }) {
  return (
    <header className="flex flex-col items-center gap-2 px-2 pt-4 pb-3">
      <div className="flex w-full items-center justify-between gap-2">
        <Drawer tienda={tienda} />
        {/* El PNG del logo trae mucho margen en blanco integrado; se recorta con
            object-position para que se vea como un logo normal de header. */}
        <div className="relative h-14 w-56 shrink-0">
          <Image
            src="/logo-cronchy.png"
            alt={tienda.nombre}
            fill
            sizes="224px"
            priority
            className="object-cover object-[50%_47%]"
          />
        </div>
        <span className="w-9 shrink-0" aria-hidden />
      </div>
      <SelectorTipoPedido />
    </header>
  );
}
