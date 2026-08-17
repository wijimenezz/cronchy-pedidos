"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * El único sitio que captura un fallo del layout raíz.
 *
 * Cuando revienta ahí, React ya no tiene dónde montar nada: por eso este componente trae sus
 * propios `<html>` y `<body>`, y por eso **no puede usar las clases de la marca** — si lo que
 * falló fue el layout, las fuentes y los estilos pueden no haber cargado. Los colores van en
 * línea a propósito.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#faf3e8",
          color: "#50240a",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "28rem" }}>
          <h1 style={{ fontSize: "1.5rem", margin: "0 0 8px" }}>Algo se rompió de nuestro lado</h1>
          <p style={{ margin: "0 0 20px", lineHeight: 1.5 }}>
            No fue culpa tuya y ya nos enteramos. Vuelve a intentarlo en un momento.
          </p>
          {/* `<a>` y no `<Link>` a propósito: si lo que reventó fue el layout raíz, el router de
              Next puede estar en un estado del que no se sale navegando por su cuenta. Aquí hace
              falta una carga limpia de la página. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            style={{
              display: "inline-block",
              minHeight: "44px",
              lineHeight: "44px",
              padding: "0 24px",
              borderRadius: "9999px",
              background: "#f26b1d",
              color: "#faf3e8",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Volver a la carta
          </a>
        </div>
      </body>
    </html>
  );
}
