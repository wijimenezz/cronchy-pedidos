import { create } from "zustand";

// Estado de UI puro (abrir/cerrar el panel del carrito), separado de
// src/lib/carrito.ts que guarda los items del pedido. El botón de carrito del
// Header y la barra inferior CartBar comparten este store para abrir la misma
// CartSheet desde dos lugares distintos del árbol.
type EstadoHojaCarrito = {
  abierta: boolean;
  abrir: () => void;
  cerrar: () => void;
};

export const useCartSheet = create<EstadoHojaCarrito>((set) => ({
  abierta: false,
  abrir: () => set({ abierta: true }),
  cerrar: () => set({ abierta: false }),
}));
