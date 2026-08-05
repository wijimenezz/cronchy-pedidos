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
