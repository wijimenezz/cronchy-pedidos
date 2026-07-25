"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { pesos } from "@/lib/notificaciones/plantillas";
import { useCarrito } from "@/lib/carrito";
import { CartSheet } from "@/components/tienda/CartSheet";

export function CartBar() {
  const [abierto, setAbierto] = useState(false);
  const items = useCarrito((s) => s.items);
  const cantidad = items.reduce((t, i) => t + i.cantidad, 0);
  const total = items.reduce((t, i) => t + i.precioBase * i.cantidad, 0);

  return (
    <>
      <div className="sticky bottom-0 z-20 mx-4 mb-4">
        <div className="flex items-center gap-3 rounded-full bg-naranja px-4 py-3 text-crema shadow-modal">
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="flex flex-1 items-center gap-3"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-crema text-sm font-bold text-naranja">
              {cantidad}
            </span>
            <span className="flex-1 text-center font-cuerpo font-semibold">Ver carrito</span>
            <span className="font-cuerpo font-bold">{pesos(total)}</span>
          </button>
          <button
            type="button"
            aria-label="Buscar"
            className="rounded-full bg-crema/20 p-1.5 hover:bg-crema/30"
          >
            <Search className="size-4" />
          </button>
        </div>
      </div>

      {abierto && <CartSheet onClose={() => setAbierto(false)} />}
    </>
  );
}
