import { obtenerProductoConEngancles, obtenerProductosConEngancles } from "@/db/queries/productos";
import { obtenerZonaActiva } from "@/db/queries/deliveryZones";
import { calcularItem } from "@/lib/precios-calculo";
import type {
  AvisoIncompleto,
  ErrorPrecio,
  ItemCalculado,
  ItemSolicitado,
  ResultadoItemCalculado,
  ResultadoPrecio,
} from "@/lib/precios-calculo";

// Fuente única de verdad de precios (regla 1 de CLAUDE.md). La capa pura de
// cálculo (sin DB) vive en `precios-calculo.ts` para poder importarse desde
// el cliente (ej. la ficha de producto, para precio en vivo) sin arrastrar el
// driver de Postgres al bundle del navegador — este archivo la re-exporta
// completa y le agrega las funciones que sí necesitan la base de datos.
export * from "@/lib/precios-calculo";

// ------------------------------------------------------------
// Capa DB — fetch + delega a la capa pura
// ------------------------------------------------------------

export async function calcularPrecioItem(
  storeId: string,
  item: ItemSolicitado,
  tipoPedido?: "domicilio" | "recoger",
): Promise<ResultadoPrecio<ResultadoItemCalculado>> {
  const producto = await obtenerProductoConEngancles(storeId, item.productId);
  if (!producto) {
    return { ok: false, error: { tipo: "producto_no_encontrado", productId: item.productId } };
  }

  return calcularItem(producto, item, tipoPedido);
}

export type CalculoPedidoInput = {
  tipo: "domicilio" | "recoger";
  items: ItemSolicitado[];
  zonaId?: string | null;
  /** US11: barrio escrito a mano cuando no está en la lista. Solo se mira si no hay zonaId. */
  barrioTexto?: string | null;
  descuento?: number; // default 0, entero >= 0
};

export type ErrorPedido =
  | (ErrorPrecio & { itemIndex: number })
  | { tipo: "zona_o_barrio_requerido" }
  | { tipo: "zona_no_encontrada"; zonaId: string }
  | { tipo: "zona_inactiva"; zonaId: string }
  | { tipo: "descuento_invalido" };

export type PedidoCalculado = {
  items: ItemCalculado[];
  subtotal: number;
  costoDomicilio: number;
  /** Nombre de la zona que cobró el domicilio. Se congela en el pedido (regla 2): una
   * zona que después se renombre o se borre no debe reescribir lo que el cliente pagó. */
  zonaNombre: string | null;
  descuento: number;
  total: number;
  /** US11: el barrio no estaba en la lista, el negocio confirma el valor después.
   * Lo decide el servidor (determina dinero), nunca llega del cliente. */
  domicilioPorConfirmar: boolean;
  avisos: (AvisoIncompleto & { itemIndex: number })[];
};

export async function calcularPedido(
  storeId: string,
  input: CalculoPedidoInput,
): Promise<{ ok: true; valor: PedidoCalculado } | { ok: false; error: ErrorPedido }> {
  const descuento = input.descuento ?? 0;
  if (!Number.isInteger(descuento) || descuento < 0) {
    return { ok: false, error: { tipo: "descuento_invalido" } };
  }

  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const productos = await obtenerProductosConEngancles(storeId, productIds);

  const items: ItemCalculado[] = [];
  const avisos: (AvisoIncompleto & { itemIndex: number })[] = [];
  let subtotal = 0;

  for (let i = 0; i < input.items.length; i++) {
    const itemSolicitado = input.items[i];
    const producto = productos.get(itemSolicitado.productId);
    if (!producto) {
      return {
        ok: false,
        error: { tipo: "producto_no_encontrado", productId: itemSolicitado.productId, itemIndex: i },
      };
    }

    const resultado = calcularItem(producto, itemSolicitado, input.tipo);
    if (!resultado.ok) {
      return { ok: false, error: { ...resultado.error, itemIndex: i } };
    }

    items.push(resultado.valor.base, ...resultado.valor.upsells);
    subtotal += resultado.valor.base.subtotal + resultado.valor.upsells.reduce((n, u) => n + u.subtotal, 0);
    for (const aviso of resultado.valor.base.avisos) {
      avisos.push({ ...aviso, itemIndex: i });
    }
  }

  let costoDomicilio = 0;
  let zonaNombre: string | null = null;
  let domicilioPorConfirmar = false;
  if (input.tipo === "domicilio") {
    if (input.zonaId) {
      const zona = await obtenerZonaActiva(storeId, input.zonaId);
      if (!zona) {
        return { ok: false, error: { tipo: "zona_no_encontrada", zonaId: input.zonaId } };
      }
      if (!zona.activa) {
        return { ok: false, error: { tipo: "zona_inactiva", zonaId: input.zonaId } };
      }
      costoDomicilio = zona.precio;
      zonaNombre = zona.nombre;
    } else if (input.barrioTexto) {
      // US11: el barrio no está en la lista. Se cobra 0 de domicilio y el negocio
      // acuerda el valor con el cliente después. Cobrar un estimado sería peor:
      // el cliente vería un total que no es el que va a pagar.
      costoDomicilio = 0;
      domicilioPorConfirmar = true;
    } else {
      return { ok: false, error: { tipo: "zona_o_barrio_requerido" } };
    }
  }

  const total = Math.max(0, subtotal + costoDomicilio - descuento);

  return {
    ok: true,
    valor: {
      items,
      subtotal,
      costoDomicilio,
      zonaNombre,
      descuento,
      total,
      domicilioPorConfirmar,
      avisos,
    },
  };
}
