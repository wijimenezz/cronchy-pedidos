import type { PedidoParaExport } from "@/db/queries/resumen";
import { METODOS_PAGO, type TotalPorMetodo } from "@/db/queries/resumen";
import type { ItemSnapshot } from "@/lib/notificaciones/plantillas";
import { ETIQUETA_ESTADO, METODO_PAGO_ETIQUETA } from "@/lib/pedidos/estados";
import { diaDeBogota, diasDelRango } from "@/lib/pedidos/dias";

/**
 * Las cinco hojas de la descarga, como datos.
 *
 * Puro y sin base de datos ni XLSX: recibe los pedidos y devuelve filas. Se separa del armado
 * del archivo (`libro.ts`) porque lo que hay que poder probar es **qué dice** el Excel, no cómo
 * se comprime — y una invariante que no cuadre aquí es plata mal contada en la contabilidad del
 * negocio.
 *
 * La regla que gobierna todo el módulo: **un pedido cancelado aparece pero no suma**. Se ve en
 * la hoja de pedidos, se cuenta en su columna de cancelados, y queda fuera de cualquier importe.
 */

function esCancelado(pedido: PedidoParaExport): boolean {
  return pedido.estado === "cancelado";
}

/**
 * Sí/No como texto, no como booleano.
 *
 * Excel escribe un booleano nativo como VERDADERO/FALSO en mayúsculas y según el idioma de quien
 * lo abra; el filtro de columna y una tabla dinámica se leen mejor con dos palabras fijas.
 */
function siNo(valor: boolean): string {
  return valor ? "Sí" : "No";
}

// ------------------------------------------------------------
// Hoja 1 — Resumen
// ------------------------------------------------------------

export type FilaResumen = {
  dia: string;
  pedidos: number;
  cancelados: number;
  domicilios: number;
  recoger: number;
  productos: number;
  domicilio: number;
  descuento: number;
  ventas: number;
};

function cifrasDe(pedidos: PedidoParaExport[], dia: string): FilaResumen {
  const cobrados = pedidos.filter((p) => !esCancelado(p));
  const suma = (f: (p: PedidoParaExport) => number) => cobrados.reduce((n, p) => n + f(p), 0);

  return {
    dia,
    pedidos: pedidos.length,
    cancelados: pedidos.length - cobrados.length,
    domicilios: cobrados.filter((p) => p.tipo === "domicilio").length,
    recoger: cobrados.filter((p) => p.tipo === "recoger").length,
    productos: suma((p) => p.subtotal),
    domicilio: suma((p) => p.costoDomicilio),
    descuento: suma((p) => p.descuento),
    ventas: suma((p) => p.total),
  };
}

/**
 * Una fila por día del rango, más la de totales.
 *
 * Los días sin pedidos salen en cero en vez de faltar: un hueco en la tabla se lee como un dato
 * perdido, y "ese lunes no se abrió" es información.
 */
export function hojaResumen(
  pedidos: PedidoParaExport[],
  desde: string,
  hasta: string,
): { dias: FilaResumen[]; total: FilaResumen } {
  const porDia = new Map<string, PedidoParaExport[]>();
  for (const pedido of pedidos) {
    const dia = diaDeBogota(pedido.creadoEn);
    porDia.set(dia, [...(porDia.get(dia) ?? []), pedido]);
  }

  return {
    dias: diasDelRango(desde, hasta).map((dia) => cifrasDe(porDia.get(dia) ?? [], dia)),
    total: cifrasDe(pedidos, `${desde} a ${hasta}`),
  };
}

/** El cuadre de caja del rango: cuánto entró por cada medio. Los cuatro van siempre. */
export function totalesPorMetodo(pedidos: PedidoParaExport[]): TotalPorMetodo[] {
  const cobrados = pedidos.filter((p) => !esCancelado(p));

  return METODOS_PAGO.map((metodo) => {
    const suyos = cobrados.filter((p) => p.metodoPago === metodo);

    return {
      metodo,
      pedidos: suyos.length,
      monto: suyos.reduce((n, p) => n + p.total, 0),
    };
  });
}

// ------------------------------------------------------------
// Hoja 2 — Pedidos
// ------------------------------------------------------------

export type FilaPedido = {
  numero: number;
  creadoEn: Date;
  cerradoEn: Date | null;
  estado: string;
  tipo: string;
  cliente: string;
  telefono: string;
  recibe: string | null;
  telefonoRecibe: string | null;
  barrio: string | null;
  direccion: string | null;
  indicaciones: string | null;
  latitud: number | null;
  longitud: number | null;
  zona: string | null;
  domiciliario: string | null;
  programadoPara: Date | null;
  metodoPago: string;
  pagaCon: number | null;
  productos: number;
  domicilio: number;
  descuento: number;
  /**
   * Si el pedido llevó cupón, en una columna aparte del código.
   *
   * No sobra teniendo `cupon` al lado: filtrar "los que usaron cupón" por "código no vacío" es
   * una fórmula, y contar sobre una columna Sí/No es una tabla dinámica de dos clics. Además
   * distingue el descuento manual del negocio —descuento sin código— del descuento por cupón.
   */
  usoCupon: string;
  /**
   * El código del cupón, junto al monto que descontó. La columna que CLAUDE.md tenía prometida.
   *
   * `null` cuando no hubo cupón: en una hoja de cálculo, la celda vacía al lado de un descuento en
   * $0 se lee bien, y la del descuento manual del negocio también — no hay código que poner.
   */
  cupon: string | null;
  total: number;
  notas: string | null;
  /** Si hay consentimiento registrado para este pedido. "No" en todo lo anterior a la columna. */
  aceptoDatos: string;
  /** Cuándo lo aceptó, sellado por el servidor. `null` deja la celda vacía. */
  aceptoEl: Date | null;
  /**
   * Qué versión del documento aceptó. Sin esto la fila dice que alguien aceptó sin poder mostrar
   * qué decía la política ese día, que es la mitad de lo que hay que poder acreditar.
   */
  versionPolitica: string | null;
  /** Si quiso los avisos por WhatsApp del estado de su pedido. */
  avisosWhatsapp: string;
  id: string;
};

/**
 * Una fila por pedido, con todo lo que se puede decir de él.
 *
 * Los montos van como número y las fechas como `Date`: en `libro.ts` se escriben como celdas
 * numéricas y de fecha de verdad. Un Excel donde el total es la cadena "$59.500" no se puede
 * sumar, que es justo para lo que se descarga.
 */
export function hojaPedidos(pedidos: PedidoParaExport[]): FilaPedido[] {
  return pedidos.map((p) => ({
    numero: p.numero,
    creadoEn: p.creadoEn,
    cerradoEn: p.cerradoEn,
    estado: ETIQUETA_ESTADO[p.estado],
    tipo: p.tipo === "domicilio" ? "Domicilio" : "Recoge en tienda",
    cliente: p.clienteNombre,
    telefono: p.clienteTelefono,
    recibe: p.recibeNombre,
    telefonoRecibe: p.recibeTelefono,
    barrio: p.barrio,
    direccion: p.direccion,
    indicaciones: p.indicaciones,
    latitud: p.punto?.lat ?? null,
    longitud: p.punto?.lng ?? null,
    zona: p.zonaNombre,
    domiciliario: p.domiciliarioNombre,
    programadoPara: p.programadoPara,
    metodoPago: METODO_PAGO_ETIQUETA[p.metodoPago] ?? p.metodoPago,
    pagaCon: p.pagaCon,
    productos: p.subtotal,
    domicilio: p.costoDomicilio,
    descuento: p.descuento,
    usoCupon: siNo(p.cuponCodigo !== null),
    cupon: p.cuponCodigo,
    total: p.total,
    notas: p.notas,
    aceptoDatos: siNo(p.politicaAceptadaEn !== null),
    aceptoEl: p.politicaAceptadaEn,
    versionPolitica: p.politicaVersion,
    avisosWhatsapp: siNo(p.aceptaAvisos),
    id: p.id,
  }));
}

// ------------------------------------------------------------
// Hoja 3 — Detalle
// ------------------------------------------------------------

export type FilaDetalle = {
  numero: number;
  creadoEn: Date;
  estado: string;
  producto: string;
  cantidad: number;
  modificadores: string;
  subtotal: number;
  notas: string | null;
};

/**
 * Los modificadores en una celda: "Salsa incluida: Arequipe · Topping: Oreo".
 *
 * Se agrupan por su grupo, como en el ticket de WhatsApp, porque "Arequipe, Oreo" suelto no dice
 * cuál era la salsa y cuál el topping. Un `x2` solo aparece cuando de verdad se pidió doble.
 */
function textoModificadores(item: ItemSnapshot): string {
  const grupos = new Map<string, string[]>();

  for (const m of item.modificadores) {
    const texto = m.cantidad > 1 ? `${m.nombre} x${m.cantidad}` : m.nombre;
    grupos.set(m.grupo, [...(grupos.get(m.grupo) ?? []), texto]);
  }

  return [...grupos].map(([grupo, nombres]) => `${grupo}: ${nombres.join(", ")}`).join(" · ");
}

/** Una fila por línea de pedido. Con una tabla dinámica responde "¿qué salsa se pide más?". */
export function hojaDetalle(pedidos: PedidoParaExport[]): FilaDetalle[] {
  return pedidos.flatMap((p) =>
    p.items.map((item) => ({
      numero: p.numero,
      creadoEn: p.creadoEn,
      estado: ETIQUETA_ESTADO[p.estado],
      producto: item.nombre,
      cantidad: item.cantidad,
      modificadores: textoModificadores(item),
      subtotal: item.subtotal,
      notas: item.notas ?? null,
    })),
  );
}

// ------------------------------------------------------------
// Hoja 4 — Productos vendidos
// ------------------------------------------------------------

export type FilaProducto = {
  producto: string;
  vendida: number;
  cancelada: number;
  importe: number;
};

/**
 * Cuánto salió de cada producto, ordenado de más a menos.
 *
 * Se agrupa **por nombre de producto** y no por la configuración completa: la pregunta de
 * compras es "¿cuántos Cronchy Mega salieron?", no "¿cuántos con arequipe y oreo?". Ese desglose
 * está en la hoja de detalle, donde una tabla dinámica lo saca.
 *
 * Lo cancelado va en su propia columna en vez de desaparecer: es lo que se preparó de más o lo
 * que se dejó de vender, y ninguna de las dos cosas se ve en el importe.
 */
export function hojaProductos(pedidos: PedidoParaExport[]): FilaProducto[] {
  const acumulado = new Map<string, FilaProducto>();

  for (const pedido of pedidos) {
    const cancelado = esCancelado(pedido);

    for (const item of pedido.items) {
      const fila = acumulado.get(item.nombre) ?? {
        producto: item.nombre,
        vendida: 0,
        cancelada: 0,
        importe: 0,
      };

      if (cancelado) {
        fila.cancelada += item.cantidad;
      } else {
        fila.vendida += item.cantidad;
        fila.importe += item.subtotal;
      }

      acumulado.set(item.nombre, fila);
    }
  }

  return [...acumulado.values()].sort(
    (a, b) => b.vendida - a.vendida || a.producto.localeCompare(b.producto, "es"),
  );
}

// ------------------------------------------------------------
// Hoja 5 — Clientes
// ------------------------------------------------------------

export type FilaCliente = {
  telefono: string;
  cliente: string;
  pedidos: number;
  cancelados: number;
  gastado: number;
  aceptoDatos: string;
  primeraAceptacion: Date | null;
  ultimaAceptacion: Date | null;
  /**
   * Si quiere que le escribamos, según su pedido MÁS RECIENTE del rango: es una preferencia que
   * puede cambiar, y aquí lo que sirve es la última que expresó, no si alguna vez dijo que sí.
   * Al revés que `aceptoDatos`, donde basta una aceptación porque un consentimiento no se
   * deshace por el pedido siguiente.
   */
  aceptaAvisos: string;
};

/**
 * Una fila por cliente, con su consentimiento y lo que dejó en el rango.
 *
 * Se agrupa **por teléfono**, que es lo que identifica a una persona en este negocio (el
 * `unique (store_id, telefono)` de `customer`): el nombre lo reescribe cualquiera entre un pedido
 * y otro, y se toma el del más reciente porque los pedidos llegan ordenados por fecha ascendente.
 *
 * Se calcula **sobre los pedidos del rango descargado** y no consultando la tabla `customer`:
 * `customer.total_pedidos` es el histórico completo del cliente, así que un cliente con 40 pedidos
 * saldría con 40 en una descarga de una semana y la hoja no cuadraría con `Resumen`. Aquí todo
 * mide lo mismo: lo que pasó entre `desde` y `hasta`.
 *
 * `aceptoDatos` es "Sí" **si al menos uno** de sus pedidos tiene consentimiento registrado, y las
 * dos fechas lo acotan. Ese criterio es el que resuelve el caso real: el cliente de siempre, con
 * pedidos viejos sin marca y nuevos con ella, sí consintió — y aquí está desde cuándo.
 */
export function hojaClientes(pedidos: PedidoParaExport[]): FilaCliente[] {
  const acumulado = new Map<string, FilaCliente>();

  for (const pedido of pedidos) {
    const fila = acumulado.get(pedido.clienteTelefono) ?? {
      telefono: pedido.clienteTelefono,
      cliente: pedido.clienteNombre,
      pedidos: 0,
      cancelados: 0,
      gastado: 0,
      aceptoDatos: siNo(false),
      primeraAceptacion: null,
      ultimaAceptacion: null,
      aceptaAvisos: siNo(true),
    };

    // Lo del pedido más reciente: si cambió el nombre, o cambió de idea sobre los avisos, manda
    // lo último que dijo. Los pedidos llegan ordenados por fecha ascendente.
    fila.cliente = pedido.clienteNombre;
    fila.aceptaAvisos = siNo(pedido.aceptaAvisos);
    fila.pedidos += 1;

    // Un cancelado se cuenta pero no suma, igual que en el resto del módulo.
    if (esCancelado(pedido)) {
      fila.cancelados += 1;
    } else {
      fila.gastado += pedido.total;
    }

    const acepto = pedido.politicaAceptadaEn;
    if (acepto) {
      fila.aceptoDatos = siNo(true);
      // Sin asumir el orden de entrada: comparar es más barato que confiar en el `orderBy`.
      if (!fila.primeraAceptacion || acepto < fila.primeraAceptacion) {
        fila.primeraAceptacion = acepto;
      }
      if (!fila.ultimaAceptacion || acepto > fila.ultimaAceptacion) {
        fila.ultimaAceptacion = acepto;
      }
    }

    acumulado.set(pedido.clienteTelefono, fila);
  }

  return [...acumulado.values()].sort(
    (a, b) => b.gastado - a.gastado || a.cliente.localeCompare(b.cliente, "es"),
  );
}
