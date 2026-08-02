import type { ProductoParaFicha } from "@/db/queries/productos";

// Caché en memoria de la sesión (se pierde al recargar la página, y eso está
// bien: es solo para que abrir la ficha se sienta instantáneo). Guarda la
// PROMESA, no el valor resuelto, para que una precarga en curso y un click
// que llega antes de que termine compartan el mismo request en vez de
// disparar dos.
const cache = new Map<string, Promise<ProductoParaFicha>>();

/**
 * Vacía la caché. La usa `RefrescarAlVolver`.
 *
 * `router.refresh()` rehace el árbol del servidor, pero este `Map` vive en el navegador y
 * no se entera. Sin vaciarlo, la rejilla mostraría el precio nuevo y el modal del mismo
 * producto seguiría con el viejo — que es peor que no refrescar nada.
 */
export function limpiarCacheProductos(): void {
  cache.clear();
}

export function precargarProducto(productId: string): Promise<ProductoParaFicha> {
  let promesa = cache.get(productId);
  if (!promesa) {
    promesa = fetch(`/api/productos/${productId}`).then((r) => {
      if (!r.ok) throw new Error("No se pudo cargar el producto");
      return r.json() as Promise<ProductoParaFicha>;
    });
    // Si falla, no se queda en caché — el próximo intento vuelve a pedirlo.
    promesa.catch(() => cache.delete(productId));
    cache.set(productId, promesa);
  }
  return promesa;
}
