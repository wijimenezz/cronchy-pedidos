import { cookies } from "next/headers";
import {
  DURACION_SEGUNDOS,
  NOMBRE_COOKIE,
  firmarSesion,
  verificarSesion,
  type Rol,
  type Sesion,
} from "./sesion";

/**
 * La cookie de sesión vista desde el servidor (server components, route handlers y
 * server actions). Vive aparte de `sesion.ts` porque `next/headers` no existe en el
 * middleware, que lee la cookie de `NextRequest` y solo necesita la parte pura.
 */

export async function leerSesion(): Promise<Sesion | null> {
  const cookie = (await cookies()).get(NOMBRE_COOKIE);
  return verificarSesion(cookie?.value);
}

export async function guardarSesion(datos: { sub: string; rol: Rol; storeId: string }) {
  (await cookies()).set(NOMBRE_COOKIE, await firmarSesion(datos), {
    httpOnly: true,
    // `lax` y no `strict`: con `strict` el navegador no manda la cookie cuando se llega
    // al panel desde un link externo —el aviso de pedido nuevo que abre WhatsApp— y el
    // empleado vería el login aunque su sesión esté viva.
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DURACION_SEGUNDOS,
  });
}

export async function borrarSesion() {
  (await cookies()).delete(NOMBRE_COOKIE);
}
