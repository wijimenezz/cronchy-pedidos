"use client";

import { useState } from "react";
import Image from "next/image";
import { Bike, ChevronDown, ShoppingBag } from "lucide-react";
import { elegirTipoPedido, useTipoPedido, type TipoPedido } from "@/lib/tienda/tipo-pedido";

export function SelectorTipoPedido() {
  const tipo = useTipoPedido();
  const [reabierto, setReabierto] = useState(false);

  const mostrarModal = reabierto || tipo === null;

  function elegir(nuevo: TipoPedido) {
    elegirTipoPedido(nuevo);
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
