import { describe, expect, it } from "vitest";
import { capitalizarNombre } from "./nombre";

describe("capitalizarNombre", () => {
  it("pone en mayúscula la inicial de cada palabra", () => {
    expect(capitalizarNombre("juan perez")).toBe("Juan Perez");
  });

  it("baja lo que venía en mayúsculas", () => {
    expect(capitalizarNombre("JOSE RAMIREZ")).toBe("Jose Ramirez");
  });

  // El motivo de que esto sea un módulo propio y no un `.replace` suelto: en español las
  // partículas van en minúscula, y capitalizarlas escribe mal el apellido de alguien.
  it("deja las partículas en minúscula", () => {
    expect(capitalizarNombre("juan de la espriella")).toBe("Juan de la Espriella");
    expect(capitalizarNombre("MARIA DEL PILAR")).toBe("Maria del Pilar");
    expect(capitalizarNombre("ana y pedro")).toBe("Ana y Pedro");
  });

  // Un nombre no empieza en minúscula aunque su primera palabra sea una partícula.
  it("no degrada la primera palabra", () => {
    expect(capitalizarNombre("de la hoz")).toBe("De la Hoz");
  });

  it("respeta tildes y ñ", () => {
    expect(capitalizarNombre("josé ramírez")).toBe("José Ramírez");
    expect(capitalizarNombre("ANA MARÍA PEÑA")).toBe("Ana María Peña");
  });

  it("colapsa los espacios, igual que el esquema antes de validar", () => {
    expect(capitalizarNombre("  ana   maría  ")).toBe("Ana María");
  });

  it("con el campo vacío no revienta", () => {
    expect(capitalizarNombre("")).toBe("");
    expect(capitalizarNombre("   ")).toBe("");
  });
});
