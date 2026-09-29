/* Tema del header de la tienda. Se cambia A MANO, una vez al mes, en la línea TEMA_ACTIVO.
 *
 * Calendario:
 *   Septiembre            → "default"
 *   1 de octubre          → "halloween"
 *   Noviembre             → "default"
 *   Diciembre             → "navidad"   (pendiente de crear, ver abajo)
 *   Enero en adelante     → "default"
 *
 * No hay activación por fecha a propósito: el día que cambia lo decide el negocio, no el reloj
 * del servidor. Tras cambiarlo hay que desplegar; la carta es ISR y toma el tema en el build.
 *
 * Cómo añadir un tema nuevo (ej. Navidad):
 *   1. Añadir "navidad" al tipo TemaTienda de aquí abajo.
 *   2. Crear su capa en components/tienda/temas/navidad/ (y su motor, si lo tiene, en
 *      lib/temas/navidad/), con el mismo molde que halloween/.
 *   3. Registrarlo en components/tienda/temas/index.ts. TypeScript no compila hasta hacerlo:
 *      el registro es un Record<TemaTienda, Tema> exhaustivo.
 *   4. Opcionales, todo en la carpeta del tema y sin tocar el Header:
 *      - Color de fondo y textura: una clase .fondo en su module.css y la copia del SVG de
 *        ondas en public/temas/navidad/ con otro fill y opacity (ver la de halloween).
 *      - Personaje junto a Abierto/Cerrado: el PNG en public/temas/navidad/ y `personaje`
 *        en el registro, con su ancho y alto.
 *   5. Cambiar TEMA_ACTIVO cuando toque.
 */

export type TemaTienda = "default" | "halloween";

export const TEMA_ACTIVO: TemaTienda = "halloween";
