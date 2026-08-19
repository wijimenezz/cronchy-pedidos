import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Lo que comparten los tres arranques de Sentry (servidor, edge y navegador).
 *
 * Vive aquí y no repetido en cada `sentry.*.config.ts` porque lo importante de este archivo no
 * es la configuración: es **el filtro de datos personales**, y una copia que se quede atrás es
 * exactamente el fallo que no se ve hasta que ya se filtró algo.
 *
 * Sin DSN el SDK queda desactivado y no se manda nada. Es a propósito, igual que
 * `notificaciones/telegram.ts` con su configuración ausente: en local no hace falta y un
 * proyecto recién clonado tiene que arrancar sin cuentas de nadie.
 */

export const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

/**
 * Cabeceras que **nunca** pueden salir del servidor.
 *
 * La de sesión es el motivo de todo esto: la cookie del panel viaja en cada petición del admin,
 * dura 12 horas y va firmada con `AUTH_SECRET`. Un evento de error que la arrastre entera es una
 * llave de sesión guardada en el dashboard de un tercero — el mismo criterio de la regla 18, que
 * ni siquiera le repite el teléfono del cliente al domiciliario.
 */
const CABECERAS_PROHIBIDAS = ["cookie", "set-cookie", "authorization", "proxy-authorization"];

/**
 * Deja el evento sin nada que identifique a una persona.
 *
 * **No es una lista de "por si acaso"**: cada cosa que borra está aquí porque este proyecto la
 * maneja de verdad. El cuerpo de `POST /api/pedidos` lleva nombre, teléfono, dirección y el punto
 * exacto del mapa del cliente; las cabeceras del panel llevan la sesión; y la URL de un
 * seguimiento (`/pedido/<token>`) es, ella sola, la llave para leer ese pedido.
 *
 * Se prefiere perder contexto a filtrar: una traza sin el cuerpo de la petición sigue diciendo
 * qué se rompió y dónde, que es para lo que se mira.
 */
export function limpiarEvento(evento: ErrorEvent): ErrorEvent | null {
  if (evento.request) {
    // El cuerpo entero. Aquí es donde viajan los datos del cliente al confirmar un pedido.
    delete evento.request.data;
    delete evento.request.cookies;

    if (evento.request.headers) {
      for (const nombre of Object.keys(evento.request.headers)) {
        if (CABECERAS_PROHIBIDAS.includes(nombre.toLowerCase())) {
          delete evento.request.headers[nombre];
        }
      }
    }

    // El token del seguimiento o el de entrega van en la ruta, y cualquiera de los dos abre algo
    // (regla 18). Se conserva la forma de la URL, que es lo que sirve para agrupar.
    if (evento.request.url) evento.request.url = enmascararToken(evento.request.url);
  }

  // `sendDefaultPii: false` ya evita que se rellene, pero si alguien lo enciende algún día esto
  // sigue en pie.
  delete evento.user;

  return evento;
}

/** `/pedido/a1b2c3…` → `/pedido/<token>`. La ruta sirve igual para agrupar y deja de ser una llave. */
function enmascararToken(url: string): string {
  return url.replace(/\/(pedido|entrega)\/[^/?#]+/g, "/$1/<token>");
}

/**
 * Lo que comparten los tres runtimes.
 *
 * `tracesSampleRate: 0` y **sin Session Replay** no es tacañería: los clientes entran desde datos
 * móviles y esas dos integraciones son la mayor parte del peso del SDK, sin responder ninguna
 * pregunta que este negocio tenga hoy. Si algún día hace falta medir rendimiento, se enciende
 * sabiendo lo que cuesta.
 */
export const opcionesComunes = {
  dsn: DSN,
  sendDefaultPii: false,
  tracesSampleRate: 0,
  beforeSend: limpiarEvento,
  // Un despliegue nuevo agrupa sus errores aparte y se ve si una regresión es de hoy.
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  // En local se ve por consola y no se gasta cuota del plan gratuito (5.000 al mes).
  enabled: Boolean(DSN) && process.env.NODE_ENV === "production",
} as const;
