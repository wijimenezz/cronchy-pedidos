"use client";

import { pesos } from "@/lib/notificaciones/plantillas";
import { useCarrito } from "@/lib/carrito";

export function CartSheet({ onClose }: { onClose: () => void }) {
  const items = useCarrito((s) => s.items);
  const incrementar = useCarrito((s) => s.incrementar);
  const decrementar = useCarrito((s) => s.decrementar);
  const total = items.reduce((t, i) => t + i.precioBase * i.cantidad, 0);

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-cafe/40"
        aria-hidden
      />
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[75vh] w-full max-w-[520px] flex-col rounded-t-lg bg-tarjeta shadow-modal">
        <div className="flex items-center justify-between border-b border-crema-oscura px-5 py-4">
          <h2 className="font-titulo text-xl font-semibold text-cafe">Tu pedido</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-xl font-bold text-naranja"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-cafe-suave">
              Tu carrito está vacío. ¡Agrega unos churros!
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {items.map((item) => (
                <div key={item.productoId} className="flex items-center gap-3">
                  <div className="flex flex-1 flex-col gap-0.5">
                    <span className="font-cuerpo text-sm font-bold text-cafe">{item.nombre}</span>
                    <span className="text-[13px] text-cafe-suave">{pesos(item.precioBase)} c/u</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => decrementar(item.productoId)}
                      aria-label="Quitar uno"
                      className="flex size-7 items-center justify-center rounded-full bg-crema-oscura font-bold text-cafe"
                    >
                      −
                    </button>
                    <span className="min-w-[18px] text-center font-bold text-cafe">
                      {item.cantidad}
                    </span>
                    <button
                      type="button"
                      onClick={() => incrementar(item.productoId)}
                      aria-label="Agregar uno"
                      className="flex size-7 items-center justify-center rounded-full bg-naranja font-bold text-crema"
                    >
                      +
                    </button>
                  </div>
                  <span className="min-w-16 text-right font-cuerpo text-sm font-bold text-cafe">
                    {pesos(item.precioBase * item.cantidad)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-crema-oscura px-5 py-4">
            <div className="flex justify-between font-cuerpo text-base font-bold text-cafe">
              <span>Total</span>
              <span>{pesos(total)}</span>
            </div>
            {/* El checkout (datos del cliente, zona, pago) aún no existe — se
                construye en una fase aparte. Esta hoja solo arma el carrito. */}
            <button
              type="button"
              disabled
              className="rounded-full bg-naranja px-4 py-3 font-cuerpo text-sm font-bold text-crema opacity-50"
            >
              Continuar (próximamente)
            </button>
          </div>
        )}
      </div>
    </>
  );
}
