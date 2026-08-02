import { describe, expect, it } from "vitest";
import { slugify, slugLibre } from "@/lib/texto";

describe("slugify", () => {
  it("pasa un nombre normal a minúsculas con guiones", () => {
    expect(slugify("Cronchy Mega")).toBe("cronchy-mega");
  });

  it("quita las tildes en vez de escaparlas", () => {
    expect(slugify("Frutilla Café")).toBe("frutilla-cafe");
    expect(slugify("Limón")).toBe("limon");
  });

  it("convierte la ñ en n", () => {
    expect(slugify("Piña")).toBe("pina");
  });

  it("colapsa espacios y signos repetidos en un solo guion", () => {
    expect(slugify("Churros  con   Helado")).toBe("churros-con-helado");
    expect(slugify("Combo 2x1 — ¡Nuevo!")).toBe("combo-2x1-nuevo");
  });

  it("no deja guiones sueltos en los extremos", () => {
    expect(slugify("  Ring  ")).toBe("ring");
    expect(slugify("¿Qué hay?")).toBe("que-hay");
  });

  it("devuelve vacío cuando no queda nada aprovechable", () => {
    expect(slugify("🍩🍦")).toBe("");
    expect(slugify("   ")).toBe("");
  });
});

describe("slugLibre", () => {
  it("devuelve la base cuando nadie la ocupa", () => {
    expect(slugLibre("cronchy-mega", [])).toBe("cronchy-mega");
    expect(slugLibre("cronchy-mega", ["otro"])).toBe("cronchy-mega");
  });

  it("sufija con -2 en la primera colisión", () => {
    expect(slugLibre("agua", ["agua"])).toBe("agua-2");
  });

  it("sigue subiendo mientras el sufijo también esté tomado", () => {
    expect(slugLibre("agua", ["agua", "agua-2", "agua-3"])).toBe("agua-4");
  });

  it("no se salta un hueco libre en medio", () => {
    expect(slugLibre("agua", ["agua", "agua-3"])).toBe("agua-2");
  });
});
