import { NextResponse } from "next/server";
import { obtenerPedidoPorNumero } from "@/db/queries/panel";
import { NoAutenticadoError, SinPermisoError, exigirRol } from "@/lib/autorizacion";
import { esUrlDeComprobante } from "@/lib/comprobantes";
import { descargarComprobante } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sirve el comprobante de Nequi al panel.
 *
 * El bucket es privado a propósito —guarda datos bancarios de clientes— así que la URL
 * almacenada no abre sola. Este endpoint hace de puente: valida la sesión y recién ahí
 * pide el objeto con la service key, que jamás sale del servidor.
 *
 * Se busca por número de pedido y no por la URL del objeto: si la ruta aceptara una URL,
 * sería un proxy con el que leer cualquier archivo del bucket.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ numero: string }> }) {
  try {
    const sesion = await exigirRol("colaborador");

    const { numero } = await params;
    if (!/^\d+$/.test(numero)) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    const encontrado = await obtenerPedidoPorNumero(sesion.storeId, Number(numero));
    const url = encontrado?.pedido.comprobanteUrl;
    if (!url) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    // Cinturón y tirantes: la columna solo debería contener URLs de nuestro bucket, pero
    // se comprueba antes de que la service key toque nada.
    if (!esUrlDeComprobante(url)) {
      return NextResponse.json({ error: "Comprobante inválido" }, { status: 422 });
    }

    const archivo = await descargarComprobante(url);
    if (!archivo) {
      return NextResponse.json({ error: "El comprobante ya se purgó" }, { status: 410 });
    }

    return new NextResponse(archivo.cuerpo, {
      headers: {
        "Content-Type": archivo.tipo,
        // Privado y sin cachear en intermediarios: es un dato personal.
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
