import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/db/queries/store";
import { resolverZona } from "@/lib/zonas";
import { barrioDelPunto } from "@/lib/barrio";

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

  // El barrio viaja de gorra en esta respuesta y no en un endpoint propio: el pin ya dispara
  // esta llamada cada vez que se mueve, así que el navegador no gasta ni un viaje extra.
  //
  // En paralelo y no encadenado: son dos preguntas independientes, y `barrioDelPunto` sale a
  // un servicio ajeno. Encadenarlas le sumaría su latencia al precio del domicilio, que es lo
  // que el cliente está esperando ver. Nunca lanza —devuelve null si falla—, así que la
  // cotización no puede caerse por culpa de la sugerencia.
  const [zona, barrio] = await Promise.all([
    resolverZona(tienda.id, parsed.data),
    barrioDelPunto(parsed.data),
  ]);

  // Fuera de cobertura igual se devuelve el barrio: el checkout ofrece cotizar por WhatsApp
  // (regla 14) y saber el barrio ayuda a que ese mensaje diga algo.
  if (!zona) {
    return NextResponse.json({ cubierto: false, barrio });
  }

  return NextResponse.json({ cubierto: true, zona: zona.nombre, precio: zona.precio, barrio });
}
