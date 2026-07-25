import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ItemCarrito = {
  productoId: string;
  nombre: string;
  precioBase: number;
  cantidad: number;
};

type EstadoCarrito = {
  items: ItemCarrito[];
  agregar: (producto: { id: string; nombre: string; precioBase: number }) => void;
  incrementar: (productoId: string) => void;
  decrementar: (productoId: string) => void;
  vaciar: () => void;
};

/**
 * Carrito de UI únicamente: el total que muestra es un estimado para que el
 * cliente vea qué lleva. El precio real (regla 1 de CLAUDE.md) siempre se
 * recalcula en `POST /api/pedidos` a partir de los ids de producto.
 */
export const useCarrito = create<EstadoCarrito>()(
  persist(
    (set) => ({
      items: [],
      agregar: (producto) =>
        set((estado) => {
          const existente = estado.items.find((i) => i.productoId === producto.id);
          if (existente) {
            return {
              items: estado.items.map((i) =>
                i.productoId === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i,
              ),
            };
          }
          return {
            items: [
              ...estado.items,
              {
                productoId: producto.id,
                nombre: producto.nombre,
                precioBase: producto.precioBase,
                cantidad: 1,
              },
            ],
          };
        }),
      incrementar: (productoId) =>
        set((estado) => ({
          items: estado.items.map((i) =>
            i.productoId === productoId ? { ...i, cantidad: i.cantidad + 1 } : i,
          ),
        })),
      decrementar: (productoId) =>
        set((estado) => ({
          items: estado.items
            .map((i) => (i.productoId === productoId ? { ...i, cantidad: i.cantidad - 1 } : i))
            .filter((i) => i.cantidad > 0),
        })),
      vaciar: () => set({ items: [] }),
    }),
    { name: "cronchy_carrito" },
  ),
);
