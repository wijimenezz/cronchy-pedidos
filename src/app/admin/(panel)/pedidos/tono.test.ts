/**
 * La cabecera del WAV, que es donde se puede meter la pata sin que se note hasta que Android
 * rechaza el archivo. El render no se prueba aquí: `OfflineAudioContext` no existe en node, mismo
 * motivo por el que `sonido.test.ts` solo cubre la parte pura.
 */

import { describe, expect, it } from "vitest";
import { codificarWav } from "./tono";

const MUESTREO = 44_100;

function leerTexto(vista: DataView, offset: number, largo: number): string {
  let salida = "";
  for (let i = 0; i < largo; i++) salida += String.fromCharCode(vista.getUint8(offset + i));
  return salida;
}

describe("codificarWav", () => {
  it("escribe una cabecera RIFF/WAVE que Android reconoce", () => {
    const vista = new DataView(codificarWav(new Float32Array(100), MUESTREO));

    expect(leerTexto(vista, 0, 4)).toBe("RIFF");
    expect(leerTexto(vista, 8, 4)).toBe("WAVE");
    expect(leerTexto(vista, 12, 4)).toBe("fmt ");
    expect(leerTexto(vista, 36, 4)).toBe("data");
  });

  it("declara PCM de 16 bits, mono, al muestreo que se le pasa", () => {
    const vista = new DataView(codificarWav(new Float32Array(10), MUESTREO));

    expect(vista.getUint16(20, true)).toBe(1); // PCM
    expect(vista.getUint16(22, true)).toBe(1); // mono
    expect(vista.getUint32(24, true)).toBe(MUESTREO);
    expect(vista.getUint16(34, true)).toBe(16); // bits
  });

  it("cuadra los tamaños con los 44 bytes de cabecera", () => {
    const muestras = new Float32Array(500);
    const buffer = codificarWav(muestras, MUESTREO);
    const vista = new DataView(buffer);

    expect(buffer.byteLength).toBe(44 + muestras.length * 2);
    expect(vista.getUint32(40, true)).toBe(muestras.length * 2); // bloque data
    expect(vista.getUint32(4, true)).toBe(36 + muestras.length * 2); // bloque RIFF
  });

  it("deriva los bytes por segundo y la alineación del formato", () => {
    const vista = new DataView(codificarWav(new Float32Array(1), MUESTREO));

    expect(vista.getUint32(28, true)).toBe(MUESTREO * 2);
    expect(vista.getUint16(32, true)).toBe(2);
  });

  it("mapea el rango -1..1 sin dar la vuelta al entero", () => {
    const vista = new DataView(codificarWav(new Float32Array([0, 1, -1]), MUESTREO));

    expect(vista.getInt16(44, true)).toBe(0);
    expect(vista.getInt16(46, true)).toBe(0x7fff);
    expect(vista.getInt16(48, true)).toBe(-0x8000);
  });

  it("recorta lo que se pase de rango en vez de envolverlo", () => {
    // Una muestra a 2.0 sin recortar daria un entero negativo, o sea un chasquido en mitad de la
    // alarma. Se satura, que es lo que hace cualquier reproductor.
    const vista = new DataView(codificarWav(new Float32Array([2, -2]), MUESTREO));

    expect(vista.getInt16(44, true)).toBe(0x7fff);
    expect(vista.getInt16(46, true)).toBe(-0x8000);
  });
});
