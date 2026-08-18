import { obtenerProductoConEngancles, obtenerProductosConEngancles } from "@/db/queries/productos";
import { resolverZona, type Punto } from "@/lib/zonas";
import { aplicarCupon, type CuponVigente, type MotivoRechazo } from "@/lib/cupones";
import { diaDeBogota } from "@/lib/pedidos/dias";
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
  /**
   * El cupón **ya resuelto** desde la base (`buscarCuponPorCodigo`). Del navegador llega el
   * código; cuánto descuenta se decide aquí (regla 1).
   */
  cupon?: CuponVigente | null;
  /**
   * Ajuste manual del negocio, para el pedido digitado desde el panel. **Excluyente con `cupon`**:
   * dos fuentes para el mismo número es exactamente lo que este proyecto no hace.
   */
  descuento?: number; // default 0, entero >= 0
  /** El día de Bogotá contra el que se mide el vencimiento. Por defecto, hoy. */
  hoy?: string;
};

export type ErrorPedido =
  | (ErrorPrecio & { itemIndex: number })
  | { tipo: "punto_requerido" }
  | { tipo: "fuera_de_cobertura" }
  | { tipo: "cupon_invalido"; motivo: MotivoRechazo }
  | { tipo: "descuento_invalido" };

export type PedidoCalculado = {
  items: ItemCalculado[];
  subtotal: number;
  costoDomicilio: number;
  /** Nombre de la zona que cobró el domicilio. Se congela en el pedido (regla 2): una
   * zona que después se renombre o se borre no debe reescribir lo que el cliente pagó. */
  zonaNombre: string | null;
  descuento: number;
  /**
   * Qué cupón descontó, congelado en el pedido igual que `zonaNombre` (regla 2). `null` cuando no
   * hubo cupón — incluido el descuento manual, que no tiene código que mostrar.
   */
  cuponId: string | null;
  cuponCodigo: string | null;
  total: number;
  avisos: (AvisoIncompleto & { itemIndex: number })[];
};

/**
 * Cuánto valen estos items, y nada más: sin domicilio, sin cupón y sin total.
 *
 * Existe aparte de `calcularPedido` porque responde otra pregunta, igual que `pedidosDelRango` no
 * reusa `listarPedidosDelDia`: aquel calcula **un pedido** —y por eso exige el pin y resuelve la
 * zona— y esto solo pone precio a un carrito. Es lo que necesita `/api/cupones/validar`, que quiere
 * saber sobre cuánto descontaría sin tener todavía una dirección confirmada.
 *
 * **`tipo` importa aunque no cobre el domicilio**: decide si cada producto se puede vender por ese
 * canal (`disponibleDelivery` / `disponiblePickup`). Pasarlo mal convierte un carrito perfectamente
 * válido en un error, que es justo lo que pasaba cuando el endpoint del cupón valoraba todo como
 * "recoger".
 */
export async function valorarItems(
  storeId: string,
  items: ItemSolicitado[],
  tipo: "domicilio" | "recoger",
): Promise<
  | { ok: true; valor: { items: ItemCalculado[]; subtotal: number; avisos: (AvisoIncompleto & { itemIndex: number })[] } }
  | { ok: false; error: ErrorPedido }
> {
  const productIds = [...new Set(items.map((i) => i.productId))];
  const productos = await obtenerProductosConEngancles(storeId, productIds);

  const calculados: ItemCalculado[] = [];
  const avisos: (AvisoIncompleto & { itemIndex: number })[] = [];
  let subtotal = 0;

  for (let i = 0; i < items.length; i++) {
    const itemSolicitado = items[i];
    const producto = productos.get(itemSolicitado.productId);
    if (!producto) {
      return {
        ok: false,
        error: { tipo: "producto_no_encontrado", productId: itemSolicitado.productId, itemIndex: i },
      };
    }

    const resultado = calcularItem(producto, itemSolicitado, tipo);
    if (!resultado.ok) {
      return { ok: false, error: { ...resultado.error, itemIndex: i } };
    }

    calculados.push(resultado.valor.base, ...resultado.valor.upsells);
    subtotal += resultado.valor.base.subtotal + resultado.valor.upsells.reduce((n, u) => n + u.subtotal, 0);
    for (const aviso of resultado.valor.base.avisos) {
      avisos.push({ ...aviso, itemIndex: i });
    }
  }

  return { ok: true, valor: { items: calculados, subtotal, avisos } };
}

export async function calcularPedido(
  storeId: string,
  input: CalculoPedidoInput,
): Promise<{ ok: true; valor: PedidoCalculado } | { ok: false; error: ErrorPedido }> {
  const descuentoManual = input.descuento ?? 0;
  if (!Number.isInteger(descuentoManual) || descuentoManual < 0) {
    return { ok: false, error: { tipo: "descuento_invalido" } };
  }
  // Un cupón Y un ajuste manual a la vez no se puede resolver sin inventarse una regla —¿se
  // suman? ¿gana uno?—, así que se rechaza en vez de adivinar.
  if (input.cupon !== undefined && descuentoManual > 0) {
    return { ok: false, error: { tipo: "descuento_invalido" } };
  }

  const valorados = await valorarItems(storeId, input.items, input.tipo);
  if (!valorados.ok) return valorados;
  const { items, subtotal, avisos } = valorados.valor;

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

  /**
   * El cupón se resuelve DESPUÉS de valorar los items y ANTES de sumar el domicilio, y ese orden
   * es el cálculo entero: necesita los subtotales ya calculados para saber sobre qué descontar, y
   * el domicilio no participa (regla 13).
   *
   * Se le pasan todos los items, upsells incluidos: cada uno lleva su propio `productId` (regla 8)
   * y `aplicarCupon` decide cuáles cubre.
   *
   * **`!== undefined` y no el valor a secas**: `null` significa "el cliente escribió un código y no
   * existe", que no es lo mismo que no haber escrito ninguno. Con la comprobación laxa, un cupón
   * mal tecleado se ignoraría en silencio y el cliente pagaría el precio lleno creyendo que le
   * descontaron. Ese es justo el caso que `aplicarCupon` rechaza con `no_existe`.
   */
  let descuento = descuentoManual;
  let cuponId: string | null = null;
  let cuponCodigo: string | null = null;

  if (input.cupon !== undefined) {
    const aplicado = aplicarCupon(input.cupon, items, input.hoy ?? diaDeBogota());
    if (!aplicado.ok) {
      // No se descarta en silencio para cobrar el precio lleno: el cliente vio un total con
      // descuento y puede haberlo transferido ya. Quien traduce el motivo es el checkout.
      return { ok: false, error: { tipo: "cupon_invalido", motivo: aplicado.motivo } };
    }

    descuento = aplicado.valor.descuento;
    cuponId = aplicado.valor.cuponId;
    cuponCodigo = aplicado.valor.codigo;
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
      cuponId,
      cuponCodigo,
      total,
      avisos,
    },
  };
}
