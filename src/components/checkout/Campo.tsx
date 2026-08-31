"use client";

import { useId } from "react";

/**
 * Controles del checkout, escritos a mano sobre los tokens de DESIGN.md en vez de
 * traer los primitivos de shadcn: el resto del storefront está hecho así, y los
 * controles nativos se comportan mejor en móvil (teclado numérico con inputMode,
 * picker del sistema en el select, cámara directa en el file).
 *
 * Alto mínimo 44px y anillo de foco naranja: DESIGN.md §7, no negociables.
 */

const BASE_CONTROL =
  "min-h-11 w-full rounded-sm border bg-tarjeta px-3 py-2 font-cuerpo text-[15px] text-cafe " +
  "placeholder:text-cafe-tenue focus:outline-none focus:ring-2 focus:ring-naranja";

export function Campo({
  etiqueta,
  error,
  ayuda,
  requerido,
  children,
}: {
  etiqueta: string;
  error?: string;
  ayuda?: string;
  requerido?: boolean;
  children: (props: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby"?: string;
  }) => React.ReactNode;
}) {
  const id = useId();
  const idError = `${id}-error`;
  const idAyuda = `${id}-ayuda`;
  const describedBy = error ? idError : ayuda ? idAyuda : undefined;

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="font-cuerpo text-sm font-bold text-naranja-osc"
      >
        {etiqueta}
        {requerido && <span className="text-naranja"> *</span>}
      </label>
      {children({
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": describedBy,
      })}
      {ayuda && !error && (
        <p id={idAyuda} className="font-cuerpo text-[13px] text-cafe-tenue">
          {ayuda}
        </p>
      )}
      {error && (
        <p
          id={idError}
          className="font-cuerpo text-[13px] font-semibold text-error"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export function claseControl(error?: string): string {
  return `${BASE_CONTROL} ${error ? "border-error" : "border-crema-oscura"}`;
}
