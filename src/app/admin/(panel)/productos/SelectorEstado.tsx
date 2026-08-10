"use client";

import { useOptimistic, useState, useTransition } from "react";
import { marcarDisponible, marcarVisible } from "./acciones";

/**
 * Visible · Agotado · Oculto. Son los tres estados que ve el negocio, armados sobre las dos
 * columnas independientes que define CLAUDE.md:
 *
 *   Visible → activo=true,  disponible=true    (pedible)
 *   Agotado → activo=true,  disponible=false   (se ve, con etiqueta, no se pide)
 *   Oculto  → activo=false                     (no aparece en la carta)
 *
 * No se colapsan en un enum en la base a propósito: un producto que se ocultó por temporada
 * conserva si estaba agotado o no, y al volver a encenderlo aparece como estaba.
 *
 * Dos server actions distintas y no una con un parámetro, porque tienen dueños distintos:
 * mover Visible↔Agotado es la operación diaria del colaborador, y Oculto es de admin.
 * Decidir el permiso mirando el valor del parámetro es la clase de escalada implícita que
 * acaba en agujero.
 */

export type Estado = "visible" | "agotado" | "oculto";

export function estadoDe(producto: { activo: boolean; disponible: boolean }): Estado {
  if (!producto.activo) return "oculto";
  return producto.disponible ? "visible" : "agotado";
}

const ETIQUETA: Record<Estado, string> = {
  visible: "Visible",
  agotado: "Agotado",
  oculto: "Oculto",
};

const COLOR: Record<Estado, string> = {
  visible: "bg-exito",
  agotado: "bg-alerta",
  oculto: "bg-agotado",
};

/** El puntito de color de la lista. Dice el estado sin ocupar una línea de texto. */
export function PuntoEstado({ activo, disponible }: { activo: boolean; disponible: boolean }) {
  const estado = estadoDe({ activo, disponible });

  return (
    <span
      title={ETIQUETA[estado]}
      aria-label={ETIQUETA[estado]}
      role="img"
      className={`size-3 shrink-0 rounded-full ${COLOR[estado]}`}
    />
  );
}

export function SelectorEstado({
  id,
  activo,
  disponible,
  esAdmin,
}: {
  id: string;
  activo: boolean;
  disponible: boolean;
  esAdmin: boolean;
}) {
  const [pendiente, iniciar] = useTransition();
  const [optimista, setOptimista] = useOptimistic(estadoDe({ activo, disponible }));
  const [error, setError] = useState<string | null>(null);

  function cambiar(destino: Estado) {
    if (destino === optimista) return;
    setError(null);

    iniciar(async () => {
      setOptimista(destino);

      // Volver de Oculto a Visible o Agotado son dos cambios: encender el producto y dejar
      // la disponibilidad donde toca. Se hacen en este orden para que la carta nunca
      // muestre, ni por un instante, algo pedible que en realidad está agotado.
      if (destino === "oculto") {
        const r = await marcarVisible({ id, activo: false });
        if (!r.ok) return setError(r.error);
        return;
      }

      const quiereDisponible = destino === "visible";
      if (disponible !== quiereDisponible) {
        const r = await marcarDisponible({ id, disponible: quiereDisponible });
        if (!r.ok) return setError(r.error);
      }
      if (!activo) {
        const r = await marcarVisible({ id, activo: true });
        if (!r.ok) return setError(r.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div
        role="group"
        aria-label="Estado del producto"
        className="flex rounded-full border border-crema-oscura p-0.5"
      >
        {(["visible", "agotado", "oculto"] as const).map((estado) => {
          // El colaborador mueve el switch de agotado y nada más (regla 12). Sacar de
          // Oculto también le está vedado: encender un producto es volver a ponerlo a la
          // venta, y esa es la misma decisión que ocultarlo, solo que al revés.
          const bloqueado = !esAdmin && (estado === "oculto" || !activo);

          return (
            <button
              key={estado}
              type="button"
              onClick={() => cambiar(estado)}
              disabled={pendiente || bloqueado}
              aria-pressed={optimista === estado}
              title={bloqueado ? "Solo un administrador puede ocultar o reactivar" : undefined}
              className={`flex min-h-9 items-center gap-1.5 rounded-full px-3 font-cuerpo text-[13px] font-bold transition-colors disabled:opacity-40 ${
                optimista === estado ? "bg-crema text-cafe" : "text-cafe-tenue hover:text-cafe"
              }`}
            >
              <span className={`size-2 rounded-full ${COLOR[estado]}`} />
              {ETIQUETA[estado]}
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="font-cuerpo text-[13px] font-semibold text-error">
          {error}
        </p>
      )}
    </div>
  );
}
