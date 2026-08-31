import { describe, expect, it } from "vitest";
import {
  LIMITES,
  decidir,
  segundosParaReset,
  ventanaDe,
  type Cupo,
} from "./politica";

const CUPO: Cupo = { maximo: 3, ventanaSegundos: 60 };

describe("ventanaDe", () => {
  // Anclada al epoch y no al primer acceso: dos instancias serverless que atienden a la misma IP
  // tienen que calcular la MISMA ventana sin hablar entre ellas, o cada una llevaría su cuenta.
  it("dos instantes del mismo minuto caen en la misma ventana", () => {
    const a = ventanaDe(new Date("2026-08-27T15:00:03.000Z"), 60);
    const b = ventanaDe(new Date("2026-08-27T15:00:59.999Z"), 60);

    expect(a.toISOString()).toBe(b.toISOString());
    expect(a.toISOString()).toBe("2026-08-27T15:00:00.000Z");
  });

  it("un milisegundo después del corte ya es otra ventana", () => {
    const dentro = ventanaDe(new Date("2026-08-27T15:00:59.999Z"), 60);
    const fuera = ventanaDe(new Date("2026-08-27T15:01:00.000Z"), 60);

    expect(fuera.getTime() - dentro.getTime()).toBe(60_000);
  });

  it("una ventana de cinco minutos se alinea a los cinco minutos", () => {
    expect(ventanaDe(new Date("2026-08-27T15:07:30.000Z"), 300).toISOString()).toBe(
      "2026-08-27T15:05:00.000Z",
    );
  });
});

describe("decidir", () => {
  const ventana = new Date("2026-08-27T15:00:00.000Z");

  // El conteo llega YA incrementado porque el UPSERT es atómico: es "esta es la número N".
  it("la última que cabe pasa, la siguiente no", () => {
    expect(decidir(3, CUPO, ventana).permitido).toBe(true);
    expect(decidir(4, CUPO, ventana).permitido).toBe(false);
  });

  it("las restantes nunca son negativas", () => {
    expect(decidir(1, CUPO, ventana).restantes).toBe(2);
    expect(decidir(3, CUPO, ventana).restantes).toBe(0);
    expect(decidir(50, CUPO, ventana).restantes).toBe(0);
  });

  it("el reset es el final de la ventana, no un plazo desde ahora", () => {
    expect(decidir(4, CUPO, ventana).resetEn.toISOString()).toBe("2026-08-27T15:01:00.000Z");
  });
});

// **El límite conocido de la ventana fija**, escrito como test para que se lea como decisión y no
// como bug: a caballo del corte se puede colar hasta el doble del cupo en un instante. Se acepta
// porque una ventana deslizante obligaría a guardar cada petición, y nadie tumba un bcrypt con el
// doble de diez.
describe("la ventana fija deja pasar el doble en el borde", () => {
  it("tres al final de un minuto y tres al principio del siguiente pasan las seis", () => {
    const final = new Date("2026-08-27T15:00:59.000Z");
    const principio = new Date("2026-08-27T15:01:00.000Z");

    const v1 = ventanaDe(final, 60);
    const v2 = ventanaDe(principio, 60);

    expect(v1.toISOString()).not.toBe(v2.toISOString());
    // Cada ventana cuenta desde cero, así que las tres de cada lado pasan.
    expect(decidir(3, CUPO, v1).permitido).toBe(true);
    expect(decidir(3, CUPO, v2).permitido).toBe(true);
  });
});

describe("segundosParaReset", () => {
  it("redondea hacia arriba", () => {
    const reset = new Date("2026-08-27T15:01:00.000Z");

    expect(segundosParaReset(reset, new Date("2026-08-27T15:00:58.100Z"))).toBe(2);
  });

  // Un `Retry-After: 0` invita a reintentar de inmediato, que es justo lo que se quiere evitar.
  it("nunca baja de uno, ni siquiera si la ventana ya venció", () => {
    const reset = new Date("2026-08-27T15:01:00.000Z");

    expect(segundosParaReset(reset, new Date("2026-08-27T15:01:00.000Z"))).toBe(1);
    expect(segundosParaReset(reset, new Date("2026-08-27T15:05:00.000Z"))).toBe(1);
  });
});

describe("los presupuestos", () => {
  it("todos son positivos y con ventana", () => {
    for (const [nombre, cupo] of Object.entries(LIMITES)) {
      expect(cupo.maximo, nombre).toBeGreaterThan(0);
      expect(cupo.ventanaSegundos, nombre).toBeGreaterThan(0);
    }
  });

  // El polling del seguimiento son 4 por minuto, pero volver a la pestaña y recuperar la conexión
  // disparan consultas inmediatas separadas por 3 s (regla 19). Un cupo justo cortaría a alguien
  // que solo está mirando si ya salió su pedido.
  it("el seguimiento tiene margen de sobra sobre su polling", () => {
    expect(LIMITES.seguimiento.maximo).toBeGreaterThanOrEqual(20);
  });

  // El login corre bcrypt contra un hash señuelo incluso con un correo inexistente, así que cada
  // intento es CPU garantizada. Es el más estricto a propósito.
  it("el login es el más estricto por minuto", () => {
    const porMinuto = (c: Cupo) => (c.maximo / c.ventanaSegundos) * 60;

    for (const [nombre, cupo] of Object.entries(LIMITES)) {
      if (nombre === "login") continue;
      expect(porMinuto(LIMITES.login), nombre).toBeLessThan(porMinuto(cupo));
    }
  });
});
