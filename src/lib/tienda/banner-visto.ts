/**
 * QUÉ BANNER YA VIO ESTE DISPOSITIVO.
 *
 * El negocio publica un anuncio —una hamburguesa nueva, una promo— y se muestra al entrar a la
 * carta. La regla acordada es **una vez por banner**: quien ya lo vio no vuelve a topárselo hasta
 * que se publique otro. Sin eso, el cliente que pide tres veces por semana aprende a cerrarlo sin
 * leerlo, y entonces el banner deja de servir para lo único que existe.
 *
 * **Se guarda el ID del banner, no un booleano ni una fecha**, y esa es toda la gracia: publicar
 * uno nuevo lo vuelve a mostrar **solo**, sin que nadie tenga que acordarse de resetear nada desde
 * el panel. Un "ya vio el anuncio" habría que apagarlo a mano cada vez, y el día que se olvide, el
 * anuncio nuevo no lo ve nadie.
 *
 * La consecuencia que hay que conocer: **reemplazar la imagen de un banner ya visto no lo vuelve a
 * mostrar**, porque sigue siendo el mismo id. Para que se vuelva a ver se sube uno nuevo — que
 * además es lo que deja el anterior guardado en la biblioteca.
 *
 * Puro y aparte del componente por lo mismo que `leerGuardado` en `tipo-pedido.ts`: los tests
 * corren en `environment: "node"` y ahí no existe `localStorage`.
 */

/** Dónde lo recuerda el navegador. */
export const CLAVE_BANNER_VISTO = "cronchy_banner_visto";

/**
 * ¿Se le enseña este banner a este dispositivo?
 *
 * `idActivo` es `null` cuando no hay ninguno publicado. `crudoGuardado` es lo que haya en
 * `localStorage`, tal cual — puede ser basura de una versión anterior, y ante la duda se muestra:
 * enseñar un anuncio de más es mucho menos malo que tragarse el único aviso que el negocio quería
 * dar.
 */
export function debeMostrarBanner(
  idActivo: string | null,
  crudoGuardado: string | null,
): boolean {
  if (!idActivo) return false;

  return crudoGuardado?.trim() !== idActivo;
}
