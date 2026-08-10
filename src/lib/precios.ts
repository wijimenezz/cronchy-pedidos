import { obtenerProductoConEngancles, obtenerProductosConEngancles } from "@/db/queries/productos";
import { resolverZona, type Punto } from "@/lib/zonas";
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
  /** El pin que el cliente confirmó. Es lo único que fija el costo del domicilio (regla 14). */
  punto?: Punto | null;
  descuento?: number; // default 0, entero >= 0
};

export type ErrorPedido =
  | (ErrorPrecio & { itemIndex: number })
  | { tipo: "punto_requerido" }
  | { tipo: "fuera_de_cobertura" }
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
  if (input.tipo === "domicilio") {
    if (!input.punto) {
      return { ok: false, error: { tipo: "punto_requerido" } };
    }

    // Se resuelve la zona AQUÍ, en el servidor, con el punto que llegó (regla 1). Lo que el
    // cliente vio mientras arrastraba el pin salió del endpoint de cotización y no cuenta:
    // entre que lo vio y confirmó, el admin pudo cambiar el precio o apagar la zona.
    const zona = await resolverZona(storeId, input.punto);
    if (!zona) {
      // Regla 14: fuera de cobertura no se cobra un estimado ni se deja "por confirmar";
      // el pedido no entra y la tienda cotiza por WhatsApp.
      return { ok: false, error: { tipo: "fuera_de_cobertura" } };
    }

    costoDomicilio = zona.precio;
    zonaNombre = zona.nombre;
  }

  const total = Math.max(0, subtotal + costoDomicilio - descuento);

  return {
    ok: true,
    valor: { items, subtotal, costoDomicilio, zonaNombre, descuento, total, avisos },
  };
}
