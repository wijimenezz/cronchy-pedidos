/**
 * El aviso que se ve estando en otra aplicación, disparado por el propio panel.
 *
 * El sonido y el `(N)` del título solo sirven si el navegador está delante: el título hay que
 * verlo en la barra de pestañas, y el pitido se pierde entre el ruido de una cocina. Una
 * notificación del sistema sale por encima de lo que sea que esté en pantalla.
 *
 * **Sale por el service worker y no por `new Notification()`, y eso no es una preferencia:** en
 * Android el constructor directo LANZA (`Illegal constructor`), así que la primera versión de
 * esto no avisaba nada en la tablet y el `catch` se lo tragaba en silencio.
 * `registration.showNotification()` funciona en los dos sitios.
 *
 * Esto cubre el panel abierto en alguna pestaña. Con el navegador cerrado avisa Web Push
 * (`push.ts`), que usa el mismo service worker por el otro extremo.
 */

import { registroSw } from "./push";

/** El icono más pequeño que ya existe en `public/`. Los demás son fotos de producto o logos. */
const ICONO = "/churro_icon.png";

/** Reemplazar en vez de apilar: cinco pedidos seguidos no son cinco notificaciones. */
const ETIQUETA = "cronchy-pedidos";

export function soportaNotificaciones(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function permisoConcedido(): boolean {
  return soportaNotificaciones() && Notification.permission === "granted";
}

export function permisoDenegado(): boolean {
  return soportaNotificaciones() && Notification.permission === "denied";
}

/**
 * Pide el permiso. **Hay que llamarlo desde un gesto del usuario**, igual que al desbloquear el
 * audio, así que va colgado del mismo botón: un solo toque arma los dos canales.
 *
 * Si ya se denegó, no se vuelve a preguntar. El navegador bloquea el diálogo tras un rechazo y
 * reintentarlo solo gastaría código que nunca hace nada.
 */
export async function pedirPermisoNotificaciones(): Promise<boolean> {
  if (!soportaNotificaciones()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;

  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    // Safari viejo devolvía el permiso por callback y no por promesa. Sin permiso, sin aviso.
    return false;
  }
}

/**
 * "1 pedido nuevo" · "3 pedidos nuevos · 5 sin aceptar".
 *
 * Puro y aparte para poder testearlo: los plurales escritos a mano son de lo que se rompe sin
 * que nadie lo note hasta que la cocina lee "1 pedidos nuevos". El total solo se añade cuando
 * dice algo que el primer número no dice ya.
 */
export function textoAviso(nuevos: number, sinAceptar: number): string {
  const cabeza = nuevos === 1 ? "1 pedido nuevo" : `${nuevos} pedidos nuevos`;

  if (sinAceptar <= nuevos) return cabeza;

  return `${cabeza} · ${sinAceptar} sin aceptar`;
}

/**
 * Avisa de los pedidos que acaban de entrar.
 *
 * `requireInteraction` la deja en pantalla hasta que alguien la toca: en una cocina, una
 * notificación que se desvanece a los cinco segundos es una que nadie vio. Y al tocarla se
 * levanta la ventana del panel, que es lo único que se puede hacer con ese aviso.
 *
 * Sin permiso no hace nada y no lanza — quien decide si el empleado se entera es el botón.
 */
export async function avisarPedidosNuevos(nuevos: number, sinAceptar: number): Promise<void> {
  if (!permisoConcedido() || nuevos <= 0) return;

  // `renotify` no está en la definición de TypeScript, pero sí en el navegador. Con `tag`, la
  // notificación nueva reemplaza a la anterior EN SILENCIO; `renotify` hace que además vuelva a
  // alertar. Sin esto, el segundo pedido entraría sin que nadie lo note.
  const opciones: NotificationOptions & { renotify?: boolean } = {
    body: textoAviso(nuevos, sinAceptar),
    icon: ICONO,
    badge: ICONO,
    tag: ETIQUETA,
    renotify: true,
    requireInteraction: true,
  };

  try {
    const registro = await registroSw();
    // Sin service worker no hay notificación posible en Android, y en escritorio tampoco vale la
    // pena mantener dos caminos: el sonido sigue avisando igual.
    if (!registro) return;

    // El clic lo atiende el service worker (`notificationclick`), que además sabe enfocar la
    // pestaña del panel que ya esté abierta en vez de abrir otra.
    await registro.showNotification("Cronchy · pedidos", opciones);
  } catch {
    // Que falle el aviso visual no puede tumbar el tablero.
  }
}
