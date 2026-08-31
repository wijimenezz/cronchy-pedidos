"use client";

import Link from "next/link";
import { pesos } from "@/lib/notificaciones/plantillas";
import { useCarrito } from "@/lib/carrito";
import { Campo, claseControl } from "@/components/checkout/Campo";

/**
 * El mismo tope que `crearPedidoSchema` le pone a `notas`. Se repite el número porque el esquema
 * no lo exporta; si allá cambia, aquí también — el test del esquema es el que fija cuál manda.
 */
const MAX_NOTAS = 100;

function resumenModificadores(item: {
  modificadores: { nombre: string; cantidad: number }[];
}): string | null {
  if (item.modificadores.length === 0) return null;
  return item.modificadores
    .map((m) => (m.cantidad > 1 ? `${m.cantidad}x ${m.nombre}` : m.nombre))
    .join(", ");
}

export function CartSheet({ onClose }: { onClose: () => void }) {
  const items = useCarrito((s) => s.items);
  const incrementar = useCarrito((s) => s.incrementar);
  const decrementar = useCarrito((s) => s.decrementar);
  const notas = useCarrito((s) => s.notas);
  const setNotas = useCarrito((s) => s.setNotas);
  const total = items.reduce(
    (t, i) => t + i.precioUnitarioEstimado * i.cantidad,
    0,
  );

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-cafe/40"
        aria-hidden
      />
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[75vh] w-full max-w-[520px] flex-col rounded-t-lg bg-tarjeta shadow-modal">
        <div className="flex items-center justify-between border-b border-crema-oscura px-5 py-4">
          <h2 className="font-titulo text-xl font-semibold text-cafe">
            Tu pedido
          </h2>
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
                <div key={item.lineId} className="flex items-center gap-3">
                  <div className="flex flex-1 flex-col gap-0.5">
                    <span className="font-cuerpo text-sm font-bold text-cafe">
                      {item.nombre}
                    </span>
                    {resumenModificadores(item) && (
                      <span className="text-[12px] text-cafe-suave">
                        {resumenModificadores(item)}
                      </span>
                    )}
                    <span className="text-[13px] text-cafe-suave">
                      {pesos(item.precioUnitarioEstimado)} c/u
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => decrementar(item.lineId)}
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
                      onClick={() => incrementar(item.lineId)}
                      aria-label="Agregar uno"
                      className="flex size-7 items-center justify-center rounded-full bg-naranja font-bold text-crema"
                    >
                      +
                    </button>
                  </div>
                  <span className="min-w-16 text-right font-cuerpo text-sm font-bold text-cafe">
                    {pesos(item.precioUnitarioEstimado * item.cantidad)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-crema-oscura px-5 py-4">
            <Campo etiqueta="Notas para el pedido" ayuda="Opcional.">
              {(props) => (
                <div className="flex flex-col gap-1">
                  <textarea
                    {...props}
                    rows={2}
                    value={notas}
                    onChange={(e) =>
                      setNotas(e.target.value.slice(0, MAX_NOTAS))
                    }
                    // El tope va también en el atributo: el `slice` cubre el pegado, y esto le
                    // dice al navegador que no acepte más pulsaciones.
                    maxLength={MAX_NOTAS}
                    placeholder="Para mi churrito favorito, feliz día"
                    className={claseControl()}
                  />
                  {/* El contador solo aparece cuando ya se escribió algo: en blanco sería un
                      "0/100" avisando de un límite que nadie está cerca de tocar. */}
                  {notas.length > 0 && (
                    <span
                      aria-live="polite"
                      className={`self-end font-cuerpo text-[12px] ${
                        notas.length === MAX_NOTAS
                          ? "text-alerta"
                          : "text-cafe-tenue"
                      }`}
                    >
                      {notas.length}/{MAX_NOTAS}
                    </span>
                  )}
                </div>
              )}
            </Campo>

            <div className="flex justify-between font-cuerpo text-base font-bold text-cafe">
              <span>Total</span>
              <span>{pesos(total)}</span>
            </div>
            {/* El gate de tienda cerrada vive en /checkout, que sí tiene datos del
                servidor; aquí no hace falta otra llamada. */}
            <Link
              href="/checkout"
              onClick={onClose}
              className="flex min-h-11 items-center justify-center rounded-full bg-naranja px-4 py-3 font-cuerpo text-sm font-bold text-crema"
            >
              Continuar
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
