import { describe, expect, it } from "vitest";
import type { PedidoParaExport } from "@/db/queries/resumen";
import {
  hojaDetalle,
  hojaPedidos,
  hojaProductos,
  hojaResumen,
  totalesPorMetodo,
} from "./hojas";

/**
 * Lo que se prueba aquí es que el archivo **cuadre**. Un Excel que va a contabilidad con un total
 * que no coincide con la suma de sus filas es peor que no tener el Excel: nadie lo detecta hasta
 * que ya se usó para cerrar un mes.
 */

const BASE: PedidoParaExport = {
  id: "11111111-1111-1111-1111-111111111111",
  numero: 1,
  tipo: "domicilio",
  estado: "entregado",
  creadoEn: new Date("2025-12-09T20:00:00Z"), // 3:00 pm en Bogotá
  cerradoEn: new Date("2025-12-09T20:40:00Z"),
  programadoPara: null,
  clienteNombre: "Wilson",
  clienteTelefono: "3001112233",
  recibeNombre: null,
  recibeTelefono: null,
  barrio: "Balmoral",
  direccion: "Cra 5 #10-20",
  indicaciones: "Casa blanca",
  zonaNombre: "Centro",
  punto: { lat: 4.34, lng: -74.36 },
  metodoPago: "efectivo",
  pagaCon: 50000,
  notas: null,
  subtotal: 30000,
  costoDomicilio: 5000,
  descuento: 0,
  total: 35000,
  items: [
    {
      nombre: "Cronchy Mega",
      cantidad: 2,
      subtotal: 30000,
      modificadores: [
        { grupo: "Salsa incluida", nombre: "Arequipe", cantidad: 1, precio: 0 },
        { grupo: "Topping incluido", nombre: "Oreo", cantidad: 2, precio: 0 },
      ],
    },
  ],
};

const pedido = (parcial: Partial<PedidoParaExport> = {}): PedidoParaExport => ({
  ...BASE,
  ...parcial,
});

describe("hojaResumen", () => {
  it("la identidad del dinero cuadra: ventas = productos + domicilio − descuento", () => {
    const { total } = hojaResumen(
      [
        pedido({ numero: 1 }),
        pedido({ numero: 2, subtotal: 20000, costoDomicilio: 5000, descuento: 2000, total: 23000 }),
      ],
      "2025-12-09",
      "2025-12-09",
    );

    expect(total.ventas).toBe(total.productos + total.domicilio - total.descuento);
    expect(total.ventas).toBe(58000);
  });

  // La suma de los días tiene que dar el total, o la hoja se contradice a sí misma.
  it("los días suman el total del rango", () => {
    const { dias, total } = hojaResumen(
      [
        pedido({ numero: 1, creadoEn: new Date("2025-12-08T20:00:00Z") }),
        pedido({ numero: 2, creadoEn: new Date("2025-12-09T20:00:00Z") }),
        pedido({ numero: 3, creadoEn: new Date("2025-12-09T22:00:00Z") }),
      ],
      "2025-12-08",
      "2025-12-09",
    );

    expect(dias.reduce((n, d) => n + d.ventas, 0)).toBe(total.ventas);
    expect(dias.reduce((n, d) => n + d.pedidos, 0)).toBe(total.pedidos);
  });

  it("los tres conteos suman el total de pedidos", () => {
    const { total } = hojaResumen(
      [
        pedido({ numero: 1, tipo: "domicilio" }),
        pedido({ numero: 2, tipo: "recoger", costoDomicilio: 0 }),
        pedido({ numero: 3, estado: "cancelado" }),
      ],
      "2025-12-09",
      "2025-12-09",
    );

    expect(total.domicilios + total.recoger + total.cancelados).toBe(total.pedidos);
    expect(total.pedidos).toBe(3);
    expect(total.cancelados).toBe(1);
  });

  // La regla de todo el módulo: aparece pero no suma.
  it("un cancelado no aporta ni un peso", () => {
    const solo = hojaResumen([pedido()], "2025-12-09", "2025-12-09").total;
    const conCancelado = hojaResumen(
      [pedido(), pedido({ numero: 2, estado: "cancelado" })],
      "2025-12-09",
      "2025-12-09",
    ).total;

    expect(conCancelado.ventas).toBe(solo.ventas);
    expect(conCancelado.productos).toBe(solo.productos);
    expect(conCancelado.domicilio).toBe(solo.domicilio);
    expect(conCancelado.pedidos).toBe(2);
  });

  // Un hueco en la tabla se lee como un dato perdido; un cero dice "ese día no se abrió".
  it("un día sin pedidos sale en cero, no falta", () => {
    const { dias } = hojaResumen(
      [pedido({ creadoEn: new Date("2025-12-09T20:00:00Z") })],
      "2025-12-07",
      "2025-12-09",
    );

    expect(dias.map((d) => d.dia)).toEqual(["2025-12-07", "2025-12-08", "2025-12-09"]);
    expect(dias[0]).toMatchObject({ pedidos: 0, ventas: 0 });
  });

  // 11:30 pm en Bogotá es el día siguiente en UTC: si se agrupara por UTC, la venta de la noche
  // se contaría en el día equivocado.
  it("agrupa por el día de Bogotá y no por el de UTC", () => {
    const { dias } = hojaResumen(
      // 9 de diciembre, 23:30 en Bogotá = 10 de diciembre, 04:30 UTC.
      [pedido({ creadoEn: new Date("2025-12-10T04:30:00Z") })],
      "2025-12-09",
      "2025-12-10",
    );

    expect(dias[0]).toMatchObject({ dia: "2025-12-09", pedidos: 1 });
    expect(dias[1]).toMatchObject({ dia: "2025-12-10", pedidos: 0 });
  });
});

describe("totalesPorMetodo", () => {
  it("los cuatro métodos van siempre, aunque estén en cero", () => {
    const totales = totalesPorMetodo([pedido()]);

    expect(totales.map((t) => t.metodo)).toEqual([
      "efectivo",
      "nequi",
      "transferencia",
      "datafono",
    ]);
    expect(totales.find((t) => t.metodo === "datafono")).toMatchObject({ pedidos: 0, monto: 0 });
  });

  // El cuadre de caja: si esto no da el total, falta plata en alguna parte del informe.
  it("suman el total de ventas", () => {
    const pedidos = [
      pedido({ numero: 1, metodoPago: "efectivo" }),
      pedido({ numero: 2, metodoPago: "nequi" }),
      pedido({ numero: 3, metodoPago: "nequi", estado: "cancelado" }),
    ];
    const { total } = hojaResumen(pedidos, "2025-12-09", "2025-12-09");

    expect(totalesPorMetodo(pedidos).reduce((n, t) => n + t.monto, 0)).toBe(total.ventas);
  });
});

describe("hojaPedidos", () => {
  it("los totales de las filas suman el total del resumen", () => {
    const pedidos = [pedido({ numero: 1 }), pedido({ numero: 2, estado: "cancelado" })];
    const { total } = hojaResumen(pedidos, "2025-12-09", "2025-12-09");

    const filas = hojaPedidos(pedidos);
    const cobradas = filas.filter((f) => f.estado !== "Cancelado");

    expect(filas).toHaveLength(2); // el cancelado aparece
    expect(cobradas.reduce((n, f) => n + f.total, 0)).toBe(total.ventas); // pero no suma
  });

  it("un pedido para recoger no lleva dirección ni coordenadas", () => {
    const [fila] = hojaPedidos([
      pedido({
        tipo: "recoger",
        direccion: null,
        barrio: null,
        punto: null,
        zonaNombre: null,
        costoDomicilio: 0,
      }),
    ]);

    expect(fila.tipo).toBe("Recoge en tienda");
    expect(fila.direccion).toBeNull();
    expect(fila.latitud).toBeNull();
    expect(fila.domicilio).toBe(0);
  });

  // Si viajaran como texto formateado, en Excel no se podrían sumar ni ordenar — que es
  // exactamente para lo que se descargan.
  it("los montos son números y las fechas son fechas", () => {
    const [fila] = hojaPedidos([pedido()]);

    expect(typeof fila.total).toBe("number");
    expect(typeof fila.productos).toBe("number");
    expect(fila.creadoEn).toBeInstanceOf(Date);
  });
});

describe("hojaDetalle", () => {
  it("una fila por línea, y sus subtotales suman los productos del resumen", () => {
    const pedidos = [
      pedido({
        numero: 1,
        subtotal: 42000,
        total: 47000,
        items: [
          { ...BASE.items[0] },
          { nombre: "Agua 600ml", cantidad: 2, subtotal: 12000, modificadores: [] },
        ],
      }),
    ];
    const filas = hojaDetalle(pedidos);
    const { total } = hojaResumen(pedidos, "2025-12-09", "2025-12-09");

    expect(filas).toHaveLength(2);
    expect(filas.reduce((n, f) => n + f.subtotal, 0)).toBe(total.productos);
  });

  it("los modificadores se agrupan y el x2 solo sale si es doble", () => {
    const [fila] = hojaDetalle([pedido()]);

    expect(fila.modificadores).toBe("Salsa incluida: Arequipe · Topping incluido: Oreo x2");
  });

  it("un producto sin modificadores deja la celda vacía", () => {
    const [fila] = hojaDetalle([
      pedido({ items: [{ nombre: "Agua", cantidad: 1, subtotal: 3000, modificadores: [] }] }),
    ]);

    expect(fila.modificadores).toBe("");
  });
});

describe("hojaProductos", () => {
  it("agrupa por nombre y ordena de más vendido a menos", () => {
    const filas = hojaProductos([
      pedido({ numero: 1 }),
      pedido({
        numero: 2,
        items: [{ nombre: "Agua 600ml", cantidad: 1, subtotal: 3000, modificadores: [] }],
      }),
      pedido({ numero: 3 }),
    ]);

    expect(filas).toEqual([
      { producto: "Cronchy Mega", vendida: 4, cancelada: 0, importe: 60000 },
      { producto: "Agua 600ml", vendida: 1, cancelada: 0, importe: 3000 },
    ]);
  });

  // Lo cancelado se preparó de más o se dejó de vender: no puede desaparecer, pero tampoco
  // puede colarse en el importe.
  it("lo cancelado va en su columna y no en el importe", () => {
    const [fila] = hojaProductos([pedido({ numero: 1 }), pedido({ numero: 2, estado: "cancelado" })]);

    expect(fila).toEqual({
      producto: "Cronchy Mega",
      vendida: 2,
      cancelada: 2,
      importe: 30000,
    });
  });

  it("sin pedidos no hay filas", () => {
    expect(hojaProductos([])).toEqual([]);
  });
});
