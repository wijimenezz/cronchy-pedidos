/**
 * El aviso sonoro del tablero: qué suena, y la pelea con el navegador para que suene.
 *
 * El tono se **genera**, no se descarga. Dos notas cortas con un oscilador son ~30 líneas y
 * ahorran meter un binario al repo, elegir una licencia y gastar una descarga en cada carga
 * del panel. Si algún día se quiere un sonido grabado, se cambia `sonarAviso` y ya.
 *
 * Todos los navegadores **bloquean el audio hasta que alguien toca la página**, así que el
 * `AudioContext` nace suspendido. Sin resolverlo, la primera alerta del día sería muda y nadie
 * sabría por qué — de ahí el botón y el desbloqueo al primer toque.
 */

const CLAVE_PREFERENCIA = "cronchy_sonido_panel";
const CLAVE_NIVEL = "cronchy_volumen_panel";

/**
 * De dónde sale el volumen, porque no es de donde parece y alguien va a intentar "arreglarlo".
 *
 * Antes esto eran dos notas triangulares a 880 y 1320 Hz con la ganancia en `0.35`, y en la tablet
 * del mostrador no se oía. El arreglo **no** es subir ese `0.35`: el techo digital es `1.0`, así
 * que por amplitud sola hay 2,8× de margen y pasarse recorta la onda — distorsión, no volumen.
 *
 * Las tres palancas que sí pagan, y lo que aporta cada una:
 *
 * 1. **La frecuencia**, que es la grande. El altavoz de una tablet es diminuto y no rinde abajo;
 *    el oído humano es más sensible entre 2 y 4 kHz. Los 880 Hz de antes eran casi el peor sitio
 *    posible. 3100 Hz no es un número redondo elegido a ojo: es donde converge el diseño de las
 *    alarmas de humo, por esto mismo. Fácilmente +8-12 dB acústicos sin gastar un ápice de
 *    amplitud.
 * 2. **La onda cuadrada.** A igual pico tiene √3 más de valor eficaz que una triangular, y sus
 *    armónicos caen justo en esa banda sensible.
 * 3. **El pico**, de `0.35` a `0.9`.
 *
 * **Medido** en un `OfflineAudioContext`, sobre la misma ventana de 1 s y sin contar la ventaja de
 * frecuencia, que es acústica y no aparece en la señal:
 *
 * | Nivel        | Eficaz | Pico  | vs. el aviso viejo |
 * | ------------ | ------ | ----- | ------------------ |
 * | (viejo)      | 0.034  | 0.340 | —                  |
 * | Bajo         | 0.084  | 0.181 | +7,9 dB            |
 * | Medio        | 0.188  | 0.408 | +14,9 dB           |
 * | Alto         | 0.419  | 0.907 | +21,8 dB           |
 *
 * La sonoridad percibida se dobla cada ~10 dB, así que Alto ya son ~4,3× **antes** de sumar (1), y
 * ningún nivel recorta. Vale la pena rehacer esa medición si se toca algo de aquí: el `0.35` de
 * antes invitaba a multiplicar el número que no era, y a ojo no se distingue.
 *
 * **No hay compresor, y no es un olvido.** Un compresor sube el nivel medio de una señal con
 * factor de cresta alto; una onda cuadrada ya tiene el eficaz pegado al pico, así que no queda
 * nada que recuperar y el nodo solo añadiría algo difícil de afinar.
 *
 * El comentario que había aquí descartaba la cuadrada por su "filo metálico". Ese compromiso está
 * resuelto al revés a propósito: el filo es exactamente lo que se le pide a una alarma. Devolver
 * esto a una triangular de 880 Hz porque suena más agradable es devolver el aviso que no se oye.
 */
const HZ = 3100;

/** Cuatro pulsos secos en vez de dos notas ligadas: se lee como alarma, no como notificación. */
const PULSOS = 4;
const DURACION_PULSO = 0.09;
const SILENCIO_PULSO = 0.07;

/** El pico del oscilador en el nivel Alto. Es el techo de diseño; `1.0` es el del formato. */
export const PICO = 0.9;

/** Cuánto dura un ciclo entero de la alarma: los cuatro pulsos con sus silencios. */
export const DURACION_ALARMA = PULSOS * (DURACION_PULSO + SILENCIO_PULSO);

/**
 * Programa un ciclo de la alarma sobre cualquier contexto, en vivo o `Offline`.
 *
 * Está aparte para que **el tono que se exporta a un archivo y el que suena en el panel salgan de
 * las mismas líneas** (ver `tono.ts`). Si divergieran, el empleado pondría en los ajustes de
 * Android un sonido que no es el que aprendió a reconocer, y eso es peor que no tener archivo.
 */
export function programarAlarma(
  ctx: BaseAudioContext,
  destino: AudioNode,
  pico: number,
  desde: number,
): void {
  for (let i = 0; i < PULSOS; i++) {
    const oscilador = ctx.createOscillator();
    const volumen = ctx.createGain();

    oscilador.type = "square";
    oscilador.frequency.value = HZ;

    const inicio = desde + i * (DURACION_PULSO + SILENCIO_PULSO);
    const fin = inicio + DURACION_PULSO;

    // Las rampas evitan el "clic" que deja cortar una onda en seco, y con una cuadrada a 0.9 ese
    // clic sería mucho más audible que antes. La de subida es corta a propósito: alargarla
    // redondearía el ataque, que es justo lo que hace que un pulso suene seco.
    volumen.gain.setValueAtTime(0.0001, inicio);
    volumen.gain.exponentialRampToValueAtTime(pico, inicio + 0.002);
    volumen.gain.setValueAtTime(pico, fin - 0.008);
    volumen.gain.exponentialRampToValueAtTime(0.0001, fin);

    oscilador.connect(volumen).connect(destino);
    oscilador.start(inicio);
    oscilador.stop(fin);
  }
}

/** Un solo contexto para toda la vida de la pestaña: crear uno por aviso los va agotando —los
 *  navegadores limitan cuántos puede haber— y además cada uno nacería suspendido otra vez. */
let contexto: AudioContext | null = null;

function obtenerContexto(): AudioContext | null {
  if (typeof window === "undefined") return null;

  // Safari viejo todavía lo expone con prefijo.
  const Constructor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!Constructor) return null;

  contexto ??= new Constructor();
  return contexto;
}

/**
 * Reanuda el contexto. **La primera vez solo funciona dentro de un gesto del usuario**:
 * llamarlo en un efecto al montar no sirve de nada, el navegador lo ignora. Después de ese
 * primer desbloqueo sí se puede reanudar por código, que es de lo que vive `sonarAviso`.
 */
export async function desbloquearSonido(): Promise<void> {
  const ctx = obtenerContexto();
  if (ctx && ctx.state !== "running") await ctx.resume().catch(() => {});
}

/** Si el aviso puede sonar ahora mismo, sin intentarlo. */
export function sonidoListo(): boolean {
  return obtenerContexto()?.state === "running";
}

/**
 * Suena el aviso.
 *
 * **Reanima el contexto antes de rendirse, y ese era el bug**: Chrome suspende el `AudioContext`
 * de una pestaña que lleva rato en segundo plano, y antes esta función simplemente salía en
 * silencio. Como el único `resume()` estaba detrás de un gesto, la alarma se quedaba muda hasta
 * que el empleado volvía y tocaba la ventana — o sea, hasta después de enterarse, que es cuando
 * ya no servía de nada.
 *
 * Reanudar por código es legal aquí porque **ya hubo un gesto**: el botón de armar los avisos. Si
 * nunca lo hubo, `resume()` falla, se traga el error y no suena — que es el comportamiento
 * correcto, porque entonces nadie ha pedido que suene.
 */
export async function sonarAviso(): Promise<void> {
  const ctx = obtenerContexto();
  if (!ctx) return;

  if (ctx.state !== "running") await ctx.resume().catch(() => {});
  // Se vuelve a consultar en vez de mirar `ctx.state` otra vez: `resume()` puede haber fallado
  // —si nunca hubo un gesto no hay nada que reanudar— y además TypeScript no sabe que ese await
  // cambia el estado, así que seguiría creyendo que no puede ser "running".
  if (!sonidoListo()) return;

  // El nivel se lee en cada aviso y no se cachea: así tocar el control del panel se oye en el
  // pitido siguiente sin tener que avisar a nadie de que cambió.
  programarAlarma(ctx, ctx.destination, PICO * ganancia(leerNivel()), ctx.currentTime);
}

// ------------------------------------------------------------
// Mantener la pestaña despierta
// ------------------------------------------------------------

/** Inaudible, pero no cero: lo que cuenta como "reproduciendo" es que salga señal. */
const VOLUMEN_TESTIGO = 0.0001;

let testigo: OscillatorNode | null = null;
let mudo: HTMLAudioElement | null = null;

/**
 * Un WAV de un segundo de silencio, para reproducir en bucle por un `<audio>`.
 *
 * **Web Audio sola no basta en Android**: lo que impide que el sistema congele el proceso no es la
 * heurística de "esta pestaña suena" de Chrome sino tener el **foco de audio**, y ese lo toma un
 * elemento de medios, no un `OscillatorNode`. Por eso hay dos testigos y no uno.
 *
 * Se genera aquí en vez de meter un binario en `public/`, igual que el pitido: son 44 bytes de
 * cabecera y ceros. Y es silencio de verdad —no el 0.0001 del oscilador— porque esto va al
 * altavoz por otra vía y un zumbido audible en el mostrador sería inaceptable.
 */
function wavMudo(): string {
  const muestreo = 8000;
  const muestras = muestreo; // un segundo, y el bucle hace el resto
  const buffer = new ArrayBuffer(44 + muestras * 2);
  const vista = new DataView(buffer);

  const texto = (offset: number, valor: string) => {
    for (let i = 0; i < valor.length; i++) vista.setUint8(offset + i, valor.charCodeAt(i));
  };

  texto(0, "RIFF");
  vista.setUint32(4, 36 + muestras * 2, true);
  texto(8, "WAVE");
  texto(12, "fmt ");
  vista.setUint32(16, 16, true);
  vista.setUint16(20, 1, true);
  vista.setUint16(22, 1, true);
  vista.setUint32(24, muestreo, true);
  vista.setUint32(28, muestreo * 2, true);
  vista.setUint16(32, 2, true);
  vista.setUint16(34, 16, true);
  texto(36, "data");
  vista.setUint32(40, muestras * 2, true);
  // Las muestras se quedan en cero: eso ES el silencio.

  let binario = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binario += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(binario)}`;
}

/**
 * Decirle a Android que esto es un reproductor.
 *
 * Con la sesión declarada el sistema muestra un aviso permanente de medios y trata la app como
 * tal, que es justo lo que hace que no la congele al minuto de irse a AppSheet. **Ese aviso no es
 * un efecto secundario molesto: es la prueba visible de que la alarma está armada**, y en una
 * tablet enchufada al mostrador la batería no es un criterio.
 */
function declararSesion(activa: boolean): void {
  if (typeof navigator === "undefined" || !navigator.mediaSession) return;

  if (!activa) {
    navigator.mediaSession.playbackState = "none";
    return;
  }

  navigator.mediaSession.metadata = new MediaMetadata({
    title: "Escuchando pedidos",
    artist: "Cronchy · Panel",
  });
  navigator.mediaSession.playbackState = "playing";

  // Sin esto, el botón de pausa del aviso del sistema —o el de unos audífonos— dejaría la página
  // sin foco de audio y sin que nadie se entere. Se ignoran a propósito: aquí no hay nada que
  // pausar, y quien apaga los avisos lo hace con la campana del panel.
  for (const accion of ["pause", "stop"] as const) {
    try {
      navigator.mediaSession.setActionHandler(accion, () => {});
    } catch {
      // Un navegador que no conoce la acción no puede tumbar el armado.
    }
  }
}

/**
 * Un tono continuo e inaudible mientras los avisos están armados.
 *
 * Chrome frena los temporizadores de una pestaña oculta a ~1 por minuto y a los cinco minutos
 * aprieta más, así que el polling de 15 s deja de correr a su ritmo justo cuando el empleado está
 * en otra cosa. La excepción es una pestaña que está **reproduciendo audio de verdad** — no una
 * que podría reproducirlo. Esto la mantiene en esa categoría, y de paso impide que el contexto
 * vuelva a suspenderse.
 *
 * **Es best-effort, y conviene saberlo antes de confiar en ello**: las heurísticas de audibilidad
 * de Chrome no son un contrato y pueden cambiar sin aviso. Si algún día dejan de eximir a esta
 * pestaña, el aviso sigue llegando —`sonarAviso` reanima y la notificación del sistema no depende
 * del audio—, solo que con el retraso del throttling. Por eso esto es una mejora del ritmo, no el
 * arreglo.
 */
export function iniciarMantenerDespierto(): void {
  const ctx = obtenerContexto();
  if (!ctx || testigo) return;

  const oscilador = ctx.createOscillator();
  const volumen = ctx.createGain();

  // 20 Hz queda por debajo de lo que un oído distingue, y el volumen lo hace inaudible igual.
  oscilador.frequency.value = 20;
  volumen.gain.value = VOLUMEN_TESTIGO;

  oscilador.connect(volumen).connect(ctx.destination);
  oscilador.start();

  testigo = oscilador;

  // El segundo testigo, el que de verdad cuenta en Android: ver `wavMudo` y `declararSesion`.
  mudo ??= new Audio(wavMudo());
  mudo.loop = true;
  void mudo.play().catch(() => {
    // Sin gesto previo no arranca, y no pasa nada: quien llama a esto es el botón de la campana,
    // así que para cuando llega aquí el gesto ya existió. Si falla, se pierde la sesión de medios
    // y queda el tono de notificación de Android, que es la garantía de todas formas.
  });
  declararSesion(true);
}

export function detenerMantenerDespierto(): void {
  declararSesion(false);

  if (mudo) {
    mudo.pause();
    mudo.src = "";
    mudo = null;
  }

  if (!testigo) return;

  testigo.stop();
  testigo.disconnect();
  testigo = null;
}

/**
 * Apagar los avisos de verdad.
 *
 * Antes el botón cambiaba el icono y guardaba la preferencia, pero `sonarAviso` no consultaba
 * nada y el pitido seguía. Ahora además se corta el testigo, para que una pestaña con los avisos
 * apagados deje de pedirle al navegador que la trate como si estuviera sonando.
 */
export function silenciar(): void {
  detenerMantenerDespierto();
}

// ------------------------------------------------------------
// La preferencia, entre recargas
// ------------------------------------------------------------

export function prefiereSonido(): boolean {
  if (typeof window === "undefined") return false;

  try {
    return window.localStorage.getItem(CLAVE_PREFERENCIA) === "1";
  } catch {
    // Modo incógnito con el almacenamiento capado. Se asume apagado: el botón sigue ahí.
    return false;
  }
}

export function guardarPreferencia(activo: boolean): void {
  try {
    window.localStorage.setItem(CLAVE_PREFERENCIA, activo ? "1" : "0");
  } catch {
    // Que no se pueda recordar la preferencia no debe romper el turno.
  }
}

// ------------------------------------------------------------
// El volumen, en tres niveles
// ------------------------------------------------------------

export type Nivel = "bajo" | "medio" | "alto";

export const NIVELES: Nivel[] = ["bajo", "medio", "alto"];

export const ETIQUETA_NIVEL: Record<Nivel, string> = {
  bajo: "Bajo",
  medio: "Medio",
  alto: "Alto",
};

/**
 * Cuánto del pico de diseño usa cada nivel. Alto es `1`, o sea el techo: por encima empezaría a
 * recortar, y eso ya no es más volumen sino distorsión.
 *
 * **Bajo sigue siendo más fuerte que el aviso viejo**, y es deliberado: la subida grande viene de
 * la frecuencia y de la onda, que no dependen del nivel. Nadie pidió poder volver al pitido que no
 * se oía.
 */
const GANANCIA: Record<Nivel, number> = {
  bajo: 0.2,
  medio: 0.45,
  alto: 1,
};

export function ganancia(nivel: Nivel): number {
  return GANANCIA[nivel];
}

/**
 * Interpreta lo que salió de `localStorage`. Puro y aparte de `leerNivel` **porque Vitest corre en
 * `environment: "node"` y ahí no hay `localStorage`**: si la validación viviera dentro del acceso
 * al almacenamiento no se podría probar. Mismo reparto que `tienda/tipo-pedido.ts`.
 *
 * Cualquier cosa que no sea uno de los tres niveles cae en **Alto**, incluido el `null` de la
 * primera vez: el problema que se estaba resolviendo era que no se oía, así que ese es el default
 * honesto.
 */
export function nivelGuardado(crudo: string | null): Nivel {
  return NIVELES.find((n) => n === crudo) ?? "alto";
}

export function leerNivel(): Nivel {
  if (typeof window === "undefined") return "alto";

  try {
    return nivelGuardado(window.localStorage.getItem(CLAVE_NIVEL));
  } catch {
    return "alto";
  }
}

export function guardarNivel(nivel: Nivel): void {
  try {
    window.localStorage.setItem(CLAVE_NIVEL, nivel);
  } catch {
    // Igual que la preferencia: no recordarlo no puede romper el turno.
  }
}

/**
 * Devuelve el sonido al recargar, sin obligar a tocar el botón cada mañana.
 *
 * El navegador exige un gesto, pero **cualquiera sirve**: el empleado va a tocar una pestaña o
 * una tarjeta de todas formas, y ahí se reanuda el contexto. Se escucha una sola vez y se
 * limpia sola; devuelve la función de limpieza para el efecto que la use.
 */
export function reanudarAlPrimerToque(alReanudar: () => void): () => void {
  const eventos = ["pointerdown", "keydown"] as const;

  const escuchar = () => {
    void desbloquearSonido().then(alReanudar);
    quitar();
  };

  const quitar = () => {
    for (const evento of eventos) document.removeEventListener(evento, escuchar);
  };

  for (const evento of eventos) document.addEventListener(evento, escuchar, { once: true });

  return quitar;
}
