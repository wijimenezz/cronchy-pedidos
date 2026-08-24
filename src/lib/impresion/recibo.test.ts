import { describe, expect, it } from "vitest";
import { recibo, type LocalDelRecibo, type PedidoParaRecibo } from "./recibo";
import { columnasDelTicket, lineasDelTicket, textoDelTicket } from "./pruebas/decodificar";
import type { ItemSnapshot, ModificadorSnapshot } from "@/lib/notificaciones/plantillas";

const AHORA = new Date("2026-08-21T20:45:00Z");

const LOCAL: LocalDelRecibo = {
  // El nombre real del negocio, no uno corto de laboratorio: son 27 caracteres, y a doble
  // ancho eso son 54 columnas de las 48 que da el papel.
  nombre: "Cronchy - Churros y Helados",
  direccion: "Calle 12 #5-30, Fusagasugá",
  telefono: "3201234567",
};

function mod(parcial: Partial<ModificadorSnapshot> = {}): ModificadorSnapshot {
  return { grupo: "Salsa incluida", nombre: "Arequipe", cantidad: 1, precio: 0, ...parcial };
}

function item(parcial: Partial<ItemSnapshot> = {}): ItemSnapshot {
  return { nombre: "Cronchy Mega", cantidad: 1, subtotal: 19000, modificadores: [], ...parcial };
}

function pedido(parcial: Partial<PedidoParaRecibo> = {}): PedidoParaRecibo {
  return {
    numero: 1042,
    tipo: "domicilio",
    creadoEn: AHORA,
    clienteNombre: "Wilson Jiménez",
    items: [item()],
    subtotal: 19000,
    descuento: 0,
    cuponCodigo: null,
    costoDomicilio: 5000,
    total: 24000,
    metodoPago: "efectivo",
    pagado: false,
    ...parcial,
  };
}

const texto = (p: PedidoParaRecibo, local = LOCAL) => textoDelTicket(recibo(p, local));
const lineas = (p: PedidoParaRecibo, local = LOCAL) => lineasDelTicket(recibo(p, local));
const columnas = (p: PedidoParaRecibo, local = LOCAL) => columnasDelTicket(recibo(p, local));

describe("recibo", () => {
  it("encabeza con el nombre del local y cómo encontrarlo", () => {
    const t = texto(pedido());

    expect(t).toContain("Cronchy");
    expect(t).toContain("Calle 12 #5-30, Fusagasugá");
    expect(t).toContain("3201234567");
  });

  // `store` no tiene columna NIT, así que la línea sencillamente no existe. Un "NIT:" con el
  // hueco vacío se lee como un dato que se perdió.
  it("no promete un NIT que la tienda no tiene", () => {
    expect(texto(pedido())).not.toContain("NIT");
  });

  it("un local sin dirección ni teléfono no deja renglones huérfanos", () => {
    const t = lineas(pedido(), { nombre: "Cronchy", direccion: null, telefono: null });

    expect(t.some((l) => l.startsWith("Tel"))).toBe(false);
    expect(t.join("\n")).toContain("Cronchy");
  });

  it("identifica el pedido y a quién es", () => {
    const t = texto(pedido());

    expect(t).toContain("#1042");
    expect(t).toContain("Wilson Jiménez");
  });

  it("cada ítem lleva cantidad, precio unitario y subtotal de línea", () => {
    const t = texto(pedido({ items: [item({ cantidad: 2, subtotal: 38000 })] }));
    const linea = t.split("\n").find((l) => l.includes("Cronchy Mega")) ?? "";

    expect(linea).toContain("2");
    expect(linea).toContain("$19.000");
    expect(linea).toContain("$38.000");
  });

  // El precio unitario ya trae dentro los modificadores cobrados: `subtotal` es
  // `precioUnitario × cantidad`, y `precioUnitario` es base + modificadores por unidad.
  it("el precio unitario sale de dividir el subtotal, no del precio base", () => {
    const t = texto(pedido({ items: [item({ cantidad: 2, subtotal: 42000 })] }));
    const linea = t.split("\n").find((l) => l.includes("Cronchy Mega")) ?? "";

    expect(linea).toContain("$21.000");
  });

  it("los modificadores se detallan bajo su ítem", () => {
    const t = texto(
      pedido({
        items: [
          item({
            modificadores: [
              mod({ grupo: "Salsa incluida", nombre: "Arequipe" }),
              mod({ grupo: "Toppings incluidos", nombre: "M&M" }),
            ],
          }),
        ],
      }),
    );

    expect(t).toContain("Salsa: Arequipe");
    expect(t).toContain("Toppings: M&M");
  });

  // Mismo criterio que el WhatsApp del cliente: el extra se nombra con lo que costó, aunque esa
  // plata ya esté dentro del subtotal de la línea.
  it("un extra cobrado dice cuánto costó, con el precio ya multiplicado", () => {
    const t = texto(
      pedido({
        items: [
          item({
            cantidad: 1,
            subtotal: 23000,
            modificadores: [mod({ nombre: "Nutella", cantidad: 2, precio: 2000 })],
          }),
        ],
      }),
    );

    expect(t).toContain("+ Nutella x2 ($4.000)");
  });

  // Regla 20: el cupón se aplica sobre los productos y el domicilio se suma al final.
  it("desglosa en el orden en que se forman las cifras", () => {
    const t = lineas(
      pedido({ subtotal: 41000, descuento: 4100, cuponCodigo: "CHURRO10", costoDomicilio: 5000, total: 41900 }),
    );

    // Por el principio de la línea y no por `includes`: "Subtotal" es además la cabecera de
    // una columna de la tabla de ítems, que va mucho antes.
    const indice = (etiqueta: string) => t.findIndex((l) => l.startsWith(etiqueta));

    expect(indice("Valor Productos:")).toBeLessThan(indice("Descuento"));
    expect(indice("Descuento")).toBeLessThan(indice("Subtotal:"));
    expect(indice("Subtotal:")).toBeLessThan(indice("Domicilio:"));
    expect(indice("Domicilio:")).toBeLessThan(indice("TOTAL:"));
  });

  it("el descuento nombra su cupón y lleva el signo menos", () => {
    const t = texto(pedido({ subtotal: 41000, descuento: 4100, cuponCodigo: "CHURRO10", total: 41900 }));

    expect(t).toContain("Descuento (CHURRO10)");
    expect(t).toContain("-$4.100");
  });

  // En un recibo, la ausencia de la línea no se lee como "no hubo descuento" sino como que
  // falta algo. Misma decisión que `bloqueRecibo` del WhatsApp.
  it("sin descuento la línea sigue estando, en cero y sin signo", () => {
    const t = texto(pedido({ descuento: 0 }));

    expect(t).toContain("Descuento");
    expect(t).toContain("$0");
    expect(t).not.toContain("-$0");
  });

  // Sin descuento, "Subtotal" repetiría la cifra de arriba, y una línea que repite a la
  // anterior se lee como un error.
  it("sin descuento no hay línea de Subtotal", () => {
    expect(lineas(pedido({ descuento: 0 })).some((l) => l.startsWith("Subtotal"))).toBe(false);
  });

  it("quien recoge no ve una línea de domicilio", () => {
    const t = texto(pedido({ tipo: "recoger", costoDomicilio: 0, total: 19000 }));

    expect(t).not.toContain("Domicilio");
  });

  it("las cifras del snapshot cuadran solas: productos - descuento + domicilio = total", () => {
    const p = pedido({ subtotal: 41000, descuento: 4100, costoDomicilio: 5000, total: 41900 });
    const t = texto(p);

    expect(p.subtotal - p.descuento + p.costoDomicilio).toBe(p.total);
    expect(t).toContain("$41.900");
  });

  it("el total va en negrita", () => {
    const bytes = Array.from(recibo(pedido(), LOCAL));

    expect(String(bytes)).toContain(String([0x1b, 0x45, 0x01]));
  });

  // El enum sigue diciendo `nequi` porque es historial escrito; el rótulo es de la pantalla.
  it("el método de pago se rotula como lo lee el cliente", () => {
    expect(texto(pedido({ metodoPago: "nequi" }))).toContain("Nequi o Bre-B");
    expect(texto(pedido({ metodoPago: "efectivo" }))).toContain("Efectivo");
  });

  it("dice si el pedido ya está pagado", () => {
    expect(texto(pedido({ pagado: true }))).toContain("Pagado");
    expect(texto(pedido({ pagado: false }))).toContain("Pendiente");
  });

  // Cuenta COLUMNAS impresas y no caracteres. El encabezado va a doble ancho, donde cada letra
  // gasta dos: contando caracteres, "Cronchy - Churros y Helados" pasaba por bueno con 27
  // cuando en el papel mide 54 y la impresora lo parte a media palabra.
  it("ninguna línea se pasa del ancho del papel", () => {
    const t = columnas(
      pedido({
        clienteNombre: "María Fernanda Rodríguez de la Espriella Buenaventura",
        items: [
          item({
            nombre: "Cronchy Familiar con todos los toppings y salsas de la carta",
            cantidad: 12,
            subtotal: 1234567,
          }),
        ],
      }),
    );

    expect(Math.max(...t)).toBeLessThanOrEqual(48);
  });

  it("termina cortando el papel", () => {
    expect(String(Array.from(recibo(pedido(), LOCAL)))).toContain(
      String([0x1d, 0x56, 0x42, 0x00]),
    );
  });
});
