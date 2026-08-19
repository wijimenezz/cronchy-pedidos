import { describe, expect, it } from "vitest";
import type { PedidoParaExport } from "@/db/queries/resumen";
import { libroDePedidos, rotuloDeRango } from "./libro";

/**
 * Que el archivo **se genere**. `hojas.test.ts` prueba que las cifras cuadren; esto prueba que la
 * traducción a celdas no reviente, que es lo único que TypeScript no puede ver: un `type` que no
 * cuadra con su `value`, un formato inválido o una fila con más celdas que la cabecera solo
 * fallan al escribir el ZIP.
 */

const PEDIDO: PedidoParaExport = {
  id: "11111111-1111-1111-1111-111111111111",
  numero: 124,
  tipo: "domicilio",
  estado: "entregado",
  creadoEn: new Date("2025-12-09T20:00:00Z"),
  cerradoEn: new Date("2025-12-09T20:40:00Z"),
  programadoPara: null,
  clienteNombre: "Wilson",
  clienteTelefono: "3001112233",
  recibeNombre: null,
  recibeTelefono: null,
  barrio: "Balmoral",
  direccion: "Cra 5 #10-20",
  indicaciones: null,
  zonaNombre: "Centro",
  punto: { lat: 4.336, lng: -74.364 },
  domiciliarioNombre: "Jesús F",
  metodoPago: "efectivo",
  pagaCon: 50000,
  notas: null,
  subtotal: 30000,
  costoDomicilio: 5000,
  descuento: 0,
  cuponCodigo: null,
  total: 35000,
  politicaAceptadaEn: new Date("2025-12-09T20:00:00Z"),
  items: [
    {
      nombre: "Cronchy Mega",
      cantidad: 2,
      subtotal: 30000,
      modificadores: [{ grupo: "Salsa incluida", nombre: "Arequipe", cantidad: 1, precio: 0 }],
    },
  ],
};

/** Todo XLSX es un ZIP, y todo ZIP empieza por "PK". */
function esZip(buffer: Buffer): boolean {
  return buffer[0] === 0x50 && buffer[1] === 0x4b;
}

describe("libroDePedidos", () => {
  it("genera un XLSX válido", async () => {
    const { buffer } = await libroDePedidos([PEDIDO], "2025-12-09", "2025-12-09");

    expect(esZip(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  // Un día vacío es lo que se descarga el lunes que no se abrió: no puede reventar.
  it("un rango sin pedidos también genera archivo", async () => {
    const { buffer } = await libroDePedidos([], "2025-12-05", "2025-12-09");

    expect(esZip(buffer)).toBe(true);
  });

  // Las celdas nulas y los tipos opcionales son justo donde una librería de hojas se rompe.
  it("aguanta un pedido de recoger, sin dirección ni pin ni paga con", async () => {
    const { buffer } = await libroDePedidos(
      [
        {
          ...PEDIDO,
          tipo: "recoger",
          estado: "cancelado",
          cerradoEn: null,
          direccion: null,
          barrio: null,
          indicaciones: null,
          zonaNombre: null,
          punto: null,
          domiciliarioNombre: null,
          pagaCon: null,
          costoDomicilio: 0,
          programadoPara: new Date("2025-12-09T23:00:00Z"),
          items: [{ nombre: "Agua", cantidad: 1, subtotal: 3000, modificadores: [] }],
        },
      ],
      "2025-12-09",
      "2025-12-09",
    );

    expect(esZip(buffer)).toBe(true);
  });

  it("el aviso de líneas descartadas no rompe la hoja", async () => {
    const { buffer } = await libroDePedidos([PEDIDO], "2025-12-09", "2025-12-09", 3);

    expect(esZip(buffer)).toBe(true);
  });

  it("el nombre del archivo dice el rango", async () => {
    const unDia = await libroDePedidos([], "2025-12-09", "2025-12-09");
    const varios = await libroDePedidos([], "2025-12-05", "2025-12-09");

    expect(unDia.nombreArchivo).toBe("cronchy-pedidos-2025-12-09.xlsx");
    expect(varios.nombreArchivo).toBe("cronchy-pedidos-2025-12-05-a-2025-12-09.xlsx");
  });
});

describe("rotuloDeRango", () => {
  it("un solo día se dice como el día", () => {
    expect(rotuloDeRango("2025-12-09", "2025-12-09", "2025-12-09")).toBe("Hoy");
    expect(rotuloDeRango("2025-12-08", "2025-12-08", "2025-12-09")).toBe("Ayer");
  });

  it("un rango se dice con los dos extremos", () => {
    expect(rotuloDeRango("2025-12-05", "2025-12-09", "2025-12-09")).toBe(
      "Viernes, 5 de diciembre — Hoy",
    );
  });
});
