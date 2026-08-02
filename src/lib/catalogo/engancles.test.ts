import { describe, expect, it } from "vitest";
import {
  configuracionDesde,
  planificarEngancles,
  type ConfiguracionModificadores,
  type EngancheActual,
  type EngancheConTipo,
} from "@/lib/catalogo/engancles";

const SALSAS = "11111111-1111-1111-1111-111111111111";
const TOPPINGS = "22222222-2222-2222-2222-222222222222";
const BEBIDAS = "33333333-3333-3333-3333-333333333333";

const VACIA: ConfiguracionModificadores = { incluidos: [], adicionales: [], upsells: [] };

function actual(over: Partial<EngancheActual> & { id: string; groupId: string }): EngancheActual {
  return {
    modo: "incluido",
    minSelect: 1,
    maxSelect: 1,
    precioUnitario: null,
    colapsado: false,
    ...over,
  };
}

describe("planificarEngancles", () => {
  it("crea un enganche incluido con min = max (regla 4)", () => {
    const plan = planificarEngancles([], { ...VACIA, incluidos: [{ groupId: SALSAS, cantidad: 1 }] });

    expect(plan.borrar).toEqual([]);
    expect(plan.guardar).toEqual([
      {
        groupId: SALSAS,
        modo: "incluido",
        minSelect: 1,
        maxSelect: 1,
        // Fila nueva: se estrena con 0 (regla 3).
        precioUnitario: 0,
        avisarIncompleto: false,
        colapsado: false,
        orden: 0,
      },
    ]);
  });

  it("bloquea en vez de solo avisar: avisar_incompleto siempre false", () => {
    const plan = planificarEngancles([], {
      ...VACIA,
      incluidos: [{ groupId: SALSAS, cantidad: 4 }],
    });

    expect(plan.guardar[0].avisarIncompleto).toBe(false);
  });

  it("bajar de 2 a 1 incluidas es un update, no un borrar y crear", () => {
    const actuales = [actual({ id: "e1", groupId: SALSAS, minSelect: 2, maxSelect: 2 })];

    const plan = planificarEngancles(actuales, {
      ...VACIA,
      incluidos: [{ groupId: SALSAS, cantidad: 1 }],
    });

    // Recrear la fila cambiaría su id, que es lo que el carrito guardó en el navegador.
    expect(plan.borrar).toEqual([]);
    expect(plan.guardar).toHaveLength(1);
    expect(plan.guardar[0]).toMatchObject({ minSelect: 1, maxSelect: 1, modo: "incluido" });
  });

  it("quitar lo incluido no toca el adicional del mismo grupo", () => {
    const actuales = [
      actual({ id: "inc", groupId: SALSAS, modo: "incluido" }),
      actual({ id: "adi", groupId: SALSAS, modo: "adicional", minSelect: 0, maxSelect: 3, precioUnitario: 2000, colapsado: true }),
    ];

    const plan = planificarEngancles(actuales, {
      ...VACIA,
      adicionales: [{ groupId: SALSAS, hasta: 3, precio: 2000 }],
    });

    expect(plan.borrar).toEqual(["inc"]);
    expect(plan.guardar).toHaveLength(1);
    expect(plan.guardar[0]).toMatchObject({ groupId: SALSAS, modo: "adicional" });
  });

  it("el mismo grupo enganchado en los dos modos son dos filas (regla 3)", () => {
    const plan = planificarEngancles([], {
      incluidos: [{ groupId: SALSAS, cantidad: 1 }],
      adicionales: [{ groupId: SALSAS, hasta: 3, precio: 2000 }],
      upsells: [],
    });

    expect(plan.borrar).toEqual([]);
    expect(plan.guardar).toHaveLength(2);

    const incluido = plan.guardar.find((f) => f.modo === "incluido");
    const adicional = plan.guardar.find((f) => f.modo === "adicional");

    expect(incluido).toMatchObject({ minSelect: 1, maxSelect: 1, precioUnitario: 0, colapsado: false });
    expect(adicional).toMatchObject({ minSelect: 0, maxSelect: 3, precioUnitario: 2000, colapsado: true });
  });

  it("los adicionales llegan plegados y opcionales", () => {
    const plan = planificarEngancles([], {
      ...VACIA,
      adicionales: [{ groupId: SALSAS, hasta: 2, precio: 2000 }],
    });

    expect(plan.guardar[0]).toMatchObject({ minSelect: 0, colapsado: true, precioUnitario: 2000 });
  });

  it("encender un upsell nuevo lo crea opcional y al final", () => {
    const plan = planificarEngancles([], {
      ...VACIA,
      incluidos: [{ groupId: SALSAS, cantidad: 1 }],
      upsells: [BEBIDAS],
    });

    const upsell = plan.guardar.find((f) => f.groupId === BEBIDAS);
    expect(upsell).toMatchObject({ modo: "adicional", minSelect: 0, maxSelect: 1, precioUnitario: null });
    expect(upsell!.orden).toBeGreaterThan(plan.guardar.find((f) => f.groupId === SALSAS)!.orden);
  });

  it("un upsell que ya existía conserva su min y su max", () => {
    const actuales = [
      actual({ id: "ups", groupId: BEBIDAS, modo: "adicional", minSelect: 0, maxSelect: 3, precioUnitario: null }),
    ];

    const plan = planificarEngancles(actuales, { ...VACIA, upsells: [BEBIDAS] });

    // El panel solo enciende y apaga: no hay control que exponga estos números, así que
    // reescribirlos con un default sería perder configuración a espaldas del admin.
    expect(plan.borrar).toEqual([]);
    expect(plan.guardar[0]).toMatchObject({ minSelect: 0, maxSelect: 3 });
  });

  it("apagar el upsell borra solo esa fila", () => {
    const actuales = [
      actual({ id: "inc", groupId: TOPPINGS, modo: "incluido" }),
      actual({ id: "ups", groupId: BEBIDAS, modo: "adicional", minSelect: 0, maxSelect: 1 }),
    ];

    const plan = planificarEngancles(actuales, {
      ...VACIA,
      incluidos: [{ groupId: TOPPINGS, cantidad: 1 }],
    });

    expect(plan.borrar).toEqual(["ups"]);
  });

  it("dejar la configuración vacía borra todo lo que había", () => {
    const actuales = [
      actual({ id: "a", groupId: SALSAS }),
      actual({ id: "b", groupId: TOPPINGS }),
    ];

    const plan = planificarEngancles(actuales, VACIA);

    expect(plan.guardar).toEqual([]);
    expect(plan.borrar).toEqual(["a", "b"]);
  });

  it("un producto sin nada configurado no produce escrituras", () => {
    expect(planificarEngancles([], VACIA)).toEqual({ guardar: [], borrar: [] });
  });

  it("ordena incluidos, luego adicionales, luego upsells", () => {
    const plan = planificarEngancles([], {
      incluidos: [{ groupId: SALSAS, cantidad: 1 }, { groupId: TOPPINGS, cantidad: 2 }],
      adicionales: [{ groupId: SALSAS, hasta: 3, precio: 2000 }],
      upsells: [BEBIDAS],
    });

    const ordenes = plan.guardar.map((f) => f.orden);
    expect(ordenes).toEqual([...ordenes].sort((a, b) => a - b));
    expect(new Set(ordenes).size).toBe(ordenes.length);
  });

  it("no normaliza el precio_unitario de un incluido que ya existía", () => {
    // La base tiene filas 'incluido' con 0 y filas con NULL, según la migración que las
    // creó. Como el motor ni lo mira en ese modo, tocarlas sería reescribir la carta para
    // nada. Las nuevas sí nacen con 0.
    const actuales = [actual({ id: "e1", groupId: SALSAS, precioUnitario: null })];

    const plan = planificarEngancles(actuales, {
      ...VACIA,
      incluidos: [{ groupId: SALSAS, cantidad: 1 }, { groupId: TOPPINGS, cantidad: 1 }],
    });

    expect(plan.guardar.find((f) => f.groupId === SALSAS)!.precioUnitario).toBeNull();
    expect(plan.guardar.find((f) => f.groupId === TOPPINGS)!.precioUnitario).toBe(0);
  });

  it("se queda con el primero si un grupo llega repetido en la misma lista", () => {
    const plan = planificarEngancles([], {
      ...VACIA,
      incluidos: [{ groupId: SALSAS, cantidad: 1 }, { groupId: SALSAS, cantidad: 4 }],
    });

    expect(plan.guardar).toHaveLength(1);
    expect(plan.guardar[0].minSelect).toBe(1);
  });
});

describe("ida y vuelta", () => {
  /**
   * Los enganches reales de "Cronchy Churros", copiados de la base tal cual: una salsa
   * incluida, salsas adicionales a $2.000 y el upsell de bebidas con max 3.
   *
   * Este es EL test que importa de verdad. Abrir un producto en el panel y darle a Guardar
   * sin tocar nada no puede cambiar ni una fila; si `configuracionDesde` y
   * `planificarEngancles` se desalinearan, ese guardado inocente reescribiría la carta —y
   * un `min_select` movido bloquea el carrito de cualquiera que intente pedir ese producto.
   */
  const REALES: EngancheConTipo[] = [
    {
      id: "pmg-1",
      groupId: SALSAS,
      tipoGrupo: "seleccion",
      modo: "incluido",
      minSelect: 1,
      maxSelect: 1,
      precioUnitario: 0,
      colapsado: false,
    },
    {
      id: "pmg-2",
      groupId: SALSAS,
      tipoGrupo: "seleccion",
      modo: "adicional",
      minSelect: 0,
      maxSelect: 8,
      precioUnitario: 2000,
      colapsado: true,
    },
    {
      id: "pmg-3",
      groupId: BEBIDAS,
      tipoGrupo: "upsell",
      modo: "adicional",
      minSelect: 0,
      maxSelect: 3,
      precioUnitario: null,
      colapsado: false,
    },
  ];

  it("guardar sin cambios no borra nada", () => {
    const plan = planificarEngancles(REALES, configuracionDesde(REALES));
    expect(plan.borrar).toEqual([]);
  });

  it("guardar sin cambios no altera ningún valor", () => {
    const plan = planificarEngancles(REALES, configuracionDesde(REALES));

    for (const previo of REALES) {
      const fila = plan.guardar.find(
        (f) => f.groupId === previo.groupId && f.modo === previo.modo,
      );

      expect(fila, `falta el enganche ${previo.id}`).toBeDefined();
      expect(fila).toMatchObject({
        minSelect: previo.minSelect,
        maxSelect: previo.maxSelect,
        precioUnitario: previo.precioUnitario,
        colapsado: previo.colapsado,
      });
    }
  });

  it("distingue el upsell del adicional aunque ambos sean modo 'adicional'", () => {
    const config = configuracionDesde(REALES);

    expect(config.upsells).toEqual([BEBIDAS]);
    expect(config.adicionales).toEqual([{ groupId: SALSAS, hasta: 8, precio: 2000 }]);
    expect(config.incluidos).toEqual([{ groupId: SALSAS, cantidad: 1 }]);
  });

  it("subir las salsas incluidas de 1 a 2 solo toca esa fila", () => {
    const config = configuracionDesde(REALES);
    const plan = planificarEngancles(REALES, {
      ...config,
      incluidos: [{ groupId: SALSAS, cantidad: 2 }],
    });

    expect(plan.borrar).toEqual([]);

    const incluido = plan.guardar.find((f) => f.modo === "incluido");
    expect(incluido).toMatchObject({ minSelect: 2, maxSelect: 2 });

    // El upsell y el adicional siguen exactamente como estaban.
    expect(plan.guardar.find((f) => f.groupId === BEBIDAS)).toMatchObject({ maxSelect: 3 });
    expect(
      plan.guardar.find((f) => f.groupId === SALSAS && f.modo === "adicional"),
    ).toMatchObject({ maxSelect: 8, precioUnitario: 2000 });
  });
});
