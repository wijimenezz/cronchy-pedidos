import { mapsUrl } from "@/lib/notificaciones/plantillas";

/**
 * DÓNDE QUEDA EL LOCAL, y cómo se llega — fuente única.
 *
 * Puro y sin base de datos: lo usan el checkout, el seguimiento del cliente y las plantillas de
 * WhatsApp, que son los tres sitios donde a alguien hay que decirle dónde recoger su pedido.
 */

export type Local = {
  /** La dirección escrita, tal como se edita en `/admin/ajustes`. */
  direccion: string | null;
  /**
   * El pin del local, o `null` si nadie lo ha fijado todavía (se mueve en `/admin/zonas`).
   *
   * **No lo confundas con `centroTienda` del checkout**, que es esto mismo pero con respaldo al
   * parque principal de Fusagasugá cuando no hay pin. Ese respaldo sirve para abrir un mapa vacío
   * en algún sitio razonable; usarlo aquí mandaría al cliente al parque con toda la confianza.
   */
  ubicacion: { lat: number; lng: number } | null;
};

/**
 * El enlace de «Cómo llegar», o `null` si no hay ni pin ni dirección — y entonces quien lo pinta
 * esconde el botón. Un botón que existe siempre y a veces no lleva a ninguna parte es peor que uno
 * que no está.
 *
 * **El pin gana a la dirección escrita**: es un punto exacto, mientras que el texto Maps lo tiene
 * que adivinar. La búsqueda por texto es el respaldo para el rato que va entre escribir la
 * dirección en Ajustes y acordarse de mover el pin en Zonas.
 *
 * Reusa `mapsUrl`, que ya arma el enlace del domiciliario: dos formas de construir la misma URL
 * terminan divergiendo el día que una de las dos haya que cambiarla. Es un **enlace** a
 * maps.google.com, no la API de Google, así que no toca la prohibición de CLAUDE.md.
 */
export function comoLlegarUrl(local: Local): string | null {
  if (local.ubicacion) return mapsUrl(local.ubicacion);

  const direccion = local.direccion?.trim();
  if (!direccion) return null;

  return `https://maps.google.com/maps?q=${encodeURIComponent(direccion)}`;
}
