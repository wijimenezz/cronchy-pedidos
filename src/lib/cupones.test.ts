import { describe, expect, it } from "vitest";
import {
  aplicarCupon,
  mensajeDeRechazo,
  normalizarCodigo,
  type CuponVigente,
} from "./cupones";

const HOY = "2026-08-18";

function cupon(parcial: Partial<CuponVigente> = {}): CuponVigente {
  return {
    id: "cupon-1",
    codigo: "CHURRO10",
    porcentaje: 10,
    venceEl: null,
    activo: true,
    productosElegibles: null,
    ...parcial,
  };
}

describe("normalizarCodigo", () => {
  it("lo que el cliente teclea mal resuelve al mismo cupón", () => {
    expect(normalizarCodigo("  churro10 ")).toBe("CHURRO10");
  });
});

/**
 * El texto vive aquí y no en el checkout porque hay DOS caminos que rechazan el mismo cupón —la
 * comprobación en vivo mientras se escribe y el 422 al confirmar—, y si cada uno redactara lo suyo
 * el cliente leería dos explicaciones distintas del mismo problema.
 */
describe("mensajeDeRechazo", () => {
  it("un código mal escrito invita a revisarlo, no acusa al cliente", () => {
    expect(mensajeDeRechazo("no_existe", [])).toBe(
      "Ese cupón no existe. Revisa que esté bien escrito.",
    );
  });

  it("dice que venció", () => {
    expect(mensajeDeRechazo("vencido", [])).toBe("Ese cupón ya venció.");
  });

  it("un cupón apagado no revela que existió", () => {
    expect(mensajeDeRechazo("apagado", [])).toBe("Ese cupón ya no está disponible.");
  });

  // El mensaje que importa: dice QUÉ agregar. "No aplica" deja al cliente adivinando.
  it("cuando no cubre nada del carrito, nombra a qué sí aplica", () => {
    expect(mensajeDeRechazo("sin_items_elegibles", ["Churros con helado"])).toBe(
      "Ese cupón aplica solo a Churros con helado. Agrégalo a tu pedido para usarlo.",
    );
  });

  it("con varios, los enumera en español", () => {
    expect(
      mensajeDeRechazo("sin_items_elegibles", ["Churros con helado", "Malteadas", "Latte frío"]),
    ).toBe(
      "Ese cupón aplica solo a Churros con helado, Malteadas y Latte frío. Agrégalo a tu pedido para usarlo.",
    );
  });

  // Un cupón acotado al que le borraron la categoría: no hay nada que nombrar, y prometer una
  // lista vacía ("aplica solo a .") sería peor que la frase genérica.
  it("sin nada que nombrar cae en una frase que igual se entiende", () => {
    expect(mensajeDeRechazo("sin_items_elegibles", [])).toBe(
      "Ese cupón no aplica a lo que llevas en el carrito.",
    );
  });
});

describe("aplicarCupon", () => {
  it("descuenta el porcentaje sobre el subtotal cuando el cupón cubre toda la carta", () => {
    const resultado = aplicarCupon(
      cupon(),
      [
        { productId: "churro", subtotal: 8000 },
        { productId: "latte", subtotal: 2000 },
      ],
      HOY,
    );

    expect(resultado).toEqual({
      ok: true,
      valor: { cuponId: "cupon-1", codigo: "CHURRO10", porcentaje: 10, base: 10000, descuento: 1000 },
    });
  });

  it("con alcance acotado, solo la parte elegible del pedido entra en la base", () => {
    const resultado = aplicarCupon(
      cupon({ productosElegibles: new Set(["churro"]) }),
      [
        { productId: "churro", subtotal: 8000 },
        { productId: "latte", subtotal: 2000 },
      ],
      HOY,
    );

    // El latte no se descuenta: base 8000 y no 10000.
    expect(resultado).toEqual({
      ok: true,
      valor: { cuponId: "cupon-1", codigo: "CHURRO10", porcentaje: 10, base: 8000, descuento: 800 },
    });
  });

  /**
   * Regla 8: una bebida agregada desde la ficha de un churro es su propio `order_item` con su
   * propio `productId`, así que se evalúa como cualquier otra línea. Un cupón de churros no la
   * descuenta, y eso es lo correcto — no un descuido del alcance.
   */
  it("una bebida que entró como upsell no se descuenta si el cupón no la cubre", () => {
    const resultado = aplicarCupon(
      cupon({ productosElegibles: new Set(["churro"]) }),
      [
        { productId: "churro", subtotal: 8000 },
        // La misma bebida, llegada desde la ficha del churro en vez de suelta.
        { productId: "latte", subtotal: 6000 },
      ],
      HOY,
    );

    expect(resultado.ok && resultado.valor.base).toBe(8000);
  });

  /**
   * El rechazo que de verdad importa: es el que permite decir «CHURRO10 aplica solo a Churros con
   * helado» en vez de un «no aplica» que deja al cliente adivinando qué le falta.
   */
  it("rechaza cuando el pedido no lleva nada que el cupón cubra", () => {
    const resultado = aplicarCupon(
      cupon({ productosElegibles: new Set(["churro"]) }),
      [{ productId: "latte", subtotal: 6000 }],
      HOY,
    );

    expect(resultado).toEqual({ ok: false, motivo: "sin_items_elegibles" });
  });

  it("rechaza el código que no existe", () => {
    expect(aplicarCupon(null, [{ productId: "churro", subtotal: 8000 }], HOY)).toEqual({
      ok: false,
      motivo: "no_existe",
    });
  });

  it("rechaza el cupón apagado", () => {
    const resultado = aplicarCupon(
      cupon({ activo: false }),
      [{ productId: "churro", subtotal: 8000 }],
      HOY,
    );

    expect(resultado).toEqual({ ok: false, motivo: "apagado" });
  });
});

/**
 * `hoy` es el día de Bogotá y lo produce `diaDeBogota`, que ya tiene sus propios tests para las
 * 11:30 de la noche (que en UTC son el día siguiente). Aquí se prueba solo el corte, con cadenas
 * fijas: la comparación es lexicográfica sobre "YYYY-MM-DD", que para ese formato es la
 * cronológica.
 */
describe("aplicarCupon · vencimiento", () => {
  it("vale durante todo su último día", () => {
    const resultado = aplicarCupon(
      cupon({ venceEl: HOY }),
      [{ productId: "churro", subtotal: 8000 }],
      HOY,
    );

    expect(resultado.ok).toBe(true);
  });

  it("al día siguiente ya no", () => {
    const resultado = aplicarCupon(
      cupon({ venceEl: "2026-08-17" }),
      [{ productId: "churro", subtotal: 8000 }],
      HOY,
    );

    expect(resultado).toEqual({ ok: false, motivo: "vencido" });
  });

  it("sin fecha no vence nunca", () => {
    const resultado = aplicarCupon(
      cupon({ venceEl: null }),
      [{ productId: "churro", subtotal: 8000 }],
      "2099-01-01",
    );

    expect(resultado.ok).toBe(true);
  });
});

describe("aplicarCupon · redondeo", () => {
  // El dinero es entero (regla 7): no existe medio peso.
  it("redondea una vez sobre la base, no línea por línea", () => {
    const resultado = aplicarCupon(
      cupon({ porcentaje: 10 }),
      [
        { productId: "a", subtotal: 8333 },
        { productId: "b", subtotal: 8333 },
        { productId: "c", subtotal: 8333 },
      ],
      HOY,
    );

    // 24999 * 10% = 2499,9 → 2500. Redondeando cada línea (833 * 3) daría 2499.
    expect(resultado.ok && resultado.valor.descuento).toBe(2500);
  });

  it("el descuento nunca supera lo que el cupón cubre", () => {
    const resultado = aplicarCupon(
      cupon({ porcentaje: 50, productosElegibles: new Set(["churro"]) }),
      [
        { productId: "churro", subtotal: 8000 },
        { productId: "latte", subtotal: 100000 },
      ],
      HOY,
    );

    expect(resultado.ok && resultado.valor.descuento).toBe(4000);
  });
});
