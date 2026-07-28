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
 * Lee el tipo de pedido (domicilio/recoger) elegido en el modal de bienvenida,
 * sin parpadeo ni mismatch de hidratación: React corrige el snapshot del
 * servidor (siempre null) al del cliente antes del primer paint.
 */
export function useTipoPedido(): TipoPedido | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function elegirTipoPedido(nuevo: TipoPedido) {
  localStorage.setItem(STORAGE_KEY, nuevo);
  window.dispatchEvent(new Event(EVENTO_CAMBIO));
}
