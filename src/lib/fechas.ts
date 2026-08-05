/**
 * Los nombres de meses y días, y la aritmética de calendario que no depende de zona horaria.
 *
 * Existe como módulo aparte porque hay dos selectores de fecha en el proyecto —el de cumpleaños
 * del checkout y el del tablero del panel— y dos listas de meses que se puedan desincronizar
 * son un bug esperando.
 *
 * **Nada aquí usa `Intl.DateTimeFormat("es-CO")`, y es a propósito.** Ese locale mete un espacio
 * duro entre "a." y "m." que **no es el mismo carácter** en Node (U+00A0) y en Chrome (U+202F):
 * un texto formateado así en el servidor y rehidratado en el navegador revienta con un error de
 * hidratación que muestra dos líneas idénticas. Con tablas propias el problema no existe.
 */

export const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export const MESES_CORTOS = [
  "ENE",
  "FEB",
  "MAR",
  "ABR",
  "MAY",
  "JUN",
  "JUL",
  "AGO",
  "SEPT",
  "OCT",
  "NOV",
  "DIC",
];

/** Índice 0 = domingo, igual que `Date.getDay()` y que `ahoraEnBogota().diaSemana`. */
export const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** Los mismos días, sin abreviar, para el rótulo de una fecha completa. */
export const DIAS_SEMANA_LARGOS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

/**
 * Cuántos días tiene ese mes. `mes` va de 1 a 12.
 *
 * El día 0 del mes siguiente es el último del actual, así que el año bisiesto sale solo sin
 * tener que escribir la regla de los múltiplos de 100 y 400.
 */
export function diasDelMes(anio: number, mes: number): number {
  return new Date(anio, mes, 0).getDate();
}

export function conMayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// ------------------------------------------------------------
// Aritmética sobre fechas "YYYY-MM-DD"
// ------------------------------------------------------------

/**
 * Cuántos días se pueden descargar de una vez.
 *
 * Un trimestre cubre cualquier cierre contable razonable. El tope existe porque el otro extremo
 * es un `?desde=2020-01-01` que intentaría cargar años de pedidos —con todos sus snapshots— en
 * memoria para armar un archivo. Es preferible un límite que se pueda explicar a una petición
 * que muere sin decir por qué.
 *
 * Vive aquí y no en `pedidos/dias.ts` porque el diálogo de descarga es un componente de cliente,
 * y ese módulo arrastra `horario.ts` —y con él toda la capa de base de datos— al bundle.
 */
export const MAXIMO_DIAS_RANGO = 92;

/**
 * Un día atrás o adelante sobre una fecha "YYYY-MM-DD".
 *
 * Se construye con `new Date(a, m - 1, d)` (hora local) y se vuelve a leer con
 * `getFullYear/Month/Date`: la zona horaria entra y sale por el mismo sitio, así que se cancela.
 * Lo que jamás hay que hacer es `new Date("2025-12-09")`, que se interpreta como UTC y en
 * Colombia cae un día antes.
 */
export function desplazarDia(fecha: string, dias: number): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const d = new Date(anio, mes - 1, dia + dias);

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Cuántos días cubre un rango, contando los dos extremos.
 *
 * El `Math.round` no es paranoia: en una máquina con horario de verano, dos medianoches locales
 * pueden estar separadas por 23 o 25 horas, y una división exacta daría 4,96 días.
 */
export function contarDias(desde: string, hasta: string): number {
  const [a1, m1, d1] = desde.split("-").map(Number);
  const [a2, m2, d2] = hasta.split("-").map(Number);

  const ms = new Date(a2, m2 - 1, d2).getTime() - new Date(a1, m1 - 1, d1).getTime();

  return Math.round(ms / (24 * 60 * 60 * 1000)) + 1;
}
