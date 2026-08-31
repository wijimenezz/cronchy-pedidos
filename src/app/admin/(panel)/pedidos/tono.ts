/**
 * Exportar la alarma a un archivo, para ponerla como tono de notificación de Android.
 *
 * **Es la única forma de que el aviso suene con el panel en segundo plano o cerrado.** Una página
 * congelada no ejecuta nada —Android suspende las PWA que no están al frente, así que ni el
 * polling corre ni `sonarAviso` llega a llamarse—, y un service worker puede mostrar
 * notificaciones pero **no reproducir audio**. Quien sí puede sonar siempre es el sistema
 * operativo, y el canal de notificaciones de la app instalada acepta un archivo propio.
 *
 * Por eso esto no es un extra: mientras el pitido salga de la página, depende de que la página
 * exista. Sale de aquí y depende de Android, que es lo que se quería.
 *
 * El audio se **genera**, igual que el que suena en vivo, y de las mismas líneas
 * (`programarAlarma`): un archivo distinto del pitido real sería peor que ninguno, porque el
 * empleado aprendería a reconocer un sonido que el panel no hace.
 */

import { DURACION_ALARMA, PICO, programarAlarma } from "./sonido";

/**
 * Cuántos ciclos lleva el archivo.
 *
 * Un ciclo dura 0,64 s, y un tono de notificación de medio segundo se pierde entre el ruido de la
 * cocina justo igual que el aviso viejo que esto vino a arreglar. Con la pausa, seis ciclos son
 * 5,5 s: lo que se tarda en cruzar el local y mirar la tablet, sin llegar a lo insoportable.
 */
const CICLOS = 6;

/** Un respiro entre ciclos, para que se lea como alarma repetida y no como un zumbido continuo. */
const PAUSA_CICLO = 0.28;

/**
 * 44.1 kHz y no 48: es lo que cualquier reproductor de Android acepta sin recodificar, y a 3100 Hz
 * sobra de largo. Mono, porque una alarma no tiene nada que repartir entre dos canales y el
 * archivo pesa la mitad.
 */
const MUESTREO = 44_100;
const CANALES = 1;
const BITS = 16;

/** El nombre con el que se baja. Sin espacios: acaba en la lista de tonos del sistema. */
export const NOMBRE_ARCHIVO = "cronchy-pedido-nuevo.wav";

/**
 * Convierte muestras en `-1..1` a un WAV PCM de 16 bits.
 *
 * Puro y separado del render **porque `OfflineAudioContext` no existe en node** y Vitest corre en
 * `environment: "node"` — mismo reparto que `nivelGuardado` frente a `leerNivel`. Así la cabecera,
 * que es donde de verdad se puede meter la pata, sí se puede probar.
 *
 * WAV y no MP3/OGG a propósito: es PCM crudo con 44 bytes de cabecera, así que se escribe entero
 * aquí sin traer un codificador. Android lo acepta como tono sin más.
 */
export function codificarWav(muestras: Float32Array, muestreo = MUESTREO): ArrayBuffer {
  const bytesPorMuestra = BITS / 8;
  const datos = muestras.length * bytesPorMuestra;
  const buffer = new ArrayBuffer(44 + datos);
  const vista = new DataView(buffer);

  const texto = (offset: number, valor: string) => {
    for (let i = 0; i < valor.length; i++) vista.setUint8(offset + i, valor.charCodeAt(i));
  };

  texto(0, "RIFF");
  // El tamaño del RIFF excluye los 8 bytes de "RIFF" + este mismo campo.
  vista.setUint32(4, 36 + datos, true);
  texto(8, "WAVE");

  texto(12, "fmt ");
  vista.setUint32(16, 16, true); // longitud del bloque fmt para PCM
  vista.setUint16(20, 1, true); // 1 = PCM sin comprimir
  vista.setUint16(22, CANALES, true);
  vista.setUint32(24, muestreo, true);
  vista.setUint32(28, muestreo * CANALES * bytesPorMuestra, true); // bytes por segundo
  vista.setUint16(32, CANALES * bytesPorMuestra, true); // alineación de bloque
  vista.setUint16(34, BITS, true);

  texto(36, "data");
  vista.setUint32(40, datos, true);

  for (let i = 0; i < muestras.length; i++) {
    // El recorte es defensivo: `programarAlarma` no se pasa de 1, pero una muestra fuera de rango
    // daría la vuelta al entero con signo y sonaría como un chasquido en vez de saturar.
    const v = Math.max(-1, Math.min(1, muestras[i]));
    vista.setInt16(44 + i * bytesPorMuestra, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }

  return buffer;
}

/**
 * Renderiza el archivo entero. Siempre al **pico de diseño**, sin pasar por el nivel del panel:
 * el volumen de un tono de notificación lo pone Android, y exportarlo en "Bajo" solo serviría
 * para que quien lo baje crea que el archivo salió mal.
 */
export async function renderizarAlarma(): Promise<ArrayBuffer> {
  const paso = DURACION_ALARMA + PAUSA_CICLO;
  const duracion = CICLOS * paso;

  const ctx = new OfflineAudioContext(CANALES, Math.ceil(duracion * MUESTREO), MUESTREO);
  for (let i = 0; i < CICLOS; i++) programarAlarma(ctx, ctx.destination, PICO, i * paso);

  const renderizado = await ctx.startRendering();
  return codificarWav(renderizado.getChannelData(0), MUESTREO);
}

/**
 * Lo baja. El `revokeObjectURL` va después del clic y no en un `setTimeout`: el navegador ya
 * arrancó la descarga cuando vuelve de `click()`, y dejar el blob vivo filtra la memoria del
 * archivo entero mientras la pestaña siga abierta.
 */
export async function descargarTono(): Promise<void> {
  const wav = await renderizarAlarma();
  const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));

  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = NOMBRE_ARCHIVO;
  enlace.click();

  URL.revokeObjectURL(url);
}
