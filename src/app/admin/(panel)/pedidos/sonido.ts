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

/** Dos notas ascendentes: se distingue del resto de pitidos de una cocina y no asusta. */
const NOTAS: { hz: number; desde: number; duracion: number }[] = [
  { hz: 880, desde: 0, duracion: 0.18 },
  { hz: 1320, desde: 0.16, duracion: 0.28 },
];

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

  for (const nota of NOTAS) {
    const oscilador = ctx.createOscillator();
    const volumen = ctx.createGain();

    // `triangle` en vez de `sine`: se oye por encima del ruido de una cocina sin el filo
    // metálico de una onda cuadrada.
    oscilador.type = "triangle";
    oscilador.frequency.value = nota.hz;

    const inicio = ahora + nota.desde;
    const fin = inicio + nota.duracion;

    // La rampa de bajada evita el "clic" que deja cortar una onda en seco.
    volumen.gain.setValueAtTime(0.0001, inicio);
    volumen.gain.exponentialRampToValueAtTime(0.35, inicio + 0.02);
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
