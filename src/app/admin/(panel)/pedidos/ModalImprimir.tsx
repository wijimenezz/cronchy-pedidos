"use client";

import { useState, useTransition } from "react";
import { ChefHat, Receipt } from "lucide-react";
import { Modal, ModalCabecera, ModalCerrar } from "@/components/ui/Modal";
import { prepararImpresion, type FormatoTicket } from "./acciones";
import { dispararImpresion } from "./imprimir";

/**
 * Cuál de los dos tickets se imprime.
 *
 * Es un modal y no un menú anclado al botón, y esa no es una decisión de estilo: las columnas
 * del tablero tienen su propio scroll, así que un popover que sobresalga de la tarjeta se
 * recorta. Además el panel se opera con el dedo en una tablet (regla 15) y un menú de dos
 * entradas pequeñas es justo lo que ahí se falla.
 *
 * Lo abren **dos sitios** —la tarjeta y el detalle del pedido—, igual que `ModalAsignar`, y por
 * eso vive suelto. A diferencia de aquel, este sí dispara la impresión: no hay nada que decidir
 * después, porque el navegador nunca sabrá si el papel salió.
 */
export function ModalImprimir({
  numero,
  onCerrar,
}: {
  numero: number;
  onCerrar: () => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function imprimir(formato: FormatoTicket) {
    setError(null);
    iniciar(async () => {
      const resultado = await prepararImpresion({ numero, formato });
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      dispararImpresion(resultado.url);
      onCerrar();
    });
  }

  return (
    <Modal etiqueta="Imprimir" onCerrar={onCerrar}>
      <ModalCabecera>Imprimir · #{numero}</ModalCabecera>

      <div className="flex flex-col gap-2 p-4">
        {error && (
          <p role="alert" className="font-cuerpo text-[13px] font-semibold text-error">
            {error}
          </p>
        )}

        <OpcionTicket
          icono={ChefHat}
          titulo="Comanda de cocina"
          detalle="Qué preparar, con los modificadores y las notas. Sin precios."
          onClick={() => imprimir("comanda")}
          disabled={pendiente}
        />

        <OpcionTicket
          icono={Receipt}
          titulo="Recibo del cliente"
          detalle="El desglose de lo que se cobró, con el total y el método de pago."
          onClick={() => imprimir("recibo")}
          disabled={pendiente}
        />
      </div>

      <ModalCerrar onCerrar={onCerrar} />
    </Modal>
  );
}

/** Un objetivo grande: esto se toca con el dedo y en medio del turno. */
function OpcionTicket({
  icono: Icono,
  titulo,
  detalle,
  onClick,
  disabled,
}: {
  icono: typeof ChefHat;
  titulo: string;
  detalle: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-16 w-full items-center gap-3 rounded-md border border-crema-oscura px-3 text-left transition-colors hover:border-naranja hover:bg-crema disabled:opacity-50"
    >
      <Icono className="size-5 shrink-0 text-naranja" />
      <span className="min-w-0">
        <span className="block font-cuerpo text-[15px] font-bold text-cafe">{titulo}</span>
        <span className="block font-cuerpo text-[13px] text-cafe-suave">{detalle}</span>
      </span>
    </button>
  );
}
