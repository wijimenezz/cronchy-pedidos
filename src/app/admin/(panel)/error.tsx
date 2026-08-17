"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

/**
 * Un fallo dentro del panel.
 *
 * El tono es otro que en la tienda a propósito: aquí no hay que tranquilizar a un cliente, hay
 * que devolver a alguien al trabajo lo antes posible — si esto se ve, el local no está pudiendo
 * despachar. Por eso el `digest` se muestra: es lo único que permite emparejar esta pantalla con
 * el error concreto en Sentry cuando alguien pregunte "¿qué pasó a las 7:15?".
 */
export default function ErrorPanel({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="mx-auto grid min-h-[60vh] w-full max-w-contenido place-items-center px-4 text-center">
      <div className="flex max-w-md flex-col items-center gap-3">
        <h1 className="font-titulo text-2xl font-bold text-cafe">Esta pantalla falló</h1>
        <p className="font-cuerpo text-[15px] text-cafe-suave">
          Los pedidos no se han perdido: están guardados. Reintenta, y si vuelve a fallar entra
          al tablero.
        </p>

        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="min-h-11 rounded-full bg-naranja px-6 font-cuerpo text-sm font-bold text-crema transition-colors hover:bg-naranja-osc"
          >
            Reintentar
          </button>
          <Link
            href="/admin/pedidos"
            className="flex min-h-11 items-center rounded-full border border-crema-oscura px-6 font-cuerpo text-sm font-bold text-cafe transition-colors hover:bg-crema"
          >
            Ir al tablero
          </Link>
        </div>

        {error.digest && (
          <p className="mt-1 font-cuerpo text-xs text-cafe-tenue">
            Código del error: <code>{error.digest}</code>
          </p>
        )}
      </div>
    </div>
  );
}
