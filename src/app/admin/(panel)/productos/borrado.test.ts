import { describe, expect, it } from "vitest";
import { porQueNoSeBorra } from "./borrado";

describe("porQueNoSeBorra", () => {
  // No basta con negar: el producto vendido TIENE salida, y hay que nombrarla o el admin se
  // queda pulsando el mismo botón.
  it("lo vendido manda a Oculto", () => {
    const texto = porQueNoSeBorra({ estado: "tiene_ventas" });

    expect(texto).toContain("ya se vendió");
    expect(texto).toContain("Oculto");
  });

  it("un acompañante nombra su lista y dónde quitarlo", () => {
    const texto = porQueNoSeBorra({ estado: "es_acompanante", listas: ["Bebidas"] });

    expect(texto).toContain("«Bebidas»");
    expect(texto).toContain("Opciones");
    expect(texto).toContain("esa lista");
  });

  // Una bebida puede estar colgada de varias listas, y hay que ir a todas.
  it("si está en varias, las nombra todas", () => {
    const texto = porQueNoSeBorra({
      estado: "es_acompanante",
      listas: ["Bebidas", "Postres", "Combos"],
    });

    expect(texto).toContain("«Bebidas», «Postres» y «Combos»");
    expect(texto).toContain("esas listas");
  });

  it("un producto que ya desapareció se dice igual que en el resto del panel", () => {
    expect(porQueNoSeBorra({ estado: "sin_producto" })).toBe("Ese producto ya no existe.");
  });

  // Dos ramas con el mismo texto son una rama muerta.
  it("cada motivo tiene su propia frase", () => {
    const frases = [
      porQueNoSeBorra({ estado: "sin_producto" }),
      porQueNoSeBorra({ estado: "tiene_ventas" }),
      porQueNoSeBorra({ estado: "es_acompanante", listas: ["Bebidas"] }),
    ];

    expect(new Set(frases).size).toBe(frases.length);
  });
});
