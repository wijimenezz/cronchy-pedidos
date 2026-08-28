import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/queries/productos", () => ({
  obtenerProductoConEngancles: vi.fn(),
  obtenerProductosConEngancles: vi.fn(),
}));
// Solo se mockea la resolución de la zona: qué devuelve `ST_Covers` para un punto dado ya
// está probado contra PostGIS en `zonas.test.ts`. Aquí interesa qué hace `calcularPedido`
// con esa respuesta.
vi.mock("@/lib/zonas", () => ({
  resolverZona: vi.fn(),
}));

import { obtenerProductosConEngancles } from "@/db/queries/productos";
import { resolverZona } from "@/lib/zonas";

/** Un pin cualquiera de Fusagasugá; el mock decide qué zona lo cubre. */
const PIN = { lat: 4.337, lng: -74.362 };
import {
  calcularItem,
  calcularPedido,
  engancheCobra,
  esCasilla,
  esVariante,
  gruposIncompletos,
  precioDesde,
  valorarItems,
  type EngancheParaPrecio,
  type ItemSolicitado,
  type OpcionParaPrecio,
  type ProductoParaPrecio,
} from "./precios";

function producto(overrides: Partial<ProductoParaPrecio> = {}): ProductoParaPrecio {
  return {
    id: "prod-1",
    nombre: "Churro clásico",
    precioBase: 5000,
    activo: true,
    disponible: true,
    disponibleDelivery: true,
    disponiblePickup: true,
    engancles: [],
    ...overrides,
  };
}

function enganche(overrides: Partial<EngancheParaPrecio> = {}): EngancheParaPrecio {
  return {
    id: "pmg-1",
    modo: "incluido",
    tipo: "seleccion",
    nombreGrupo: "Salsas",
    minSelect: 0,
    maxSelect: 1,
    precioUnitario: null,
    avisarIncompleto: false,
    permiteCantidad: false,
    maxPorOpcion: null,
    opciones: [],
    ...overrides,
  };
}

function opcion(overrides: Partial<OpcionParaPrecio> = {}): OpcionParaPrecio {
  return {
    id: "op-1",
    nombre: "Arequipe",
    precioDelta: 0,
    disponible: true,
    productoRef: null,
    precioProductoRef: null,
    ...overrides,
  };
}

function item(overrides: Partial<ItemSolicitado> = {}): ItemSolicitado {
  return { productId: "prod-1", cantidad: 1, seleccion: [], ...overrides };
}

describe("calcularItem", () => {
  it("sin engancles, el precio es el precioBase", () => {
    const r = calcularItem(producto(), item());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.base.precioUnitario).toBe(5000);
      expect(r.valor.base.subtotal).toBe(5000);
      expect(r.valor.upsells).toEqual([]);
    }
  });

  it("modo incluido ignora el precioDelta de la opción, el precio efectivo es 0", () => {
    const p = producto({
      engancles: [
        enganche({
          modo: "incluido",
          minSelect: 1,
          maxSelect: 1,
          opciones: [opcion({ id: "op-1", precioDelta: 1500 })],
        }),
      ],
    });
    const r = calcularItem(
      p,
      item({ seleccion: [{ productModifierGroupId: "pmg-1", opciones: [{ modifierOptionId: "op-1", cantidad: 1 }] }] }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.base.precioUnitario).toBe(5000);
      expect(r.valor.base.modificadores[0].precioUnitario).toBe(0);
    }
  });

  it("modo adicional usa el precioUnitario del enganche si existe, no el precioDelta", () => {
    const p = producto({
      engancles: [
        enganche({
          modo: "adicional",
          precioUnitario: 2000,
          opciones: [opcion({ id: "op-1", precioDelta: 500 })],
        }),
      ],
    });
    const r = calcularItem(
      p,
      item({ seleccion: [{ productModifierGroupId: "pmg-1", opciones: [{ modifierOptionId: "op-1", cantidad: 1 }] }] }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.base.precioUnitario).toBe(5000 + 2000);
  });

  it("modo adicional cae al precioDelta de la opción si el enganche no tiene override", () => {
    const p = producto({
      engancles: [
        enganche({
          modo: "adicional",
          precioUnitario: null,
          opciones: [opcion({ id: "op-1", precioDelta: 700 })],
        }),
      ],
    });
    const r = calcularItem(
      p,
      item({ seleccion: [{ productModifierGroupId: "pmg-1", opciones: [{ modifierOptionId: "op-1", cantidad: 1 }] }] }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.base.precioUnitario).toBe(5000 + 700);
  });

  it("minSelect sin avisarIncompleto bloquea si no se eligió nada", () => {
    const p = producto({
      engancles: [enganche({ minSelect: 1, maxSelect: 1, avisarIncompleto: false, opciones: [opcion()] })],
    });
    const r = calcularItem(p, item());
    expect(r).toEqual({
      ok: false,
      error: { tipo: "seleccion_incompleta", productModifierGroupId: "pmg-1", minSelect: 1, recibidas: 0 },
    });
  });

  it("avisarIncompleto no bloquea, solo agrega un aviso cuando no se eligió nada", () => {
    const p = producto({
      engancles: [enganche({ minSelect: 0, maxSelect: 1, avisarIncompleto: true, opciones: [opcion()] })],
    });
    const r = calcularItem(p, item());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.base.avisos).toEqual([
        { productModifierGroupId: "pmg-1", nombreGrupo: "Salsas", minSelect: 0, recibidas: 0 },
      ]);
    }
  });

  it("avisarIncompleto nunca bloquea, ni siquiera con minSelect > 0 sin cumplir", () => {
    const p = producto({
      engancles: [
        enganche({
          minSelect: 2,
          maxSelect: 2,
          avisarIncompleto: true,
          opciones: [opcion({ id: "op-1" }), opcion({ id: "op-2" })],
        }),
      ],
    });
    const r = calcularItem(
      p,
      item({ seleccion: [{ productModifierGroupId: "pmg-1", opciones: [{ modifierOptionId: "op-1", cantidad: 1 }] }] }),
    );
    // Eligió 1 de 2: no llegó al mínimo, pero como avisarIncompleto=true nunca bloquea.
    // Tampoco avisa, porque el aviso solo dispara cuando no se eligió absolutamente nada.
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.base.avisos).toEqual([]);
  });

  // Caso real del catálogo: el Cronchy Familiar incluye 4 salsas y hay que elegirlas todas.
  it("un grupo incluido de 4 salsas bloquea hasta completar las 4", () => {
    const p = producto({
      engancles: [
        enganche({
          nombreGrupo: "Salsas incluidas",
          minSelect: 4,
          maxSelect: 4,
          avisarIncompleto: false,
          permiteCantidad: true,
          opciones: [opcion({ id: "op-arequipe" }), opcion({ id: "op-choco" })],
        }),
      ],
    });

    const conTres = calcularItem(
      p,
      item({
        seleccion: [
          {
            productModifierGroupId: "pmg-1",
            opciones: [
              { modifierOptionId: "op-arequipe", cantidad: 2 },
              { modifierOptionId: "op-choco", cantidad: 1 },
            ],
          },
        ],
      }),
    );
    expect(conTres).toEqual({
      ok: false,
      error: { tipo: "seleccion_incompleta", productModifierGroupId: "pmg-1", minSelect: 4, recibidas: 3 },
    });

    // Las salsas permiten repetir, así que 4x la misma es una selección válida.
    const cuatroIguales = calcularItem(
      p,
      item({
        seleccion: [
          { productModifierGroupId: "pmg-1", opciones: [{ modifierOptionId: "op-arequipe", cantidad: 4 }] },
        ],
      }),
    );
    expect(cuatroIguales.ok).toBe(true);
    // Van incluidas: no suman al precio.
    if (cuatroIguales.ok) expect(cuatroIguales.valor.base.precioUnitario).toBe(5000);
  });

  it("excede maxSelect bloquea", () => {
    const p = producto({
      engancles: [enganche({ minSelect: 0, maxSelect: 2, permiteCantidad: true, opciones: [opcion({ id: "op-1" })] })],
    });
    const r = calcularItem(
      p,
      item({ seleccion: [{ productModifierGroupId: "pmg-1", opciones: [{ modifierOptionId: "op-1", cantidad: 3 }] }] }),
    );
    expect(r).toEqual({
      ok: false,
      error: { tipo: "seleccion_excedida", productModifierGroupId: "pmg-1", maxSelect: 2, recibidas: 3 },
    });
  });

  it("una opción que no pertenece al enganche es rechazada", () => {
    const p = producto({ engancles: [enganche({ opciones: [opcion({ id: "op-1" })] })] });
    const r = calcularItem(
      p,
      item({
        seleccion: [{ productModifierGroupId: "pmg-1", opciones: [{ modifierOptionId: "op-inexistente", cantidad: 1 }] }],
      }),
    );
    expect(r).toEqual({
      ok: false,
      error: { tipo: "opcion_invalida", modifierOptionId: "op-inexistente", motivo: "no_pertenece_al_grupo" },
    });
  });

  it("una opción no disponible es rechazada", () => {
    const p = producto({ engancles: [enganche({ opciones: [opcion({ id: "op-1", disponible: false })] })] });
    const r = calcularItem(
      p,
      item({ seleccion: [{ productModifierGroupId: "pmg-1", opciones: [{ modifierOptionId: "op-1", cantidad: 1 }] }] }),
    );
    expect(r).toEqual({
      ok: false,
      error: { tipo: "opcion_invalida", modifierOptionId: "op-1", motivo: "no_disponible" },
    });
  });

  it("permiteCantidad multiplica el precio por la cantidad elegida", () => {
    const p = producto({
      engancles: [
        enganche({
          modo: "adicional",
          permiteCantidad: true,
          maxPorOpcion: 5,
          minSelect: 0,
          maxSelect: 5,
          opciones: [opcion({ id: "op-1", precioDelta: 1000 })],
        }),
      ],
    });
    const r = calcularItem(
      p,
      item({ seleccion: [{ productModifierGroupId: "pmg-1", opciones: [{ modifierOptionId: "op-1", cantidad: 3 }] }] }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.base.precioUnitario).toBe(5000 + 1000 * 3);
  });

  it("cantidad > 1 en una opción sin permiteCantidad es inválida", () => {
    const p = producto({
      engancles: [enganche({ permiteCantidad: false, minSelect: 0, maxSelect: 5, opciones: [opcion({ id: "op-1" })] })],
    });
    const r = calcularItem(
      p,
      item({ seleccion: [{ productModifierGroupId: "pmg-1", opciones: [{ modifierOptionId: "op-1", cantidad: 2 }] }] }),
    );
    expect(r).toEqual({ ok: false, error: { tipo: "cantidad_invalida", motivo: "opcion_sin_permitir_cantidad" } });
  });

  it("cantidad del item <= 0 es inválida", () => {
    const r = calcularItem(producto(), item({ cantidad: 0 }));
    expect(r).toEqual({ ok: false, error: { tipo: "cantidad_invalida", motivo: "item" } });
  });

  it("la cantidad del item multiplica el subtotal", () => {
    const r = calcularItem(producto(), item({ cantidad: 3 }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.base.subtotal).toBe(5000 * 3);
  });

  it("producto inactivo no se puede pedir", () => {
    const r = calcularItem(producto({ activo: false }), item());
    expect(r).toEqual({ ok: false, error: { tipo: "producto_no_disponible", productId: "prod-1" } });
  });

  it("producto no disponible no se puede pedir", () => {
    const r = calcularItem(producto({ disponible: false }), item());
    expect(r).toEqual({ ok: false, error: { tipo: "producto_no_disponible", productId: "prod-1" } });
  });

  it("producto no disponible para domicilio se rechaza en ese tipo de pedido", () => {
    const r = calcularItem(producto({ disponibleDelivery: false }), item(), "domicilio");
    expect(r).toEqual({ ok: false, error: { tipo: "producto_no_disponible", productId: "prod-1" } });
  });

  it("un grupo tipo upsell no agrega modificadores al item base, sino un item propio (regla 8)", () => {
    const p = producto({
      engancles: [
        enganche({
          id: "pmg-bebida",
          tipo: "upsell",
          modo: "adicional",
          nombreGrupo: "¿Deseas agregar una bebida?",
          minSelect: 0,
          maxSelect: 3,
          precioUnitario: null,
          opciones: [opcion({ id: "op-agua", nombre: "Agua Pequeña", precioDelta: 1500, productoRef: "prod-agua" })],
        }),
      ],
    });
    const r = calcularItem(
      p,
      item({
        seleccion: [{ productModifierGroupId: "pmg-bebida", opciones: [{ modifierOptionId: "op-agua", cantidad: 1 }] }],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      // El item base no cambia de precio ni gana un modificador por el upsell.
      expect(r.valor.base.precioUnitario).toBe(5000);
      expect(r.valor.base.modificadores).toEqual([]);
      // El upsell aparece como su propio item, apuntando al producto real (productoRef).
      expect(r.valor.upsells).toEqual([
        {
          productId: "prod-agua",
          nombreProducto: "Agua Pequeña",
          // Sin foto: aquí solo se conoce la opción, no el producto al que apunta. La bebida
          // que el cliente agrega de verdad llega al checkout como línea propia y sí la trae.
          imagen: null,
          cantidad: 1,
          precioUnitario: 1500,
          subtotal: 1500,
          modificadores: [],
          avisos: [],
          notas: null,
        },
      ]);
    }
  });

  // Regla 8: un upsell se cobra por el `precio_base` de SU producto, no por el `precio_delta`
  // de la opción. Esto llegó a cobrar de menos con datos reales: los churros de upsell tienen
  // delta 0 y el producto vale 4.000, así que esta rama los regalaba.
  it("un upsell se cobra por el precio del producto, no por el delta de la opción", () => {
    const p = producto({
      engancles: [
        enganche({
          id: "pmg-churros",
          tipo: "upsell",
          modo: "adicional",
          nombreGrupo: "¿Deseas agregar más churros?",
          maxSelect: 3,
          permiteCantidad: true,
          opciones: [
            opcion({
              id: "op-mini",
              nombre: "Mini Churros",
              precioDelta: 0,
              productoRef: "prod-mini",
              precioProductoRef: 4000,
            }),
          ],
        }),
      ],
    });

    const r = calcularItem(
      p,
      item({
        cantidad: 1,
        seleccion: [
          { productModifierGroupId: "pmg-churros", opciones: [{ modifierOptionId: "op-mini", cantidad: 2 }] },
        ],
      }),
    );

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.upsells[0].precioUnitario).toBe(4000);
      expect(r.valor.upsells[0].subtotal).toBe(8000);
    }
  });

  // El `precio_unitario` del enganche manda sobre el delta en los grupos de selección, pero no
  // puede mandar sobre el precio de un producto: un upsell no es un modificador con recargo.
  it("ni el precio del enganche ni un modo incluido abaratan un upsell", () => {
    const p = producto({
      engancles: [
        enganche({
          id: "pmg-churros",
          tipo: "upsell",
          modo: "incluido",
          precioUnitario: 500,
          maxSelect: 3,
          opciones: [
            opcion({ id: "op-mini", precioDelta: 0, productoRef: "prod-mini", precioProductoRef: 4000 }),
          ],
        }),
      ],
    });

    const r = calcularItem(
      p,
      item({
        seleccion: [
          { productModifierGroupId: "pmg-churros", opciones: [{ modifierOptionId: "op-mini", cantidad: 1 }] },
        ],
      }),
    );

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.upsells[0].precioUnitario).toBe(4000);
  });

  // El respaldo, para una opción cuyo producto no se resolvió: se cae al delta, que es lo que
  // hacía antes. Peor que el precio real, pero mejor que cobrar cero.
  it("sin el precio del producto resuelto, cae al delta de la opción", () => {
    const p = producto({
      engancles: [
        enganche({
          id: "pmg-bebida",
          tipo: "upsell",
          modo: "adicional",
          maxSelect: 3,
          opciones: [
            opcion({ id: "op-agua", precioDelta: 1500, productoRef: "prod-agua", precioProductoRef: null }),
          ],
        }),
      ],
    });

    const r = calcularItem(
      p,
      item({
        seleccion: [
          { productModifierGroupId: "pmg-bebida", opciones: [{ modifierOptionId: "op-agua", cantidad: 1 }] },
        ],
      }),
    );

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.upsells[0].precioUnitario).toBe(1500);
  });

  it("varias opciones de un grupo upsell producen varios items independientes", () => {
    const p = producto({
      engancles: [
        enganche({
          id: "pmg-bebida",
          tipo: "upsell",
          modo: "adicional",
          minSelect: 0,
          maxSelect: 3,
          opciones: [
            opcion({ id: "op-agua", nombre: "Agua Pequeña", precioDelta: 1500, productoRef: "prod-agua" }),
            opcion({ id: "op-latte", nombre: "Latte Frío", precioDelta: 9000, productoRef: "prod-latte" }),
          ],
        }),
      ],
    });
    const r = calcularItem(
      p,
      item({
        seleccion: [
          {
            productModifierGroupId: "pmg-bebida",
            opciones: [
              { modifierOptionId: "op-agua", cantidad: 1 },
              { modifierOptionId: "op-latte", cantidad: 1 },
            ],
          },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.upsells.map((u) => u.productId)).toEqual(["prod-agua", "prod-latte"]);
  });

  it("un upsell sin productoRef es un error (dato inconsistente en el catálogo)", () => {
    const p = producto({
      engancles: [
        enganche({
          id: "pmg-bebida",
          tipo: "upsell",
          modo: "adicional",
          minSelect: 0,
          maxSelect: 3,
          opciones: [opcion({ id: "op-agua", productoRef: null })],
        }),
      ],
    });
    const r = calcularItem(
      p,
      item({
        seleccion: [{ productModifierGroupId: "pmg-bebida", opciones: [{ modifierOptionId: "op-agua", cantidad: 1 }] }],
      }),
    );
    expect(r).toEqual({ ok: false, error: { tipo: "upsell_sin_producto", modifierOptionId: "op-agua" } });
  });

  // La cantidad sobre un grupo `seleccion` ya está probada arriba; sobre un UPSELL no lo estaba,
  // y es lo que estrena "¿Deseas agregar más churros?" — los dos upsell que existían (bebida y
  // helado) llevan `permiteCantidad: false`. El motor lo valida de forma genérica, así que estos
  // tests no descubren nada nuevo: fijan la mecánica de la que ahora depende la carta.
  describe("cantidad sobre un upsell", () => {
    const conCantidad = (overrides = {}) =>
      producto({
        engancles: [
          enganche({
            id: "pmg-churros",
            tipo: "upsell",
            modo: "adicional",
            nombreGrupo: "¿Deseas agregar más churros?",
            minSelect: 0,
            maxSelect: 10,
            permiteCantidad: true,
            maxPorOpcion: 5,
            opciones: [
              opcion({ id: "op-mini", nombre: "Mini Churros", precioDelta: 4000, productoRef: "prod-mini" }),
              opcion({ id: "op-loop", nombre: "Churros Loop", precioDelta: 4000, productoRef: "prod-loop" }),
            ],
            ...overrides,
          }),
        ],
      });

    const pidiendo = (opciones: { modifierOptionId: string; cantidad: number }[]) =>
      item({ seleccion: [{ productModifierGroupId: "pmg-churros", opciones }] });

    // Tres porciones son UNA línea de cantidad 3, no tres líneas de a una: así es como el
    // carrito y la comanda las cuentan.
    it("tres porciones son un solo item con cantidad 3", () => {
      const r = calcularItem(conCantidad(), pidiendo([{ modifierOptionId: "op-mini", cantidad: 3 }]));

      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.valor.upsells).toHaveLength(1);
        expect(r.valor.upsells[0]).toMatchObject({
          productId: "prod-mini",
          cantidad: 3,
          precioUnitario: 4000,
          subtotal: 12000,
        });
      }
    });

    it("los dos productos a la vez salen como items independientes, cada uno con su cantidad", () => {
      const r = calcularItem(
        conCantidad(),
        pidiendo([
          { modifierOptionId: "op-mini", cantidad: 2 },
          { modifierOptionId: "op-loop", cantidad: 1 },
        ]),
      );

      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.valor.upsells.map((u) => [u.productId, u.cantidad])).toEqual([
          ["prod-mini", 2],
          ["prod-loop", 1],
        ]);
        // Y el churro de abajo sigue sin enterarse: un upsell nunca lo encarece (regla 8).
        expect(r.valor.base.precioUnitario).toBe(5000);
        expect(r.valor.base.modificadores).toEqual([]);
      }
    });

    it("maxPorOpcion corta: seis porciones con el tope en cinco no pasan", () => {
      const r = calcularItem(conCantidad(), pidiendo([{ modifierOptionId: "op-mini", cantidad: 6 }]));

      expect(r).toEqual({
        ok: false,
        error: { tipo: "cantidad_invalida", motivo: "excede_max_por_opcion" },
      });
    });

    // `maxSelect` topa la SUMA del grupo, no cada opción por separado. Es lo que impide que
    // 5 + 5 se cuele estando las dos dentro de `maxPorOpcion`.
    it("maxSelect topa la suma de las dos opciones, no cada una", () => {
      const r = calcularItem(
        conCantidad({ maxSelect: 6 }),
        pidiendo([
          { modifierOptionId: "op-mini", cantidad: 5 },
          { modifierOptionId: "op-loop", cantidad: 5 },
        ]),
      );

      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatchObject({ tipo: "seleccion_excedida", recibidas: 10 });
    });

    // La invariante de la que dependen los dos upsell viejos: sin `permiteCantidad`, pedir dos
    // es un error y no un silencioso "pues uno".
    it("sin permiteCantidad, un upsell no acepta más de uno", () => {
      const r = calcularItem(
        conCantidad({ permiteCantidad: false, maxPorOpcion: null }),
        pidiendo([{ modifierOptionId: "op-mini", cantidad: 2 }]),
      );

      expect(r).toEqual({
        ok: false,
        error: { tipo: "cantidad_invalida", motivo: "opcion_sin_permitir_cantidad" },
      });
    });
  });
});

// Una bebida de upsell llega al servidor como item propio (regla 8) y se valida como
// cualquier producto. Estos casos son la regresión del bug que dejaba al cliente atrapado:
// la bebida viajaba con `seleccion: []` y reventaba en el checkout con un 422.
describe("bebida con opciones propias", () => {
  const frappe = producto({
    id: "prod-frappe",
    nombre: "Frappe",
    precioBase: 13000,
    engancles: [
      enganche({
        id: "pmg-sabor",
        nombreGrupo: "Sabor",
        modo: "incluido",
        minSelect: 1,
        maxSelect: 1,
        opciones: [opcion({ id: "op-oreo", nombre: "Oreo", precioDelta: 0 })],
      }),
    ],
  });

  it("sin elegir sabor se rechaza", () => {
    const r = calcularItem(frappe, item({ productId: "prod-frappe" }));
    expect(r).toEqual({
      ok: false,
      error: { tipo: "seleccion_incompleta", productModifierGroupId: "pmg-sabor", minSelect: 1, recibidas: 0 },
    });
  });

  it("con el sabor elegido cuesta su precio base y arrastra el modificador", () => {
    const r = calcularItem(
      frappe,
      item({
        productId: "prod-frappe",
        seleccion: [{ productModifierGroupId: "pmg-sabor", opciones: [{ modifierOptionId: "op-oreo", cantidad: 1 }] }],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      // Modo incluido: la opción no suma (regla 3).
      expect(r.valor.base.precioUnitario).toBe(13000);
      expect(r.valor.base.modificadores).toEqual([
        { modifierOptionId: "op-oreo", grupo: "Sabor", nombre: "Oreo", cantidad: 1, precioUnitario: 0 },
      ]);
    }
  });

  // Lo que promete el tipo ProductoUpsellRef: que la ficha puede cotizar una bebida con
  // el mismo motor que usa el servidor.
  it("un objeto con la forma de ProductoUpsellRef sirve tal cual para calcularItem", () => {
    const ref = {
      id: "prod-agua",
      nombre: "Agua 600ml",
      precioBase: 3000,
      activo: true,
      disponible: true,
      disponibleDelivery: true,
      disponiblePickup: true,
      imagen: null,
      engancles: [
        {
          ...enganche({
            id: "pmg-gas",
            nombreGrupo: "Gas",
            minSelect: 1,
            maxSelect: 1,
            opciones: [opcion({ id: "op-con", nombre: "Con gas", precioDelta: 0 })],
          }),
          colapsado: false,
        },
      ],
    };

    const r = calcularItem(ref, {
      productId: "prod-agua",
      cantidad: 1,
      seleccion: [{ productModifierGroupId: "pmg-gas", opciones: [{ modifierOptionId: "op-con", cantidad: 1 }] }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.base.precioUnitario).toBe(3000);
  });
});

describe("gruposIncompletos", () => {
  // Un Cronchy Clásico: 1 salsa + 1 topping obligatorios, y las salsas de pago opcionales.
  const clasico = producto({
    engancles: [
      enganche({
        id: "pmg-salsa",
        nombreGrupo: "Salsa incluida",
        minSelect: 1,
        maxSelect: 1,
        opciones: [opcion({ id: "op-arequipe" })],
      }),
      enganche({
        id: "pmg-topping",
        nombreGrupo: "Topping incluido",
        minSelect: 1,
        maxSelect: 1,
        opciones: [opcion({ id: "op-oreo" })],
      }),
      enganche({
        id: "pmg-extra",
        nombreGrupo: "Salsas",
        modo: "adicional",
        minSelect: 0,
        maxSelect: 8,
        opciones: [opcion({ id: "op-lechera", precioDelta: 2000 })],
      }),
    ],
  });

  it("sin elegir nada lista los dos grupos obligatorios, en orden", () => {
    expect(gruposIncompletos(clasico, [])).toEqual([
      { productModifierGroupId: "pmg-salsa", nombreGrupo: "Salsa incluida", faltan: 1 },
      { productModifierGroupId: "pmg-topping", nombreGrupo: "Topping incluido", faltan: 1 },
    ]);
  });

  it("con la salsa elegida solo queda el topping", () => {
    const r = gruposIncompletos(clasico, [
      { productModifierGroupId: "pmg-salsa", opciones: [{ modifierOptionId: "op-arequipe", cantidad: 1 }] },
    ]);
    expect(r).toEqual([
      { productModifierGroupId: "pmg-topping", nombreGrupo: "Topping incluido", faltan: 1 },
    ]);
  });

  it("con todo completo devuelve lista vacía", () => {
    const r = gruposIncompletos(clasico, [
      { productModifierGroupId: "pmg-salsa", opciones: [{ modifierOptionId: "op-arequipe", cantidad: 1 }] },
      { productModifierGroupId: "pmg-topping", opciones: [{ modifierOptionId: "op-oreo", cantidad: 1 }] },
    ]);
    expect(r).toEqual([]);
  });

  it("los adicionales nunca cuentan como incompletos", () => {
    const soloAdicional = producto({
      engancles: [clasico.engancles[2]],
    });
    expect(gruposIncompletos(soloAdicional, [])).toEqual([]);
  });

  it("informa cuántas faltan cuando el grupo pide varias", () => {
    const familiar = producto({
      engancles: [
        enganche({
          id: "pmg-salsas",
          nombreGrupo: "Salsas incluidas",
          minSelect: 4,
          maxSelect: 4,
          permiteCantidad: true,
          opciones: [opcion({ id: "op-arequipe" })],
        }),
      ],
    });
    const r = gruposIncompletos(familiar, [
      { productModifierGroupId: "pmg-salsas", opciones: [{ modifierOptionId: "op-arequipe", cantidad: 3 }] },
    ]);
    expect(r).toEqual([
      { productModifierGroupId: "pmg-salsas", nombreGrupo: "Salsas incluidas", faltan: 1 },
    ]);
  });

  it("un grupo con avisarIncompleto no bloquea, así que no aparece", () => {
    const conAviso = producto({
      engancles: [enganche({ id: "pmg-1", minSelect: 2, avisarIncompleto: true, opciones: [opcion()] })],
    });
    expect(gruposIncompletos(conAviso, [])).toEqual([]);
  });
});

describe("engancheCobra", () => {
  // Lo que separa "de pago" de "opcional": el modo dice cómo se elige, no si cuesta.
  it("un adicional con precio 0 no cobra — es opcional y gratis, como Azúcar y canela", () => {
    const azucar = enganche({
      modo: "adicional",
      nombreGrupo: "Azúcar y canela",
      minSelect: 0,
      maxSelect: 2,
      precioUnitario: 0,
      opciones: [opcion({ id: "op-sin-canela", nombre: "Sin canela" })],
    });
    expect(engancheCobra(azucar)).toBe(false);
  });

  it("un adicional sin precio propio cae al precioDelta de cada opción", () => {
    const sinPrecioPropio = { modo: "adicional" as const, precioUnitario: null };

    expect(engancheCobra({ ...sinPrecioPropio, opciones: [opcion({ precioDelta: 0 })] })).toBe(false);
    expect(engancheCobra({ ...sinPrecioPropio, opciones: [opcion({ precioDelta: 1500 })] })).toBe(true);
  });

  it("una sola opción con precio ya hace que el grupo cobre", () => {
    const salsasDePago = enganche({
      modo: "adicional",
      precioUnitario: null,
      opciones: [opcion({ id: "op-1", precioDelta: 0 }), opcion({ id: "op-2", precioDelta: 2000 })],
    });
    expect(engancheCobra(salsasDePago)).toBe(true);
  });

  it("lo incluido nunca cobra, aunque sus opciones tengan precioDelta (regla 3)", () => {
    const incluido = enganche({
      modo: "incluido",
      precioUnitario: 2000,
      opciones: [opcion({ precioDelta: 2000 })],
    });
    expect(engancheCobra(incluido)).toBe(false);
  });
});

/**
 * Un producto con varios precios según el tamaño: "Porción de helado" a $4.000 en pequeña y
 * $8.000 en mediana.
 *
 * No hay tabla de variantes ni columna nueva: es un grupo en modo `adicional` —para que el
 * `precioDelta` de cada opción cuente, cosa que en `incluido` no pasa (regla 3)— con
 * `minSelect = maxSelect = 1`, que es lo que lo vuelve obligatorio y de a uno. El precio base
 * del producto es el del tamaño más barato y cada opción suma su diferencia.
 */
describe("tamaños: obligatorio y con precio propio", () => {
  const PEQUENO = "op-peq";
  const MEDIANO = "op-med";

  function helado(): ProductoParaPrecio {
    return producto({
      id: "helado",
      nombre: "Porción de helado",
      precioBase: 4000,
      engancles: [
        enganche({
          id: "pmg-tamano",
          modo: "adicional",
          nombreGrupo: "Tamaño",
          minSelect: 1,
          maxSelect: 1,
          // NULL: cada opción cobra la suya. Un número aquí le pondría el mismo precio a los
          // dos tamaños, que es justo lo contrario de lo que se quiere.
          precioUnitario: null,
          opciones: [
            opcion({ id: PEQUENO, nombre: "Pequeño", precioDelta: 0 }),
            opcion({ id: MEDIANO, nombre: "Mediano", precioDelta: 4000 }),
          ],
        }),
      ],
    });
  }

  function conTamano(opcionId: string) {
    return item({
      productId: "helado",
      seleccion: [
        { productModifierGroupId: "pmg-tamano", opciones: [{ modifierOptionId: opcionId, cantidad: 1 }] },
      ],
    });
  }

  it("sin elegir tamaño no se puede añadir al carrito", () => {
    const r = calcularItem(helado(), item({ productId: "helado" }));

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.tipo).toBe("seleccion_incompleta");
  });

  it("el pequeño cuesta el precio base", () => {
    const r = calcularItem(helado(), conTamano(PEQUENO));

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.base.precioUnitario).toBe(4000);
  });

  it("el mediano cuesta el doble sin tocar el precio base del producto", () => {
    const r = calcularItem(helado(), conTamano(MEDIANO));

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.base.precioUnitario).toBe(8000);
  });

  it("el tamaño elegido viaja al snapshot con su precio (regla 2)", () => {
    const r = calcularItem(helado(), conTamano(MEDIANO));

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Es lo que hace que el panel, el WhatsApp de cocina y el XLSX digan "Tamaño: Mediano"
    // sin enterarse de que esto existe.
    expect(r.valor.base.modificadores).toEqual([
      {
        modifierOptionId: MEDIANO,
        grupo: "Tamaño",
        nombre: "Mediano",
        cantidad: 1,
        precioUnitario: 4000,
      },
    ]);
  });

  it("no se pueden elegir dos tamaños a la vez", () => {
    const r = calcularItem(
      helado(),
      item({
        productId: "helado",
        seleccion: [
          {
            productModifierGroupId: "pmg-tamano",
            opciones: [
              { modifierOptionId: PEQUENO, cantidad: 1 },
              { modifierOptionId: MEDIANO, cantidad: 1 },
            ],
          },
        ],
      }),
    );

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.tipo).toBe("seleccion_excedida");
  });

  it("dos porciones medianas son 16.000", () => {
    const r = calcularItem(helado(), { ...conTamano(MEDIANO), cantidad: 2 });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.base.subtotal).toBe(16000);
  });
});

describe("esVariante", () => {
  it("un adicional obligatorio es un tamaño", () => {
    expect(esVariante(enganche({ modo: "adicional", minSelect: 1 }))).toBe(true);
  });

  it("un adicional que se puede saltar es un extra, no un tamaño", () => {
    expect(esVariante(enganche({ modo: "adicional", minSelect: 0 }))).toBe(false);
  });

  it("lo incluido no es un tamaño: obliga, pero no cobra (regla 3)", () => {
    expect(esVariante(enganche({ modo: "incluido", minSelect: 1 }))).toBe(false);
  });

  it("un upsell no es un tamaño aunque llegara con mínimo", () => {
    expect(esVariante(enganche({ tipo: "upsell", modo: "adicional", minSelect: 1 }))).toBe(false);
  });
});

describe("esCasilla", () => {
  it("un adicional opcional de una sola opción es una casilla", () => {
    const agrandar = enganche({
      modo: "adicional",
      minSelect: 0,
      maxSelect: 1,
      precioUnitario: 8000,
      nombreGrupo: "¿Quieres agrandar tus churros?",
      opciones: [opcion({ nombre: "Sí, +5 churros" })],
    });
    expect(esCasilla(agrandar)).toBe(true);
  });

  it("una casilla gratis sigue siendo una casilla: lo que la define es que no haya lista", () => {
    const p = enganche({
      modo: "adicional",
      minSelect: 0,
      maxSelect: 1,
      precioUnitario: 0,
      opciones: [opcion()],
    });
    expect(esCasilla(p)).toBe(true);
  });

  it("con dos opciones ya hay lista que abrir: «Azúcar y canela» sigue plegada", () => {
    const azucarYCanela = enganche({
      modo: "adicional",
      minSelect: 0,
      maxSelect: 2,
      precioUnitario: 0,
      nombreGrupo: "Azúcar y canela",
      opciones: [opcion({ id: "op-1", nombre: "Sin canela" }), opcion({ id: "op-2", nombre: "Sin azúcar" })],
    });
    expect(esCasilla(azucarYCanela)).toBe(false);
  });

  it("un adicional obligatorio es un tamaño, no una casilla", () => {
    const tamano = enganche({
      modo: "adicional",
      minSelect: 1,
      maxSelect: 1,
      opciones: [opcion()],
    });
    expect(esCasilla(tamano)).toBe(false);
  });

  it("lo incluido no es una casilla: hay que elegirlo y ya está pagado", () => {
    const incluido = enganche({
      modo: "incluido",
      minSelect: 1,
      maxSelect: 1,
      opciones: [opcion()],
    });
    expect(esCasilla(incluido)).toBe(false);
  });

  it("un upsell de una sola bebida no es una casilla: se pinta con su propia fila", () => {
    const bebida = enganche({
      tipo: "upsell",
      modo: "adicional",
      minSelect: 0,
      maxSelect: 1,
      opciones: [opcion({ productoRef: "prod-bebida" })],
    });
    expect(esCasilla(bebida)).toBe(false);
  });

  it("una opción agotada no cambia la forma de la sección", () => {
    const agrandar = enganche({
      modo: "adicional",
      minSelect: 0,
      maxSelect: 1,
      precioUnitario: 8000,
      opciones: [opcion({ disponible: false })],
    });
    expect(esCasilla(agrandar)).toBe(true);
  });
});

describe("precioDesde", () => {
  /** Un grupo de tamaños: adicional y obligatorio, con el precio en cada opción. */
  function tamanos(precios: { precio: number; disponible?: boolean }[], id = "pmg-tam") {
    return enganche({
      id,
      modo: "adicional",
      minSelect: 1,
      maxSelect: 1,
      nombreGrupo: "Tamaño Helado",
      opciones: precios.map((p, i) =>
        opcion({ id: `${id}-op-${i}`, precioDelta: p.precio, disponible: p.disponible ?? true }),
      ),
    });
  }

  it("sin engancles, el mínimo es el precio base y no hay nada que anunciar", () => {
    expect(precioDesde(producto({ precioBase: 11500 }))).toEqual({
      minimo: 11500,
      hayRango: false,
    });
  });

  it("con el precio entero en los tamaños, el mínimo es el tamaño más barato", () => {
    const p = producto({
      precioBase: 0,
      engancles: [tamanos([{ precio: 4000 }, { precio: 8000 }])],
    });
    expect(precioDesde(p)).toEqual({ minimo: 4000, hayRango: true });
  });

  it("con el precio repartido, el mínimo suma el base y el tamaño más barato", () => {
    const p = producto({
      precioBase: 4000,
      engancles: [tamanos([{ precio: 0 }, { precio: 4000 }])],
    });
    expect(precioDesde(p)).toEqual({ minimo: 4000, hayRango: true });
  });

  it("si todos los tamaños cuestan lo mismo no hay rango: 'desde' sería ruido", () => {
    const p = producto({
      precioBase: 0,
      engancles: [tamanos([{ precio: 6000 }, { precio: 6000 }])],
    });
    expect(precioDesde(p)).toEqual({ minimo: 6000, hayRango: false });
  });

  it("un tamaño agotado no cuenta: prometería un precio que nadie puede pedir", () => {
    const p = producto({
      precioBase: 0,
      engancles: [tamanos([{ precio: 4000, disponible: false }, { precio: 8000 }])],
    });
    expect(precioDesde(p)).toEqual({ minimo: 8000, hayRango: false });
  });

  it("lo incluido no suma aunque su opción traiga precioDelta (regla 3)", () => {
    const p = producto({
      precioBase: 5000,
      engancles: [
        enganche({
          modo: "incluido",
          minSelect: 1,
          maxSelect: 1,
          opciones: [opcion({ precioDelta: 1500 })],
        }),
      ],
    });
    expect(precioDesde(p)).toEqual({ minimo: 5000, hayRango: false });
  });

  it("un adicional que se puede saltar no suma: es un extra, no un tamaño", () => {
    const p = producto({
      precioBase: 5000,
      engancles: [
        enganche({
          modo: "adicional",
          minSelect: 0,
          maxSelect: 8,
          precioUnitario: 2000,
          opciones: [opcion({ precioDelta: 2000 })],
        }),
      ],
    });
    expect(precioDesde(p)).toEqual({ minimo: 5000, hayRango: false });
  });

  it("con dos grupos obligatorios se suman los dos mínimos", () => {
    const p = producto({
      precioBase: 0,
      engancles: [
        tamanos([{ precio: 4000 }, { precio: 8000 }], "pmg-tam"),
        tamanos([{ precio: 1000 }, { precio: 1000 }], "pmg-presentacion"),
      ],
    });
    expect(precioDesde(p)).toEqual({ minimo: 5000, hayRango: true });
  });

  it("un grupo obligatorio con todo agotado se salta en vez de contar 0", () => {
    const p = producto({
      precioBase: 0,
      engancles: [tamanos([{ precio: 4000, disponible: false }, { precio: 8000, disponible: false }])],
    });
    expect(precioDesde(p)).toEqual({ minimo: 0, hayRango: false });
  });
});

/**
 * `valorarItems` es lo que usa `/api/cupones/validar`: pone precio a un carrito sin exigir un pin
 * ni resolver zonas, porque ahí todavía no hay pedido.
 *
 * Lo que hay que fijar es que **el tipo se respeta aunque no se cobre domicilio**: es lo que decide
 * si cada producto se vende por ese canal, y valorar un carrito de domicilio como "recoger" —que es
 * lo que hacía el endpoint antes— convierte un carrito válido en un error sin explicación.
 */
describe("valorarItems", () => {
  beforeEach(() => {
    vi.mocked(obtenerProductosConEngancles).mockReset();
  });

  it("suma los subtotales sin exigir pin ni resolver zona", async () => {
    const p = producto();
    vi.mocked(obtenerProductosConEngancles).mockResolvedValue(new Map([[p.id, p]]));

    const r = await valorarItems("store-1", [item()], "domicilio");

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.subtotal).toBe(5000);
    expect(resolverZona).not.toHaveBeenCalled();
  });

  it("un producto que no se vende por ese canal no se puede valorar", async () => {
    const p = producto({ disponiblePickup: false });
    vi.mocked(obtenerProductosConEngancles).mockResolvedValue(new Map([[p.id, p]]));

    const enDomicilio = await valorarItems("store-1", [item()], "domicilio");
    const enRecoger = await valorarItems("store-1", [item()], "recoger");

    expect(enDomicilio.ok).toBe(true);
    expect(enRecoger.ok).toBe(false);
  });
});

describe("calcularPedido", () => {
  beforeEach(() => {
    vi.mocked(obtenerProductosConEngancles).mockReset();
    vi.mocked(resolverZona).mockReset();
  });

  it("el pin dentro de una zona suma su precio al total", async () => {
    const p = producto();
    vi.mocked(obtenerProductosConEngancles).mockResolvedValue(new Map([[p.id, p]]));
    vi.mocked(resolverZona).mockResolvedValue({ id: "zona-1", nombre: "Centro", precio: 3000 });

    const r = await calcularPedido("store-1", { tipo: "domicilio", items: [item()], punto: PIN });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.subtotal).toBe(5000);
      expect(r.valor.costoDomicilio).toBe(3000);
      expect(r.valor.total).toBe(8000);
    }
  });

  // Regla 2 aplicada al domicilio: el nombre se congela en el pedido, así que renombrar la
  // zona después no reescribe lo que el cliente pagó.
  it("congela el nombre de la zona que cobró", async () => {
    const p = producto();
    vi.mocked(obtenerProductosConEngancles).mockResolvedValue(new Map([[p.id, p]]));
    vi.mocked(resolverZona).mockResolvedValue({ id: "zona-1", nombre: "Centro", precio: 3000 });

    const r = await calcularPedido("store-1", { tipo: "domicilio", items: [item()], punto: PIN });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.zonaNombre).toBe("Centro");
  });

  it("recoger no consulta zonas y no cobra domicilio", async () => {
    const p = producto();
    vi.mocked(obtenerProductosConEngancles).mockResolvedValue(new Map([[p.id, p]]));

    const r = await calcularPedido("store-1", { tipo: "recoger", items: [item()], punto: PIN });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.costoDomicilio).toBe(0);
      expect(r.valor.zonaNombre).toBeNull();
      expect(r.valor.total).toBe(5000);
    }
    expect(resolverZona).not.toHaveBeenCalled();
  });

  it("domicilio sin pin es un error", async () => {
    const p = producto();
    vi.mocked(obtenerProductosConEngancles).mockResolvedValue(new Map([[p.id, p]]));

    const r = await calcularPedido("store-1", { tipo: "domicilio", items: [item()] });
    expect(r).toEqual({ ok: false, error: { tipo: "punto_requerido" } });
    expect(resolverZona).not.toHaveBeenCalled();
  });

  /**
   * Regla 14: fuera de cobertura el pedido NO entra. Antes (US11) se aceptaba con $0 y
   * "domicilio por confirmar"; eso le mostraba al cliente un total que no era el que iba a
   * pagar, y por eso se quitó.
   */
  it("un pin fuera de toda zona no deja crear el pedido", async () => {
    const p = producto();
    vi.mocked(obtenerProductosConEngancles).mockResolvedValue(new Map([[p.id, p]]));
    vi.mocked(resolverZona).mockResolvedValue(null);

    const r = await calcularPedido("store-1", { tipo: "domicilio", items: [item()], punto: PIN });
    expect(r).toEqual({ ok: false, error: { tipo: "fuera_de_cobertura" } });
  });

  // El precio sale de la zona que resuelve el servidor, no de nada que mande el cliente.
  it("el costo lo pone la zona resuelta en el servidor", async () => {
    const p = producto();
    vi.mocked(obtenerProductosConEngancles).mockResolvedValue(new Map([[p.id, p]]));
    vi.mocked(resolverZona).mockResolvedValue({ id: "z", nombre: "Balmoral", precio: 5000 });

    const r = await calcularPedido("store-1", { tipo: "domicilio", items: [item()], punto: PIN });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.costoDomicilio).toBe(5000);
    expect(resolverZona).toHaveBeenCalledWith("store-1", PIN);
  });

  it("un descuento mayor al subtotal deja el total en 0, nunca negativo", async () => {
    const p = producto();
    vi.mocked(obtenerProductosConEngancles).mockResolvedValue(new Map([[p.id, p]]));

    const r = await calcularPedido("store-1", { tipo: "recoger", items: [item()], descuento: 999999 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.total).toBe(0);
  });

  /**
   * El cupón entra por aquí y no por el `descuento` a pelo: quien decide cuánto descuenta es
   * `aplicarCupon` sobre los items que este mismo cálculo acaba de valorar (regla 1). Lo que llega
   * del navegador es el código, nunca el monto.
   */
  describe("con cupón", () => {
    const CUPON = {
      id: "cupon-1",
      codigo: "CHURRO10",
      porcentaje: 10,
      venceEl: null,
      activo: true,
      productosElegibles: null,
    };

    it("descuenta sobre el subtotal y congela el código", async () => {
      const p = producto();
      vi.mocked(obtenerProductosConEngancles).mockResolvedValue(new Map([[p.id, p]]));

      const r = await calcularPedido("store-1", {
        tipo: "recoger",
        items: [item()],
        cupon: CUPON,
        hoy: "2026-08-18",
      });

      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.valor.descuento).toBe(500);
        expect(r.valor.cuponCodigo).toBe("CHURRO10");
        expect(r.valor.total).toBe(4500);
      }
    });

    /**
     * Regla 13: el domicilio lo ejecuta un courier externo que cobra igual, así que no existe
     * descuento sobre él. Un 10 % aquí son $500 (sobre los $5.000 del churro) y jamás $800
     * (sobre los $8.000 con el envío).
     */
    it("el costo del domicilio nunca entra en la base del descuento", async () => {
      const p = producto();
      vi.mocked(obtenerProductosConEngancles).mockResolvedValue(new Map([[p.id, p]]));
      vi.mocked(resolverZona).mockResolvedValue({ id: "z", nombre: "Centro", precio: 3000 });

      const r = await calcularPedido("store-1", {
        tipo: "domicilio",
        items: [item()],
        punto: PIN,
        cupon: CUPON,
        hoy: "2026-08-18",
      });

      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.valor.descuento).toBe(500);
        expect(r.valor.total).toBe(5000 + 3000 - 500);
      }
    });

    // El cliente vio un total con descuento y puede haberlo transferido ya por Nequi: cobrarle el
    // precio lleno en silencio sería peor que rechazar el pedido y decirle por qué.
    it("un cupón que ya no sirve corta el pedido en vez de cobrar el precio lleno", async () => {
      const p = producto();
      vi.mocked(obtenerProductosConEngancles).mockResolvedValue(new Map([[p.id, p]]));

      const r = await calcularPedido("store-1", {
        tipo: "recoger",
        items: [item()],
        cupon: { ...CUPON, activo: false },
        hoy: "2026-08-18",
      });

      expect(r).toEqual({ ok: false, error: { tipo: "cupon_invalido", motivo: "apagado" } });
    });

    // Dos fuentes para el mismo número es justo lo que este proyecto no hace.
    it("mandar cupón y descuento manual a la vez es error", async () => {
      const p = producto();
      vi.mocked(obtenerProductosConEngancles).mockResolvedValue(new Map([[p.id, p]]));

      const r = await calcularPedido("store-1", {
        tipo: "recoger",
        items: [item()],
        cupon: CUPON,
        descuento: 1000,
        hoy: "2026-08-18",
      });

      expect(r).toEqual({ ok: false, error: { tipo: "descuento_invalido" } });
    });

    /**
     * `null` significa "escribió un código y no existe", que NO es lo mismo que no haber escrito
     * ninguno (`undefined`). Si se confundieran, un cupón mal tecleado se ignoraría en silencio y
     * el cliente pagaría el precio lleno creyendo que le descontaron.
     */
    it("un código que no existe se rechaza, no se ignora", async () => {
      const p = producto();
      vi.mocked(obtenerProductosConEngancles).mockResolvedValue(new Map([[p.id, p]]));

      const r = await calcularPedido("store-1", {
        tipo: "recoger",
        items: [item()],
        cupon: null,
        hoy: "2026-08-18",
      });

      expect(r).toEqual({ ok: false, error: { tipo: "cupon_invalido", motivo: "no_existe" } });
    });

    it("sin cupón no hay descuento ni código", async () => {
      const p = producto();
      vi.mocked(obtenerProductosConEngancles).mockResolvedValue(new Map([[p.id, p]]));

      const r = await calcularPedido("store-1", { tipo: "recoger", items: [item()] });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.valor.descuento).toBe(0);
        expect(r.valor.cuponCodigo).toBeNull();
      }
    });
  });

  it("un upsell se agrega como item propio en el pedido y su precio suma al subtotal", async () => {
    const p = producto({
      engancles: [
        enganche({
          id: "pmg-bebida",
          tipo: "upsell",
          modo: "adicional",
          minSelect: 0,
          maxSelect: 1,
          opciones: [opcion({ id: "op-agua", nombre: "Agua Pequeña", precioDelta: 1500, productoRef: "prod-agua" })],
        }),
      ],
    });
    vi.mocked(obtenerProductosConEngancles).mockResolvedValue(new Map([[p.id, p]]));

    const r = await calcularPedido("store-1", {
      tipo: "recoger",
      items: [
        item({
          seleccion: [
            { productModifierGroupId: "pmg-bebida", opciones: [{ modifierOptionId: "op-agua", cantidad: 1 }] },
          ],
        }),
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.items).toHaveLength(2);
      expect(r.valor.items[1].productId).toBe("prod-agua");
      expect(r.valor.subtotal).toBe(5000 + 1500);
      expect(r.valor.total).toBe(6500);
    }
  });
});
