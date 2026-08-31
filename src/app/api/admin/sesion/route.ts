import { NextResponse } from "next/server";
import { getStore } from "@/db/queries/store";
import { buscarUsuarioPorEmail } from "@/db/queries/usuarios";
import { borrarSesion, guardarSesion } from "@/lib/auth/cookie";
import { hashear, verificarClave } from "@/lib/auth/password";
import { loginSchema } from "@/lib/validaciones";
import { exigirCupo } from "@/lib/limites";

// bcrypt es Node puro; el Edge Runtime no sirve aquí.
export const runtime = "nodejs";

/**
 * Un solo mensaje para todos los fallos: correo que no existe, clave equivocada, usuario
 * dado de baja. Decir "ese correo no está registrado" le confirma a quien prueba cuáles
 * sí lo están.
 */
const CREDENCIALES_INVALIDAS = "Correo o clave incorrectos";

/**
 * Hash de descarte con el que comparar cuando el correo no existe. Sin esto, un correo
 * desconocido responde al instante y uno real tarda los ~50 ms de bcrypt: esa diferencia
 * de tiempo es, por sí sola, un buscador de correos válidos.
 */
const HASH_SEÑUELO = hashear("señuelo para igualar el tiempo de respuesta");

export async function POST(request: Request) {
  const frenado = await exigirCupo(request, "login");
  if (frenado) return frenado;

  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: CREDENCIALES_INVALIDAS }, { status: 400 });
  }

  const tienda = await getStore();
  const usuario = await buscarUsuarioPorEmail(tienda.id, parsed.data.email);

  const correcta = await verificarClave(
    parsed.data.clave,
    usuario?.passwordHash ?? (await HASH_SEÑUELO),
  );

  if (!usuario || !correcta) {
    return NextResponse.json({ error: CREDENCIALES_INVALIDAS }, { status: 401 });
  }

  await guardarSesion({ sub: usuario.id, rol: usuario.rol, storeId: tienda.id });

  return NextResponse.json({ nombre: usuario.nombre, rol: usuario.rol });
}

export async function DELETE() {
  await borrarSesion();
  return new NextResponse(null, { status: 204 });
}
