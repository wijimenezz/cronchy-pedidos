import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/db/queries/store";
import { resolverZona } from "@/lib/zonas";

export const dynamic = "force-dynamic";

/**
 * Cuánto cuesta el domicilio hasta este punto.
 *
 * Existe solo para pintar el costo en vivo mientras el cliente arrastra el pin. **No es la
 * fuente del precio** (regla 1): al confirmar, `calcularPedido` vuelve a resolver la zona en
 * el servidor con el punto que llega en el pedido. Entre que el cliente vio un número y
 * confirmó, el admin pudo cambiar la tarifa o apagar la zona, y manda lo que valga entonces.
 *
 * Es anónimo a propósito, como el resto del storefront. Lo único que revela es lo que
 * cualquiera vería probando direcciones en el checkout: hasta dónde llega la tienda y a qué
 * precio.
 */
const schema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ubicación inválida" }, { status: 400 });
  }

  const tienda = await getStore();
  const zona = await resolverZona(tienda.id, parsed.data);

  if (!zona) {
    return NextResponse.json({ cubierto: false });
  }

  return NextResponse.json({ cubierto: true, zona: zona.nombre, precio: zona.precio });
}
