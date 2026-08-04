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
 * Reanuda el contexto. **Solo funciona dentro de un gesto del usuario**: llamarlo en un efecto
 * al montar no sirve de nada, el navegador lo ignora.
 */
export async function desbloquearSonido(): Promise<void> {
  const ctx = obtenerContexto();
  if (ctx && ctx.state === "suspended") await ctx.resume();
}

/** Si el aviso puede sonar ahora mismo, sin intentarlo. */
export function sonidoListo(): boolean {
  return obtenerContexto()?.state === "running";
}

/**
 * Suena el aviso. Si el contexto sigue bloqueado no hace nada y no lanza: quien decide si el
 * empleado se entera es el botón, no esta función.
 */
export function sonarAviso(): void {
  const ctx = obtenerContexto();
  if (!ctx || ctx.state !== "running") return;

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
