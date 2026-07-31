import { NextResponse } from "next/server";
import { crearPedidoSchema } from "@/lib/validaciones";
import { calcularPedido } from "@/lib/precios";
import { estaAbierta } from "@/lib/horario";
import { getStore } from "@/db/queries/store";
import { crearPedidoEnDB } from "@/db/queries/pedidos";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = crearPedidoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", detalles: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const disponibilidad = await estaAbierta();
  if (!disponibilidad.abierta) {
    return NextResponse.json(
      { error: disponibilidad.mensaje, motivo: disponibilidad.motivo },
      { status: 409 },
    );
  }

  const tienda = await getStore();

  // Todo el dinero se calcula aquí, en servidor (regla 1 de CLAUDE.md) — nunca se
  // confía en un total que venga del cliente. El descuento es siempre 0 al crear el
  // pedido: es un ajuste manual del negocio, no algo que el cliente controle.
  const resultado = await calcularPedido(tienda.id, {
    tipo: input.tipo,
    items: input.items,
    // Llega el pin, no la zona ni el precio: el servidor resuelve la cobertura de nuevo.
    punto: input.punto,
    descuento: 0,
  });

  if (!resultado.ok) {
    return NextResponse.json(
      { error: "No se pudo calcular el pedido", detalle: resultado.error },
      { status: 422 },
    );
  }

  const pedido = await crearPedidoEnDB(tienda.id, input, resultado.valor);

  return NextResponse.json(
    {
      id: pedido.id,
      numero: pedido.numero,
      tokenPublico: pedido.tokenPublico,
      total: resultado.valor.total,
      avisos: resultado.valor.avisos,
    },
    { status: 201 },
  );
}
