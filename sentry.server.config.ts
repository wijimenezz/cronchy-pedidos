import * as Sentry from "@sentry/nextjs";
import { opcionesComunes } from "@/lib/observabilidad/sentry";

// El runtime de Node: route handlers, server actions y server components.
// Todo el filtrado de datos personales vive en `opcionesComunes` — ver ese archivo antes de
// tocar nada aquí.
Sentry.init(opcionesComunes);
