/**
 * Utilidades de texto del dominio. Módulo puro: sin DB, sin `process.env`, importable
 * desde el navegador (el panel muestra el slug mientras se escribe el nombre).
 */

/** Diacríticos combinantes que NFD separa de su letra. Escapado, no literal: una tilde
 *  suelta dentro de una expresión regular es invisible y cualquier editor la puede comer. */
const DIACRITICOS = /[\u0300-\u036f]/g;

/**
 * Convierte un nombre en un slug de URL: "Cronchy Mega" → "cronchy-mega".
 *
 * Se normaliza con NFD para separar la tilde de la letra y poder borrarla: sin eso,
 * "Frutilla Café" quedaría con un `%C3%A9` en la URL. La ñ, que NFD descompone en n + ~,
 * termina en "n" — que es como la escribe todo el mundo al buscar.
 *
 * Devuelve cadena vacía si no queda nada aprovechable (un nombre que sea solo emojis);
 * quien lo llama decide qué hacer con eso.
 */
export function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(DIACRITICOS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Primer slug libre de la lista: "cronchy-mega", luego "cronchy-mega-2", "cronchy-mega-3"…
 *
 * Existe porque el UNIQUE (store_id, slug) de `product` y `category` es una colisión que
 * el admin va a provocar de verdad —dos productos con el mismo nombre en categorías
 * distintas— y hacerle escribir la URL a mano para resolverlo sería absurdo. El INSERT
 * puede fallar igual si alguien crea otro producto entre la consulta y la escritura; el
 * `violaConstraint` de la acción es quien cubre esa carrera.
 */
export function slugLibre(base: string, ocupados: Iterable<string>): string {
  const tomados = new Set(ocupados);
  if (!tomados.has(base)) return base;

  for (let i = 2; i < 1000; i++) {
    const candidato = `${base}-${i}`;
    if (!tomados.has(candidato)) return candidato;
  }

  // Mil productos con el mismo nombre no es un caso real, pero devolver algo único es
  // mejor que un bucle infinito o un slug repetido.
  return `${base}-${Date.now()}`;
}
