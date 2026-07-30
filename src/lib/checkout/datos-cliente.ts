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
  /** Id de la zona elegida, o el centinela de "mi barrio no aparece". */
  zonaId: string;
  barrioTexto: string;
  direccion: string;
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
  zonaId: "",
  barrioTexto: "",
  direccion: "",
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
    { name: "cronchy_datos_cliente", version: 1 },
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
