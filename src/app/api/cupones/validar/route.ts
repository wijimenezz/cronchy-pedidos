import { NextResponse } from "next/server";
import { z } from "zod";
import { buscarCuponPorCodigo } from "@/db/queries/cupones";
import { getStore } from "@/db/queries/store";
import { valorarItems } from "@/lib/precios";
import { aplicarCupon, normalizarCodigo } from "@/lib/cupones";
import { diaDeBogota } from "@/lib/pedidos/dias";
import { idSchema } from "@/lib/validaciones";

export const dynamic = "force-dynamic";

/**
 * Cuánto descontaría este cupón sobre este carrito.
 *
 * Existe solo para pintar el descuento en vivo mientras el cliente escribe el código. **No es la
 * fuente del descuento** (regla 1): al confirmar, `POST /api/pedidos` vuelve a buscar el cupón y a
 * aplicarlo desde cero. Entre que el cliente vio un número y confirmó, el admin pudo apagarlo o el
 * cupón pudo vencer, y manda lo que valga entonces.
 *
 * Es el gemelo de `/api/zonas/cotizar`, y por lo mismo: los dos muestran un precio que el servidor
 * recalculará, y los dos son anónimos. Lo único que revela es a qué aplica un código que quien
 * pregunta ya conoce.
 *
 * **Valora el carrito contra la base en vez de sumar los subtotales que mande el navegador**: los
 * precios los pone el servidor (regla 1), así que recalcularlos aquí es lo que garantiza que el
 * descuento mostrado sea el que se va a cobrar.
 *
 * Usa `valorarItems` y no `calcularPedido` porque aquí no hay pedido: no hay pin confirmado, y el
 * domicilio no entra en la base del descuento (regla 13). Pero **el tipo sí viaja**, aunque no se
 * cobre envío: es lo que decide si cada producto se vende por ese canal. Valorar un carrito de
 * domicilio como si fuera "recoger" —que es lo que hacía antes— convertiría un producto marcado
 * solo-domicilio en un "no pudimos comprobar el cupón" sin explicación.
 */
const schema = z.object({
  codigo: z.string().trim().min(1).max(24),
  tipo: z.enum(["domicilio", "recoger"]),
  items: z
    .array(
      z.object({
        productId: idSchema,
        cantidad: z.number().int().positive().max(20),
        seleccion: z
          .array(
            z.object({
              productModifierGroupId: idSchema,
              opciones: z.array(
                z.object({
                  modifierOptionId: idSchema,
                  cantidad: z.number().int().positive().max(20),
                }),
              ),
            }),
          )
          .max(20),
      }),
    )
    .min(1)
    .max(30),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const tienda = await getStore();
  const codigo = normalizarCodigo(parsed.data.codigo);

  const [cupon, valorados] = await Promise.all([
    buscarCuponPorCodigo(tienda.id, codigo),
    valorarItems(tienda.id, parsed.data.items, parsed.data.tipo),
  ]);

  // Un carrito que ni se puede valorar (un producto que se agotó mientras el cliente escribía el
  // código) no es un problema del cupón: se contesta que no se pudo comprobar en vez de culpar al
  // código, y quien lo dirá con claridad es el 422 de `POST /api/pedidos` al confirmar.
  if (!valorados.ok) {
    return NextResponse.json({ ok: false, motivo: "no_comprobable" });
  }

  const aplicado = aplicarCupon(cupon, valorados.valor.items, diaDeBogota());

  if (!aplicado.ok) {
    return NextResponse.json({
      ok: false,
      motivo: aplicado.motivo,
      // Para poder decir a qué sí aplica. Vacío cuando el código no existe: ahí no hay alcance.
      aplicaA: cupon?.aplicaA ?? [],
    });
  }

  return NextResponse.json({
    ok: true,
    codigo: aplicado.valor.codigo,
    descuento: aplicado.valor.descuento,
  });
}
