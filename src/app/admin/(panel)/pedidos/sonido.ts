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
const PICO = 0.9;

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

  const ahora = ctx.currentTime;
  // El nivel se lee en cada aviso y no se cachea: así tocar el control del panel se oye en el
  // pitido siguiente sin tener que avisar a nadie de que cambió.
  const pico = PICO * ganancia(leerNivel());

  for (let i = 0; i < PULSOS; i++) {
    const oscilador = ctx.createOscillator();
    const volumen = ctx.createGain();

    oscilador.type = "square";
    oscilador.frequency.value = HZ;

    const inicio = ahora + i * (DURACION_PULSO + SILENCIO_PULSO);
    const fin = inicio + DURACION_PULSO;

    // Las rampas evitan el "clic" que deja cortar una onda en seco, y con una cuadrada a 0.9 ese
    // clic sería mucho más audible que antes. La de subida es corta a propósito: alargarla
    // redondearía el ataque, que es justo lo que hace que un pulso suene seco.
    volumen.gain.setValueAtTime(0.0001, inicio);
    volumen.gain.exponentialRampToValueAtTime(pico, inicio + 0.002);
    volumen.gain.setValueAtTime(pico, fin - 0.008);
    volumen.gain.exponentialRampToValueAtTime(0.0001, fin);

    oscilador.connect(volumen).connect(ctx.destination);
    oscilador.start(inicio);
    oscilador.stop(fin);
  }
}

// ------------------------------------------------------------
// Mantener la pestaña despierta
// ------------------------------------------------------------

/** Inaudible, pero no cero: lo que cuenta como "reproduciendo" es que salga señal. */
const VOLUMEN_TESTIGO = 0.0001;

let testigo: OscillatorNode | null = null;

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
}

export function detenerMantenerDespierto(): void {
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
