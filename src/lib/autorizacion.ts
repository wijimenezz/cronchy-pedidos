import { leerSesion } from "@/lib/auth/cookie";
import type { Rol, Sesion } from "@/lib/auth/sesion";

/**
 * Permisos del panel (regla 12 de CLAUDE.md).
 *
 * El middleware protege `/admin/*`, pero eso NO basta: una server action se puede invocar
 * con un POST directo sin pasar nunca por la ruta que la contiene. Por eso **toda mutación
 * del panel abre llamando a `exigirRol()`**, declarando el rol mínimo que necesita. Una
 * mutación sin esta llamada es un bug de seguridad, no un descuido de estilo.
 */

export class NoAutenticadoError extends Error {
  constructor() {
    super("No hay sesión");
  }
}

export class SinPermisoError extends Error {
  constructor(rolMinimo: Rol) {
    super(`Se requiere rol ${rolMinimo}`);
  }
}

/** Mayor número, más permisos. Solo hay dos roles y no se prevén más (regla 12). */
const JERARQUIA: Record<Rol, number> = { colaborador: 1, admin: 2 };

export function rolAlcanza(rol: Rol, minimo: Rol): boolean {
  return JERARQUIA[rol] >= JERARQUIA[minimo];
}

/**
 * Devuelve la sesión si alcanza el rol pedido; si no, lanza. Se distinguen los dos errores
 * porque quien llama actúa distinto: sin sesión se manda al login, con sesión insuficiente
 * se responde que no tiene permiso —mandarlo al login lo dejaría en un bucle, ya está
 * autenticado.
 */
export async function exigirRol(minimo: Rol): Promise<Sesion> {
  const sesion = await leerSesion();
  if (!sesion) throw new NoAutenticadoError();
  if (!rolAlcanza(sesion.rol, minimo)) throw new SinPermisoError(minimo);

  return sesion;
}
