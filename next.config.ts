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
    /**
     * **Hay que declarar aquí cada `quality` que se use, o Next responde 400.** El default de
     * `images.qualities` es `[75]` y no hay caída al valor por defecto: un `quality={82}` sin
     * esta lista deja la imagen sin cargar, no la sirve peor.
     *
     * El 82 es la tienda pública. Recomprimir a 75 un archivo que ya venía comprimido era la
     * mitad del problema de calidad —dos pasadas con pérdida, la segunda más agresiva que la
     * primera—; ahora el máster se guarda casi sin pérdida (`CALIDAD_WEBP`) y el recorte fino
     * lo hace este optimizador una sola vez, por hueco.
     *
     * El 75 se queda en la lista por ser el default: nada lo pide hoy —el panel va
     * `unoptimized`— pero quitarlo convertiría en un 400 cualquier `<Image>` nuevo que se
     * escriba sin `quality`.
     */
    qualities: [75, 82],
    /**
     * 31 días, contra las 4 horas del default.
     *
     * Se puede porque `rutaFotoProducto` mete un `crypto.randomUUID()` en el nombre del
     * objeto: cambiar una foto produce una URL nueva, así que **no hay nada que invalidar** y
     * una caché larga jamás sirve una foto vieja. Con 4 horas se volvía a descargar y a
     * recodificar la misma imagen seis veces al día.
     *
     * Importa más desde que el máster pesa ~450 KB: cada miss es una descarga contra Supabase,
     * y el free tier son 5 GB de egress al mes.
     */
    minimumCacheTTL: 2_678_400,
  },
};

/**
 * Sentry envuelve la config para dos cosas: subir los source maps al construir —sin ellos la
 * traza de producción es código minificado y no sirve para nada— y podar del bundle lo que no
 * se usa.
 *
 * **Ojo con `bundleSizeOptimizations`: hoy, con Turbopack, no poda nada.** Se dejan puestas
 * porque son la forma documentada y no deprecada de pedirlo, y se aplicarán solas el día que
 * Turbopack las soporte —pero no se cuentan como ahorro. Medido sobre el bundle construido:
 * `__SENTRY_DEBUG__` y las cadenas del logger siguen ahí, y el código de tracing también, pese a
 * `excludeTracing`. Lo único que de verdad se ahorra es Session Replay, que sencillamente no se
 * instala. El SDK suma ~84 KB gzip al cliente; esa es la cifra real y no la teórica.
 *
 * **Aquí NO va `disableLogger`, y no es un olvido.** Está deprecado en favor de
 * `webpack.treeshake.removeDebugLogging`, que es una opción de webpack y con Turbopack tampoco
 * hace nada. Se midió al quitarlo: **el bundle cambió en 5 bytes**, o sea que no estaba podando
 * nada. Lo único que aportaba era un aviso de deprecación en cada `pnpm dev`.
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
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeTracing: true,
  },
});
