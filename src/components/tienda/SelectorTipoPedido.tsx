"use client";

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { Bike, ChevronDown, ShoppingBag } from "lucide-react";

const STORAGE_KEY = "cronchy_tipo_pedido";
const EVENTO_CAMBIO = "cronchy-tipo-pedido-changed";

type TipoPedido = "domicilio" | "recoger";

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

export function SelectorTipoPedido() {
  // Lee localStorage sin parpadeo ni mismatch de hidratación: React corrige el
  // snapshot del servidor (siempre null) al del cliente antes del primer paint.
  const tipo = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [reabierto, setReabierto] = useState(false);

  const mostrarModal = reabierto || tipo === null;

  function elegir(nuevo: TipoPedido) {
    localStorage.setItem(STORAGE_KEY, nuevo);
    window.dispatchEvent(new Event(EVENTO_CAMBIO));
    setReabierto(false);
  }

  return (
    <>
      {tipo && (
        <button
          type="button"
          onClick={() => setReabierto(true)}
          className="flex items-center gap-1.5 rounded-full bg-crema-oscura px-3 py-1 text-sm font-medium text-cafe"
        >
          {tipo === "domicilio" ? <Bike className="size-4" /> : <ShoppingBag className="size-4" />}
          {tipo === "domicilio" ? "Domicilio" : "Recoger"}
          <ChevronDown className="size-3.5" />
        </button>
      )}

      {mostrarModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-cafe/40 sm:items-center"
          onClick={() => {
            if (tipo) setReabierto(false);
          }}
        >
          <div
            className="w-full max-w-sm rounded-t-lg bg-tarjeta p-6 sm:rounded-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center">
              <Image src="/churro-gorra.png" alt="" width={318} height={456} className="h-24 w-auto" />
            </div>
            <h2 className="mt-2 text-center font-titulo text-xl font-semibold text-cafe">
              ¿Cómo quieres tu pedido?
            </h2>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => elegir("domicilio")}
                className="flex flex-1 flex-col items-center gap-2 rounded-md border border-crema-oscura py-4 text-cafe hover:border-naranja hover:text-naranja"
              >
                <Bike className="size-6" />
                Domicilio
              </button>
              <button
                type="button"
                onClick={() => elegir("recoger")}
                className="flex flex-1 flex-col items-center gap-2 rounded-md border border-crema-oscura py-4 text-cafe hover:border-naranja hover:text-naranja"
              >
                <ShoppingBag className="size-6" />
                Recoger
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
