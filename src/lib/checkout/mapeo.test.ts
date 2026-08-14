import { describe, expect, it } from "vitest";
import {
  bebidasElegidas,
  carritoAItems,
  pendientesDeFicha,
  precioUpsell,
  seleccionSinUpsells,
} from "./mapeo";
import { crearPedidoSchema } from "@/lib/validaciones";
import type { ItemCarrito } from "@/lib/carrito";
import type { EngancheParaPrecio, ProductoParaPrecio } from "@/lib/precios-calculo";

function linea(overrides: Partial<ItemCarrito> = {}): ItemCarrito {
  return {
    lineId: "line-1",
    productoId: "prod-1",
    nombre: "Churro clásico",
    precioBase: 5000,
    disponibleDelivery: true,
    disponiblePickup: true,
    precioUnitarioEstimado: 5000,
    cantidad: 1,
    seleccion: [],
    modificadores: [],
    avisos: [],
    ...overrides,
  };
}

const ENGANCHES = [
  { id: "pmg-salsas", tipo: "seleccion" as const },
  { id: "pmg-bebida", tipo: "upsell" as const },
];

describe("seleccionSinUpsells", () => {
  // Este es el caso que evitaba el doble cobro: si el grupo de bebidas se quedara en la
  // selección de la línea base, el servidor la regeneraría desde ahí Y recibiría además
  // la línea suelta de la bebida, cobrándola dos veces.
  it("quita los grupos de tipo upsell y deja los de selección", () => {
    const seleccion = [
      { productModifierGroupId: "pmg-salsas", opciones: [{ modifierOptionId: "op-arequipe", cantidad: 1 }] },
      { productModifierGroupId: "pmg-bebida", opciones: [{ modifierOptionId: "op-agua", cantidad: 1 }] },
    ];

    expect(seleccionSinUpsells(seleccion, ENGANCHES)).toEqual([
      { productModifierGroupId: "pmg-salsas", opciones: [{ modifierOptionId: "op-arequipe", cantidad: 1 }] },
    ]);
  });

  it("sin upsells elegidos no cambia nada", () => {
    const seleccion = [
      { productModifierGroupId: "pmg-salsas", opciones: [{ modifierOptionId: "op-arequipe", cantidad: 1 }] },
    ];
    expect(seleccionSinUpsells(seleccion, ENGANCHES)).toEqual(seleccion);
  });

  it("un producto sin grupos upsell conserva su selección íntegra", () => {
    const seleccion = [
      { productModifierGroupId: "pmg-salsas", opciones: [{ modifierOptionId: "op-arequipe", cantidad: 1 }] },
    ];
    expect(seleccionSinUpsells(seleccion, [{ id: "pmg-salsas", tipo: "seleccion" }])).toEqual(seleccion);
  });
});

describe("precioUpsell", () => {
  it("usa el precio del producto real, no el precioDelta del enganche", () => {
    // Caso real del catálogo: el Latte Frío tiene precioDelta 9000 pero precioBase 11500.
    // Como se cobra por item propio, la UI debe mostrar 11500.
    expect(precioUpsell({ "prod-latte": { precioBase: 11500 } }, "prod-latte", 9000)).toBe(11500);
  });

  it("cae al respaldo si el producto no vino en el mapa", () => {
    expect(precioUpsell({}, "prod-desconocido", 1500)).toBe(1500);
  });
});

// ------------------------------------------------------------
// Bebidas de upsell con opciones propias
// ------------------------------------------------------------

function grupo(overrides: Partial<EngancheParaPrecio> = {}): EngancheParaPrecio {
  return {
    id: "pmg-x",
    modo: "incluido",
    tipo: "seleccion",
    nombreGrupo: "Sabor",
    minSelect: 1,
    maxSelect: 1,
    precioUnitario: null,
    avisarIncompleto: false,
    permiteCantidad: false,
    maxPorOpcion: null,
    opciones: [{ id: "op-1", nombre: "Oreo", precioDelta: 0, disponible: true, productoRef: null }],
    ...overrides,
  };
}

function bebida(overrides: Partial<ProductoParaPrecio> = {}): ProductoParaPrecio {
  return {
    id: "prod-frappe",
    nombre: "Frappe",
    precioBase: 13000,
    activo: true,
    disponible: true,
    disponibleDelivery: true,
    disponiblePickup: true,
    engancles: [grupo({ id: "pmg-sabor", nombreGrupo: "Sabor" })],
    ...overrides,
  };
}

describe("bebidasElegidas", () => {
  it("une el upsell con su producto real y con la selección que hizo el cliente", () => {
    const frappe = bebida();
    const r = bebidasElegidas(
      [{ productId: "prod-frappe", cantidad: 2 }],
      { "prod-frappe": frappe },
      { "prod-frappe": [{ productModifierGroupId: "pmg-sabor", opciones: [{ modifierOptionId: "op-1", cantidad: 1 }] }] },
    );

    expect(r).toHaveLength(1);
    expect(r[0].producto).toBe(frappe);
    expect(r[0].cantidad).toBe(2);
    expect(r[0].seleccion[0].opciones[0].modifierOptionId).toBe("op-1");
  });

  it("una bebida sin configurar llega con selección vacía, no se pierde", () => {
    const r = bebidasElegidas([{ productId: "prod-frappe", cantidad: 1 }], { "prod-frappe": bebida() }, {});
    expect(r[0].seleccion).toEqual([]);
  });

  it("omite la bebida cuyo producto real no se pudo resolver", () => {
    const r = bebidasElegidas([{ productId: "prod-fantasma", cantidad: 1 }], {}, {});
    expect(r).toEqual([]);
  });

  it("sin upsells devuelve lista vacía", () => {
    expect(bebidasElegidas([], { "prod-frappe": bebida() }, {})).toEqual([]);
  });
});

describe("pendientesDeFicha", () => {
  const churro: Pick<ProductoParaPrecio, "engancles"> = {
    engancles: [grupo({ id: "pmg-salsa", nombreGrupo: "Salsa incluida" })],
  };
  const salsaElegida = [
    { productModifierGroupId: "pmg-salsa", opciones: [{ modifierOptionId: "op-1", cantidad: 1 }] },
  ];
  const saborElegido = [
    { productModifierGroupId: "pmg-sabor", opciones: [{ modifierOptionId: "op-1", cantidad: 1 }] },
  ];

  it("señala el grupo pendiente de la bebida, con su nombre", () => {
    const r = pendientesDeFicha(churro, salsaElegida, [{ producto: bebida(), seleccion: [] }]);
    expect(r).toEqual([
      { productModifierGroupId: "pmg-sabor", nombreGrupo: "Sabor", faltan: 1, nombreProducto: "Frappe" },
    ]);
  });

  // El orden manda: es el texto que muestra el botón, y el cliente resuelve de arriba abajo.
  it("pone primero lo del producto y después lo de las bebidas", () => {
    const r = pendientesDeFicha(churro, [], [{ producto: bebida(), seleccion: [] }]);
    expect(r.map((p) => p.nombreProducto)).toEqual([null, "Frappe"]);
    expect(r[0].nombreGrupo).toBe("Salsa incluida");
  });

  it("con todo elegido no queda nada pendiente", () => {
    const r = pendientesDeFicha(churro, salsaElegida, [{ producto: bebida(), seleccion: saborElegido }]);
    expect(r).toEqual([]);
  });

  it("una bebida sin grupos obligatorios no aporta pendientes", () => {
    const agua = bebida({ id: "prod-agua", nombre: "Agua 600ml", engancles: [] });
    const r = pendientesDeFicha(churro, salsaElegida, [{ producto: agua, seleccion: [] }]);
    expect(r).toEqual([]);
  });

  it("acumula los pendientes de varias bebidas", () => {
    const latte = bebida({ id: "prod-latte", nombre: "Latte Frio", engancles: [grupo({ id: "pmg-dulce", nombreGrupo: "Nivel de dulce" })] });
    const r = pendientesDeFicha(churro, salsaElegida, [
      { producto: bebida(), seleccion: [] },
      { producto: latte, seleccion: [] },
    ]);
    expect(r.map((p) => `${p.nombreProducto}/${p.nombreGrupo}`)).toEqual([
      "Frappe/Sabor",
      "Latte Frio/Nivel de dulce",
    ]);
  });
});

describe("carritoAItems", () => {
  it("renombra productoId a productId y conserva cantidad, selección y notas", () => {
    const r = carritoAItems([
      linea({
        cantidad: 2,
        notas: "sin canela",
        seleccion: [
          { productModifierGroupId: "pmg-salsas", opciones: [{ modifierOptionId: "op-arequipe", cantidad: 1 }] },
        ],
      }),
    ]);

    expect(r.items).toEqual([
      {
        productId: "prod-1",
        cantidad: 2,
        seleccion: [
          { productModifierGroupId: "pmg-salsas", opciones: [{ modifierOptionId: "op-arequipe", cantidad: 1 }] },
        ],
        notas: "sin canela",
      },
    ]);
  });

  it("no filtra nada del payload que pueda revelar precios", () => {
    const r = carritoAItems([linea({ precioUnitarioEstimado: 99999 })]);
    expect(Object.keys(r.items[0]).sort()).toEqual(["cantidad", "notas", "productId", "seleccion"]);
  });

  it("una bebida agregada como upsell viaja como item independiente", () => {
    const r = carritoAItems([
      linea({ lineId: "line-churro" }),
      linea({ lineId: "line-agua", productoId: "prod-agua", nombre: "Agua Grande", cantidad: 1 }),
    ]);

    expect(r.items).toHaveLength(2);
    expect(r.items[1].productId).toBe("prod-agua");
    expect(r.items[1].seleccion).toEqual([]);
  });

  it("lineIdPorIndice permite ubicar la línea culpable de un error del servidor", () => {
    const r = carritoAItems([
      linea({ lineId: "line-a" }),
      linea({ lineId: "line-b", productoId: "prod-2" }),
      linea({ lineId: "line-c", productoId: "prod-3" }),
    ]);

    expect(r.lineIdPorIndice).toEqual(["line-a", "line-b", "line-c"]);
    // Un 422 con itemIndex 1 apunta a la línea "line-b".
    expect(r.lineIdPorIndice[1]).toBe("line-b");
  });

  it("notas ausentes se normalizan a null", () => {
    const r = carritoAItems([linea()]);
    expect(r.items[0].notas).toBeNull();
  });

  it("un carrito vacío no produce items", () => {
    expect(carritoAItems([])).toEqual({ items: [], lineIdPorIndice: [] });
  });
});

/**
 * La costura entre el carrito y la API, que es por donde se rompió.
 *
 * Los dos lados estaban probados y cada uno era coherente consigo mismo —aquí arriba se fija
 * que las notas ausentes viajan como `null`, y el `payloadBase()` de `validaciones.test.ts`
 * arma sus items sin la clave `notas`—, pero el payload que de verdad produce
 * `carritoAItems` no había pasado nunca por el esquema que lo recibe. No pasaba: `null`
 * contra un `.optional()` tumbaba TODOS los pedidos sin observaciones, o sea casi todos, y
 * como el route handler valida con el mismo esquema, no había forma de crear un pedido.
 *
 * Por eso el test va contra el esquema real y no contra una copia de su forma: una copia
 * envejece igual que envejeció la otra mitad.
 */
describe("carritoAItems contra crearPedidoSchema", () => {
  // Ids con forma de uuid porque `idSchema` la exige; los del resto del archivo son legibles
  // ("prod-1") y ahí da igual, porque no llegan a ningún esquema.
  const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
  const GRUPO_ID = "33333333-0000-0000-0000-000000000001";
  const OPCION_ID = "44444444-0000-0000-0000-000000000001";

  /** El payload tal cual lo arma el checkout, con lo mínimo alrededor de los items. */
  function pedidoCon(items: ItemCarrito[]) {
    return {
      tipo: "recoger" as const,
      clienteNombre: "Ana",
      clienteTelefono: "3001234567",
      metodoPago: "efectivo" as const,
      items: carritoAItems(items).items,
    };
  }

  it("un carrito sin notas produce un pedido que el esquema acepta", () => {
    const r = crearPedidoSchema.safeParse(pedidoCon([linea({ productoId: PRODUCT_ID })]));

    // Se mira `items` antes que `success` para que, si vuelve a romperse, el fallo diga cuál
    // es el campo culpable en vez de un "expected true, received false".
    expect(r.error?.flatten().fieldErrors.items).toBeUndefined();
    expect(r.success).toBe(true);
  });

  it("una línea con notas y con selección también", () => {
    const r = crearPedidoSchema.safeParse(
      pedidoCon([
        linea({
          productoId: PRODUCT_ID,
          cantidad: 2,
          notas: "sin canela",
          seleccion: [
            {
              productModifierGroupId: GRUPO_ID,
              opciones: [{ modifierOptionId: OPCION_ID, cantidad: 1 }],
            },
          ],
        }),
      ]),
    );

    expect(r.error?.flatten().fieldErrors.items).toBeUndefined();
    expect(r.success).toBe(true);
  });
});
