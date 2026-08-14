import { beforeEach, describe, expect, it } from "vitest";
import { useCarrito, type ItemCarrito } from "@/lib/carrito";

/**
 * `depurarPorTipo` es lo único del carrito que **borra** líneas sin que el cliente las haya
 * tocado, así que se prueba: quitar de más es perderle una venta al negocio y quitar de menos
 * deja un pedido que revienta al confirmar.
 *
 * El store corre tal cual en Node. `persist` no encuentra `localStorage` y se queda sin
 * hidratar, que es justo lo que hace falta aquí: cada test parte de un carrito conocido.
 */
function linea(over: Partial<ItemCarrito> & { lineId: string }): ItemCarrito {
  return {
    productoId: `prod-${over.lineId}`,
    nombre: "Churro clásico",
    precioBase: 5000,
    disponibleDelivery: true,
    disponiblePickup: true,
    precioUnitarioEstimado: 5000,
    cantidad: 1,
    seleccion: [],
    modificadores: [],
    avisos: [],
    ...over,
  };
}

describe("depurarPorTipo", () => {
  beforeEach(() => {
    useCarrito.setState({ items: [] });
  });

  it("quita lo que no se vende a domicilio y deja el resto", () => {
    useCarrito.setState({
      items: [
        linea({ lineId: "churro" }),
        linea({ lineId: "helado", nombre: "Porción de helado", disponibleDelivery: false }),
      ],
    });

    const retiradas = useCarrito.getState().depurarPorTipo("domicilio");

    expect(retiradas.map((i) => i.nombre)).toEqual(["Porción de helado"]);
    expect(useCarrito.getState().items.map((i) => i.lineId)).toEqual(["churro"]);
  });

  it("el mismo carrito en recoger pierde el otro", () => {
    useCarrito.setState({
      items: [
        linea({ lineId: "churro" }),
        linea({ lineId: "combo", nombre: "Combo familiar", disponiblePickup: false }),
      ],
    });

    const retiradas = useCarrito.getState().depurarPorTipo("recoger");

    expect(retiradas.map((i) => i.nombre)).toEqual(["Combo familiar"]);
    expect(useCarrito.getState().items.map((i) => i.lineId)).toEqual(["churro"]);
  });

  it("un carrito que se puede vender entero no pierde nada", () => {
    useCarrito.setState({ items: [linea({ lineId: "a" }), linea({ lineId: "b" })] });

    expect(useCarrito.getState().depurarPorTipo("domicilio")).toEqual([]);
    expect(useCarrito.getState().items).toHaveLength(2);
  });

  it("puede vaciar el carrito si nada se vende por ese canal", () => {
    useCarrito.setState({
      items: [linea({ lineId: "a", disponibleDelivery: false })],
    });

    expect(useCarrito.getState().depurarPorTipo("domicilio")).toHaveLength(1);
    expect(useCarrito.getState().items).toEqual([]);
  });

  it("las líneas viejas, sin canales guardados, sobreviven", () => {
    // Las guardó una versión anterior del carrito. `migrate` las normaliza a los dos canales,
    // pero si alguna se colara sin ellos no puede desaparecer sola: se comporta como antes.
    const antigua = { ...linea({ lineId: "vieja" }) } as Partial<ItemCarrito>;
    delete antigua.disponibleDelivery;
    delete antigua.disponiblePickup;

    useCarrito.setState({ items: [antigua as ItemCarrito] });

    expect(useCarrito.getState().depurarPorTipo("domicilio")).toEqual([]);
    expect(useCarrito.getState().items).toHaveLength(1);
  });
});
