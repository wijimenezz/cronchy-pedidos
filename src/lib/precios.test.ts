import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/queries/productos", () => ({
  obtenerProductoConEngancles: vi.fn(),
  obtenerProductosConEngancles: vi.fn(),
}));
vi.mock("@/db/queries/deliveryZones", () => ({
  obtenerZonaActiva: vi.fn(),
}));

import { obtenerProductosConEngancles } from "@/db/queries/productos";
import { obtenerZonaActiva } from "@/db/queries/deliveryZones";
import {
  calcularItem,
  calcularPedido,
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
  return { id: "op-1", nombre: "Arequipe", precioDelta: 0, disponible: true, productoRef: null, ...overrides };
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
});

describe("calcularPedido", () => {
  beforeEach(() => {
    vi.mocked(obtenerProductosConEngancles).mockReset();
    vi.mocked(obtenerZonaActiva).mockReset();
  });

  it("domicilio con zona válida suma el costo de envío al total", async () => {
    const p = producto();
    vi.mocked(obtenerProductosConEngancles).mockResolvedValue(new Map([[p.id, p]]));
    vi.mocked(obtenerZonaActiva).mockResolvedValue({ id: "zona-1", barrio: "Centro", precio: 3000, activa: true });

    const r = await calcularPedido("store-1", { tipo: "domicilio", items: [item()], zonaId: "zona-1" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.subtotal).toBe(5000);
      expect(r.valor.costoDomicilio).toBe(3000);
      expect(r.valor.total).toBe(8000);
    }
  });

  it("recoger ignora zonaId, costoDomicilio es 0", async () => {
    const p = producto();
    vi.mocked(obtenerProductosConEngancles).mockResolvedValue(new Map([[p.id, p]]));

    const r = await calcularPedido("store-1", { tipo: "recoger", items: [item()] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.costoDomicilio).toBe(0);
      expect(r.valor.total).toBe(5000);
    }
    expect(obtenerZonaActiva).not.toHaveBeenCalled();
  });

  it("domicilio sin zonaId es un error", async () => {
    const p = producto();
    vi.mocked(obtenerProductosConEngancles).mockResolvedValue(new Map([[p.id, p]]));

    const r = await calcularPedido("store-1", { tipo: "domicilio", items: [item()] });
    expect(r).toEqual({ ok: false, error: { tipo: "zona_requerida" } });
  });

  it("un descuento mayor al subtotal deja el total en 0, nunca negativo", async () => {
    const p = producto();
    vi.mocked(obtenerProductosConEngancles).mockResolvedValue(new Map([[p.id, p]]));

    const r = await calcularPedido("store-1", { tipo: "recoger", items: [item()], descuento: 999999 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.total).toBe(0);
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
