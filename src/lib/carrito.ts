import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TipoPedido } from "@/lib/tienda/tipo-pedido";

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
  /**
   * Por qué canales se vendía este producto al añadirlo.
   *
   * Es un dato **de UI**, como `precioUnitarioEstimado`: sirve para sacar del carrito lo que
   * dejó de poder venderse al cambiar de domicilio a recoger, y nada más. Quien decide de
   * verdad sigue siendo el servidor al confirmar (regla 1), así que si el admin cambia el canal
   * mientras alguien tiene el carrito abierto, lo peor que pasa es lo que pasaba antes: el
   * pedido se rechaza al crearlo.
   */
  disponibleDelivery: boolean;
  disponiblePickup: boolean;
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
  agregarSimple: (producto: {
    id: string;
    nombre: string;
    precioBase: number;
    disponibleDelivery: boolean;
    disponiblePickup: boolean;
  }) => void;
  /**
   * Saca del carrito lo que no se puede vender por ese canal y **devuelve lo que sacó**.
   *
   * Devuelve las líneas en vez de solo quitarlas porque quitar en silencio es peor que el bug
   * que arregla: el cliente vuelve al carrito y falta algo sin explicación. Quien la llama
   * necesita los nombres para poder decirlo.
   */
  depurarPorTipo: (tipo: TipoPedido) => ItemCarrito[];
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
    // `get` y no `useCarrito.getState()`: referirse al store desde dentro de su propio creador
    // es una referencia circular que deja a TypeScript sin poder inferir `EstadoCarrito`.
    (set, get) => ({
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
                disponibleDelivery: producto.disponibleDelivery,
                disponiblePickup: producto.disponiblePickup,
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
      depurarPorTipo: (tipo) => {
        // `!== false` y no el valor a secas: solo un `false` explícito retira una línea. Una
        // guardada sin estos campos —`migrate` las normaliza, pero esto es lo único que borra
        // sin que el cliente lo pida— se queda, que es como se comportaba antes de existir el
        // dato. Equivocarse hacia el otro lado es vaciarle el carrito a alguien en silencio.
        const sobreviven = (i: ItemCarrito) =>
          tipo === "domicilio" ? i.disponibleDelivery !== false : i.disponiblePickup !== false;

        const retiradas = get().items.filter((i) => !sobreviven(i));
        if (retiradas.length > 0) {
          set((estado) => ({ items: estado.items.filter(sobreviven) }));
        }

        return retiradas;
      },
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
      //
      // v4: cada línea guarda por qué canales se vende su producto. **Aquí NO se descarta el
      // carrito**, al revés que en v1 y v2: allí faltaban datos sin los que la UI reventaba o
      // el servidor rechazaba el pedido, y perder el carrito era el mal menor. Un canal que
      // falta se puede suponer —`true`/`true` es exactamente como se comportaba antes— y tirarle
      // el carrito a alguien por un campo informativo sería un castigo desproporcionado.
      version: 4,
      migrate: (persistedState, version) => {
        if (version < 2) return PERSISTIDO_VACIO;

        // Se reconstruye campo a campo, no con un spread: así la `notas` que las
        // versiones anteriores sí guardaban queda fuera y no vuelve por la puerta de
        // atrás al fusionarse con el estado inicial.
        const guardado = persistedState as Partial<CarritoPersistido>;
        return {
          items: (guardado.items ?? []).map((item) => ({
            ...item,
            disponibleDelivery: item.disponibleDelivery ?? true,
            disponiblePickup: item.disponiblePickup ?? true,
          })),
          metodoPago: guardado.metodoPago ?? "efectivo",
          comprobanteUrl: guardado.comprobanteUrl ?? null,
          pagoConfirmado: guardado.pagoConfirmado ?? false,
          paso: guardado.paso ?? 1,
        };
      },
    },
  ),
);
