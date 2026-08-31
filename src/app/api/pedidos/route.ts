import { NextResponse } from "next/server";
import { crearPedidoSchema } from "@/lib/validaciones";
import { calcularPedido } from "@/lib/precios";
import { esFranjaOfrecida, opcionesDeEntrega } from "@/lib/pedidos/entrega";
import { esMetodoOfrecido } from "@/lib/pedidos/pago";
import { getStore } from "@/db/queries/store";
import { buscarCuponPorCodigo } from "@/db/queries/cupones";
import { crearPedidoEnDB } from "@/db/queries/pedidos";
import { enviarPushPedidoNuevo } from "@/lib/notificaciones/push";
import { avisarPedidoNuevo } from "@/lib/notificaciones/telegram";
import { exigirCupo } from "@/lib/limites";

export async function POST(request: Request) {
  const frenado = await exigirCupo(request, "pedido");
  if (frenado) return frenado;

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

  // El "cuándo" se valida igual que el "cuánto" (regla 1): el servidor genera las opciones y
  // solo acepta una de las suyas. De paso resuelve la carrera de la franja que caduca mientras
  // el cliente llena el formulario — a las 6:59 la de las 7:00 ya no está en la lista.
  const opciones = await opcionesDeEntrega();

  if (input.programadoPara) {
    if (!esFranjaOfrecida(opciones, new Date(input.programadoPara))) {
      // Dos situaciones distintas bajo el mismo 409, y el checkout las trata distinto: si
      // quedan horas, solo caducó la suya y basta con volver a elegir; si no queda ninguna,
      // la tienda cerró de verdad y no hay nada que reintentar.
      return opciones.dias.length > 0
        ? NextResponse.json(
            { error: "Esa hora ya no está disponible. Elige otra.", motivo: "franja_caducada" },
            { status: 409 },
          )
        : NextResponse.json(
            { error: opciones.mensajeCerrado ?? "Estamos cerrados en este momento." },
            { status: 409 },
          );
    }
  } else if (!opciones.pronto) {
    return NextResponse.json(
      { error: opciones.mensajeCerrado ?? "Estamos cerrados en este momento." },
      { status: 409 },
    );
  }

  const tienda = await getStore();

  // Y el "con qué" se valida igual que el "cuándo", unas líneas más arriba: el servidor genera
  // los métodos que ofrece y solo acepta uno de los suyos. Recoger se paga por adelantado, así
  // que esconder el radio del efectivo en el checkout no basta — el payload se arma a mano en
  // treinta segundos, y `crearPedidoEnDB` escribe `metodoPago` tal como llega.
  if (
    !esMetodoOfrecido(input.metodoPago, input.tipo, {
      llaveDisponible: Boolean(tienda.nequiLlave),
    })
  ) {
    return NextResponse.json(
      {
        error:
          input.tipo === "recoger"
            ? "Los pedidos para recoger se pagan por adelantado. Elige Nequi o Bre-B."
            : "Ese método de pago no está disponible.",
      },
      { status: 422 },
    );
  }

  // Y el descuento igual que todo lo demás: del navegador llega el **código** del cupón, y cuánto
  // vale lo decide el servidor. Se busca aquí y se le pasa resuelto al cálculo; si no sirve —no
  // existe, venció, lo apagaron, o el carrito no lleva nada que cubra— `calcularPedido` corta con
  // `cupon_invalido` en vez de cobrar el precio lleno en silencio.
  const cupon = input.cupon ? await buscarCuponPorCodigo(tienda.id, input.cupon) : null;

  // Todo el dinero se calcula aquí, en servidor (regla 1 de CLAUDE.md) — nunca se
  // confía en un total que venga del cliente.
  const resultado = await calcularPedido(tienda.id, {
    tipo: input.tipo,
    items: input.items,
    // Llega el pin, no la zona ni el precio: el servidor resuelve la cobertura de nuevo.
    punto: input.punto,
    // `null` cuando el código no existe, y eso NO es "sin cupón": el cliente escribió algo y hay
    // que decírselo. Distinguir los dos casos es lo que hace que se rechace en vez de ignorarlo.
    cupon: input.cupon ? cupon : undefined,
  });

  if (!resultado.ok) {
    return NextResponse.json(
      {
        error: "No se pudo calcular el pedido",
        detalle: resultado.error,
        // Los nombres de lo que el cupón cubre viajan aparte del `detalle` —que es el `ErrorPedido`
        // del cálculo y no tiene por qué conocer el catálogo—, y solo cuando hacen falta: son lo
        // que permite decir "aplica solo a Churros con helado" en vez de "no aplica".
        ...(resultado.error.tipo === "cupon_invalido" && cupon
          ? { aplicaA: cupon.aplicaA }
          : {}),
      },
      { status: 422 },
    );
  }

  const pedido = await crearPedidoEnDB(tienda.id, input, resultado.valor);

  // Los avisos al negocio, DESPUÉS de crear el pedido y sin poder tumbarlo: el cliente ya compró,
  // así que un fallo notificando no puede convertirse en un error de su checkout.
  //
  // Se esperan (`await`) a propósito, igual que al borrar fotos huérfanas: en una función
  // serverless, disparar sin esperar mata la instancia antes de que salgan las peticiones. Van en
  // paralelo porque son canales independientes —el push despierta al panel, Telegram cuenta el
  // pedido— y encadenarlos le sumaría al cliente la espera de los dos.
  //
  // `allSettled` y no `all`, que es lo que había: `all` rechaza en el primer fallo y devuelve el
  // control con la otra petición todavía en vuelo — justo la instancia muerta a medio camino que
  // el `await` venía a evitar. Hoy ninguna de las dos rechaza (las dos se tragan sus errores por
  // dentro), así que esto es el seguro para el día en que una deje de hacerlo.
  const avisos = await Promise.allSettled([
    enviarPushPedidoNuevo(tienda.id, pedido.numero),
    avisarPedidoNuevo(input, resultado.valor, pedido, tienda),
  ]);

  for (const aviso of avisos) {
    if (aviso.status === "rejected") {
      console.error("No se pudo avisar al panel del pedido nuevo:", aviso.reason);
    }
  }

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
