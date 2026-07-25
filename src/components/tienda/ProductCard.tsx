"use client";

import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { pesos } from "@/lib/notificaciones/plantillas";
import { useCarrito } from "@/lib/carrito";
import type { ProductoDeMenu } from "@/db/queries/menu";

export function ProductCard({ producto }: { producto: ProductoDeMenu }) {
  const agregar = useCarrito((s) => s.agregar);
  const foto = producto.imagenes[0];
  const agotado = !producto.disponible;

  return (
    <div className={`relative ${agotado ? "opacity-75" : ""}`}>
      {(producto.recomendado || agotado) && (
        <div className="absolute -top-2 left-2 z-10 flex gap-1">
          {agotado ? (
            <Badge className="bg-agotado text-crema">Agotado</Badge>
          ) : (
            <Badge className="bg-naranja text-crema">Recomendado</Badge>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-md bg-tarjeta/90 shadow-tarjeta">
        <div className="relative aspect-square bg-crema-oscura">
          {foto ? (
            <Image
              src={foto}
              alt={producto.nombre}
              fill
              sizes="50vw"
              className={`object-cover ${agotado ? "grayscale" : ""}`}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-cafe-tenue">
              <span className="font-titulo text-sm">Cronchy</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5 p-3 text-center">
          <h3 className="font-titulo text-lg font-semibold text-cafe">{producto.nombre}</h3>
          {producto.descripcion && (
            <p className="line-clamp-2 text-[13px] text-cafe-suave">{producto.descripcion}</p>
          )}
          <p className="font-cuerpo text-base font-bold text-naranja">
            {pesos(producto.precioBase)}
          </p>
          <button
            type="button"
            disabled={agotado}
            onClick={() =>
              agregar({ id: producto.id, nombre: producto.nombre, precioBase: producto.precioBase })
            }
            className="mt-1 self-center rounded-full bg-naranja px-6 py-1.5 font-cuerpo text-sm font-bold text-crema transition-colors hover:bg-naranja-osc disabled:pointer-events-none disabled:opacity-50"
          >
            Agregar
          </button>
        </div>
      </div>
    </div>
  );
}
