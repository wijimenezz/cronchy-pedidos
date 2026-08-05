import { describe, expect, it } from "vitest";
import {
  diaAnterior,
  diaDeBogota,
  diaPedido,
  diaSiguiente,
  rangoDelDia,
  rotuloDeDia,
} from "./dias";

/**
 * Bogotá es UTC-5, así que las últimas cinco horas de cada día local ya son el día siguiente en
 * UTC. Ahí es donde un bug de zona horaria mueve los pedidos de la noche al turno equivocado sin
 * romper nada visible: la lista se ve completa y la caja del día sale corta.
 */
describe("diaDeBogota", () => {
  it("las 11:30 de la noche todavía son el mismo día, aunque en UTC ya sea el siguiente", () => {
    // 9 de diciembre, 23:30 en Bogotá = 10 de diciembre, 04:30 UTC.
    expect(diaDeBogota(new Date("2025-12-10T04:30:00Z"))).toBe("2025-12-09");
  });

  it("las 12:30 de la madrugada ya son el día nuevo", () => {
    // 9 de diciembre, 00:30 en Bogotá = 9 de diciembre, 05:30 UTC.
    expect(diaDeBogota(new Date("2025-12-09T05:30:00Z"))).toBe("2025-12-09");
  });

  it("la medianoche exacta abre el día, no cierra el anterior", () => {
    expect(diaDeBogota(new Date("2025-12-09T05:00:00Z"))).toBe("2025-12-09");
  });
});

describe("rangoDelDia", () => {
  it("va de medianoche a medianoche, en hora de Bogotá", () => {
    const { desde, hasta } = rangoDelDia("2025-12-09");

    expect(desde.toISOString()).toBe("2025-12-09T05:00:00.000Z");
    expect(hasta.toISOString()).toBe("2025-12-10T05:00:00.000Z");
  });

  // Si el tope fuera inclusivo, un pedido creado justo a medianoche saldría contado en los dos
  // días y la suma de la semana no cuadraría con la de los días sueltos.
  it("el tope es exclusivo: la medianoche del día siguiente ya no es de este día", () => {
    const { hasta } = rangoDelDia("2025-12-09");
    const medianoche = new Date("2025-12-10T05:00:00Z");

    expect(medianoche.getTime()).toBe(hasta.getTime());
    expect(medianoche.getTime() < hasta.getTime()).toBe(false);
    expect(diaDeBogota(medianoche)).toBe("2025-12-10");
  });

  it("el último instante del día sí entra", () => {
    const { desde, hasta } = rangoDelDia("2025-12-09");
    const casiMedianoche = new Date("2025-12-10T04:59:59Z");

    expect(casiMedianoche >= desde && casiMedianoche < hasta).toBe(true);
  });
});

// Se avanza sumando al instante y volviendo a preguntar la fecha en Bogotá, en vez de sumar 1 al
// número del día. Estos son los casos que esa decisión resuelve gratis.
describe("diaAnterior y diaSiguiente", () => {
  it("cruzan el cambio de año", () => {
    expect(diaAnterior("2026-01-01")).toBe("2025-12-31");
    expect(diaSiguiente("2025-12-31")).toBe("2026-01-01");
  });

  it("cruzan el cambio de mes", () => {
    expect(diaAnterior("2025-12-01")).toBe("2025-11-30");
    expect(diaSiguiente("2025-11-30")).toBe("2025-12-01");
  });

  it("conocen el 29 de febrero de un año bisiesto", () => {
    expect(diaAnterior("2024-03-01")).toBe("2024-02-29");
    expect(diaSiguiente("2024-02-29")).toBe("2024-03-01");
  });

  it("y que 2025 no lo tiene", () => {
    expect(diaAnterior("2025-03-01")).toBe("2025-02-28");
  });

  it("ida y vuelta devuelven el mismo día", () => {
    expect(diaAnterior(diaSiguiente("2025-12-09"))).toBe("2025-12-09");
  });
});

describe("rotuloDeDia", () => {
  it("hoy y ayer se dicen por su nombre", () => {
    expect(rotuloDeDia("2025-12-09", "2025-12-09")).toBe("Hoy");
    expect(rotuloDeDia("2025-12-08", "2025-12-09")).toBe("Ayer");
  });

  it("el resto lleva día de la semana y fecha", () => {
    // El 9 de diciembre de 2025 fue martes.
    expect(rotuloDeDia("2025-12-09", "2025-12-15")).toBe("Martes, 9 de diciembre");
  });

  it("acierta el día de la semana al otro lado de un cambio de año", () => {
    // El 1 de enero de 2025 fue miércoles.
    expect(rotuloDeDia("2025-01-01", "2025-12-15")).toBe("Miércoles, 1 de enero");
  });

  it("'ayer' también cruza el cambio de mes", () => {
    expect(rotuloDeDia("2025-11-30", "2025-12-01")).toBe("Ayer");
  });
});

// Lo que llega por la URL es entrada de usuario como cualquier otra: se valida antes de tocar la
// base. Todo lo que no sea un día pasado válido cae en hoy.
describe("diaPedido", () => {
  const HOY = "2025-12-09";

  it("deja pasar un día pasado, y hoy mismo", () => {
    expect(diaPedido("2025-12-08", HOY)).toBe("2025-12-08");
    expect(diaPedido(HOY, HOY)).toBe(HOY);
  });

  it("sin parámetro es hoy", () => {
    expect(diaPedido(undefined, HOY)).toBe(HOY);
  });

  it("una fecha con mala forma es hoy", () => {
    expect(diaPedido("basura", HOY)).toBe(HOY);
    expect(diaPedido("09/12/2025", HOY)).toBe(HOY);
    expect(diaPedido("2025-12-8", HOY)).toBe(HOY);
  });

  // Pasa el regex pero no es un día del calendario.
  it("un día que no existe es hoy", () => {
    expect(diaPedido("2025-01-32", HOY)).toBe(HOY);
    expect(diaPedido("2025-02-30", HOY)).toBe(HOY);
    expect(diaPedido("2025-13-01", HOY)).toBe(HOY);
  });

  // No hay pedidos creados mañana: una lista vacía ahí parecería un fallo del sistema.
  it("el futuro es hoy", () => {
    expect(diaPedido("2025-12-10", HOY)).toBe(HOY);
    expect(diaPedido("2030-01-01", HOY)).toBe(HOY);
  });
});
