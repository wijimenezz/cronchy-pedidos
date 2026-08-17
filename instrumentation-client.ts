import * as Sentry from "@sentry/nextjs";
import { opcionesComunes } from "@/lib/observabilidad/sentry";

/**
 * El navegador — la mitad que hasta ahora no veía nadie.
 *
 * Importa porque el checkout está partido en dos: `POST /api/pedidos` es servidor, pero
 * `CheckoutForm` es `'use client'` y ahí es donde el cliente elige, paga y confirma. Un error de
 * JavaScript en el paso 3 no produce ningún log de servidor: el pedido sencillamente no se hace y
 * la persona se va sin decir nada.
 *
 * **Este archivo y NO `sentry.client.config.ts`**: con Next 16 + Turbopack ese otro no se
 * auto-importa, así que el init nunca correría y Sentry parecería instalado sin capturar nada del
 * navegador. Este lo llama Next de forma nativa.
 */
Sentry.init(opcionesComunes);

/** Sin esto, un error después de navegar se atribuye a la página de la que se venía. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
