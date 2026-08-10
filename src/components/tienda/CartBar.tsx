"use client";

import { ArrowRight } from "lucide-react";
import { pesos } from "@/lib/notificaciones/plantillas";
import { useCarrito } from "@/lib/carrito";
import { useCartSheet } from "@/lib/tienda/cart-sheet";
import { CartSheet } from "@/components/tienda/CartSheet";

export function CartBar() {
  const abierta = useCartSheet((s) => s.abierta);
  const abrir = useCartSheet((s) => s.abrir);
  const cerrar = useCartSheet((s) => s.cerrar);
  const items = useCarrito((s) => s.items);
  const cantidad = items.reduce((t, i) => t + i.cantidad, 0);
  const total = items.reduce((t, i) => t + i.precioUnitarioEstimado * i.cantidad, 0);

  if (cantidad === 0) return null;

  return (
    <>
      <div className="sticky bottom-6 z-20 mx-4 mb-4 lg:mx-auto lg:max-w-sm">
        <button
          type="button"
          onClick={abrir}
          className="flex w-full items-center gap-3 rounded-full bg-naranja px-4 py-3 text-crema shadow-modal"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-crema text-sm font-bold text-naranja">
            {cantidad}
          </span>
          <span className="flex-1 text-center font-cuerpo font-semibold">
            Ver carrito
          </span>
          <span className="font-cuerpo font-bold">{pesos(total)}</span>
          <ArrowRight className="size-4 shrink-0" />
        </button>
      </div>

      {abierta && <CartSheet onClose={cerrar} />}
    </>
  );
}
