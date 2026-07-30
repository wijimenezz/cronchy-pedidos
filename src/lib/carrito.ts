import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ModificadorCarrito = {
  modifierOptionId: string;
  grupo: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
};

export type SeleccionCarrito = {
  productModifierGroupId: string;
  opciones: { modifierOptionId: string; cantidad: number }[];
};

export type AvisoCarrito = {
  productModifierGroupId: string;
  nombreGrupo: string;
  minSelect: number;
  recibidas: number;
};

export type ItemCarrito = {
  /** Identidad de esta línea (no del producto): dos configuraciones distintas
   * del mismo producto son líneas separadas. */
  lineId: string;
  productoId: string;
  nombre: string;
  precioBase: number;
  /** Estimado de UI (precioBase + modificadores). El precio real siempre se
   * recalcula en `POST /api/pedidos` (regla 1 de CLAUDE.md). */
  precioUnitarioEstimado: number;
  cantidad: number;
  /** Mapea 1:1 a `SeleccionEnganche[]` de `lib/precios` para el checkout futuro. */
  seleccion: SeleccionCarrito[];
  /** Denormalizado para pintar el carrito sin volver a pedir el producto. */
  modificadores: ModificadorCarrito[];
  avisos: AvisoCarrito[];
  notas?: string | null;
};

type EstadoCarrito = {
  items: ItemCarrito[];
  /** Observación del pedido completo (no por línea), ej. "Sin canela". */
  notas: string;
  /** Producto sin modificadores: agrega directo, igual que hoy. */
  agregarSimple: (producto: { id: string; nombre: string; precioBase: number }) => void;
  /** Producto configurado desde la ficha (con o sin modificadores/upsells):
   * siempre crea una línea nueva, no intenta fusionar configuraciones. */
  agregarConfigurado: (item: Omit<ItemCarrito, "lineId">) => void;
  setNotas: (notas: string) => void;
  incrementar: (lineId: string) => void;
  decrementar: (lineId: string) => void;
  eliminar: (lineId: string) => void;
  vaciar: () => void;
};

/**
 * Carrito de UI únicamente: el total que muestra es un estimado para que el
 * cliente vea qué lleva. El precio real (regla 1 de CLAUDE.md) siempre se
 * recalcula en `POST /api/pedidos` a partir de los ids de producto y opciones.
 */
export const useCarrito = create<EstadoCarrito>()(
  persist(
    (set) => ({
      items: [],
      notas: "",
      agregarSimple: (producto) =>
        set((estado) => {
          const existente = estado.items.find(
            (i) => i.productoId === producto.id && i.seleccion.length === 0,
          );
          if (existente) {
            return {
              items: estado.items.map((i) =>
                i.lineId === existente.lineId ? { ...i, cantidad: i.cantidad + 1 } : i,
              ),
            };
          }
          return {
            items: [
              ...estado.items,
              {
                lineId: crypto.randomUUID(),
                productoId: producto.id,
                nombre: producto.nombre,
                precioBase: producto.precioBase,
                precioUnitarioEstimado: producto.precioBase,
                cantidad: 1,
                seleccion: [],
                modificadores: [],
                avisos: [],
              },
            ],
          };
        }),
      agregarConfigurado: (item) =>
        set((estado) => ({
          items: [...estado.items, { ...item, lineId: crypto.randomUUID() }],
        })),
      incrementar: (lineId) =>
        set((estado) => ({
          items: estado.items.map((i) => (i.lineId === lineId ? { ...i, cantidad: i.cantidad + 1 } : i)),
        })),
      decrementar: (lineId) =>
        set((estado) => ({
          items: estado.items
            .map((i) => (i.lineId === lineId ? { ...i, cantidad: i.cantidad - 1 } : i))
            .filter((i) => i.cantidad > 0),
        })),
      eliminar: (lineId) =>
        set((estado) => ({ items: estado.items.filter((i) => i.lineId !== lineId) })),
      setNotas: (notas) => set({ notas }),
      vaciar: () => set({ items: [], notas: "" }),
    }),
    {
      name: "cronchy_carrito",
      // v1 agregó lineId/seleccion/modificadores/avisos/precioUnitarioEstimado
      // a cada línea. Un carrito guardado en localStorage con la forma vieja
      // (antes de v1) no tiene esos campos — no hay forma de reconstruirlos
      // sin volver a pedir cada producto, así que se descarta en vez de dejar
      // que la UI truene leyendo un campo inexistente.
      //
      // v2: las bebidas pasaron a tener opciones obligatorias (gas, sabor, dulzor). Una
      // línea de bebida guardada antes lleva `seleccion: []` y el servidor la rechazaría
      // con un 422 en el checkout, donde el cliente ya no puede reconfigurarla. Se
      // descarta el carrito: perder un carrito una vez es mejor que un pedido bloqueado.
      version: 2,
      migrate: (persistedState, version) => {
        if (version < 2) return { items: [] };
        return persistedState as EstadoCarrito;
      },
    },
  ),
);
