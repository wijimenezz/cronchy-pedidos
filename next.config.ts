import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * Cuánto reutiliza el navegador una página estática ya visitada al volver a ella con
     * un `<Link>` — el "seguir comprando" del checkout, sin ir más lejos.
     *
     * El default de Next son 300 s, así que se podía servir hasta CINCO MINUTOS de carta
     * vieja aunque el panel ya la hubiera revalidado. 30 es el mínimo que Next admite, y
     * de todas formas el servidor recalcula todo al confirmar el pedido (regla 1).
     */
    staleTimes: { static: 30 },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "koipbxrmkylpucbsgmqd.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

/**
 * Sentry envuelve la config para dos cosas: subir los source maps al construir —sin ellos la
 * traza de producción es código minificado y no sirve para nada— y podar del bundle lo que no
 * se usa.
 *
 * Los tres flags de abajo son la diferencia entre un SDK de ~40 KB y uno bastante más gordo, y
 * aquí eso importa: los clientes entran desde datos móviles. Se apagan **el debug**, **el
 * tracing** (que ya va con `tracesSampleRate: 0`) y **los logs**; Session Replay ni se instala.
 *
 * `silent` en CI para que el log del build no se llene, y `widenClientFileUpload` para que la
 * traza también resuelva dentro de los chunks compartidos.
 *
 * Sin `SENTRY_AUTH_TOKEN` el build NO falla: se salta la subida de source maps y sigue. Es lo
 * que permite que alguien clone el repo y construya sin cuentas de nadie.
 */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeTracing: true,
  },
});
