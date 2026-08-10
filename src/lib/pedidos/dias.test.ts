import { describe, expect, it } from "vitest";
import {
  MAXIMO_DIAS_RANGO,
  contarDias,
  diaAnterior,
  diaDeBogota,
  diaPedido,
  diaSiguiente,
  diasDelRango,
  enHoraDeBogota,
  rangoDeDias,
  rangoDelDia,
  rangoPedido,
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

// Excel no guarda zona horaria, así que la corrección se hace al escribir. Si esto se rompe, los
// pedidos de la noche aparecen en el día siguiente y solo se descubre al cuadrar el mes.
describe("enHoraDeBogota", () => {
  it("deja la hora de Bogotá en los componentes UTC", () => {
    // 3:00 pm en Bogotá = 20:00 UTC.
    expect(enHoraDeBogota(new Date("2025-12-09T20:00:00Z")).toISOString()).toBe(
      "2025-12-09T15:00:00.000Z",
    );
  });

  it("una venta de las 11:30 pm no se corre al día siguiente", () => {
    // 9 de diciembre 23:30 en Bogotá = 10 de diciembre 04:30 UTC.
    expect(enHoraDeBogota(new Date("2025-12-10T04:30:00Z")).toISOString()).toBe(
      "2025-12-09T23:30:00.000Z",
    );
  });

  it("conserva los segundos", () => {
    expect(enHoraDeBogota(new Date("2025-12-09T20:00:29Z")).getUTCSeconds()).toBe(29);
  });

  it("el día que resulta es el mismo que dice `diaDeBogota`", () => {
    const instante = new Date("2025-12-10T04:30:00Z");
    expect(enHoraDeBogota(instante).toISOString().slice(0, 10)).toBe(diaDeBogota(instante));
  });
});

describe("rangoDeDias", () => {
  it("abarca desde la medianoche del primero hasta la del siguiente al último", () => {
    const { desde, hasta } = rangoDeDias("2025-12-05", "2025-12-09");

    expect(desde.toISOString()).toBe("2025-12-05T05:00:00.000Z");
    expect(hasta.toISOString()).toBe("2025-12-10T05:00:00.000Z");
  });

  // El último día tiene que entrar entero: si `hasta` fuera su medianoche, se perdería el turno
  // completo del día que el usuario acaba de pedir.
  it("el último día entra entero", () => {
    const { hasta } = rangoDeDias("2025-12-05", "2025-12-09");
    const casiMedianocheDel9 = new Date("2025-12-10T04:59:59Z");

    expect(casiMedianocheDel9 < hasta).toBe(true);
  });

  it("un rango de un solo día es igual al de ese día", () => {
    expect(rangoDeDias("2025-12-09", "2025-12-09")).toEqual(rangoDelDia("2025-12-09"));
  });
});

describe("contarDias", () => {
  it("cuenta los dos extremos", () => {
    expect(contarDias("2025-12-09", "2025-12-09")).toBe(1);
    expect(contarDias("2025-12-05", "2025-12-09")).toBe(5);
  });

  it("cruza el cambio de mes y el de año", () => {
    expect(contarDias("2025-11-28", "2025-12-02")).toBe(5);
    expect(contarDias("2025-12-30", "2026-01-02")).toBe(4);
  });

  it("cuenta el 29 de febrero de un bisiesto", () => {
    expect(contarDias("2024-02-28", "2024-03-01")).toBe(3);
    expect(contarDias("2025-02-28", "2025-03-01")).toBe(2);
  });
});

describe("diasDelRango", () => {
  it("los enumera todos, incluidos los extremos", () => {
    expect(diasDelRango("2025-12-07", "2025-12-09")).toEqual([
      "2025-12-07",
      "2025-12-08",
      "2025-12-09",
    ]);
  });

  it("un solo día es una lista de uno", () => {
    expect(diasDelRango("2025-12-09", "2025-12-09")).toEqual(["2025-12-09"]);
  });

  it("cruza el cambio de año", () => {
    expect(diasDelRango("2025-12-31", "2026-01-02")).toEqual([
      "2025-12-31",
      "2026-01-01",
      "2026-01-02",
    ]);
  });

  it("devuelve tantos días como cuenta `contarDias`", () => {
    expect(diasDelRango("2025-11-28", "2025-12-02")).toHaveLength(contarDias("2025-11-28", "2025-12-02"));
  });
});

describe("rangoPedido", () => {
  const HOY = "2025-12-09";

  it("deja pasar un rango normal", () => {
    expect(rangoPedido("2025-12-05", "2025-12-09", HOY)).toEqual({
      desde: "2025-12-05",
      hasta: "2025-12-09",
      dias: 5,
      recortado: false,
    });
  });

  // Escribir "del 9 al 5" es un desliz obvio: se corrige en vez de rechazarlo, porque esto
  // alimenta una descarga y un error a mitad de camino se lee como que la app se rompió.
  it("ordena un rango invertido", () => {
    const rango = rangoPedido("2025-12-09", "2025-12-05", HOY);

    expect(rango.desde).toBe("2025-12-05");
    expect(rango.hasta).toBe("2025-12-09");
  });

  it("sin parámetros es solo hoy", () => {
    expect(rangoPedido(undefined, undefined, HOY)).toEqual({
      desde: HOY,
      hasta: HOY,
      dias: 1,
      recortado: false,
    });
  });

  it("recorta el futuro a hoy", () => {
    const rango = rangoPedido("2025-12-05", "2030-01-01", HOY);

    expect(rango.hasta).toBe(HOY);
    expect(rango.dias).toBe(5);
  });

  // Se conserva `hasta` y se mueve `desde`: quien pide un rango enorme quiere lo más reciente,
  // no los tres meses de hace dos años.
  it("un rango gigante se recorta por el extremo viejo", () => {
    const rango = rangoPedido("2020-01-01", HOY, HOY);

    expect(rango.hasta).toBe(HOY);
    expect(rango.dias).toBe(MAXIMO_DIAS_RANGO);
    expect(rango.recortado).toBe(true);
    expect(contarDias(rango.desde, rango.hasta)).toBe(MAXIMO_DIAS_RANGO);
  });

  it("justo en el tope no se recorta", () => {
    const desde = "2025-09-09"; // 92 días hasta el 9 de diciembre
    expect(contarDias(desde, HOY)).toBe(MAXIMO_DIAS_RANGO);

    const rango = rangoPedido(desde, HOY, HOY);
    expect(rango.recortado).toBe(false);
    expect(rango.desde).toBe(desde);
  });
});
