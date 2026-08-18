"use client";

import { Check, TicketPercent } from "lucide-react";
import { useCarrito } from "@/lib/carrito";

/**
 * El aviso del cupón vigente, arriba de la carta.
 *
 * Existe porque un cupón que solo conoce quien vio el post de Instagram deja fuera a quien entró
 * por el link de siempre. Aquí se entera, y lo aplica de un toque en vez de memorizar el código.
 *
 * **Es cliente aunque sea casi texto**, porque el toque tiene que escribir en el carrito. Lo que
 * decide si se muestra —activo y no vencido— pasó en el servidor (`cuponAnunciado`): esta pantalla
 * no sabe de fechas.
 */
export function AvisoCupon({ codigo, anuncio }: { codigo: string; anuncio: string }) {
  const cupon = useCarrito((s) => s.cupon);
  const setCupon = useCarrito((s) => s.setCupon);
  const puesto = cupon === codigo;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-naranja/30 bg-naranja/10 px-4 py-3">
      <TicketPercent className="size-5 shrink-0 text-naranja" aria-hidden />
      <p className="min-w-[12rem] flex-1 font-cuerpo text-sm text-cafe">{anuncio}</p>

      {/* Cuando ya está puesto no se ofrece quitarlo aquí: se quita en el checkout, que es donde
          se ve cuánto descuenta. Aquí solo hay que saber que quedó guardado. */}
      {puesto ? (
        <span className="flex shrink-0 items-center gap-2 font-cuerpo text-sm font-bold text-exito">
          <Check className="size-4" />
          {codigo} guardado
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setCupon(codigo)}
          className="min-h-11 shrink-0 rounded-full bg-naranja px-5 font-cuerpo text-sm font-bold text-crema transition-colors hover:bg-naranja-osc"
        >
          Usar {codigo}
        </button>
      )}
    </div>
  );
}
