/**
 * Cómo se lee un error del driver de Postgres.
 *
 * Vive aparte porque lo necesitan varias acciones del panel: la que guarda una zona y la que
 * guarda un cupón compiten las dos contra un UNIQUE que el admin va a chocar de verdad, y
 * traducir ese choque a una frase es lo que distingue "Ya existe una zona con ese nombre" de
 * un 500 sin explicación.
 */

/**
 * ¿Este error es la violación de *ese* constraint?
 *
 * Drizzle envuelve los errores del driver en un `Failed query:` genérico y deja el original
 * colgando de `cause`, así que buscar el nombre del constraint en el mensaje de arriba no
 * encuentra nada. Se recorre la cadena leyendo el `constraint_name` que expone postgres.js.
 */
export function violaConstraint(error: unknown, nombre: string): boolean {
  let actual: unknown = error;

  for (let i = 0; i < 5 && actual instanceof Error; i++) {
    if ((actual as { constraint_name?: string }).constraint_name === nombre) return true;
    actual = actual.cause;
  }

  return false;
}
