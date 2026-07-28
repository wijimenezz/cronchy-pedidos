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
  descuento?: number; // default 0, entero >= 0
};

export type ErrorPedido =
  | (ErrorPrecio & { itemIndex: number })
  | { tipo: "zona_requerida" }
  | { tipo: "zona_no_encontrada"; zonaId: string }
  | { tipo: "zona_inactiva"; zonaId: string }
  | { tipo: "descuento_invalido" };

export type PedidoCalculado = {
  items: ItemCalculado[];
  subtotal: number;
  costoDomicilio: number;
  descuento: number;
  total: number;
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
  if (input.tipo === "domicilio") {
    if (!input.zonaId) {
      return { ok: false, error: { tipo: "zona_requerida" } };
    }
    const zona = await obtenerZonaActiva(storeId, input.zonaId);
    if (!zona) {
      return { ok: false, error: { tipo: "zona_no_encontrada", zonaId: input.zonaId } };
    }
    if (!zona.activa) {
      return { ok: false, error: { tipo: "zona_inactiva", zonaId: input.zonaId } };
    }
    costoDomicilio = zona.precio;
  }

  const total = Math.max(0, subtotal + costoDomicilio - descuento);

  return {
    ok: true,
    valor: { items, subtotal, costoDomicilio, descuento, total, avisos },
  };
}
