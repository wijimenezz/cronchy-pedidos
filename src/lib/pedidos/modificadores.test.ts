import { describe, expect, it } from "vitest";
import {
  agruparModificadores,
  contarPreparacion,
  etiquetaCorta,
} from "./modificadores";
import type { ItemSnapshot, ModificadorSnapshot } from "@/lib/notificaciones/plantillas";

function mod(parcial: Partial<ModificadorSnapshot> = {}): ModificadorSnapshot {
  return { grupo: "Salsa incluida", nombre: "Arequipe", cantidad: 1, precio: 0, ...parcial };
}

function item(parcial: Partial<ItemSnapshot> = {}): ItemSnapshot {
  return { nombre: "Cronchy Mega", cantidad: 1, subtotal: 19000, modificadores: [], ...parcial };
}

describe("etiquetaCorta", () => {
  it("acorta los grupos del catálogo", () => {
    expect(etiquetaCorta("Sabor de helado")).toBe("Helado");
    expect(etiquetaCorta("Toppings incluidos")).toBe("Toppings");
    expect(etiquetaCorta("Topping incluido")).toBe("Topping");
    expect(etiquetaCorta("Salsa incluida")).toBe("Salsa");
    expect(etiquetaCorta("Salsas incluidas")).toBe("Salsas");
    expect(etiquetaCorta("Nivel de dulce")).toBe("Dulce");
    expect(etiquetaCorta("Agregar más toppings")).toBe("Toppings");
  });

  it("deja intacto lo que ya es corto", () => {
    expect(etiquetaCorta("Sabor")).toBe("Sabor");
    expect(etiquetaCorta("Gas")).toBe("Gas");
    expect(etiquetaCorta("Salsas")).toBe("Salsas");
  });

  // El fallo correcto de una regla es no tocar lo que no reconoce: se ve largo, no se ve mal.
  it("un grupo que la regla no conoce sale entero", () => {
    expect(etiquetaCorta("Punto de la carne")).toBe("Punto de la carne");
    expect(etiquetaCorta("  Gas  ")).toBe("Gas");
  });

  it("no se come el nombre entero si el grupo es solo el prefijo", () => {
    expect(etiquetaCorta("Incluido")).toBe("Incluido");
  });
});

describe("agruparModificadores", () => {
  it("dos opciones del mismo grupo caen en una sola fila", () => {
    const { incluidos } = agruparModificadores([
      mod({ grupo: "Toppings incluidos", nombre: "M&M" }),
      mod({ grupo: "Toppings incluidos", nombre: "Mango" }),
    ]);

    expect(incluidos).toEqual([{ etiqueta: "Toppings", valores: ["M&M", "Mango"] }]);
  });

  it("respeta el orden de llegada de los grupos", () => {
    const { incluidos } = agruparModificadores([
      mod({ grupo: "Sabor de helado", nombre: "Piña Colada" }),
      mod({ grupo: "Toppings incluidos", nombre: "M&M" }),
      mod({ grupo: "Salsa incluida", nombre: "Chocolate blanco" }),
      mod({ grupo: "Toppings incluidos", nombre: "Mango" }),
    ]);

    expect(incluidos.map((g) => g.etiqueta)).toEqual(["Helado", "Toppings", "Salsa"]);
    expect(incluidos[1].valores).toEqual(["M&M", "Mango"]);
  });

  it("la cantidad solo se escribe si es más de una", () => {
    const { incluidos } = agruparModificadores([
      mod({ nombre: "Arequipe" }),
      mod({ nombre: "Chocolate", cantidad: 2 }),
    ]);

    expect(incluidos[0].valores).toEqual(["Arequipe", "Chocolate ×2"]);
  });

  it("lo que tiene precio sale de la rejilla y se cobra aparte", () => {
    const { incluidos, extras } = agruparModificadores([
      mod({ grupo: "Toppings incluidos", nombre: "M&M" }),
      mod({ grupo: "Agregar más toppings", nombre: "Oreo", precio: 2000 }),
    ]);

    expect(incluidos).toEqual([{ etiqueta: "Toppings", valores: ["M&M"] }]);
    expect(extras).toEqual([{ nombre: "Oreo", cantidad: 1, total: 2000 }]);
  });

  // El `precio` del snapshot es UNITARIO. Mostrarlo sin multiplicar decía $2.000 donde el
  // WhatsApp del negocio decía $4.000 por el mismo pedido.
  it("el total del extra es precio × cantidad", () => {
    const { extras } = agruparModificadores([
      mod({ nombre: "Oreo", cantidad: 2, precio: 2000 }),
    ]);

    expect(extras).toEqual([{ nombre: "Oreo", cantidad: 2, total: 4000 }]);
  });

  // El esquema permite enganchar el mismo grupo en `incluido` y en `adicional`, y sin
  // `etiqueta` distinta llegan con el mismo nombre. El precio los separa.
  it("el mismo grupo con una gratis y otra cobrada se reparte", () => {
    const { incluidos, extras } = agruparModificadores([
      mod({ grupo: "Salsas", nombre: "Arequipe" }),
      mod({ grupo: "Salsas", nombre: "Chocolate", precio: 2000 }),
    ]);

    expect(incluidos).toEqual([{ etiqueta: "Salsas", valores: ["Arequipe"] }]);
    expect(extras).toEqual([{ nombre: "Chocolate", cantidad: 1, total: 2000 }]);
  });

  it("sin modificadores no hay nada que pintar", () => {
    expect(agruparModificadores([])).toEqual({ incluidos: [], extras: [] });
  });
});

describe("contarPreparacion", () => {
  it("cuenta unidades y no renglones", () => {
    const cuenta = contarPreparacion([
      item({ nombre: "Cronchy Cono", cantidad: 2 }),
      item({ nombre: "Frappe", cantidad: 1 }),
    ]);

    expect(cuenta).toEqual({ unidades: 3, extras: 0 });
  });

  it("suma los extras cobrados de todos los ítems", () => {
    const cuenta = contarPreparacion([
      item({
        modificadores: [
          mod({ nombre: "M&M" }),
          mod({ nombre: "Oreo", precio: 2000 }),
        ],
      }),
      item({ modificadores: [mod({ nombre: "Nutella", cantidad: 2, precio: 2000 })] }),
    ]);

    expect(cuenta).toEqual({ unidades: 2, extras: 3 });
  });

  it("un pedido vacío no cuenta nada", () => {
    expect(contarPreparacion([])).toEqual({ unidades: 0, extras: 0 });
  });
});
