import { NextResponse } from "next/server";
import { pedidosDelRango } from "@/db/queries/resumen";
import { NoAutenticadoError, SinPermisoError, exigirRol } from "@/lib/autorizacion";
import { libroDePedidos } from "@/lib/export/libro";
import { diaDeBogota, rangoPedido } from "@/lib/pedidos/dias";

// `nodejs` y no Edge: `write-excel-file` comprime el ZIP del XLSX con APIs de Node.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Descarga los pedidos de un rango de días en XLSX.
 *
 * Es de **admin** y no de colaborador: aquí sale todo junto —teléfonos, direcciones y lo que
 * facturó el negocio—, y eso es del dueño. `exigirRol` es lo que corta de verdad (regla 12); que
 * el panel esconda el botón es cortesía.
 *
 * `storeId` sale de la sesión firmada y **nunca** de la URL: si viniera del cliente, cambiarlo
 * dejaría descargarse los pedidos de otra tienda el día que haya más de una (regla 5). Las
 * fechas sí pueden venir de la URL, porque son un filtro y no un permiso.
 */
export async function GET(request: Request) {
  try {
    const sesion = await exigirRol("admin");

    const params = new URL(request.url).searchParams;
    // `rangoPedido` no falla nunca: ordena un rango invertido, recorta el futuro y aplica el tope
    // de días. Es una descarga —un error de validación a mitad de camino se lee como que la app
    // se rompió—, así que corrige en vez de rechazar.
    const { desde, hasta } = rangoPedido(
      params.get("desde") ?? undefined,
      params.get("hasta") ?? undefined,
      diaDeBogota(),
    );

    const { pedidos, lineasDescartadas } = await pedidosDelRango(sesion.storeId, desde, hasta);
    const libro = await libroDePedidos(pedidos, desde, hasta, lineasDescartadas);

    return new NextResponse(new Uint8Array(libro.buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${libro.nombreArchivo}"`,
        // Lleva nombres, teléfonos y direcciones de clientes: no lo toca ningún intermediario.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof NoAutenticadoError) {
      return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
    }
    if (error instanceof SinPermisoError) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    throw error;
  }
}
