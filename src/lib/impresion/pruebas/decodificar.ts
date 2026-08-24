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

  for (let i = 0; i < bytes.length; ) {
    const salto = largoDelComando(bytes, i);

    if (salto > 0) {
      if (bytes[i] === GS && bytes[i + 1] === 0x21) ancho = multiplicadorDeAncho(bytes[i + 2]);
      i += salto;
      continue;
    }

    const byte = bytes[i];

    if (byte === LF) {
      lineas.push({ texto, columnas });
      texto = "";
      columnas = 0;
    } else {
      texto += INVERSO.get(byte) ?? String.fromCharCode(byte);
      columnas += ancho;
    }

    i += 1;
  }

  lineas.push({ texto, columnas });

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
