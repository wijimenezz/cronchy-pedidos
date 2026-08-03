import { describe, expect, it } from "vitest";
import { instanteEnBogota } from "@/lib/horario";
import { diasConFranjas, type DiaParaFranjas } from "./franjas";

/**
 * 2026-01-01 es jueves; mañana es el 2. Todo el archivo se mueve en esas dos fechas para que
 * "hoy" y "mañana" sean literales legibles y no aritmética de milisegundos.
 */
const HOY = "2026-01-01";
const MANANA = "2026-01-02";

function enBogota(fecha: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return instanteEnBogota(fecha, h * 60 + m);
}

/** El horario real de la churrería: de 3 de la tarde a 10 de la noche. */
const TARDE = [{ abre: "15:00:00", cierra: "22:00:00" }];

function dias(hoy: DiaParaFranjas["rangos"], manana: DiaParaFranjas["rangos"]): DiaParaFranjas[] {
  return [
    { fecha: HOY, rangos: hoy },
    { fecha: MANANA, rangos: manana },
  ];
}

/** Las etiquetas del día pedido, para poder afirmar sobre horas y no sobre objetos Date. */
function horasDe(resultado: ReturnType<typeof diasConFranjas>, dia: "hoy" | "manana"): string[] {
  return resultado.find((d) => d.dia === dia)?.franjas.map((f) => f.etiqueta) ?? [];
}

describe("diasConFranjas", () => {
  it("la primera franja de hoy respeta la anticipación y se redondea hacia arriba", () => {
    // 4:05 pm + 45 min = 4:50 -> la primera que se puede prometer es la de las 5:00.
    const r = diasConFranjas(dias(TARDE, TARDE), enBogota(HOY, "16:05"), 45);

    expect(horasDe(r, "hoy")[0]).toBe("5:00 pm");
  });

  it("no ofrece ninguna hora que ya pasó", () => {
    const r = diasConFranjas(dias(TARDE, TARDE), enBogota(HOY, "19:20"), 45);

    expect(horasDe(r, "hoy")).toEqual(["8:30 pm", "9:00 pm", "9:30 pm"]);
  });

  it("mañana empieza en la apertura y NO arrastra la anticipación", () => {
    // Aunque se pida a las 9 de la noche, mañana sigue empezando a las 3 en punto.
    const r = diasConFranjas(dias(TARDE, TARDE), enBogota(HOY, "21:00"), 45);

    expect(horasDe(r, "manana")[0]).toBe("3:00 pm");
  });

  it("la última franja es anterior al cierre, nunca el cierre mismo", () => {
    const r = diasConFranjas(dias(TARDE, TARDE), enBogota(HOY, "15:00"), 45);
    const hoy = horasDe(r, "hoy");

    // Cierran a las 10; la última entrega posible es a las 9:30.
    expect(hoy[hoy.length - 1]).toBe("9:30 pm");
  });

  it("la hora exacta de apertura sí se ofrece", () => {
    // Antes de abrir, con 0 de anticipación, el suelo es la propia apertura.
    const r = diasConFranjas(dias(TARDE, TARDE), enBogota(HOY, "10:00"), 0);

    expect(horasDe(r, "hoy")[0]).toBe("3:00 pm");
  });

  it("un turno partido deja un hueco en medio y no franjas en el descanso", () => {
    const partido = [
      { abre: "08:00:00", cierra: "10:00:00" },
      { abre: "15:00:00", cierra: "17:00:00" },
    ];
    const r = diasConFranjas(dias(partido, partido), enBogota(HOY, "06:00"), 0);

    expect(horasDe(r, "hoy")).toEqual([
      "8:00 am",
      "8:30 am",
      "9:00 am",
      "9:30 am",
      "3:00 pm",
      "3:30 pm",
      "4:00 pm",
      "4:30 pm",
    ]);
  });

  it("si hoy está cerrado, solo devuelve mañana", () => {
    const r = diasConFranjas(dias([], TARDE), enBogota(HOY, "12:00"), 45);

    expect(r.map((d) => d.dia)).toEqual(["manana"]);
    expect(horasDe(r, "manana")[0]).toBe("3:00 pm");
  });

  it("si mañana está cerrado, solo devuelve hoy", () => {
    const r = diasConFranjas(dias(TARDE, []), enBogota(HOY, "16:00"), 45);

    expect(r.map((d) => d.dia)).toEqual(["hoy"]);
  });

  it("si ya pasó la última hora de hoy, hoy desaparece de la lista", () => {
    // A las 9:40 pm, con 45 min de colchón, no queda ninguna franja antes de las 10.
    const r = diasConFranjas(dias(TARDE, TARDE), enBogota(HOY, "21:40"), 45);

    expect(r.map((d) => d.dia)).toEqual(["manana"]);
  });

  it("sin horario ni hoy ni mañana no ofrece nada", () => {
    expect(diasConFranjas(dias([], []), enBogota(HOY, "16:00"), 45)).toEqual([]);
  });

  it("la etiqueta y el instante son la misma hora, en Bogotá y no en UTC", () => {
    const r = diasConFranjas(dias(TARDE, TARDE), enBogota(HOY, "15:00"), 45);
    const cuatro = horasDe(r, "hoy").indexOf("4:00 pm");
    const franja = r.find((d) => d.dia === "hoy")!.franjas[cuatro];

    // Las 4 pm de Bogotá son las 21:00Z del mismo día: si esto se guardara como "16:00Z", el
    // pedido saldría a la calle cinco horas antes.
    expect(franja.instante.toISOString()).toBe("2026-01-01T21:00:00.000Z");
  });

  it("una franja de la noche cruza a UTC del día siguiente sin cambiar de día en Bogotá", () => {
    const r = diasConFranjas(dias(TARDE, TARDE), enBogota(HOY, "20:00"), 45);
    const franja = r.find((d) => d.dia === "hoy")!.franjas.at(-1)!;

    expect(franja.etiqueta).toBe("9:30 pm");
    expect(franja.instante.toISOString()).toBe("2026-01-02T02:30:00.000Z");
  });

  it("un día fuera del horizonte de hoy y mañana se descarta", () => {
    const pasado = [{ fecha: "2025-12-31", rangos: TARDE }, ...dias(TARDE, TARDE)];
    const r = diasConFranjas(pasado, enBogota(HOY, "16:00"), 45);

    expect(r.map((d) => d.fecha)).toEqual([HOY, MANANA]);
  });
});
