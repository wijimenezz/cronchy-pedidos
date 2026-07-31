import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { appUser } from "@/db/schema";
import type { Rol } from "@/lib/auth/sesion";

export type UsuarioPanel = {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  passwordHash: string;
};

/**
 * Busca por correo dentro de la tienda (regla 5) y solo entre los activos: dar de baja a
 * alguien es apagar `activo`, no borrar la fila, porque `order_status_event.user_id`
 * apunta aquí y borrarla reescribiría quién atendió cada pedido.
 *
 * El correo se normaliza en minúsculas: nadie espera que "Wilson@" y "wilson@" sean
 * cuentas distintas, y en el móvil la primera letra sale en mayúscula sola.
 */
export async function buscarUsuarioPorEmail(
  storeId: string,
  email: string,
): Promise<UsuarioPanel | null> {
  const fila = await db.query.appUser.findFirst({
    where: and(
      eq(appUser.storeId, storeId),
      eq(appUser.email, email.trim().toLowerCase()),
      eq(appUser.activo, true),
    ),
    columns: { id: true, nombre: true, email: true, rol: true, passwordHash: true },
  });

  return fila ?? null;
}
