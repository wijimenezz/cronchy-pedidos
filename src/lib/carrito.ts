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

export type MetodoPago = "efectivo" | "nequi";

/**
 * El pago del pedido EN CURSO. Vive aquí y no en `datos-cliente` a propósito: este
 * store se limpia con `vaciar()` al crear el pedido, así que el comprobante nunca
 * sobrevive al pedido que lo originó. En el store de datos del cliente —que persiste
 * entre pedidos— el comprobante de ayer terminaría adjunto al pedido de hoy.
 *
 * Que se persista es justo lo que hace posible el viaje a Nequi: el cliente sale de la
 * pestaña a pagar, Android la mata, vuelve, y encuentra todo como lo dejó.
 */
type EstadoCarrito = {
  items: ItemCarrito[];
  /** Observación del pedido completo (no por línea), ej. "Sin canela". */
  notas: string;
  metodoPago: MetodoPago;
  comprobanteUrl: string | null;
  /** Tocó "Ya realicé mi pago": recién ahí se le ofrece adjuntar el comprobante. */
  pagoConfirmado: boolean;
  /** Paso del checkout, para volver donde estaba y no al principio. */
  paso: 1 | 2 | 3;
  /** Producto sin modificadores: agrega directo, igual que hoy. */
  agregarSimple: (producto: { id: string; nombre: string; precioBase: number }) => void;
  /** Producto configurado desde la ficha (con o sin modificadores/upsells):
   * siempre crea una línea nueva, no intenta fusionar configuraciones. */
  agregarConfigurado: (item: Omit<ItemCarrito, "lineId">) => void;
  setNotas: (notas: string) => void;
  setPago: (
    pago: Partial<Pick<EstadoCarrito, "metodoPago" | "comprobanteUrl" | "pagoConfirmado">>,
  ) => void;
  setPaso: (paso: 1 | 2 | 3) => void;
  incrementar: (lineId: string) => void;
  decrementar: (lineId: string) => void;
  eliminar: (lineId: string) => void;
  vaciar: () => void;
};

/** Lo único del carrito que sobrevive entre visitas. Ver `partialize` más abajo. */
type CarritoPersistido = {
  items: ItemCarrito[];
  metodoPago: MetodoPago;
  comprobanteUrl: string | null;
  pagoConfirmado: boolean;
  paso: 1 | 2 | 3;
};

const PERSISTIDO_VACIO: CarritoPersistido = {
  items: [],
  metodoPago: "efectivo",
  comprobanteUrl: null,
  pagoConfirmado: false,
  paso: 1,
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
      metodoPago: "efectivo",
      comprobanteUrl: null,
      pagoConfirmado: false,
      paso: 1,
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
      setPago: (pago) => set(pago),
      setPaso: (paso) => set({ paso }),
      // Con el pedido ya creado se borra TODO lo del pedido en curso, incluido el
      // comprobante: si sobreviviera, el próximo pedido nacería con un pago ajeno.
      vaciar: () =>
        set({
          items: [],
          notas: "",
          metodoPago: "efectivo",
          comprobanteUrl: null,
          pagoConfirmado: false,
          paso: 1,
        }),
    }),
    {
      name: "cronchy_carrito",
      /**
       * Lista explícita de lo que sobrevive entre visitas. Se enumera lo que SÍ se
       * guarda en vez de omitir lo que no, para que agregar un campo al store obligue
       * a decidir a conciencia si debe persistir, en vez de que se cuele solo.
       *
       * `notas` queda deliberadamente afuera: es lo que el cliente escribe para ESE
       * pedido ("sin canela"). Si se guardara, quien lo pide una vez lo pediría para
       * siempre sin enterarse. Sigue viviendo en el store durante la visita.
       *
       * Los datos de pago y el paso sí se guardan: son los que permiten salir a la app
       * de Nequi, pagar y volver sin perder el comprobante. `vaciar()` los limpia al
       * crear el pedido, así que tampoco se heredan al siguiente.
       */
      partialize: (estado): CarritoPersistido => ({
        items: estado.items,
        metodoPago: estado.metodoPago,
        comprobanteUrl: estado.comprobanteUrl,
        pagoConfirmado: estado.pagoConfirmado,
        paso: estado.paso,
      }),
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
      //
      // v3: `notas` dejó de persistirse. Una nota guardada por una versión anterior
      // sigue en localStorage, así que hay que descartarla explícitamente.
      version: 3,
      migrate: (persistedState, version) => {
        if (version < 2) return PERSISTIDO_VACIO;

        // Se reconstruye campo a campo, no con un spread: así la `notas` que las
        // versiones anteriores sí guardaban queda fuera y no vuelve por la puerta de
        // atrás al fusionarse con el estado inicial.
        const guardado = persistedState as Partial<CarritoPersistido>;
        return {
          items: guardado.items ?? [],
          metodoPago: guardado.metodoPago ?? "efectivo",
          comprobanteUrl: guardado.comprobanteUrl ?? null,
          pagoConfirmado: guardado.pagoConfirmado ?? false,
          paso: guardado.paso ?? 1,
        };
      },
    },
  ),
);
