import { useSyncExternalStore } from "react";

export type TipoPedido = "domicilio" | "recoger";

const STORAGE_KEY = "cronchy_tipo_pedido";
const EVENTO_CAMBIO = "cronchy-tipo-pedido-changed";

function esTipoPedido(valor: string | null): valor is TipoPedido {
  return valor === "domicilio" || valor === "recoger";
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENTO_CAMBIO, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENTO_CAMBIO, callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): TipoPedido | null {
  const valor = localStorage.getItem(STORAGE_KEY);
  return esTipoPedido(valor) ? valor : null;
}

function getServerSnapshot(): TipoPedido | null {
  return null;
}

/**
 * Lee el tipo de pedido (domicilio/recoger) elegido en el modal de bienvenida.
 *
 * `useSyncExternalStore` evita el error de hidratación, pero OJO: no evita el
 * parpadeo. El snapshot del servidor es siempre `null`, así que en una página
 * estática (ISR) el HTML se pinta como si nadie hubiera elegido nunca, y el valor
 * real recién aparece al hidratar. Quien dependa de esto para decidir si pinta algo
 * tiene que esperar al montaje —como hace `SelectorTipoPedido`— o el usuario verá
 * aparecer y desaparecer cosas.
 */
export function useTipoPedido(): TipoPedido | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function elegirTipoPedido(nuevo: TipoPedido) {
  localStorage.setItem(STORAGE_KEY, nuevo);
  window.dispatchEvent(new Event(EVENTO_CAMBIO));
}
