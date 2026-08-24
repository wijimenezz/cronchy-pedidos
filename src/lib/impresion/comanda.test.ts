import { describe, expect, it } from "vitest";
import { comanda, type PedidoParaComanda } from "./comanda";
import { columnasDelTicket, lineasDelTicket, textoDelTicket } from "./pruebas/decodificar";
import type { ItemSnapshot, ModificadorSnapshot } from "@/lib/notificaciones/plantillas";

/** 3:45 pm en Bogotá. Todos los tests miran el reloj desde aquí. */
const AHORA = new Date("2026-08-21T20:45:00Z");
/** 7:00 pm del mismo día, en Bogotá. */
const ESTA_NOCHE = new Date("2026-08-22T00:00:00Z");

function mod(parcial: Partial<ModificadorSnapshot> = {}): ModificadorSnapshot {
  return { grupo: "Salsa incluida", nombre: "Arequipe", cantidad: 1, precio: 0, ...parcial };
}

function item(parcial: Partial<ItemSnapshot> = {}): ItemSnapshot {
  return { nombre: "Cronchy Mega", cantidad: 1, subtotal: 19000, modificadores: [], ...parcial };
}

function pedido(parcial: Partial<PedidoParaComanda> = {}): PedidoParaComanda {
  return {
    numero: 1042,
    tipo: "domicilio",
    creadoEn: AHORA,
    programadoPara: null,
    clienteNombre: "Wilson Jiménez",
    barrio: "Balmoral",
    items: [item()],
    notas: null,
    ...parcial,
  };
}

const texto = (p: PedidoParaComanda) => textoDelTicket(comanda(p, AHORA));
const lineas = (p: PedidoParaComanda) => lineasDelTicket(comanda(p, AHORA));
const columnas = (p: PedidoParaComanda) => columnasDelTicket(comanda(p, AHORA));

describe("comanda", () => {
  it("el número del pedido es lo primero que se lee", () => {
    expect(lineas(pedido())[1]).toContain("#1042");
  });

  // Se grita desde el otro lado del mostrador, así que va a doble tamaño (GS ! 0x11).
  it("el número va a doble tamaño", () => {
    const bytes = Array.from(comanda(pedido(), AHORA));

    expect(bytes).toContain(0x1d);
    expect(String(bytes)).toContain(String([0x1d, 0x21, 0x11]));
  });

  it("dice si sale a domicilio o lo recogen", () => {
    expect(texto(pedido({ tipo: "domicilio" }))).toContain("DOMICILIO");
    expect(texto(pedido({ tipo: "recoger" }))).toContain("RECOGE EN TIENDA");
  });

  // La tilde es la razón de ser de `codificar`: si esto falla, la impresora escribiría "JimÃ©nez".
  it("los acentos del nombre sobreviven", () => {
    expect(texto(pedido())).toContain("Wilson Jiménez");
  });

  it("un pedido para ya lleva la hora en que entró", () => {
    expect(texto(pedido())).toContain("3:45 pm");
  });

  // "7:00 pm" a secas, en un pedido tomado de noche para el día siguiente, es alguien friendo
  // doce horas antes: el día va siempre.
  it("un programado grita su hora CON el día, y no la de entrada", () => {
    const t = texto(pedido({ programadoPara: ESTA_NOCHE }));

    expect(t).toContain("PROGRAMADO");
    expect(t).toContain("hoy 7:00 pm");
  });

  it("cada ítem lleva su cantidad delante", () => {
    expect(texto(pedido({ items: [item({ nombre: "Cronchy Mega", cantidad: 2 })] })))
      .toContain("2x Cronchy Mega");
  });

  it("los modificadores incluidos se agrupan por su etiqueta corta", () => {
    const t = texto(
      pedido({
        items: [
          item({
            modificadores: [
              mod({ grupo: "Salsa incluida", nombre: "Arequipe" }),
              mod({ grupo: "Toppings incluidos", nombre: "M&M" }),
              mod({ grupo: "Toppings incluidos", nombre: "Mango" }),
            ],
          }),
        ],
      }),
    );

    expect(t).toContain("Salsa: Arequipe");
    expect(t).toContain("Toppings: M&M, Mango");
  });

  // Lo cobrado se separa por PRECIO y no por el nombre del grupo, que el snapshot no distingue.
  it("lo que se cobró aparte sale marcado y fuera de la rejilla de incluidos", () => {
    const t = texto(
      pedido({
        items: [
          item({
            modificadores: [
              mod({ grupo: "Salsa incluida", nombre: "Arequipe" }),
              mod({ grupo: "Agregar más salsas", nombre: "Nutella", cantidad: 2, precio: 2000 }),
            ],
          }),
        ],
      }),
    );

    expect(t).toContain("Salsa: Arequipe");
    expect(t).toContain("+ Nutella x2");
    expect(t).not.toContain("Salsas: Nutella");
  });

  // La comanda es para preparar, no para cobrar: una cifra aquí solo puede confundir.
  it("no lleva ni un precio", () => {
    const t = texto(
      pedido({ items: [item({ subtotal: 19000, modificadores: [mod({ precio: 2000 })] })] }),
    );

    expect(t).not.toContain("$");
    expect(t).not.toContain("19.000");
    expect(t).not.toContain("2.000");
  });

  // La Ú en mayúscula no existe en CP437, así que sale sin tilde: es la limitación del papel
  // asomando, y es lo correcto — mandar el byte de CP850 pintaría un símbolo de caja.
  it("la nota de un ítem se grita en mayúsculas", () => {
    const t = texto(pedido({ items: [item({ notas: "sin azúcar" })] }));

    expect(t).toContain(">> SIN AZUCAR");
  });

  it("la nota del pedido entero sale al final", () => {
    expect(texto(pedido({ notas: "Empacar por separado" }))).toContain("Empacar por separado");
  });

  it("una nota larga se reparte en varias líneas en vez de desbordar", () => {
    const larga = "Por favor empacar cada churro en su propia bolsa y las salsas aparte, gracias";
    const conLaNota = lineas(pedido({ notas: larga }));

    expect(conLaNota.filter((l) => l.includes("bolsa") || l.includes("salsas")).length)
      .toBeGreaterThan(0);
    expect(conLaNota.every((l) => l.length <= 48)).toBe(true);
  });

  it("el barrio va en un domicilio y no en un recoger", () => {
    expect(texto(pedido({ tipo: "domicilio" }))).toContain("Balmoral");
    expect(texto(pedido({ tipo: "recoger" }))).not.toContain("Balmoral");
  });

  // Dos Cronchy Cono son dos churros que freír, no una línea de la lista.
  it("el pie cuenta unidades, no renglones", () => {
    const t = texto(
      pedido({ items: [item({ cantidad: 2 }), item({ nombre: "Agua 600ml", cantidad: 1 })] }),
    );

    expect(t).toContain("3 ítems para preparar");
    expect(t).not.toContain("2 ítems");
  });

  // Cuenta COLUMNAS impresas y no caracteres: a doble ancho cada letra gasta dos, así que
  // contar caracteres daba por buena una línea que la impresora parte sola.
  it("ninguna línea se pasa del ancho del papel", () => {
    const t = columnas(
      pedido({
        clienteNombre: "María Fernanda Rodríguez de la Espriella Buenaventura",
        items: [
          item({
            nombre: "Cronchy Familiar con todos los toppings y salsas de la carta",
            modificadores: [mod({ nombre: "Chocolate blanco belga con almendras tostadas" })],
          }),
        ],
      }),
    );

    expect(Math.max(...t)).toBeLessThanOrEqual(48);
  });

  it("termina cortando el papel", () => {
    const bytes = Array.from(comanda(pedido(), AHORA));

    expect(String(bytes)).toContain(String([0x1d, 0x56, 0x42, 0x00]));
  });
});
