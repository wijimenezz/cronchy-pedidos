"use client";

import { useOptimistic, useState, useTransition } from "react";

/**
 * Un clic, sin confirmación (CLAUDE.md: los toggles del panel son operación diaria).
 *
 * El estado se pinta con `useOptimistic` para que el switch responda al toque en vez de
 * esperar el viaje al servidor: en el mostrador, un control que tarda medio segundo se
 * toca dos veces. Si el servidor rechaza, React revierte solo al terminar la transición.
 *
 * Vive en `components/admin` y no junto a una pantalla porque lo usan "Qué hay hoy" y el
 * CRUD de productos, y son el mismo control sobre la misma columna.
 */

/** La forma que devuelven todas las server actions del panel. Se declara aquí para que el
 *  componente no dependa del `acciones.ts` de ninguna ruta en particular. */
type Resultado = { ok: true } | { ok: false; error: string };

export function Interruptor({
  id,
  nombre,
  disponible,
  accion,
  deshabilitado = false,
}: {
  id: string;
  nombre: string;
  disponible: boolean;
  accion: (entrada: { id: string; disponible: boolean }) => Promise<Resultado>;
  /** El colaborador ve el switch, pero hay pantallas donde no le toca moverlo. */
  deshabilitado?: boolean;
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

      <BotonSwitch
        activo={optimista}
        etiqueta={`${nombre}: ${optimista ? "disponible" : "agotado"}`}
        onClick={alternar}
        deshabilitado={pendiente || deshabilitado}
      />
    </div>
  );
}

/**
 * El switch pelado, sin fila ni acción: para formularios donde el valor se guarda con el
 * resto (los canales de venta de un producto, "recomendado") y no en su propio viaje.
 */
export function BotonSwitch({
  activo,
  etiqueta,
  onClick,
  deshabilitado = false,
}: {
  activo: boolean;
  etiqueta: string;
  onClick: () => void;
  deshabilitado?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      onClick={onClick}
      disabled={deshabilitado}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-naranja focus:ring-offset-2 disabled:opacity-60 ${activo ? "bg-exito" : "bg-agotado"}`}
    >
      <span
        className={`absolute top-1 size-5 rounded-full bg-tarjeta transition-all ${activo ? "left-6" : "left-1"}`}
      />
    </button>
  );
}
