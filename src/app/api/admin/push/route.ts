import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirRol, NoAutenticadoError, SinPermisoError } from "@/lib/autorizacion";
import { borrarSuscripcion, guardarSuscripcion } from "@/db/queries/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Alta y baja del dispositivo en Web Push.
 *
 * Va por route handler y no por server action porque lo llama `fetch` desde el cliente con el
 * objeto que devuelve `pushManager.subscribe()` — y en el caso de la baja, con `keepalive`
 * mientras el navegador ya está saliendo hacia el login.
 */

/** Lo que devuelve `PushSubscription.toJSON()`, que es lo que manda el cliente tal cual. */
const suscripcionSchema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(200),
  }),
});

export async function POST(request: Request) {
  const sesion = await autorizar();
  if (sesion instanceof NextResponse) return sesion;

  const body = await request.json().catch(() => null);
  const parsed = suscripcionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Suscripción inválida" }, { status: 400 });
  }

  await guardarSuscripcion({
    storeId: sesion.storeId,
    userId: sesion.sub,
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const sesion = await autorizar();
  if (sesion instanceof NextResponse) return sesion;

  const body = await request.json().catch(() => null);
  const parsed = z.object({ endpoint: z.url().max(1000) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  // Se borra por endpoint y sin comprobar de quién era: quien tiene el endpoint es el dispositivo
  // que lo generó, y darse de baja de los avisos nunca puede fallar por permisos.
  await borrarSuscripcion(parsed.data.endpoint);

  return NextResponse.json({ ok: true });
}

/**
 * `exigirRol` lanza, y aquí hace falta responder JSON: el cliente que llama a esto no está
 * navegando, está en medio de armar los avisos.
 */
async function autorizar() {
  try {
    return await exigirRol("colaborador");
  } catch (error) {
    if (error instanceof NoAutenticadoError || error instanceof SinPermisoError) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 401 });
    }
    throw error;
  }
}
