import { NextResponse } from "next/server";
import { getStore } from "@/db/queries/store";
import { listarPedidos } from "@/db/queries/panel";
import { NoAutenticadoError, SinPermisoError, exigirRol } from "@/lib/autorizacion";

export const dynamic = "force-dynamic";

/**
 * Fuente del polling de la lista (cada 5 s, regla de CLAUDE.md: nada de WebSockets).
 *
 * Es un route handler y no una server action porque aquí se lee, no se muta: una acción
 * obligaría a un `router.refresh()` que redibuja la página entera y pierde el scroll en
 * mitad de la operación.
 */
export async function GET() {
  try {
    const sesion = await exigirRol("colaborador");
    const tienda = await getStore();

    // Ya no hay filtro que pasar: el tablero pinta las cuatro columnas a la vez, así que la
    // consulta trae siempre lo vivo más lo que terminó hoy.
    //
    // `storeId` sale de la sesión firmada, no de la URL: si viniera del cliente, cambiarlo
    // dejaría leer los pedidos de otra tienda el día que haya más de una (regla 5).
    const pedidos = await listarPedidos(sesion.storeId);

    return NextResponse.json({ pedidos, tienda: { nombre: tienda.nombre } });
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
