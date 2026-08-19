import * as Sentry from "@sentry/nextjs";
import { opcionesComunes } from "@/lib/observabilidad/sentry";

/**
 * El Edge Runtime, que aquí es exactamente uno: `src/proxy.ts`, el que corta `/admin/*` sin
 * sesión. Es poco código pero está en el camino de **todas** las peticiones del panel, así que un
 * fallo suyo deja el panel inaccesible sin que nadie sepa por qué.
 */
Sentry.init(opcionesComunes);
