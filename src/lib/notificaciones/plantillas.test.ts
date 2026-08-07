import { describe, expect, it } from "vitest";
import { instanteEnBogota } from "@/lib/horario";
import {
  cambioEstado,
  cuandoCorto,
  horaCorta,
  llevaAviso,
  pedidoParaDomiciliario,
} from "./plantillas";
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

// `preparando` es el mensaje de la aceptación: aceptar un pedido lo pone ahí de una vez, y
// como ya no se avisa en `nuevo`, este es el PRIMERO que recibe el cliente. Por eso carga el
// resumen que antes iba en el de "recibimos tu pedido".
describe("cambioEstado al aceptar", () => {
  it("dice que fue aceptado y que está en preparación", () => {
    const texto = cambioEstado("preparando", PEDIDO, TIENDA)!;

    expect(texto).toContain("aceptado");
    expect(texto).toContain("en preparación");
    expect(texto).not.toContain("pendiente de confirmar");
  });

  it("lleva el número, el total y el link de seguimiento", () => {
    const texto = cambioEstado("preparando", PEDIDO, TIENDA)!;

    expect(texto).toContain("#124");
    expect(texto).toContain("$41.000");
    expect(texto).toContain(`https://cronchy.co/pedido/${"a".repeat(32)}`);
  });

  // Sin hora elegida el mensaje no puede callarse: una línea ausente se lee como un olvido.
  it("dice cuándo llega también cuando es para ya", () => {
    expect(cambioEstado("preparando", PEDIDO, TIENDA)).toContain("lo antes posible");
    expect(
      cambioEstado("preparando", { ...PEDIDO, tipo: "recoger" }, TIENDA),
    ).toContain("*Listo:*");
  });

  // Un pedido guardado en el estado retirado tiene que poder avisarse igual, y con el mismo
  // contenido: para el cliente `aceptado` y `preparando` siempre fueron la misma noticia.
  it("el estado retirado `aceptado` dice lo mismo", () => {
    expect(cambioEstado("aceptado", PEDIDO, TIENDA)).toBe(
      cambioEstado("preparando", PEDIDO, TIENDA),
    );
  });
});

/**
 * El mensaje del domiciliario es el único que mueve plata en la calle: si dice mal cuánto cobrar
 * —o dice que cobre algo ya pagado— nadie se entera hasta que el cliente reclama.
 */
describe("pedidoParaDomiciliario", () => {
  const DOMI = {
    numero: 28,
    clienteNombre: "Wilson Jimenez",
    clienteTelefono: "3116435036",
    direccion: "Cra 11a #93A-22",
    barrio: "Balmoral",
    indicaciones: "al frente del farmacetodo",
    ubicacion: { lat: 4.34, lng: -74.36 },
    total: 59500,
    metodoPago: "efectivo",
    pagaCon: 70000,
    pagado: false,
    tokenEntrega: "f".repeat(32),
  };

  const MEDIODIA = new Date("2025-12-09T17:00:00Z"); // 12:00 en Bogotá

  it("lleva lo que hace falta para llegar", () => {
    const texto = pedidoParaDomiciliario(DOMI, TIENDA, MEDIODIA);

    expect(texto).toContain("#28");
    expect(texto).toContain("Wilson Jimenez");
    expect(texto).toContain("3116435036");
    expect(texto).toContain("Cra 11a #93A-22");
    expect(texto).toContain("Balmoral");
    expect(texto).toContain("al frente del farmacetodo");
    expect(texto).toContain("maps.google.com");
    expect(texto).toContain(`https://cronchy.co/entrega/${"f".repeat(32)}`);
  });

  it("calcula la devuelta", () => {
    const texto = pedidoParaDomiciliario(DOMI, TIENDA, MEDIODIA);

    expect(texto).toContain("*COBRAR:* $59.500 en efectivo");
    expect(texto).toContain("*Paga con:* $70.000");
    expect(texto).toContain("*Devuelta:* $10.500");
  });

  it("sin `pagaCon` no habla de devuelta", () => {
    const texto = pedidoParaDomiciliario({ ...DOMI, pagaCon: null }, TIENDA, MEDIODIA);

    expect(texto).toContain("*COBRAR:* $59.500");
    expect(texto).not.toContain("Devuelta");
    expect(texto).not.toContain("Paga con");
  });

  // El cliente escribió un billete menor que el total. Se muestra tal cual y no se inventa una
  // devuelta negativa — mismo criterio que el panel.
  it("no inventa una devuelta negativa", () => {
    const texto = pedidoParaDomiciliario({ ...DOMI, pagaCon: 50000 }, TIENDA, MEDIODIA);

    expect(texto).toContain("*Paga con:* $50.000");
    expect(texto).not.toContain("Devuelta");
  });

  // Cobrar un pedido ya pagado es un incidente con el cliente. El aviso va solo, sin ninguna
  // cifra al lado que se pueda leer como algo a recibir.
  it("un pedido ya pagado dice NO COBRAR y ninguna cifra", () => {
    const texto = pedidoParaDomiciliario(
      { ...DOMI, metodoPago: "nequi", pagaCon: null, pagado: true },
      TIENDA,
      MEDIODIA,
    );

    expect(texto).toContain("*NO COBRAR* — ya pagó por Nequi");
    expect(texto).not.toContain("COBRAR:");
    expect(texto).not.toContain("$59.500");
  });

  // No arma el pedido, lo lleva. Y el texto viaja dentro de una URL `wa.me`, que se rompe si crece.
  it("no lleva el detalle de productos y cabe en un link de WhatsApp", () => {
    const texto = pedidoParaDomiciliario(DOMI, TIENDA, MEDIODIA);

    expect(texto).not.toContain("▼");
    expect(encodeURIComponent(texto).length).toBeLessThan(1800);
  });

  it("un pedido sin pin sale sin línea de Maps, no roto", () => {
    const texto = pedidoParaDomiciliario({ ...DOMI, ubicacion: null }, TIENDA, MEDIODIA);

    expect(texto).not.toContain("maps.google.com");
    expect(texto).toContain("Cra 11a #93A-22");
  });

  it("solo nombra a quien recibe si es otra persona", () => {
    expect(pedidoParaDomiciliario(DOMI, TIENDA, MEDIODIA)).not.toContain("Recibe:");
    expect(
      pedidoParaDomiciliario({ ...DOMI, recibeNombre: "Ana" }, TIENDA, MEDIODIA),
    ).toContain("*Recibe:* Ana");
  });

  // Un "buena tarde" fijo a las ocho de la noche delata que lo escribió una máquina.
  it("saluda según la hora de Bogotá", () => {
    const aLas = (iso: string) => pedidoParaDomiciliario(DOMI, TIENDA, new Date(iso));

    expect(aLas("2025-12-09T13:00:00Z")).toContain("Buenos días"); // 8:00 am
    expect(aLas("2025-12-09T20:00:00Z")).toContain("Buenas tardes"); // 3:00 pm
    expect(aLas("2025-12-10T02:00:00Z")).toContain("Buenas noches"); // 9:00 pm
  });
});

describe("llevaAviso", () => {
  // Se pregunta sin armar el texto porque el candado de idempotencia (regla 11) se cierra
  // ANTES de enviar. Antes esto se resolvía con un pedido de mentira, y reventó en cuanto la
  // plantilla de la aceptación empezó a leer el total.
  it("es cierto para los estados que tienen mensaje", () => {
    for (const estado of ["aceptado", "preparando", "en_camino", "listo", "cancelado"] as const) {
      expect(llevaAviso(estado)).toBe(true);
    }
  });

  // Los dos estados mudos, cada uno por su motivo: en `nuevo` nadie ha mirado el pedido
  // todavía, y en `entregado` el cliente ya tiene la comida en la mano.
  it("es falso para `nuevo` y `entregado`, que no llevan mensaje", () => {
    expect(llevaAviso("nuevo")).toBe(false);
    expect(llevaAviso("entregado")).toBe(false);
    expect(cambioEstado("nuevo", PEDIDO, TIENDA)).toBeNull();
    expect(cambioEstado("entregado", PEDIDO, TIENDA)).toBeNull();
  });

  it("no arma el texto para responder", () => {
    // Si lo armara, la plantilla de la aceptación leería el total y esto lanzaría.
    expect(() => llevaAviso("preparando")).not.toThrow();
  });
});
