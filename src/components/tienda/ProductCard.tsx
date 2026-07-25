import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { pesos } from "@/lib/notificaciones/plantillas";
import type { ProductoDeMenu } from "@/db/queries/menu";

export function ProductCard({ producto }: { producto: ProductoDeMenu }) {
  const foto = producto.imagenes[0];
  const agotado = !producto.disponible;

  return (
    <div
      className={`overflow-hidden rounded-md bg-tarjeta shadow-tarjeta ${agotado ? "opacity-75" : ""}`}
    >
      <div className="relative aspect-4/3 bg-crema-oscura">
        {foto ? (
          <Image
            src={foto}
            alt={producto.nombre}
            fill
            sizes="(max-width: 640px) 50vw, 25vw"
            className={`object-cover ${agotado ? "grayscale" : ""}`}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-cafe-tenue">
            <span className="font-titulo text-sm">Cronchy</span>
          </div>
        )}

        {producto.recomendado && !agotado && (
          <Badge className="absolute top-2 left-2 bg-naranja text-crema">
            Recomendado
          </Badge>
        )}
        {agotado && (
          <Badge className="absolute top-2 left-2 bg-agotado text-crema">
            Agotado
          </Badge>
        )}
      </div>

      <div className="p-3">
        <h3 className="font-titulo text-lg font-semibold text-cafe">{producto.nombre}</h3>
        {producto.descripcion && (
          <p className="mt-1 line-clamp-2 text-[13px] text-cafe-suave">
            {producto.descripcion}
          </p>
        )}
        <p className="mt-2 font-cuerpo text-base font-bold text-naranja">
          {pesos(producto.precioBase)}
        </p>
      </div>
    </div>
  );
}
