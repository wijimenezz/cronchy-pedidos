import { NextResponse } from "next/server";
import { detectarTipoImagen, MAX_BYTES } from "@/lib/imagenes";
import { exigirRol, NoAutenticadoError, SinPermisoError } from "@/lib/autorizacion";
import { subirFotoProducto } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * El id va dentro de la ruta del objeto: si no se valida, entra cualquier cosa al bucket.
 * En minúsculas y sin bandera `i` a propósito — así es como Postgres devuelve los uuid, y
 * es la única forma que `esUrlDeFotoProducto` reconocerá luego al guardar.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Sube una foto de producto (o un banner de categoría) al bucket público y devuelve su URL.
 * El panel la guarda después con la server action correspondiente: aquí solo se deja el
 * objeto en Storage, la columna `imagenes` no se toca.
 *
 * Es un route handler y no una server action porque el body por defecto de una server
 * action está topado en 1 MB. La foto llega ya comprimida a WebP desde el navegador y suele
 * pesar ~120 KB, pero el margen es gratis y este es además el patrón que ya existe en
 * `/api/comprobantes`.
 *
 * A diferencia de aquel, este SÍ exige sesión: subir a la carta es cosa de admin (regla 12).
 */
export async function POST(request: Request) {
  try {
    await exigirRol("admin");
  } catch (error) {
    if (error instanceof NoAutenticadoError || error instanceof SinPermisoError) {
      return NextResponse.json({ error: "No tienes permiso para subir fotos." }, { status: 403 });
    }
    throw error;
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

  const productId = form?.get("productId");
  const categoryId = form?.get("categoryId");
  const destino =
    typeof productId === "string" && UUID.test(productId)
      ? { productId }
      : typeof categoryId === "string" && UUID.test(categoryId)
        ? { categoryId }
        : null;

  if (!destino) {
    return NextResponse.json({ error: "Falta a qué producto pertenece." }, { status: 400 });
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
    const { url } = await subirFotoProducto(bytes, tipo, destino);
    return NextResponse.json({ url }, { status: 201 });
  } catch (error) {
    console.error("Error subiendo foto de producto:", error);
    return NextResponse.json({ error: "No pudimos guardar la foto." }, { status: 502 });
  }
}
