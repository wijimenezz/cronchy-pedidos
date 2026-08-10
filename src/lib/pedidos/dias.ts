import { ahoraEnBogota, instanteEnBogota } from "@/lib/horario";
import { DIAS_SEMANA_LARGOS, MAXIMO_DIAS_RANGO, MESES, contarDias } from "@/lib/fechas";

// Se reexportan para que quien trabaja con días de Bogotá no tenga que saber que la aritmética
// de calendario vive aparte. Está aparte porque el diálogo de descarga es cliente y este módulo
// arrastra `horario.ts` —y la capa de base de datos— al bundle del navegador.
export { MAXIMO_DIAS_RANGO, contarDias } from "@/lib/fechas";

/**
 * Qué día es cada cosa, en Bogotá. Lo que necesita la consulta de un día pasado en el panel.
 *
 * Módulo puro y testeado como `franjas.ts`, y por el mismo motivo: aquí un error de zona horaria
 * no rompe nada visiblemente, solo mete los pedidos en el día equivocado. Un pedido de las 11 de
 * la noche del martes es miércoles en UTC, y contarlo ahí desplazaría la caja de todo un turno.
 *
 * La conversión Bogotá↔UTC no se hace aquí: vive entera en `horario.ts` (regla 6) y este módulo
 * solo la usa.
 */

const UN_DIA_MS = 24 * 60 * 60 * 1000;

/** Mediodía, para saltar de día sin acercarse a ningún borde. */
const MEDIODIA = 12 * 60;

/** "YYYY-MM-DD" y nada más. Lo que puede llegar por la URL. */
const FORMA_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** El día de Bogotá al que pertenece un instante. */
export function diaDeBogota(ahora: Date = new Date()): string {
  return ahoraEnBogota(ahora).fecha;
}

/**
 * Un día atrás o adelante.
 *
 * Se suma un día al **instante** y se vuelve a preguntar por su fecha en Bogotá, en vez de sumar
 * 1 al número del día: así el cambio de mes y el de año salen solos, sin escribir la regla de
 * cuántos días tiene febrero. Es el mismo patrón de `entrega.ts` y `franjas.ts`.
 *
 * Se parte del mediodía y no de la medianoche porque cuesta lo mismo y deja doce horas de
 * margen a cada lado: ningún redondeo puede caer en el día vecino.
 */
function desplazar(fecha: string, dias: number): string {
  return diaDeBogota(new Date(instanteEnBogota(fecha, MEDIODIA).getTime() + dias * UN_DIA_MS));
}

export function diaAnterior(fecha: string): string {
  return desplazar(fecha, -1);
}

export function diaSiguiente(fecha: string): string {
  return desplazar(fecha, 1);
}

/**
 * El rango absoluto que cubre un día de Bogotá.
 *
 * **Semiabierto por arriba**, y eso no es un detalle: con el límite superior incluido, un pedido
 * creado exactamente a medianoche saldría contado en dos días a la vez. Quien lo use tiene que
 * comparar con `< hasta`, nunca con `<=`.
 */
export function rangoDelDia(fecha: string): { desde: Date; hasta: Date } {
  return {
    desde: instanteEnBogota(fecha, 0),
    hasta: instanteEnBogota(diaSiguiente(fecha), 0),
  };
}

/**
 * Cómo se le nombra un día a quien lo está mirando: "Hoy", "Ayer", o "Martes, 9 de diciembre".
 *
 * Los dos primeros ganan porque son los que se van a usar el 99% de las veces y se leen de un
 * vistazo; el resto lleva el día de la semana porque es lo que la gente recuerda de un turno
 * ("el martes que llovió"), no el número.
 *
 * El año no aparece: el selector no deja pasar de hoy y quien navega hacia atrás sabe en qué año
 * está. Ponerlo alargaría el rótulo sin resolver ninguna ambigüedad real.
 */
export function rotuloDeDia(fecha: string, hoy: string): string {
  if (fecha === hoy) return "Hoy";
  if (fecha === diaAnterior(hoy)) return "Ayer";

  const { diaSemana } = ahoraEnBogota(instanteEnBogota(fecha, MEDIODIA));
  const [, mes, dia] = fecha.split("-").map(Number);

  return `${DIAS_SEMANA_LARGOS[diaSemana]}, ${dia} de ${MESES[mes - 1]}`;
}

/**
 * Qué día pidió el usuario, a partir de lo que venga en la URL.
 *
 * Todo lo que no sea una fecha pasada válida cae en hoy. En particular **el futuro**: no existen
 * pedidos creados mañana, así que `?fecha=2030-01-01` mostraría una lista vacía que parece un
 * fallo del sistema en vez de una consulta sin sentido.
 */
export function diaPedido(texto: string | undefined, hoy: string): string {
  if (!texto || !FORMA_FECHA.test(texto)) return hoy;
  // Descarta el 32 de enero, que pasa el regex pero no es un día.
  if (diaDeBogota(instanteEnBogota(texto, MEDIODIA)) !== texto) return hoy;
  if (texto > hoy) return hoy;

  return texto;
}

/**
 * El mismo instante, corrido para que **sus componentes UTC sean la hora de Bogotá**.
 *
 * Es una fecha mentirosa a propósito, y solo sirve para una cosa: escribir celdas en una hoja de
 * cálculo. Excel no guarda fechas con zona horaria, guarda un número de días desde 1900, y
 * `write-excel-file` lo calcula con `date.getTime()` a secas. Sin corregir, un pedido de las 3:00
 * pm en Bogotá se abriría en Excel como las 8:00 pm — la contabilidad de la noche caería en el
 * día siguiente y nadie lo notaría hasta cuadrar el mes.
 *
 * No hardcodea el desfase: lo lee de `ahoraEnBogota`, que es la única puerta de la zona horaria
 * en el proyecto (regla 6). Los segundos se copian tal cual porque el desfase es de horas
 * enteras y no los toca.
 *
 * **No la uses para nada que no sea serializar.** Comparar dos de estas contra `Date.now()` da
 * cinco horas de error.
 */
export function enHoraDeBogota(instante: Date): Date {
  const { fecha, minutos } = ahoraEnBogota(instante);
  const [anio, mes, dia] = fecha.split("-").map(Number);

  return new Date(
    Date.UTC(anio, mes - 1, dia, Math.floor(minutos / 60), minutos % 60, instante.getUTCSeconds()),
  );
}

// ------------------------------------------------------------
// Rangos de varios días — lo que necesita la descarga
// ------------------------------------------------------------

/**
 * El rango absoluto que cubren varios días de Bogotá, ambos incluidos.
 *
 * Semiabierto por arriba por lo mismo que `rangoDelDia`: `hasta` es la medianoche del día
 * siguiente al último, y esa medianoche ya no pertenece al rango.
 */
export function rangoDeDias(desde: string, hasta: string): { desde: Date; hasta: Date } {
  return {
    desde: instanteEnBogota(desde, 0),
    hasta: instanteEnBogota(diaSiguiente(hasta), 0),
  };
}

/**
 * Todos los días del rango, uno por uno.
 *
 * Los devuelve **todos**, también los que no tuvieron pedidos: en una tabla por día, una fila que
 * falta se lee como un dato que se perdió, mientras que una fila en cero dice "ese lunes no se
 * abrió", que es justo lo que se quiere saber.
 */
export function diasDelRango(desde: string, hasta: string): string[] {
  const dias: string[] = [];

  for (let dia = desde; dia <= hasta; dia = diaSiguiente(dia)) {
    dias.push(dia);
  }

  return dias;
}

export type RangoPedido = {
  desde: string;
  hasta: string;
  dias: number;
  /** Si hubo que recortar por el tope, para poder decirlo en vez de mentir con el archivo. */
  recortado: boolean;
};

/**
 * Qué rango pidió el usuario, a partir de lo que venga en la URL.
 *
 * Nunca falla: corrige en vez de rechazar, porque esto alimenta una descarga y un error de
 * validación a mitad de camino se lee como que la app se rompió. Lo que hace, en orden:
 *
 * 1. Lo que no sea un día válido y pasado cae en hoy (`diaPedido`).
 * 2. Si vienen al revés, se ordenan. Escribir "del 9 al 5" es un desliz obvio, no una intención.
 * 3. Si el rango excede el tope, **se conserva `hasta` y se recorta `desde`**: quien pide un
 *    rango enorme quiere lo más reciente, no los tres meses de hace dos años.
 */
export function rangoPedido(
  desdeTexto: string | undefined,
  hastaTexto: string | undefined,
  hoy: string,
): RangoPedido {
  const a = diaPedido(desdeTexto, hoy);
  const b = diaPedido(hastaTexto, hoy);

  let desde = a <= b ? a : b;
  const hasta = a <= b ? b : a;

  const dias = contarDias(desde, hasta);
  const recortado = dias > MAXIMO_DIAS_RANGO;

  if (recortado) {
    desde = diaDeBogota(
      new Date(instanteEnBogota(hasta, MEDIODIA).getTime() - (MAXIMO_DIAS_RANGO - 1) * UN_DIA_MS),
    );
  }

  return { desde, hasta, dias: recortado ? MAXIMO_DIAS_RANGO : dias, recortado };
}
