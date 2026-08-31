import { NextResponse } from "next/server";
import { confirmarEntrega } from "@/db/queries/domiciliarios";
import { exigirCupo } from "@/lib/limites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** El token lo genera Postgres con encode(gen_random_bytes(16),'hex'), igual que el del cliente. */
const FORMA_TOKEN = /^[0-9a-f]{32}$/;

/**
 * El domiciliario confirma que entregó el pedido.
 *
 * **Es el único write del proyecto sin sesión de panel**, así que conviene ser explícito sobre
 * qué lo sostiene:
 *
 * 1. El token es una llave **distinta** de la del cliente (`order.token_entrega` vs
 *    `token_publico`). La del cliente solo lee su seguimiento; esta solo escribe un estado.
 * 2. Lo que decide qué se puede hacer no es el token sino `validarCambioEstado`, dentro de
 *    `confirmarEntrega`: **solo** `en_camino → entregado`. Un link filtrado no cancela, no
 *    adelanta un pedido en preparación y no sirve dos veces.
 * 3. No devuelve datos del pedido. Un token equivocado responde lo mismo que uno inexistente.
 *
 * Va por route handler y no por server action porque es una escritura pública, como
 * `POST /api/pedidos`; las server actions de este proyecto son para pantallas con sesión.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!FORMA_TOKEN.test(token)) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  // Por token, como el seguimiento: el domiciliario confirma desde datos móviles y comparte IP
  // con media ciudad. Lo que este límite frena es golpear un link filtrado, no al courier.
  const frenado = await exigirCupo(request, "entrega", token);
  if (frenado) return frenado;

  const resultado = await confirmarEntrega(token);

  if (!resultado.ok) {
    return resultado.motivo === "no_encontrado"
      ? NextResponse.json({ error: "No encontrado" }, { status: 404 })
      : // 409 y no 403: el link es válido, lo que no encaja es el momento — el pedido todavía no
        // salió, o se canceló.
        NextResponse.json({ error: "Este pedido todavía no se puede entregar" }, { status: 409 });
  }

  return NextResponse.json({ ok: true, yaEstaba: resultado.yaEstaba });
}
