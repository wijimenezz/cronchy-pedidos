import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { order } from "@/db/schema";
import { getStore } from "@/db/queries/store";

export const dynamic = "force-dynamic";

/**
 * En qué estado va el pedido. Nada más.
 *
 * Existe para que la pantalla de seguimiento pueda preguntar cada pocos segundos sin
 * descargarse la página entera: son datos móviles del cliente, y ese es exactamente el motivo
 * por el que CLAUDE.md descarta el polling en la carta. Aquí la respuesta pesa decenas de
 * bytes, y solo cuando el estado cambia de verdad la pantalla se recarga.
 *
 * El token es el mismo secreto que da acceso a la página, así que esto no expone nada nuevo;
 * y se filtra por `storeId` (regla 5) igual que `obtenerPedidoPorToken`. Se devuelve 404 sin
 * pistas tanto si el token no existe como si es de otra tienda.
 */
const FORMA_TOKEN = /^[0-9a-f]{32}$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!FORMA_TOKEN.test(token)) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const tienda = await getStore();

  // Solo la columna del estado: este endpoint se llama en bucle y no tiene por qué tocar los
  // items ni el snapshot.
  const fila = await db.query.order.findFirst({
    where: and(eq(order.storeId, tienda.id), eq(order.tokenPublico, token)),
    columns: { estado: true },
  });

  if (!fila) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  return NextResponse.json({ estado: fila.estado });
}
