/**
 * Qué pedidos son nuevos respecto a la última vuelta del polling.
 *
 * Está aparte del componente y es puro porque el caso que importa es el que no se ve mirando
 * el código: **al abrir el panel no puede sonar** por los pedidos que ya llevaban ahí media
 * hora. Eso depende de con qué se siembra la lista de vistos, y es exactamente la clase de
 * detalle que se rompe en una edición sin que nadie lo note hasta que la tablet empieza a
 * pitar sola cada vez que alguien recarga.
 */
export function idsNuevos(previos: readonly string[], actuales: readonly string[]): string[] {
  const yaVistos = new Set(previos);

  return actuales.filter((id) => !yaVistos.has(id));
}
