import { NextResponse, type NextRequest } from "next/server";
import { NOMBRE_COOKIE, verificarSesion } from "@/lib/auth/sesion";

/**
 * Primera barrera del panel: corta el paso antes de renderizar nada.
 *
 * Se llama `proxy` y no `middleware` porque Next 16 renombró el convenio; el
 * comportamiento es el mismo.
 *
 * Solo verifica la firma y la vigencia de la cookie — no toca la base. Aquí se corre en
 * el Edge Runtime, donde no hay `node:crypto` ni conexión a Postgres; por eso
 * `sesion.ts` usa Web Crypto y por eso el rol viaja dentro del propio token.
 *
 * Esto NO sustituye a `exigirRol()` (regla 12): una server action se puede invocar con un
 * POST directo que jamás pasa por la ruta protegida. Esto solo evita el viaje inútil y
 * manda al login a quien no tiene sesión.
 */
export default async function proxy(request: NextRequest) {
  const sesion = await verificarSesion(request.cookies.get(NOMBRE_COOKIE)?.value);
  if (sesion) return NextResponse.next();

  const login = new URL("/admin/login", request.url);
  // Para devolverlo a donde iba después de entrar. Solo la ruta, nunca una URL completa:
  // aceptar un destino absoluto convertiría el login en un redirector abierto.
  login.searchParams.set("destino", request.nextUrl.pathname);

  const respuesta = NextResponse.redirect(login);
  // La cookie vencida o adulterada se limpia de una vez, para no repetir el rebote en
  // cada navegación.
  respuesta.cookies.delete(NOMBRE_COOKIE);

  return respuesta;
}

export const config = {
  // Todo `/admin/*` salvo el login, que por definición se visita sin sesión.
  matcher: ["/admin/((?!login).*)", "/admin"],
};
