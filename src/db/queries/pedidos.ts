import { db } from "@/db";
import { order, orderItem, orderStatusEvent } from "@/db/schema";
import { upsertCustomer } from "@/db/queries/customers";
import { itemCalculadoASnapshot, type PedidoCalculado } from "@/lib/precios";
import type { CrearPedidoInput } from "@/lib/validaciones";

export async function crearPedidoEnDB(
  storeId: string,
  input: CrearPedidoInput,
  calculo: PedidoCalculado,
): Promise<{ id: string; numero: number; tokenPublico: string }> {
  return db.transaction(async (tx) => {
    const cliente = await upsertCustomer(tx, storeId, input.clienteTelefono, input.clienteNombre, calculo.total);

    // El dinero sale siempre de `calculo` (ya validado en servidor), nunca del input del cliente.
    const [pedido] = await tx
      .insert(order)
      .values({
        storeId,
        tipo: input.tipo,
        customerId: cliente.id,
        clienteNombre: input.clienteNombre,
        clienteTelefono: input.clienteTelefono,
        zonaId: input.tipo === "domicilio" ? (input.zonaId ?? null) : null,
        barrioTexto: input.barrioTexto ?? null,
        direccion: input.direccion ?? null,
        indicaciones: input.indicaciones ?? null,
        notas: input.notas ?? null,
        metodoPago: input.metodoPago,
        comprobanteUrl: input.comprobanteUrl ?? null,
        subtotal: calculo.subtotal,
        costoDomicilio: calculo.costoDomicilio,
        descuento: calculo.descuento,
        total: calculo.total,
      })
      .returning({ id: order.id, numero: order.numero, tokenPublico: order.tokenPublico });

    await tx.insert(orderItem).values(
      calculo.items.map((item, i) => ({
        orderId: pedido.id,
        productId: item.productId,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        subtotal: item.subtotal,
        snapshot: itemCalculadoASnapshot(item),
        orden: i,
      })),
    );

    await tx.insert(orderStatusEvent).values({ orderId: pedido.id, estado: "nuevo" });

    return pedido;
  });
}
