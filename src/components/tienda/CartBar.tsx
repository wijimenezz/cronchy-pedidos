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

  /**
   * **El carrito vacío esconde la BARRA, no la hoja**, y esa distinción arregla un bug feo.
   *
   * Antes esto era un `if (cantidad === 0) return null` delante de todo, así que quitar el último
   * producto desmontaba la `CartSheet` **sin cerrarla**: nadie llamaba a `cerrar()`, y `abierta` se
   * quedaba en `true` para siempre. Al añadir otro producto la hoja se montaba sola, sin que nadie
   * la pidiera, y encima de la ficha desde la que se había añadido. Dos candados de fondo
   * solapados, y de ahí salía una carta sin scroll que solo se arreglaba recargando.
   *
   * De paso, así se puede ver el «Tu carrito está vacío» que `CartSheet` ya tenía escrito y que
   * hasta ahora era inalcanzable — la hoja desaparecía antes de poder pintarlo. Que borrar el
   * último producto haga desaparecer la hoja de golpe tampoco era lo que se quería.
   */
  return (
    <>
      {cantidad > 0 && (
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
      )}

      {abierta && <CartSheet onClose={cerrar} />}
    </>
  );
}
