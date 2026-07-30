"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

type Estado = "listo" | "copiado" | "sin_permiso";

/**
 * Un dato de pago que se copia de un toque.
 *
 * El bloque entero es el botón: en un móvil, apuntarle a un ícono de 16px mientras se
 * tiene la app de Nequi a medio abrir es justo la fricción que se quiere evitar.
 *
 * El ícono de copiar va siempre visible, no en hover: sin él nadie descubre que el
 * número se puede copiar, y en una pantalla táctil no existe el hover.
 */
export function DatoCopiable({
  etiqueta,
  valor,
  aCopiar,
  titular,
}: {
  etiqueta: string;
  /** Cómo se muestra, con la separación que lo hace legible ("312 491 4660"). */
  valor: string;
  /** Lo que se copia de verdad: sin espacios, que es lo que Nequi acepta pegado. */
  aCopiar: string;
  titular?: string | null;
}) {
  const [estado, setEstado] = useState<Estado>("listo");

  async function copiar() {
    try {
      await navigator.clipboard.writeText(aCopiar);
      setEstado("copiado");
      setTimeout(() => setEstado("listo"), 2000);
    } catch {
      // Pasa en contextos no seguros (probar desde el móvil contra http://192.168.x.x).
      // Mentir con un "¡Copiado!" que no copió nada sería peor que decir la verdad.
      setEstado("sin_permiso");
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="font-cuerpo text-[13px] text-cafe-suave">{etiqueta}</span>

      <button
        type="button"
        onClick={copiar}
        className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-sm border px-3 py-2 text-left transition-colors ${
          estado === "copiado" ? "border-exito bg-exito/8" : "border-crema-oscura bg-tarjeta"
        }`}
      >
        <span className="flex flex-col">
          <span className="font-cuerpo text-lg font-bold text-cafe select-all">{valor}</span>
          {titular && <span className="font-cuerpo text-[13px] text-cafe-suave">{titular}</span>}
        </span>

        <span
          className={`flex shrink-0 items-center gap-1.5 font-cuerpo text-[13px] font-bold ${
            estado === "copiado" ? "text-exito" : "text-naranja"
          }`}
        >
          {estado === "copiado" ? <Check className="size-4" /> : <Copy className="size-4" />}
          {estado === "copiado" ? "¡Copiado!" : "Copiar"}
        </span>
      </button>

      {/* aria-live: quien usa lector de pantalla no ve el cambio de ícono. */}
      <span aria-live="polite" className="sr-only">
        {estado === "copiado" ? `${etiqueta} copiado` : ""}
      </span>

      {estado === "sin_permiso" && (
        <p className="font-cuerpo text-[13px] text-alerta">
          No pudimos copiarlo. Mantén presionado el número para copiarlo a mano.
        </p>
      )}
    </div>
  );
}
