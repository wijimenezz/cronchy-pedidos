// ============================================================
// src/lib/pedidos/tiempos.ts
//
// CUÁNTO TARDA UN PEDIDO — puro y testeado, como `franjas.ts`.
//
// No importa nada en runtime (solo tipos), y eso es a propósito: lo consumen tanto el
// server component del detalle como la tarjeta del tablero, que es `'use client'`. Un
// import de `dias.ts` u `horario.ts` metería la capa de base de datos en el bundle del
// navegador y el build lo rechazaría — es el mismo criterio que `fechas.ts` deja escrito.
// ============================================================

import type { TipoPedido } from "@/lib/notificaciones/plantillas";

/**
 * Lo mínimo para medir un pedido.
 *
 * `entregadoEn` sale del evento `estado='entregado'` de `order_status_event`, que es único por
 * pedido: `entregado` es terminal y `confirmarEntrega` sale temprano si ya lo estaba. Por eso no
 * hace falta el `estado` aquí — tener hora de entrega ES estar entregado.
 */
export type PedidoMedible = {
  tipo: TipoPedido;
  creadoEn: Date;
  entregadoEn: Date | null;
  programadoPara: Date | null;
};

export type PromedioEntrega = {
  /** Minutos, redondeados. */
  general: number;
  /** `null` cuando no hubo ninguna entrega de ese tipo en el periodo. */
  domicilio: number | null;
  recoger: number | null;
  /** Sobre cuántas entregas se calculó. Sin esto, "34 min" de un solo pedido parece un promedio. */
  entregados: number;
};

/** 8 -> "8 min" · 95 -> "1 h 35" · 120 -> "2 h". Compacto: es una etiqueta, no una frase. */
export function duracionCorta(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;

  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;

  return resto === 0 ? `${horas} h` : `${horas} h ${resto}`;
}

/**
 * Los minutos enteros entre dos instantes.
 *
 * Nunca negativo: los dos relojes que escriben esto son el mismo `now()` de Postgres, pero un
 * "-3 min" en la tarjeta se leería como un fallo del panel y no como lo que sería —una fila
 * corregida a mano en la base—.
 */
export function minutosEntre(desde: Date, hasta: Date): number {
  return Math.max(0, Math.floor((hasta.getTime() - desde.getTime()) / 60_000));
}

/** Lo que tardó, o `null` si todavía no se ha entregado. */
export function minutosDeEntrega(pedido: PedidoMedible): number | null {
  return pedido.entregadoEn ? minutosEntre(pedido.creadoEn, pedido.entregadoEn) : null;
}

/**
 * Si este pedido sirve para medir cuánto tarda el local.
 *
 * **Un programado no cuenta**, y esa es la única regla no obvia de este módulo: uno tomado a las
 * 9 de la noche para el día siguiente a las 2 pm da 17 horas aunque la cocina tardara veinte
 * minutos, y con dos o tres al mes el promedio del turno deja de significar nada. Es el mismo
 * motivo por el que el badge de la tarjeta no alarma en un programado: esa cuenta mide desde
 * `creadoEn` y ahí no significa nada.
 *
 * Sus minutos reales sí viajan al XLSX, en su fila: lo que se excluye es el promedio, no el dato.
 */
export function cuentaParaPromedio(pedido: PedidoMedible): boolean {
  return pedido.entregadoEn !== null && pedido.programadoPara === null;
}

function promedio(minutos: number[]): number | null {
  if (minutos.length === 0) return null;

  return Math.round(minutos.reduce((n, m) => n + m, 0) / minutos.length);
}

/**
 * Cuánto se tardó de media, en total y por tipo.
 *
 * Domicilio y recoger van separados porque son dos operaciones distintas —una incluye el viaje y
 * la otra termina en el mostrador—, y un promedio que las mezcla se mueve con la proporción del
 * día en vez de con la cocina.
 *
 * `null` cuando no hubo ninguna entrega que medir: un "0 min" sería una cifra falsa, no un dato
 * que falta.
 */
export function promedioDeEntrega(pedidos: PedidoMedible[]): PromedioEntrega | null {
  const medibles = pedidos.filter(cuentaParaPromedio);
  const general = promedio(medibles.map((p) => minutosEntre(p.creadoEn, p.entregadoEn!)));

  if (general === null) return null;

  const deTipo = (tipo: TipoPedido) =>
    promedio(
      medibles.filter((p) => p.tipo === tipo).map((p) => minutosEntre(p.creadoEn, p.entregadoEn!)),
    );

  return {
    general,
    domicilio: deTipo("domicilio"),
    recoger: deTipo("recoger"),
    entregados: medibles.length,
  };
}
