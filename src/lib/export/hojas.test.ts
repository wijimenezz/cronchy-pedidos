import { describe, expect, it } from "vitest";
import type { PedidoParaExport } from "@/db/queries/resumen";
import {
  hojaClientes,
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
  politicaVersion: "2026-09-01",
  aceptaAvisos: true,
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

  // "Usó cupón" es columna aparte del código para poder contar sin fórmulas. Que las dos digan
  // lo mismo es lo que hay que fijar: una en "Sí" con la otra vacía sería una promo fantasma.
  it("el cupón se reporta en las dos columnas o en ninguna", () => {
    const [con] = hojaPedidos([pedido({ cuponCodigo: "CHURRO10", descuento: 3000 })]);
    const [sin] = hojaPedidos([pedido()]);

    expect(con.usoCupon).toBe("Sí");
    expect(con.cupon).toBe("CHURRO10");
    expect(sin.usoCupon).toBe("No");
    expect(sin.cupon).toBeNull();
  });

  // El descuento manual del negocio no lleva código, y no por eso deja de ser un descuento:
  // sin la columna Sí/No, filtrar "los que usaron cupón" lo contaría como uno.
  it("un descuento sin código no cuenta como cupón", () => {
    const [fila] = hojaPedidos([pedido({ descuento: 5000, cuponCodigo: null })]);

    expect(fila.descuento).toBe(5000);
    expect(fila.usoCupon).toBe("No");
  });

  it("el consentimiento sale con su fecha, y sin fecha cuando no lo hay", () => {
    const [acepto] = hojaPedidos([pedido()]);
    // Un pedido anterior a la columna: la evidencia no existe y no se inventa.
    const [viejo] = hojaPedidos([
      pedido({ politicaAceptadaEn: null, politicaVersion: null }),
    ]);

    expect(acepto.aceptoDatos).toBe("Sí");
    expect(acepto.aceptoEl).toBeInstanceOf(Date);
    expect(acepto.versionPolitica).toBe("2026-09-01");
    expect(viejo.aceptoDatos).toBe("No");
    expect(viejo.aceptoEl).toBeNull();
    expect(viejo.versionPolitica).toBeNull();
  });

  // La fila tiene que poder distinguir a quien no quiso avisos: es lo que explica, meses después,
  // por qué a ese pedido nunca se le mandó un WhatsApp.
  it("el rechazo de los avisos queda en la fila", () => {
    const [si] = hojaPedidos([pedido()]);
    const [no] = hojaPedidos([pedido({ aceptaAvisos: false })]);

    expect(si.avisosWhatsapp).toBe("Sí");
    expect(no.avisosWhatsapp).toBe("No");
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

describe("hojaClientes", () => {
  // Es el punto de la hoja: cinco pedidos del mismo teléfono son una persona, no cinco.
  it("agrupa por teléfono y suma lo que gastó", () => {
    const filas = hojaClientes([
      pedido({ numero: 1, total: 35000 }),
      pedido({ numero: 2, total: 20000 }),
      pedido({ numero: 3, clienteTelefono: "3009998877", clienteNombre: "Ana", total: 12000 }),
    ]);

    expect(filas).toHaveLength(2);
    expect(filas[0]).toMatchObject({ telefono: "3001112233", pedidos: 2, gastado: 55000 });
    expect(filas[1]).toMatchObject({ telefono: "3009998877", pedidos: 1, gastado: 12000 });
  });

  // La misma regla del módulo, aplicada por cliente: aparece en su conteo, no en su plata.
  it("un cancelado cuenta como pedido pero no como gasto", () => {
    const [fila] = hojaClientes([
      pedido({ numero: 1, total: 35000 }),
      pedido({ numero: 2, estado: "cancelado", total: 40000 }),
    ]);

    expect(fila).toMatchObject({ pedidos: 2, cancelados: 1, gastado: 35000 });
  });

  // El teléfono identifica; el nombre lo reescribe cualquiera. Si cambió, vale el último.
  it("se queda con el nombre del pedido más reciente", () => {
    const [fila] = hojaClientes([
      pedido({ numero: 1, clienteNombre: "Wilson" }),
      pedido({ numero: 2, clienteNombre: "Wilson Jiménez" }),
    ]);

    expect(fila.cliente).toBe("Wilson Jiménez");
  });

  // El caso real del cliente de siempre: pedidos viejos sin marca y nuevos con ella. Sí
  // consintió, y las fechas dicen desde cuándo — decir "No" por el primero sería falso.
  it("basta una aceptación, y las fechas la acotan", () => {
    const primera = new Date("2025-12-09T20:00:00Z");
    const ultima = new Date("2025-12-11T15:00:00Z");
    const [fila] = hojaClientes([
      pedido({ numero: 1, politicaAceptadaEn: null }),
      pedido({ numero: 2, politicaAceptadaEn: ultima }),
      pedido({ numero: 3, politicaAceptadaEn: primera }),
    ]);

    expect(fila.aceptoDatos).toBe("Sí");
    expect(fila.primeraAceptacion).toEqual(primera);
    expect(fila.ultimaAceptacion).toEqual(ultima);
  });

  it("sin ninguna aceptación no hay fechas que mostrar", () => {
    const [fila] = hojaClientes([pedido({ politicaAceptadaEn: null })]);

    expect(fila.aceptoDatos).toBe("No");
    expect(fila.primeraAceptacion).toBeNull();
    expect(fila.ultimaAceptacion).toBeNull();
  });

  // Aquí manda el último y no "basta uno", al revés que la aceptación: querer o no que te
  // escriban es una preferencia que se cambia, y la que sirve es la vigente. Un consentimiento,
  // en cambio, no se deshace porque el pedido siguiente no lo repita.
  it("los avisos valen los del pedido más reciente, no los del primero", () => {
    const [fila] = hojaClientes([
      pedido({ numero: 1, aceptaAvisos: true }),
      pedido({ numero: 2, aceptaAvisos: false }),
    ]);

    expect(fila.aceptaAvisos).toBe("No");
    // Y el consentimiento de datos no se mueve por eso.
    expect(fila.aceptoDatos).toBe("Sí");
  });

  // Lo que amarra la hoja al resto del libro: si estas dos cifras se separan, una de las dos
  // está contando mal y el Excel se contradice a sí mismo entre hojas.
  it("lo gastado por todos los clientes es igual a las ventas del resumen", () => {
    const pedidos = [
      pedido({ numero: 1, total: 35000 }),
      pedido({ numero: 2, clienteTelefono: "3009998877", total: 12000 }),
      pedido({ numero: 3, estado: "cancelado", total: 40000 }),
    ];
    const { total } = hojaResumen(pedidos, "2025-12-09", "2025-12-09");

    expect(hojaClientes(pedidos).reduce((n, c) => n + c.gastado, 0)).toBe(total.ventas);
  });

  it("sin pedidos no hay filas", () => {
    expect(hojaClientes([])).toEqual([]);
  });
});
