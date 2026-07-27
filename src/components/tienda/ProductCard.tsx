"use client";

import { useState } from "react";
import Image from "next/image";
import { Heart } from "lucide-react";
import { ProductBadge } from "@/components/tienda/ProductBadge";
import { pesos } from "@/lib/notificaciones/plantillas";
import { useCarrito } from "@/lib/carrito";
import type { ProductoDeMenu } from "@/db/queries/menu";

export function ProductCard({ producto }: { producto: ProductoDeMenu }) {
  const agregar = useCarrito((s) => s.agregar);
  // Puramente visual: sin persistencia, no es una regla de dominio.
  const [favorito, setFavorito] = useState(false);
  const foto = producto.imagenes[0];
  const agotado = !producto.disponible;

  return (
    <div className={`overflow-hidden rounded-md bg-tarjeta shadow-tarjeta ${agotado ? "opacity-75" : ""}`}>
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

        {(agotado || producto.recomendado) && (
          <div className="absolute top-2 left-2 z-10 flex gap-1">
            {agotado ? (
              <ProductBadge variant="agotado">Agotado</ProductBadge>
            ) : (
              <ProductBadge variant="recomendado">Recomendado</ProductBadge>
            )}
          </div>
        )}

        <button
          type="button"
          aria-label={favorito ? "Quitar de favoritos" : "Agregar a favoritos"}
          aria-pressed={favorito}
          onClick={() => setFavorito((f) => !f)}
          className="absolute top-2 right-2 z-10 flex size-8 items-center justify-center rounded-full bg-tarjeta/70 backdrop-blur-sm"
        >
          <Heart className={`size-4 ${favorito ? "fill-naranja text-naranja" : "text-cafe"}`} />
        </button>
      </div>

      <div className="flex flex-col gap-1.5 p-3">
        <h3 className="font-titulo text-lg font-semibold text-cafe">{producto.nombre}</h3>
        {/* Altura reservada aunque no haya descripción: hoy ningún producto la
            tiene, pero cuando se cargue solo para algunos, el grid no debe
            desalinearse entre tarjetas con y sin texto. */}
        <p className="line-clamp-2 min-h-[34px] text-[13px] text-cafe-suave">
          {producto.descripcion || " "}
        </p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="font-cuerpo text-base font-bold text-naranja">
            {pesos(producto.precioBase)}
          </span>
          <button
            type="button"
            disabled={agotado}
            onClick={() =>
              agregar({ id: producto.id, nombre: producto.nombre, precioBase: producto.precioBase })
            }
            className="shrink-0 rounded-full bg-naranja px-4 py-1.5 font-cuerpo text-sm font-bold text-crema transition-colors hover:bg-naranja-osc disabled:pointer-events-none disabled:opacity-50"
          >
            Agregar +
          </button>
        </div>
      </div>
    </div>
  );
}
