/**
 * Lee un ticket ya armado y lo devuelve como texto. **Solo para los tests.**
 *
 * No es la inversa exacta de `crearTicket`: descarta los comandos de estilo y se queda con lo que
 * saldría impreso. Con eso, un test de `comanda.ts` puede decir "esta línea dice esto" en vez de
 * comparar cuatrocientos bytes, que no fija nada legible y falla entero al mover un espacio.
 *
 * La tabla de caracteres se construye **llamando a `codificar`**, no copiándola: dos tablas que
 * dicen lo mismo terminan divergiendo, y la que mentiría sería la del test — que es la que
 * decide si el código está bien.
 *
 * **Sí sigue los comandos de tamaño**, y esa es la diferencia con la primera versión. A doble
 * ancho cada carácter ocupa DOS columnas del papel, así que contar caracteres daba por buena una
 * línea de 27 que en la impresora mide 54 y se parte sola. `columnasDelTicket` es lo que hace que
 * la aserción "ninguna línea se pasa del ancho" pueda fallar de verdad.
 */

import { codificar } from "../escpos";

/** Todo lo que `codificar` sabe representar con un byte propio. */
const REPRESENTABLES = "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ£ƒáíóúñÑªº¿¬½¼¡«»°";

const INVERSO = new Map<number, string>(
  [...REPRESENTABLES].map((caracter) => [codificar(caracter)[0], caracter]),
);

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** Cuántos bytes ocupa cada comando, contando el ESC/GS. */
function largoDelComando(bytes: Uint8Array, i: number): number {
  const marca = bytes[i];
  const orden = bytes[i + 1];

  if (marca === ESC) return orden === 0x40 ? 2 : 3;
  if (marca === GS) return orden === 0x56 ? 4 : 3;

  return 0;
}

export type LineaImpresa = {
  /** Lo que se lee en el papel. */
  texto: string;
  /** Cuántas columnas de las 48 gasta, ya contando el doble ancho. */
  columnas: number;
  /** Si salió marcada. Se mira `ESC E`, que es el que abre y cierra el estilo. */
  negrita: boolean;
};

/**
 * El ancho de `GS ! n`: los bits 4-6 son la magnificación horizontal menos uno.
 *
 * `0x00` normal, `0x10` doble ancho, `0x11` doble ancho **y** alto — al papel solo le importa
 * lo primero, porque la altura no gasta columnas.
 */
function multiplicadorDeAncho(n: number): number {
  return ((n >> 4) & 0x07) + 1;
}

function leerTicket(bytes: Uint8Array): LineaImpresa[] {
  const lineas: LineaImpresa[] = [];
  let texto = "";
  let columnas = 0;
  let ancho = 1;
  let negrita = false;

  for (let i = 0; i < bytes.length; ) {
    const salto = largoDelComando(bytes, i);

    if (salto > 0) {
      if (bytes[i] === GS && bytes[i + 1] === 0x21) ancho = multiplicadorDeAncho(bytes[i + 2]);
      // `ESC G` (doble golpe) viaja siempre pegado a este, así que mirar uno basta.
      if (bytes[i] === ESC && bytes[i + 1] === 0x45) negrita = bytes[i + 2] === 0x01;
      i += salto;
      continue;
    }

    const byte = bytes[i];

    if (byte === LF) {
      // El estilo se cierra DESPUÉS del salto de línea —`escribir` lo hace así—, o sea que aquí
      // la bandera todavía es la de la línea que acaba de terminar. Leerla más tarde daría la de
      // la siguiente.
      lineas.push({ texto, columnas, negrita });
      texto = "";
      columnas = 0;
    } else {
      texto += INVERSO.get(byte) ?? String.fromCharCode(byte);
      columnas += ancho;
    }

    i += 1;
  }

  lineas.push({ texto, columnas, negrita });

  return lineas;
}

/** El ticket como texto plano, con sus saltos de línea. */
export function textoDelTicket(bytes: Uint8Array): string {
  return leerTicket(bytes)
    .map((linea) => linea.texto)
    .join("\n");
}

/** El ticket partido en líneas, sin espacios de relleno al final de cada una. */
export function lineasDelTicket(bytes: Uint8Array): string[] {
  return leerTicket(bytes).map((linea) => linea.texto.trimEnd());
}

/**
 * Cuántas columnas del papel gasta cada línea.
 *
 * Es lo que hay que comparar contra `ANCHO`: el relleno cuenta —la impresora lo recibe— y el
 * doble ancho cuenta doble.
 */
export function columnasDelTicket(bytes: Uint8Array): number[] {
  return leerTicket(bytes).map((linea) => linea.columnas);
}

/**
 * Las líneas que salieron en negrita, sin espacios de relleno ni sangría.
 *
 * Sin esto, "el nombre del producto va marcado" solo se podía afirmar buscando `[0x1b,0x45,0x01]`
 * en el ticket entero —que pasa en cuanto haya UNA línea en negrita en cualquier parte— o
 * comparando bytes a mano. Es el mismo motivo por el que el decodificador ya seguía el tamaño.
 */
export function negritasDelTicket(bytes: Uint8Array): string[] {
  return leerTicket(bytes)
    .filter((linea) => linea.negrita)
    .map((linea) => linea.texto.trim());
}
