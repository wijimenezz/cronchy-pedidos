import { NextResponse } from "next/server";
import { exigirCupo } from "@/lib/limites";
import { detectarTipoImagen, MAX_BYTES } from "@/lib/comprobantes";
import { subirComprobante } from "@/lib/storage";
import { opcionesDeEntrega, sePuedePedir } from "@/lib/pedidos/entrega";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Recibe el comprobante de Nequi y lo guarda en Storage, devolviendo la URL que el
 * checkout manda luego en `POST /api/pedidos`.
 *
 * Es un endpoint anónimo por diseño: el cliente no tiene cuenta (el pedido se hace sin
 * registrarse). Las defensas son el tope de tamaño, la comprobación de que el archivo
 * es realmente una imagen, y que solo se sube cuando hay un pedido que hacer.
 */
export async function POST(request: Request) {
  // Antes de leer el archivo: subirlo cuesta cuota de Storage, y esa no se recupera.
  const frenado = await exigirCupo(request, "comprobante");
  if (frenado) return frenado;

  // La pregunta es "¿se puede pedir?" y NO "¿está abierta?", que es lo que decía antes y era un
  // callejón sin salida: con la tienda cerrada el checkout ofrece programar, pero esto devolvía
  // 409, y como el esquema exige comprobante para Nequi el pedido quedaba imposible de terminar
  // —en efectivo sí salía, porque no sube nada—. Peor en recoger, que se paga por adelantado y
  // por tanto no tenía ninguna otra vía.
  //
  // Sigue siendo un guardia, que es lo que importa: `sePuedePedir` es falso con
  // `store.acepta_pedidos` apagado (el botón de pánico gana sobre todo, regla 6) y con una tienda
  // sin horario ni hoy ni mañana. Lo que cambia es que ya no confunde "cerrada ahora" con "no
  // acepta nada", que son cosas distintas desde que existen las franjas (regla 16).
  const opciones = await opcionesDeEntrega();
  if (!sePuedePedir(opciones)) {
    return NextResponse.json(
      { error: opciones.mensajeCerrado ?? "En este momento no estamos aceptando pedidos." },
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
