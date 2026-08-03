import { describe, expect, it } from "vitest";
import { instanteEnBogota } from "@/lib/horario";
import { cambioEstado, cuandoCorto, horaCorta, llevaAviso } from "./plantillas";
import type { PedidoParaMensaje } from "./plantillas";

/**
 * Los dos formateadores de hora, que es donde un error se lee como una promesa distinta de la
 * que se hizo. Todo lo demás de este módulo es concatenar texto; esto tiene lógica de zona
 * horaria y de frontera de día, que es justo lo que se rompe en silencio.
 */

function enBogota(fecha: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return instanteEnBogota(fecha, h * 60 + m);
}

describe("horaCorta", () => {
  it("usa 12 horas con am/pm en minúscula", () => {
    expect(horaCorta(enBogota("2026-01-01", "19:00"))).toBe("7:00 pm");
    expect(horaCorta(enBogota("2026-01-01", "09:30"))).toBe("9:30 am");
  });

  it("el mediodía es pm y la medianoche am", () => {
    expect(horaCorta(enBogota("2026-01-01", "12:00"))).toBe("12:00 pm");
    expect(horaCorta(enBogota("2026-01-01", "00:00"))).toBe("12:00 am");
  });

  it("es la hora de Bogotá, no la del proceso ni UTC", () => {
    // 2026-01-02T02:30:00Z son las 9:30 pm del 1 en Bogotá (UTC-5).
    expect(horaCorta(new Date("2026-01-02T02:30:00.000Z"))).toBe("9:30 pm");
  });
});

describe("cuandoCorto", () => {
  const ahora = enBogota("2026-01-01", "16:00");

  it("distingue hoy de mañana", () => {
    expect(cuandoCorto(enBogota("2026-01-01", "19:00"), ahora)).toBe("hoy 7:00 pm");
    expect(cuandoCorto(enBogota("2026-01-02", "15:00"), ahora)).toBe("mañana 3:00 pm");
  });

  it("compara días de Bogotá y no de UTC", () => {
    // A las 9 de la noche en Bogotá ya es el día siguiente en UTC. Si la comparación se
    // hiciera en UTC, este pedido para dentro de media hora diría "mañana".
    const nocheDelUno = enBogota("2026-01-01", "21:00");
    expect(cuandoCorto(enBogota("2026-01-01", "21:30"), nocheDelUno)).toBe("hoy 9:30 pm");
  });

  it("pasada la medianoche, lo de esa madrugada es hoy y lo del día anterior no", () => {
    const madrugada = enBogota("2026-01-02", "00:30");
    expect(cuandoCorto(enBogota("2026-01-02", "16:00"), madrugada)).toBe("hoy 4:00 pm");
    expect(cuandoCorto(enBogota("2026-01-03", "16:00"), madrugada)).toBe("mañana 4:00 pm");
  });

  it("cruza el fin de mes sin inventarse un día 32", () => {
    const ultimoDeEnero = enBogota("2026-01-31", "20:00");
    expect(cuandoCorto(enBogota("2026-02-01", "15:00"), ultimoDeEnero)).toBe("mañana 3:00 pm");
  });

  it("más allá de mañana escribe la fecha, que es el caso de un pedido viejo en el panel", () => {
    expect(cuandoCorto(enBogota("2026-01-23", "19:00"), ahora)).toBe("23 enero, 7:00 pm");
  });
});

/**
 * El aviso de "recibimos tu pedido". Se prueba porque es el primer mensaje que recibe un
 * cliente del negocio y porque dice una cosa muy concreta —**pendiente de confirmar**— que
 * no se puede perder en una edición: prometer que el pedido está aceptado justo antes de
 * tener que cancelarlo por un producto agotado es peor que no mandar nada.
 */
const PEDIDO: PedidoParaMensaje = {
  numero: 124,
  tokenPublico: "a".repeat(32),
  tipo: "domicilio",
  clienteNombre: "Wilson",
  clienteTelefono: "3116435036",
  direccion: "Cra 15A # 16A-22",
  barrio: "El Caney",
  items: [{ nombre: "Cronchy Familiar", cantidad: 1, subtotal: 35000, modificadores: [] }],
  subtotal: 35000,
  costoDomicilio: 6000,
  total: 41000,
  metodoPago: "efectivo",
};

const TIENDA = { nombre: "Cronchy", baseUrl: "https://cronchy.co" };

describe("cambioEstado en 'nuevo'", () => {
  it("dice que está pendiente de confirmar, no que fue aceptado", () => {
    const texto = cambioEstado("nuevo", PEDIDO, TIENDA)!;

    expect(texto).toContain("Recibimos tu pedido");
    expect(texto).toContain("pendiente de confirmar");
    expect(texto).not.toContain("aceptado");
  });

  it("lleva el número, el total y el link de seguimiento", () => {
    const texto = cambioEstado("nuevo", PEDIDO, TIENDA)!;

    expect(texto).toContain("#124");
    expect(texto).toContain("$41.000");
    expect(texto).toContain(`https://cronchy.co/pedido/${"a".repeat(32)}`);
  });

  // Sin hora elegida el mensaje no puede callarse: una línea ausente se lee como un olvido.
  it("dice cuándo llega también cuando es para ya", () => {
    expect(cambioEstado("nuevo", PEDIDO, TIENDA)).toContain("lo antes posible");
    expect(
      cambioEstado("nuevo", { ...PEDIDO, tipo: "recoger" }, TIENDA),
    ).toContain("*Listo:*");
  });
});

describe("llevaAviso", () => {
  // Se pregunta sin armar el texto porque el candado de idempotencia (regla 11) se cierra
  // ANTES de enviar. Antes esto se resolvía con un pedido de mentira, y reventó en cuanto la
  // plantilla de `nuevo` empezó a leer el total.
  it("es cierto para los estados que tienen mensaje", () => {
    for (const estado of ["nuevo", "aceptado", "preparando", "en_camino", "listo"] as const) {
      expect(llevaAviso(estado)).toBe(true);
    }
  });

  it("no arma el texto para responder", () => {
    // Si lo armara, este objeto vacío lanzaría.
    expect(() => llevaAviso("nuevo")).not.toThrow();
  });
});
