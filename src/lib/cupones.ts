/**
 * CÁLCULO DEL DESCUENTO DE UN CUPÓN — fuente única de verdad.
 *
 * Mismo trato que `precios.ts` y `zonas.ts`: si necesitas saber cuánto descuenta un cupón,
 * importa desde aquí. No repliques la aritmética en un componente ni en un route handler.
 *
 * Puro y sin base de datos: recibe el cupón **ya resuelto**. Quien lo busca y expande su alcance
 * a ids de producto es `db/queries/cupones.ts`.
 */

export type CuponVigente = {
  id: string;
  codigo: string;
  porcentaje: number;
  /** "YYYY-MM-DD" en el calendario de Bogotá. `null` = no vence. */
  venceEl: string | null;
  activo: boolean;
  /** `null` = toda la carta. Si no, los ids de producto que cubre, categorías ya expandidas. */
  productosElegibles: Set<string> | null;
};

export type MotivoRechazo = "no_existe" | "vencido" | "apagado" | "sin_items_elegibles";

export type CuponAplicado = {
  cuponId: string;
  codigo: string;
  porcentaje: number;
  /** Lo que el cupón sí cubre del pedido. Sobre esto se calcula, nunca sobre el total. */
  base: number;
  descuento: number;
};

export type ResultadoCupon =
  | { ok: true; valor: CuponAplicado }
  | { ok: false; motivo: MotivoRechazo };

/**
 * El código tal como se guarda y se busca.
 *
 * La usan el panel al guardar y el checkout al leer, así que "  churro10 " y "CHURRO10" resuelven
 * al mismo cupón. Si cada lado normalizara a su manera, el cliente que escribe en minúscula vería
 * un "ese cupón no existe" perfectamente falso.
 */
export function normalizarCodigo(crudo: string): string {
  return crudo.trim().toUpperCase();
}

/**
 * Cuánto descuenta este cupón sobre estos items, o por qué no descuenta nada.
 *
 * Tres cosas que no se pueden cambiar sin romper la caja:
 *
 * - **La base son los items elegibles, y el domicilio no está entre ellos.** Aquí no llega
 *   siquiera como parámetro, y es a propósito (regla 13): el domicilio lo ejecuta un courier
 *   externo que cobra igual, así que no existe descuento sobre él.
 * - **Se redondea una sola vez, sobre la base.** Redondear línea a línea deriva unos pesos y el
 *   número deja de cuadrar con el que el cliente vio.
 * - **`hoy` entra como parámetro** en vez de leer el reloj, igual que `calcularDisponibilidad`.
 *   Además de hacerlo probable, evita importar `dias.ts`, que arrastra la capa de base de datos.
 */
/** "A", "A y B", "A, B y C". */
function enumerar(nombres: string[]): string {
  if (nombres.length === 1) return nombres[0];
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/**
 * Qué se le dice al cliente cuando su cupón no sirve.
 *
 * Vive aquí y no en el checkout porque hay **dos** caminos que rechazan el mismo cupón: la
 * comprobación en vivo mientras lo escribe y el 422 al confirmar. Con el texto duplicado, el mismo
 * problema se explicaría de dos maneras distintas según por dónde saliera.
 *
 * `aplicaA` son los nombres de lo que el cupón cubre (`CuponResuelto.aplicaA`). Solo se usan en
 * `sin_items_elegibles`, que es el único rechazo con salida: los otros tres no tienen nada que el
 * cliente pueda hacer, así que no se le pide que haga nada.
 */
export function mensajeDeRechazo(motivo: MotivoRechazo, aplicaA: string[]): string {
  switch (motivo) {
    case "no_existe":
      // Se le invita a revisar en vez de darle por perdido: el caso normal es un dedo torpe en un
      // teclado de teléfono, no alguien inventándose códigos.
      return "Ese cupón no existe. Revisa que esté bien escrito.";
    case "vencido":
      return "Ese cupón ya venció.";
    case "apagado":
      // A propósito no dice "lo apagamos": para el cliente es lo mismo que no estar, y explicar la
      // operación interna del negocio no le sirve de nada.
      return "Ese cupón ya no está disponible.";
    case "sin_items_elegibles":
      return aplicaA.length > 0
        ? `Ese cupón aplica solo a ${enumerar(aplicaA)}. Agrégalo a tu pedido para usarlo.`
        : "Ese cupón no aplica a lo que llevas en el carrito.";
  }
}

export function aplicarCupon(
  cupon: CuponVigente | null,
  items: { productId: string; subtotal: number }[],
  hoy: string,
): ResultadoCupon {
  if (!cupon) return { ok: false, motivo: "no_existe" };

  // El switch manual gana sobre todo, igual que `store.acepta_pedidos` en la regla 6: es el botón
  // con el que se corta una promo que se salió de las manos, y uno que deja pasar cupones no sirve.
  if (!cupon.activo) return { ok: false, motivo: "apagado" };

  // Comparación de cadenas "YYYY-MM-DD", que en ese formato es la cronológica. El cupón vale
  // DURANTE todo su último día: `vence_el` es el último día bueno, no el primero malo.
  if (cupon.venceEl !== null && hoy > cupon.venceEl) {
    return { ok: false, motivo: "vencido" };
  }

  const elegibles = cupon.productosElegibles;
  const base = items.reduce(
    (n, item) => (elegibles === null || elegibles.has(item.productId) ? n + item.subtotal : n),
    0,
  );

  // Sin nada que descontar no se "aplica en $0": se rechaza, para poder decirle al cliente a qué
  // sí aplica. Un cupón que se acepta y no descuenta nada es indistinguible de uno roto.
  if (base === 0) return { ok: false, motivo: "sin_items_elegibles" };

  return {
    ok: true,
    valor: {
      cuponId: cupon.id,
      codigo: cupon.codigo,
      porcentaje: cupon.porcentaje,
      base,
      descuento: Math.round((base * cupon.porcentaje) / 100),
    },
  };
}
