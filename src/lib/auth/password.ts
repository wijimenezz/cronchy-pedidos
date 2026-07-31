import bcrypt from "bcryptjs";

/**
 * Hash de claves del panel. Separado de `sesion.ts` a propósito: bcrypt no puede correr
 * en el Edge Runtime del middleware, y si estuvieran en el mismo archivo lo arrastraría.
 *
 * Coste 10: ~50 ms en el servidor de Vercel. Subirlo protegería contra fuerza bruta
 * offline, pero el riesgo real aquí es otro —que se filtre la base entera— y 10 es el
 * punto donde un login sigue sintiéndose instantáneo.
 */

const COSTE = 10;

export function hashear(clave: string): Promise<string> {
  return bcrypt.hash(clave, COSTE);
}

export function verificarClave(clave: string, hash: string): Promise<boolean> {
  return bcrypt.compare(clave, hash);
}
