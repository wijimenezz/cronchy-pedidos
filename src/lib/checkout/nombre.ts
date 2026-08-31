/**
 * Cómo se escribe un nombre propio al salir del campo.
 *
 * Puro y testeado porque es de las cosas que parecen triviales y no lo son: capitalizar cada
 * palabra a ciegas convierte "juan de la espriella" en "Juan De La Espriella", que está mal en
 * español. Por eso las partículas se quedan en minúscula.
 *
 * Lo que **no** intenta arreglar: "macarthur" no vuelve a "MacArthur" y "o'brien" no vuelve a
 * "O'Brien". Adivinar mayúsculas internas es inventarse el apellido de alguien, y el campo sigue
 * siendo editable — quien se llame así lo corrige y esto ya no se lo vuelve a tocar, porque solo
 * actúa sobre lo que escribió el cliente cuando sale del campo.
 */

/**
 * Las que van en minúscula cuando no abren el nombre.
 *
 * `y` está por "Ramírez y Peña"; `van`/`von` porque aparecen y cuestan lo mismo.
 */
const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y", "da", "van", "von"]);

/**
 * "  juan   DE la espriella " -> "Juan de la Espriella".
 *
 * Colapsa los espacios igual que hace el esquema antes de validar, para que lo que se ve y lo
 * que se guarda sean lo mismo.
 */
export function capitalizarNombre(valor: string): string {
  const palabras = valor.trim().replace(/\s+/g, " ").split(" ");

  return palabras
    .map((palabra, i) => {
      const baja = palabra.toLocaleLowerCase("es");

      // La primera nunca se degrada: un nombre no empieza en minúscula aunque sea "De la Hoz".
      if (i > 0 && PARTICULAS.has(baja)) return baja;

      return baja.charAt(0).toLocaleUpperCase("es") + baja.slice(1);
    })
    .join(" ");
}
