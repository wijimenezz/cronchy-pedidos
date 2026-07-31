"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { ResultadoToggle } from "./acciones";

/**
 * Un clic, sin confirmación (CLAUDE.md: los toggles del panel son operación diaria).
 *
 * El estado se pinta con `useOptimistic` para que el switch responda al toque en vez de
 * esperar el viaje al servidor: en el mostrador, un control que tarda medio segundo se
 * toca dos veces. Si el servidor rechaza, React revierte solo al terminar la transición.
 */
export function Interruptor({
  id,
  nombre,
  disponible,
  accion,
}: {
  id: string;
  nombre: string;
  disponible: boolean;
  accion: (entrada: { id: string; disponible: boolean }) => Promise<ResultadoToggle>;
}) {
  const [pendiente, iniciar] = useTransition();
  const [optimista, setOptimista] = useOptimistic(disponible);
  const [error, setError] = useState<string | null>(null);

  function alternar() {
    const nuevo = !optimista;
    setError(null);

    iniciar(async () => {
      setOptimista(nuevo);
      const resultado = await accion({ id, disponible: nuevo });
      if (!resultado.ok) setError(resultado.error);
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div>
        <span
          className={`font-cuerpo text-[15px] ${optimista ? "text-cafe" : "text-agotado line-through"}`}
        >
          {nombre}
        </span>
        {error && (
          <p role="alert" className="font-cuerpo text-[13px] font-semibold text-error">
            {error}
          </p>
        )}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={optimista}
        aria-label={`${nombre}: ${optimista ? "disponible" : "agotado"}`}
        onClick={alternar}
        disabled={pendiente}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-naranja focus:ring-offset-2 disabled:opacity-60 ${optimista ? "bg-exito" : "bg-agotado"}`}
      >
        <span
          className={`absolute top-1 size-5 rounded-full bg-tarjeta transition-all ${optimista ? "left-6" : "left-1"}`}
        />
      </button>
    </div>
  );
}
