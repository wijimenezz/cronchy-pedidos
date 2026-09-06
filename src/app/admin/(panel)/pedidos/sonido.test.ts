import { describe, expect, it } from "vitest";
import { debeSostenerFondo, ganancia, NIVELES, nivelGuardado } from "./sonido";

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

/**
 * Sostener el fondo le pide a Android el foco de audio, y Android se lo quita a quien lo tuviera:
 * con la campana encendida, la música que sonaba en el mostrador pasaba a segundo plano y no
 * volvía hasta apagarla. Lo que se fija aquí es que armar no baste.
 */
describe("debeSostenerFondo", () => {
  // EL caso del bug. Una página visible no la congela nadie, así que ahí el sostén no compraba
  // nada y costaba la música.
  it("armado y con el panel delante NO se sostiene", () => {
    expect(debeSostenerFondo(true, true)).toBe(false);
  });

  it("armado y oculto sí: es el único caso que este mecanismo vino a resolver", () => {
    expect(debeSostenerFondo(true, false)).toBe(true);
  });

  // Apagar la campana e irse a otra app no puede volver a robarle el foco a la música.
  it("sin armar no se sostiene, ni oculto ni visible", () => {
    expect(debeSostenerFondo(false, false)).toBe(false);
    expect(debeSostenerFondo(false, true)).toBe(false);
  });
});
