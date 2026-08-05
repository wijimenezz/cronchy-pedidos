"use client";

import { useEffect } from "react";

/**
 * El diálogo del proyecto.
 *
 * Nace de tres copias del mismo patrón —el calendario del checkout, el selector de día del panel
 * y el selector de tipo de pedido—, que además diferían en detalles que no debían diferir: una no
 * llevaba `role="dialog"` y ninguna cerraba con Escape.
 *
 * No usa `<dialog>` nativo: su `::backdrop` no acepta las clases de Tailwind y `showModal()` hay
 * que llamarlo desde un efecto, así que el montaje condicional acaba siendo más simple y más
 * fácil de leer que el imperativo.
 */
export function Modal({
  etiqueta,
  onCerrar,
  ancho = "sm",
  children,
}: {
  /** Lo que anuncia el lector de pantalla al abrirse. */
  etiqueta: string;
  onCerrar: () => void;
  ancho?: "sm" | "md" | "lg";
  children: React.ReactNode;
}) {
  useEffect(() => {
    function alPulsar(evento: KeyboardEvent) {
      if (evento.key === "Escape") onCerrar();
    }

    document.addEventListener("keydown", alPulsar);
    return () => document.removeEventListener("keydown", alPulsar);
  }, [onCerrar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-cafe/40 p-4"
      onClick={onCerrar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={etiqueta}
        // Sin esto, un clic dentro del panel burbujea hasta el overlay y lo cierra.
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-full w-full flex-col overflow-hidden rounded-lg bg-tarjeta shadow-modal ${
          ancho === "lg" ? "max-w-2xl" : ancho === "md" ? "max-w-lg" : "max-w-sm"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/** La barra naranja de arriba. Opcional: el calendario del checkout usa la suya. */
export function ModalCabecera({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 bg-naranja px-4 py-3">
      <h2 className="font-titulo text-base font-semibold text-crema">{children}</h2>
    </div>
  );
}

export function ModalCerrar({ onCerrar }: { onCerrar: () => void }) {
  return (
    <button
      type="button"
      onClick={onCerrar}
      className="min-h-11 self-end px-5 pb-3 font-cuerpo text-sm font-bold uppercase text-naranja"
    >
      Cerrar
    </button>
  );
}
