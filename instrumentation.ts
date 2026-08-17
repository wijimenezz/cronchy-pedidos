import * as Sentry from "@sentry/nextjs";

/**
 * Arranque de la observabilidad del servidor.
 *
 * Next llama a `register()` una vez por runtime, y hay dos: `nodejs` para las rutas y las server
 * actions, `edge` para `proxy.ts`. Se importan con `await import` y no arriba porque cada archivo
 * solo debe cargarse en su runtime — el de Node arrastra APIs que en el Edge no existen.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/**
 * El enganche que de verdad captura, y es **nativo de Next**: se dispara con cualquier error de
 * un server component, un route handler, una server action o el proxy. Antes de esto un 500 no
 * dejaba rastro en ninguna parte y se descubría porque un cliente se quejaba.
 *
 * Ojo al leer las trazas: el error que llega aquí **puede no ser el original**. Si reventó
 * renderizando un Server Component, React lo procesa antes; el `digest` es lo que permite
 * emparejarlo con lo que vio el usuario en pantalla.
 */
export const onRequestError = Sentry.captureRequestError;
