"use client";

import { ShoppingBag } from "lucide-react";
import { useCarrito } from "@/lib/carrito";
import { useCartSheet } from "@/lib/tienda/cart-sheet";

export function CartButton({ className }: { className?: string }) {
  const items = useCarrito((s) => s.items);
  const abrir = useCartSheet((s) => s.abrir);
  const cantidad = items.reduce((t, i) => t + i.cantidad, 0);

  return (
    <button
      type="button"
      onClick={abrir}
      aria-label="Ver carrito"
      className={`relative -ml-3 mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-crema lg:mr-0 ${className ?? ""}`}
    >
      <ShoppingBag className="size-7" />
      {/* El badge se queda OSCURO con el número en crema, y con la bolsa clara es lo
          correcto: la pastilla tiene 11.92:1 contra el icono sobre el que se dibuja, y el
          número dentro otros 11.92:1. En claro se fundiría con la bolsa. */}
      {cantidad > 0 && (
        <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-cafe text-[10px] font-bold text-crema">
          {cantidad}
        </span>
      )}
    </button>
  );
}
