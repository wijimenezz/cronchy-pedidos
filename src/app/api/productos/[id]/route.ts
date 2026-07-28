import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/db/queries/store";
import { obtenerProductoParaFicha } from "@/db/queries/productos";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  }

  const tienda = await getStore();
  const producto = await obtenerProductoParaFicha(tienda.id, parsed.data.id);
  if (!producto) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  return NextResponse.json(producto);
}
