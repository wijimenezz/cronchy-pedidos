"use client";

import { useEffect } from "react";
import { useCarrito } from "@/lib/carrito";
import { normalizarCodigo } from "@/lib/cupones";

/**
 * Guarda el cupón que venga en la URL: `cronchy.com/?cupon=CHURRO10`.
 *
 * Existe para que el cupón se pueda repartir por donde ya se reparte el link —la bio de Instagram,
 * un QR en el mostrador, un mensaje— y el cliente no tenga que teclear un código en un celular.
 * Llega al checkout ya aplicado.
 *
 * **Lee `window.location` en un efecto y NO usa `useSearchParams()`**, y eso no es un capricho: la
 * carta se sirve con ISR (`revalidate = 60`), y ese hook en una página estática obliga a envolverla
 * en `<Suspense>` y empuja ese subárbol a renderizarse en el cliente. Un efecto que mira
 * `location` no toca la estrategia de renderizado en absoluto.
 *
 * No pinta nada. Va en el layout de la tienda para que el link funcione desde cualquier página
 * pública, no solo desde la portada.
 */
export function CapturarCupon() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codigo = normalizarCodigo(params.get("cupon") ?? "");
    if (!codigo) return;

    // Se limpia la URL: si se quedara, compartir la página o recargarla volvería a aplicar un cupón
    // que el cliente pudo haber quitado a propósito.
    params.delete("cupon");
    const resto = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (resto ? `?${resto}` : ""));

    const aplicar = () => useCarrito.getState().setCupon(codigo);

    // Si se escribiera antes de que el carrito termine de rehidratarse, la rehidratación pisaría el
    // cupón con el valor guardado (normalmente `null`) y el link no habría servido de nada.
    if (useCarrito.persist.hasHydrated()) {
      aplicar();
      return;
    }
    return useCarrito.persist.onFinishHydration(aplicar);
  }, []);

  return null;
}
