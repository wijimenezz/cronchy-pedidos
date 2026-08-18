import { describe, expect, it } from "vitest";
import { instanteEnBogota } from "@/lib/horario";
import {
  cambioEstado,
  cuandoCorto,
  horaCorta,
  llevaAviso,
  pedidoNuevoTelegram,
  pedidoParaDomiciliario,
} from "./plantillas";
import type { PedidoParaMensaje, PedidoParaTelegram } from "./plantillas";

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
  descuento: 0,
  total: 41000,
  metodoPago: "efectivo",
  pagado: false,
};

const TIENDA = { nombre: "Cronchy", baseUrl: "https://cronchy.co" };

/** Lo que promete la tienda en "lo antes posible", tal como se edita en el panel. */
const ESTIMADO = { min: 30, max: 45 };

/** 12:00 del 14 de agosto de 2026 en Bogotá. La fecha del mensaje no puede depender del reloj. */
const CUANDO_SE_ACEPTA = new Date("2026-08-14T17:00:00Z");

function aceptacion(pedido: PedidoParaMensaje = PEDIDO): string {
  return cambioEstado("preparando", pedido, TIENDA, ESTIMADO, CUANDO_SE_ACEPTA)!;
}

// `preparando` es el mensaje de la aceptación: aceptar un pedido lo pone ahí de una vez, y
// como ya no se avisa en `nuevo`, este es el PRIMERO que recibe el cliente. Por eso carga el
// resumen que antes iba en el de "recibimos tu pedido".
describe("cambioEstado al aceptar", () => {
  it("dice que fue aceptado y que está en preparación", () => {
    const texto = aceptacion();

    expect(texto).toContain("aceptado");
    expect(texto).toContain("en preparación");
    expect(texto).not.toContain("pendiente de confirmar");
  });

  it("lleva el número, el total y el link de seguimiento", () => {
    const texto = aceptacion();

    expect(texto).toContain("#124");
    expect(texto).toContain("*Total a Pagar:* $41.000");
    expect(texto).toContain(`https://cronchy.co/pedido/${"a".repeat(32)}`);
  });

  /**
   * El desglose entero, que es la razón de ser de este mensaje: el cliente acaba de decidir
   * gastar esa plata y quiere ver de qué se compone.
   *
   * Las cifras salen del snapshot y tienen que cuadrar solas. Si algún día no cuadran, el
   * pedido está mal escrito y el cliente lo va a leer antes que nadie.
   */
  it("desglosa la plata y las cifras cuadran", () => {
    const texto = aceptacion();

    expect(texto).toContain("*Valor Productos:* $35.000");
    expect(texto).toContain("*Costo Domicilio:* $6.000");
    expect(texto).toContain("*Descuento:* $0");
    expect(texto).toContain("*Propina:* $0");
    expect(texto).toContain("*Total a Pagar:* $41.000");
    expect(PEDIDO.subtotal + PEDIDO.costoDomicilio - PEDIDO.descuento).toBe(PEDIDO.total);
  });

  it("dice con qué se paga y si ya está pagado", () => {
    expect(aceptacion()).toContain("*Método de Pago:* Efectivo");
    expect(aceptacion()).toContain("*Estado del Pago:* Pendiente");

    // El enum sigue diciendo `nequi`; el rótulo es el que el cliente reconoce, como en el checkout.
    const porNequi = aceptacion({ ...PEDIDO, metodoPago: "nequi", pagado: true });
    expect(porNequi).toContain("*Método de Pago:* Nequi o Bre-B");
    expect(porNequi).toContain("*Estado del Pago:* Pagado");
  });

  it("lleva el nombre y el teléfono con los que quedó el pedido", () => {
    const texto = aceptacion();

    expect(texto).toContain("*Cliente:* Wilson");
    expect(texto).toContain("*Teléfono:* 3116435036");
  });

  // Sin hora elegida el mensaje no puede callarse: una línea ausente se lee como un olvido.
  it("dice cuándo llega también cuando es para ya, con el rango que promete la tienda", () => {
    expect(aceptacion()).toContain("*Llega:* lo antes posible (30-45 min)");
  });

  // El rango se sube desde el panel el día que la cocina va lenta, y el mensaje va detrás.
  it("el rango sale de la tienda y no de una constante", () => {
    const texto = cambioEstado(
      "preparando",
      PEDIDO,
      TIENDA,
      { min: 45, max: 90 },
      CUANDO_SE_ACEPTA,
    )!;

    expect(texto).toContain("(45-90 min)");
  });

  // Con hora elegida, el rango sobra: diría dos cosas distintas del mismo pedido.
  it("un pedido programado dice su hora y no el rango", () => {
    const texto = aceptacion({
      ...PEDIDO,
      horaEntregaEstimada: new Date("2026-08-15T00:00:00Z"), // 7:00 pm del 14 en Bogotá
    });

    expect(texto).toContain("*Llega:* hoy 7:00 pm");
    expect(texto).not.toContain("min)");
  });

  it("la fecha de entrega es la de hoy cuando el pedido es para ya", () => {
    expect(aceptacion()).toContain("*Fecha de entrega:* 14 de agosto de 2026");
  });

  it("la fecha de entrega es la programada cuando la hay", () => {
    const texto = aceptacion({
      ...PEDIDO,
      horaEntregaEstimada: new Date("2026-08-15T15:00:00Z"), // 10:00 am del 15 en Bogotá
    });

    expect(texto).toContain("*Fecha de entrega:* 15 de agosto de 2026");
  });

  // Sin domicilio no hay línea de domicilio: ahí ese concepto no existe.
  it("un pedido para recoger no habla de domicilio y dice Listo", () => {
    const texto = aceptacion({ ...PEDIDO, tipo: "recoger", costoDomicilio: 0, total: 35000 });

    expect(texto).toContain("*Tipo:* Recoger en tienda");
    expect(texto).not.toContain("Costo Domicilio");
    expect(texto).toContain("*Listo:* lo antes posible (30-45 min)");
  });

  // Un pedido guardado en el estado retirado tiene que poder avisarse igual, y con el mismo
  // contenido: para el cliente `aceptado` y `preparando` siempre fueron la misma noticia.
  it("el estado retirado `aceptado` dice lo mismo", () => {
    expect(cambioEstado("aceptado", PEDIDO, TIENDA, ESTIMADO, CUANDO_SE_ACEPTA)).toBe(
      aceptacion(),
    );
  });

  // Es el mensaje más largo que se le manda al cliente, y viaja dentro de una URL `wa.me`.
  it("cabe en un link de WhatsApp", () => {
    expect(encodeURIComponent(aceptacion()).length).toBeLessThan(1800);
  });
});

describe("cambioEstado al salir el pedido", () => {
  const enCamino = () => cambioEstado("en_camino", PEDIDO, TIENDA, ESTIMADO, CUANDO_SE_ACEPTA)!;

  it("avisa, agradece y deja el link de seguimiento", () => {
    const texto = enCamino();

    expect(texto).toContain("ya va en camino");
    expect(texto).toContain("Gracias por tu Compra");
    expect(texto).toContain(`https://cronchy.co/pedido/${"a".repeat(32)}`);
    expect(texto).toContain("¡Sonríe que la Vida es Churrisima!");
  });

  // Este mensaje no repite el recibo: el cliente ya lo recibió al aceptarle el pedido.
  it("no repite el desglose de la aceptación", () => {
    expect(enCamino()).not.toContain("Valor Productos");
    expect(enCamino()).not.toContain("Total a Pagar");
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
    subtotal: 53500,
    costoDomicilio: 6000,
    descuento: 0,
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

  /**
   * Con cupón, el desglose deja de sumar el total: $53.500 + $6.000 son $59.500, pero hay que
   * cobrar $54.150. El domiciliario lee las dos cifras de arriba como algo que compone lo de
   * abajo, así que sin la línea del descuento parece que el "COBRAR" está mal.
   */
  it("con descuento, el desglose lo dice y vuelve a cuadrar", () => {
    const texto = pedidoParaDomiciliario(
      { ...DOMI, descuento: 5350, total: 54150, pagaCon: null },
      TIENDA,
      MEDIODIA,
    );

    expect(texto).toContain("*COBRAR:* $54.150 en efectivo");
    expect(texto).toContain("*Descuento:* -$5.350");
  });

  // Sin descuento no se escribe la línea: en un mensaje que viaja dentro de una URL `wa.me`, un
  // "-$0" es un renglón que no dice nada y ocupa.
  it("sin descuento no aparece la línea", () => {
    expect(pedidoParaDomiciliario(DOMI, TIENDA, MEDIODIA)).not.toContain("Descuento");
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

  /**
   * El desglose explica de qué se compone lo que cobra, pero **va debajo de la línea de cobro y
   * nunca en su lugar**: quien lee esto de una ojeada en la moto tiene que encontrar primero una
   * sola cifra, y solo después el detalle. Dos cifras sueltas se leen como algo que hay que sumar.
   */
  it("desglosa el cobro sin tapar la cifra que se cobra", () => {
    const texto = pedidoParaDomiciliario(DOMI, TIENDA, MEDIODIA);

    expect(texto).toContain("*Valor Productos:* $53.500");
    expect(texto).toContain("*Costo Domicilio:* $6.000");
    expect(texto.indexOf("*COBRAR:*")).toBeLessThan(texto.indexOf("*Valor Productos:*"));
    expect(DOMI.subtotal + DOMI.costoDomicilio).toBe(DOMI.total);
  });

  // El desglose no puede haber convertido un pedido pagado en uno que parece cobrable.
  it("un pedido pagado desglosa igual, pero sigue diciendo NO COBRAR", () => {
    const texto = pedidoParaDomiciliario(
      { ...DOMI, metodoPago: "nequi", pagaCon: null, pagado: true },
      TIENDA,
      MEDIODIA,
    );

    expect(texto).toContain("*NO COBRAR*");
    expect(texto).toContain("*Valor Productos:* $53.500");
    expect(texto.indexOf("NO COBRAR")).toBeLessThan(texto.indexOf("*Valor Productos:*"));
  });

  it("pide la confirmación de entrega y se despide", () => {
    const texto = pedidoParaDomiciliario(DOMI, TIENDA, MEDIODIA);

    expect(texto).toContain("Cuando entregues, confirma aquí Por Favor:");
    expect(texto.trimEnd().endsWith("Gracias!!")).toBe(true);
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
    expect(cambioEstado("nuevo", PEDIDO, TIENDA, ESTIMADO)).toBeNull();
    expect(cambioEstado("entregado", PEDIDO, TIENDA, ESTIMADO)).toBeNull();
  });

  it("no arma el texto para responder", () => {
    // Si lo armara, la plantilla de la aceptación leería el total y esto lanzaría.
    expect(() => llevaAviso("preparando")).not.toThrow();
  });
});

/**
 * El aviso interno. Lo que se prueba aquí no es el texto bonito, son las dos cosas que lo hacen
 * útil o inútil: **qué cabe en las dos primeras líneas** —lo único que se lee en una pantalla
 * bloqueada— y que el HTML no se rompa con lo que escriba el cliente, porque un `<` suelto hace
 * que Telegram rechace el mensaje entero y el aviso no llegue.
 */
describe("pedidoNuevoTelegram", () => {
  const A_LAS_7 = new Date("2026-08-14T00:42:00Z"); // 7:42 pm del 13 en Bogotá

  const NUEVO: PedidoParaTelegram = {
    numero: 142,
    tipo: "domicilio",
    programadoPara: null,
    clienteNombre: "Laura Gómez",
    clienteTelefono: "3001234567",
    esClienteNuevo: true,
    direccion: "Cra 12 #8-45, Apto 302 Torre B",
    barrio: "Pekín",
    indicaciones: "portería azul junto a la papelería",
    zonaNombre: "Centro",
    items: [
      {
        nombre: "Cronchy Churros",
        cantidad: 2,
        subtotal: 22000,
        modificadores: [
          { grupo: "Salsa incluida", nombre: "Arequipe", cantidad: 1, precio: 0 },
          { grupo: "Toppings", nombre: "Oreo", cantidad: 2, precio: 2000 },
        ],
      },
      { nombre: "Malteada", cantidad: 1, subtotal: 16000, modificadores: [] },
    ],
    costoDomicilio: 6000,
    total: 47000,
    metodoPago: "efectivo",
    pagaCon: 50000,
    pagado: false,
    notas: "Porfa el arequipe aparte",
    creadoEn: A_LAS_7,
  };

  const dos = (texto: string) => texto.split("\n").slice(0, 2).join("\n");

  it("resuelve en dos líneas si hay que salir corriendo y por cuánto", () => {
    const { texto } = pedidoNuevoTelegram(NUEVO, TIENDA);

    expect(dos(texto)).toBe(
      "<b>🛵 DOMICILIO · #142 · $47.000</b>\n💵 EFECTIVO — paga con $50.000, devolver $3.000",
    );
  });

  // Misma doctrina que el payload del Web Push: quien pasa al lado del mostrador no tiene por qué
  // leer el nombre ni la dirección de nadie en una pantalla bloqueada.
  it("no asoma datos del cliente en lo que se ve bloqueado", () => {
    const { texto } = pedidoNuevoTelegram(NUEVO, TIENDA);

    expect(dos(texto)).not.toContain("Laura");
    expect(dos(texto)).not.toContain("Cra 12");
    expect(dos(texto)).not.toContain("3001234567");
  });

  // Es lo único que impide que alguien fría veinte churros doce horas antes.
  it("un pedido programado antepone su línea, sola", () => {
    const { texto } = pedidoNuevoTelegram(
      { ...NUEVO, programadoPara: new Date("2026-08-14T01:00:00Z") },
      TIENDA,
      A_LAS_7,
    );

    expect(texto.split("\n")[0]).toBe("⏰ <b>PROGRAMADO — hoy 8:00 pm</b>");
    expect(texto.split("\n")[1]).toContain("DOMICILIO");
  });

  it("lleva los items con sus modificadores y la nota del pedido", () => {
    const { texto } = pedidoNuevoTelegram(NUEVO, TIENDA);

    expect(texto).toContain("🧾 2× Cronchy Churros con Arequipe, Oreo ×2");
    expect(texto).toContain("   1× Malteada");
    expect(texto).toContain('📝 "Porfa el arequipe aparte"');
  });

  it("lleva dónde, con qué zona cobró y la referencia", () => {
    const { texto } = pedidoNuevoTelegram(NUEVO, TIENDA);

    expect(texto).toContain("📍 Cra 12 #8-45, Apto 302 Torre B");
    expect(texto).toContain("   Pekín · Centro ($6.000)");
    expect(texto).toContain("   Ref: portería azul junto a la papelería");
  });

  it("lleva a quién llamar, a qué hora entró y si es la primera vez", () => {
    const { texto } = pedidoNuevoTelegram(NUEVO, TIENDA);

    expect(texto).toContain("👤 Laura Gómez · 3001234567");
    expect(texto).toContain("🕐 7:42 pm · Cliente nuevo");
    expect(pedidoNuevoTelegram({ ...NUEVO, esClienteNuevo: false }, TIENDA).texto).not.toContain(
      "Cliente nuevo",
    );
  });

  it("en recoger no hay nada que ubicar", () => {
    const { texto } = pedidoNuevoTelegram({ ...NUEVO, tipo: "recoger" }, TIENDA);

    expect(texto).toContain("🏪 RECOGE EN TIENDA");
    expect(texto).not.toContain("📍");
    expect(texto).not.toContain("Ref:");
  });

  it("un pedido pagado no habla de devuelta", () => {
    const { texto } = pedidoNuevoTelegram(
      { ...NUEVO, metodoPago: "nequi", pagaCon: null, pagado: true },
      TIENDA,
    );

    expect(texto).toContain("✅ NEQUI O BRE-B — comprobante adjunto");
    expect(texto).not.toContain("devolver");
  });

  // Recoger se paga por adelantado: si llega sin comprobante hay un pago que perseguir, y decir
  // "contra entrega" sería justo lo contrario de lo que hay que hacer.
  it("avisa cuando falta el comprobante en vez de darlo por contra entrega", () => {
    const { texto } = pedidoNuevoTelegram(
      { ...NUEVO, metodoPago: "nequi", pagaCon: null, pagado: false },
      TIENDA,
    );

    expect(texto).toContain("⚠️ NEQUI O BRE-B — SIN comprobante");
  });

  it("sin billete declarado no promete una devuelta que nadie calculó", () => {
    const { texto } = pedidoNuevoTelegram({ ...NUEVO, pagaCon: null }, TIENDA);

    expect(texto).toContain("💵 EFECTIVO — contra entrega");
    expect(texto).not.toContain("devolver");
  });

  // Un `<` en el nombre no se ve raro: Telegram rechaza el mensaje ENTERO y el aviso no llega.
  it("escapa el HTML de todo lo que escribió el cliente", () => {
    const { texto } = pedidoNuevoTelegram(
      {
        ...NUEVO,
        clienteNombre: "Ana <la del 302>",
        direccion: "Calle 5 & 6",
        notas: "sin <crema>",
      },
      TIENDA,
    );

    expect(texto).toContain("Ana &lt;la del 302&gt;");
    expect(texto).toContain("Calle 5 &amp; 6");
    expect(texto).toContain("sin &lt;crema&gt;");
    // Las etiquetas del propio mensaje sí tienen que sobrevivir.
    expect(texto).toContain("<b>🛵 DOMICILIO");
  });

  // Pasarse de 4.096 no recorta el mensaje: Telegram lo rechaza y no llega nada.
  it("un pedido enorme se recorta en vez de no llegar", () => {
    const muchos = Array.from({ length: 200 }, () => NUEVO.items[0]);
    const { texto } = pedidoNuevoTelegram({ ...NUEVO, items: muchos }, TIENDA);

    expect(texto.length).toBeLessThanOrEqual(4000);
  });

  it("el botón apunta al pedido en el panel", () => {
    expect(pedidoNuevoTelegram(NUEVO, TIENDA).urlPanel).toBe(
      "https://cronchy.co/admin/pedidos/142",
    );
  });
});
