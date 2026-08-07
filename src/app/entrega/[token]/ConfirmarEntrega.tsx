"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";

/**
 * El botón que cierra el pedido, en el teléfono del domiciliario.
 *
 * Pide confirmación en dos pasos por lo mismo que cancelar en el panel: no tiene vuelta atrás
 * —`entregado` es terminal— y esto se pulsa con una mano, en la calle, con el casco puesto.
 */
export function ConfirmarEntrega({ token }: { token: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function confirmar() {
    setError(null);
    iniciar(async () => {
      try {
        const respuesta = await fetch(`/api/entrega/${token}`, { method: "POST" });
        if (!respuesta.ok) {
          const datos = (await respuesta.json().catch(() => null)) as { error?: string } | null;
          setError(datos?.error ?? "No pudimos confirmar. Intenta de nuevo.");
          setConfirmando(false);
          return;
        }
        // La página es `force-dynamic`: se vuelve a pedir y ya viene con el estado nuevo, sin
        // duplicar aquí la lógica de qué mostrar después.
        router.refresh();
      } catch {
        setError("Sin conexión. Revisa tus datos e intenta de nuevo.");
        setConfirmando(false);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="font-cuerpo text-sm font-semibold text-error">
          {error}
        </p>
      )}

      {confirmando ? (
        <>
          <p className="text-center font-cuerpo text-sm font-bold text-cafe">
            ¿Ya entregaste este pedido?
          </p>
          <button
            type="button"
            onClick={confirmar}
            disabled={pendiente}
            className="flex min-h-14 items-center justify-center gap-2 rounded-full bg-exito px-6 font-cuerpo text-lg font-bold text-crema transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Check className="size-5" />
            {pendiente ? "Confirmando…" : "Sí, entregado"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmando(false)}
            disabled={pendiente}
            className="min-h-11 font-cuerpo text-sm font-bold text-cafe-suave disabled:opacity-50"
          >
            Todavía no
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="flex min-h-14 items-center justify-center gap-2 rounded-full bg-naranja px-6 font-cuerpo text-lg font-bold text-crema transition-colors hover:bg-naranja-osc"
        >
          <Check className="size-5" />
          Confirmar entrega
        </button>
      )}
    </div>
  );
}
