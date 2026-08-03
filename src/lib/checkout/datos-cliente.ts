import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Lo que el cliente ya escribió alguna vez, para no volver a pedírselo en el próximo
 * pedido. Vive en localStorage (su propio dispositivo), igual que el carrito.
 *
 * NO se guarda el comprobante de Nequi, el método de pago ni el visto bueno de la
 * política: son decisiones de UN pedido, no datos del cliente. Repetirlas sin que las
 * vuelva a elegir sería asumir por él.
 */
export type DatosCliente = {
  nombre: string;
  telefono: string;
  email: string;
  cumple: string;
  /**
   * El último pin que confirmó (regla 14). Se guarda porque casi siempre pide a la misma
   * casa: al volver, el mapa abre donde lo dejó y solo tiene que confirmar.
   */
  punto: { lat: number; lng: number } | null;
  direccion: string;
  /** El barrio que confirmó. Se guarda igual que la dirección: es la misma casa de siempre. */
  barrio: string;
  indicaciones: string;
  recibeOtro: boolean;
  recibeNombre: string;
  recibeTelefono: string;
};

const VACIO: DatosCliente = {
  nombre: "",
  telefono: "",
  email: "",
  cumple: "",
  punto: null,
  direccion: "",
  barrio: "",
  indicaciones: "",
  recibeOtro: false,
  recibeNombre: "",
  recibeTelefono: "",
};

type EstadoDatosCliente = DatosCliente & {
  /** Un solo setter: el formulario actualiza campo a campo mientras se escribe. */
  set: (parcial: Partial<DatosCliente>) => void;
  olvidar: () => void;
};

export const useDatosCliente = create<EstadoDatosCliente>()(
  persist(
    (set) => ({
      ...VACIO,
      set: (parcial) => set(parcial),
      olvidar: () => set(VACIO),
    }),
    {
      name: "cronchy_datos_cliente",
      // v2: `zonaId` y `barrioTexto` salieron cuando el domicilio pasó a calcularse por el
      // pin (regla 14). Se descartan esos dos y se conserva todo lo demás: el nombre y el
      // teléfono siguen siendo válidos, y hacer que el cliente los reescriba por un cambio
      // interno sería cobrarle a él nuestra refactorización.
      //
      // v3: vuelve el barrio, ahora sí como lo que siempre debió ser —referencia para el
      // domiciliario, no insumo del precio—. Entra vacío: el `barrioTexto` de la v1 se
      // descartó hace dos versiones y no hay de dónde recuperarlo. Lo rellena el pin.
      version: 3,
      migrate: (estado) => {
        const viejo = (estado ?? {}) as Partial<DatosCliente>;
        return {
          ...VACIO,
          nombre: viejo.nombre ?? "",
          telefono: viejo.telefono ?? "",
          email: viejo.email ?? "",
          cumple: viejo.cumple ?? "",
          // El pin sí se conserva desde la v2, y es de donde sale la sugerencia de barrio en
          // cuanto el cliente vuelva al checkout.
          punto: viejo.punto ?? null,
          direccion: viejo.direccion ?? "",
          barrio: viejo.barrio ?? "",
          indicaciones: viejo.indicaciones ?? "",
          recibeOtro: viejo.recibeOtro ?? false,
          recibeNombre: viejo.recibeNombre ?? "",
          recibeTelefono: viejo.recibeTelefono ?? "",
        } as EstadoDatosCliente;
      },
    },
  ),
);

/**
 * `true` cuando `persist` ya leyó localStorage. Antes de eso el store está vacío, así
 * que pintar el formulario mostraría los campos en blanco y luego un salto al llenarse.
 *
 * Se lee con `useSyncExternalStore` —igual que el carrito y `useTipoPedido`— porque el
 * snapshot del servidor es siempre `false`: React concilia la diferencia sin error de
 * hidratación.
 */
export function useDatosClienteHidratados(): boolean {
  return useSyncExternalStore(
    (cb) => useDatosCliente.persist.onFinishHydration(cb),
    () => useDatosCliente.persist.hasHydrated(),
    () => false,
  );
}
