import { NextResponse } from "next/server";
import { detectarTipoImagen, MAX_BYTES } from "@/lib/comprobantes";
import { subirComprobante } from "@/lib/storage";
import { estaAbierta } from "@/lib/horario";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Recibe el comprobante de Nequi y lo guarda en Storage, devolviendo la URL que el
 * checkout manda luego en `POST /api/pedidos`.
 *
 * Es un endpoint anónimo por diseño: el cliente no tiene cuenta (el pedido se hace sin
 * registrarse). Las defensas son el tope de tamaño, la comprobación de que el archivo
 * es realmente una imagen, y que solo acepta subidas con la tienda abierta.
 */
export async function POST(request: Request) {
  const disponibilidad = await estaAbierta();
  if (!disponibilidad.abierta) {
    return NextResponse.json(
      { error: disponibilidad.mensaje, motivo: disponibilidad.motivo },
      { status: 409 },
    );
  }

  // Corte barato antes de leer el cuerpo entero en memoria.
  const declarado = Number(request.headers.get("content-length") ?? 0);
  if (declarado > MAX_BYTES) {
    return NextResponse.json({ error: "La imagen es muy pesada." }, { status: 413 });
  }

  const form = await request.formData().catch(() => null);
  const archivo = form?.get("archivo");
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
  }

  const bytes = await archivo.arrayBuffer();
  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: "El archivo está vacío." }, { status: 400 });
  }
  // El content-length se puede mentir; este es el tamaño real.
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "La imagen es muy pesada." }, { status: 413 });
  }

  const tipo = detectarTipoImagen(new Uint8Array(bytes));
  if (!tipo) {
    return NextResponse.json(
      { error: "El archivo no es una imagen válida (JPG, PNG o WEBP)." },
      { status: 415 },
    );
  }

  try {
    const { url } = await subirComprobante(bytes, tipo);
    return NextResponse.json({ url }, { status: 201 });
  } catch (error) {
    console.error("Error subiendo comprobante:", error);
    return NextResponse.json({ error: "No pudimos guardar el comprobante." }, { status: 502 });
  }
}
