"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

/**
 * Un fallo en la carta o en el checkout.
 *
 * Aquí sí se puede usar la marca: si este componente se monta es que el layout raíz sobrevivió.
 *
 * `reset()` antes que recargar, y no es un detalle: el carrito y los datos del cliente viven en
 * `localStorage` y sobreviven a las dos, pero reintentar deja intacto el paso del checkout en el
 * que estaba. A quien se le rompió la pantalla en el paso 3 no se le manda al principio.
 */
export default function ErrorTienda({
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
    <div className="grid min-h-[60vh] place-items-center px-4 text-center">
      <div className="flex max-w-md flex-col items-center gap-3">
        <h1 className="font-titulo text-2xl font-bold text-cafe">
          Algo se rompió de nuestro lado
        </h1>
        <p className="font-cuerpo text-[15px] text-cafe-suave">
          No fue culpa tuya y ya nos enteramos. Tu pedido no se perdió: sigue guardado en este
          teléfono.
        </p>

        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="min-h-11 rounded-full bg-naranja px-6 font-cuerpo text-sm font-bold text-crema transition-colors hover:bg-naranja-osc"
          >
            Intentar de nuevo
          </button>
          <Link
            href="/"
            className="flex min-h-11 items-center rounded-full border border-crema-oscura px-6 font-cuerpo text-sm font-bold text-cafe transition-colors hover:bg-crema"
          >
            Volver a la carta
          </Link>
        </div>
      </div>
    </div>
  );
}
