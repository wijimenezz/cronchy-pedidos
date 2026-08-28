/**
 * LA TARJETA que se ve cuando un link de la app viaja por WhatsApp.
 *
 * **El logo no se manda dentro del mensaje**: WhatsApp abre la URL que lleva el texto y lee sus
 * etiquetas Open Graph. Por eso esto vive aquí y no en `plantillas.ts` — aquel decide qué DICE el
 * mensaje, esto decide qué se VE de la página a la que apunta.
 *
 * Sin `og:image` el cliente de WhatsApp cae a un respaldo suyo, no documentado —el
 * `apple-touch-icon` de 180×180—, y ese respaldo unas veces aplica y otras no: el mismo link salía
 * un día con el churro y al siguiente pelado. La tarjeta se declara para que no dependa de eso.
 *
 * Tres cosas que no se cambian:
 *
 * - **`metadataBase` es lo que vuelve absoluta la ruta de la imagen**, y `og:image` tiene que ser
 *   absoluta o WhatsApp la ignora. Sale de `resolverBaseUrl()`, la misma función que arma el link
 *   del mensaje, para que la tarjeta y el destino no puedan apuntar a sitios distintos.
 * - **No hay `title` ni `description` aquí a propósito.** Next rellena `og:title` y
 *   `og:description` desde los de cada página cuando faltan; fijarlos aquí le robaría su título a
 *   `/pedido/[token]` ("Tu pedido — Cronchy") y la tarjeta diría el nombre del negocio a secas.
 * - **La tarjeta jamás lleva datos del cliente.** `/pedido/<token>` y `/entrega/<token>` son links
 *   privados, y la previa es justo lo que se ve si alguien los reenvía: nombre, dirección o total
 *   ahí serían la ficha del cliente en la pantalla de un tercero. Misma doctrina que la regla 18 y
 *   que el payload del push.
 */

import type { Metadata } from "next";
import { resolverBaseUrl } from "@/lib/url";

/**
 * 1200×630 y **sin transparencia**: WhatsApp pinta lo transparente de negro, así que el PNG del
 * personaje va aplanado sobre el crema de la marca. Es un archivo generado una vez y commiteado,
 * igual que los iconos y las fuentes — nada del camino crítico colgando de una composición en
 * tiempo de request.
 */
const IMAGEN_OG = {
  url: "/og-cronchy.png",
  width: 1200,
  height: 630,
  alt: "Cronchy — Churros y Helados",
};

/** Lo que el layout raíz esparce en su `metadata`. Todas las rutas lo heredan. */
export const metadatosCompartidos = {
  metadataBase: new URL(resolverBaseUrl()),
  openGraph: {
    siteName: "Cronchy - Churros y Helados",
    type: "website",
    locale: "es_CO",
    images: [IMAGEN_OG],
  },
  // No es por Twitter: varios clientes leen estas etiquetas como segunda opción, y declararlas
  // sale gratis. `summary_large_image` es lo que pide tarjeta grande en vez de miniatura.
  twitter: { card: "summary_large_image" as const },
} satisfies Metadata;
