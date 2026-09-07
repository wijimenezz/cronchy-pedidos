import { describe, expect, it } from "vitest";
import { ganancia, NIVELES, nivelGuardado } from "./sonido";

/**
 * Solo la parte pura. El resto de `sonido.ts` es `AudioContext`, que en `environment: "node"` no
 * existe — por eso la lectura del nivel está partida en `nivelGuardado(crudo)`.
 */

describe("nivelGuardado", () => {
  it("acepta los tres niveles", () => {
    for (const nivel of NIVELES) {
      expect(nivelGuardado(nivel)).toBe(nivel);
    }
  });

  // La primera vez no hay nada guardado, y el problema que se estaba resolviendo era que no se
  // oía: arrancar en Bajo sería reestrenar el bug.
  it("sin nada guardado arranca en Alto", () => {
    expect(nivelGuardado(null)).toBe("alto");
  });

  it("un valor corrupto también cae en Alto", () => {
    for (const crudo of ["", "ALTO", "medio ", "0", "silencio", "{}"]) {
      expect(nivelGuardado(crudo)).toBe("alto");
    }
  });
});

describe("ganancia", () => {
  // Dos niveles con el mismo número son un nivel de mentira.
  it("crece estrictamente de Bajo a Alto", () => {
    expect(ganancia("bajo")).toBeLessThan(ganancia("medio"));
    expect(ganancia("medio")).toBeLessThan(ganancia("alto"));
  });

  it("ninguno es cero: para callarlo está el botón, no el volumen", () => {
    for (const nivel of NIVELES) {
      expect(ganancia(nivel)).toBeGreaterThan(0);
    }
  });

  // Por encima de 1 el pico de diseño recortaría, y eso no es más volumen sino distorsión.
  it("Alto es el techo y no lo pasa", () => {
    expect(ganancia("alto")).toBe(1);
  });
});
