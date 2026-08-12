import { NextResponse } from "next/server";
import { getStore } from "@/db/queries/store";
import { esUrlDeFotoProducto } from "@/lib/imagenes";

export const runtime = "nodejs";

/**
 * Sirve el QR de pago para que el cliente lo GUARDE, no para verlo: el checkout ya lo pinta
 * desde Storage.
 *
 * Existe porque el atributo `download` de un `<a>` **se ignora en enlaces cross-origin**.
 * Apuntar el botón directamente al objeto de Supabase abriría la imagen en otra pestaña —el
 * cliente tendría que mantener pulsado y buscar "Guardar imagen"— y justamente lo que se
 * quiere es un toque. Sirviéndolo desde nuestro propio origen con `Content-Disposition`, el
 * navegador lo guarda sin ayuda.
 *
 * La URL se valida antes de pedirla aunque venga de nuestra propia base: sin ese filtro, una
 * columna manipulada convertiría este endpoint en un proxy con el que descargar cualquier
 * cosa desde el servidor.
 */
export async function GET() {
  const tienda = await getStore();
  const url = tienda.nequiQrUrl;

  if (!url || !esUrlDeFotoProducto(url)) {
    return NextResponse.json({ error: "No hay QR de pago configurado." }, { status: 404 });
  }

  const respuesta = await fetch(url).catch(() => null);
  if (!respuesta?.ok || !respuesta.body) {
    return NextResponse.json({ error: "No pudimos descargar el QR." }, { status: 502 });
  }

  const extension = url.slice(url.lastIndexOf(".") + 1);

  return new NextResponse(respuesta.body, {
    headers: {
      "Content-Type": respuesta.headers.get("content-type") ?? "image/jpeg",
      // El nombre lo ve el cliente en su carpeta de descargas: que diga de qué es.
      "Content-Disposition": `attachment; filename="QR-pago-cronchy.${extension}"`,
      // Cinco minutos: el QR no cambia casi nunca, pero la ruta es fija —el uuid del objeto
      // no viaja en ella—, así que una caché larga serviría el viejo tras cambiarlo.
      "Cache-Control": "public, max-age=300",
    },
  });
}
