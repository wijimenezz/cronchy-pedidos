/**
 * Web Push: el único canal que llega con el panel cerrado.
 *
 * El sonido y la notificación de la página necesitan que el panel esté abierto en alguna pestaña.
 * Esto no: en la tablet Android el aviso llega con Chrome cerrado del todo, porque lo entrega el
 * sistema operativo. **En Windows hace falta activar "Seguir ejecutando aplicaciones en segundo
 * plano al cerrar Google Chrome"** (`chrome://settings/system`), o al cerrar la última ventana el
 * proceso muere y no recibe nada.
 *
 * El service worker exige HTTPS, con `localhost` como única excepción — así que en local funciona,
 * pero probarlo desde la tablet obliga a un preview desplegado.
 */

const RUTA_SW = "/sw.js";

/**
 * La llave VAPID viaja en base64url —`-` y `_` en vez de `+` y `/`, y sin relleno— pero
 * `applicationServerKey` exige bytes crudos.
 *
 * Está aparte y testeada porque es de las conversiones que, si salen mal, fallan con un
 * `InvalidAccessError` que no dice nada de lo que pasó realmente.
 */
export function base64UrlABytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const relleno = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + relleno).replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(base64);

  // Se reserva el buffer y se llena, en vez del `Uint8Array.from` obvio: aquel devuelve
  // `Uint8Array<ArrayBufferLike>` —podría respaldarse en un `SharedArrayBuffer`— y
  // `applicationServerKey` exige un `ArrayBuffer` de verdad.
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);

  return bytes;
}

export function soportaPush(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

/**
 * Registra el service worker y devuelve su registro.
 *
 * También lo usa la notificación de la página: en Android `new Notification()` lanza, y la única
 * vía es `registration.showNotification()`.
 */
export async function registroSw(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;

  try {
    return await navigator.serviceWorker.register(RUTA_SW);
  } catch {
    // Sin HTTPS, o con el service worker bloqueado por política. Los otros canales siguen.
    return null;
  }
}

/**
 * Suscribe este dispositivo y guarda la suscripción en el servidor.
 *
 * Se llama desde el mismo clic que arma el sonido y pide el permiso: el navegador exige un gesto
 * para lo primero y para lo segundo, así que un solo toque deja los tres canales listos.
 *
 * Devuelve si quedó suscrito. No lanza: que falle el push no puede impedir que suene la alarma.
 */
export async function activarPush(): Promise<boolean> {
  if (!soportaPush()) return false;

  const clavePublica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!clavePublica) return false;

  try {
    const registro = await registroSw();
    if (!registro) return false;

    // `userVisibleOnly` es obligatorio en Chrome: no se puede recibir un push sin mostrar nada.
    // Aquí encaja solo, porque todo push de este panel termina en una notificación.
    const suscripcion =
      (await registro.pushManager.getSubscription()) ??
      (await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlABytes(clavePublica),
      }));

    const respuesta = await fetch("/api/admin/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(suscripcion),
    });

    return respuesta.ok;
  } catch {
    return false;
  }
}

/**
 * Suelta este dispositivo, en el navegador y en el servidor.
 *
 * Lo llaman el botón al apagar los avisos y el de cerrar sesión. Lo segundo importa: sin ello, el
 * teléfono de alguien que ya no trabaja aquí seguiría sonando con cada pedido.
 */
export async function desactivarPush(): Promise<void> {
  if (!soportaPush()) return;

  try {
    const registro = await navigator.serviceWorker.getRegistration(RUTA_SW);
    const suscripcion = await registro?.pushManager.getSubscription();
    if (!suscripcion) return;

    // Primero el servidor: si se cancela en el navegador y luego falla el DELETE, queda una fila
    // apuntando a un endpoint muerto y nadie puede volver a encontrarla para borrarla.
    await fetch("/api/admin/push", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: suscripcion.endpoint }),
      // El botón de salir navega enseguida; `keepalive` deja que la petición termine igual.
      keepalive: true,
    });

    await suscripcion.unsubscribe();
  } catch {
    // Que no se pueda desuscribir no debe impedir cerrar sesión ni apagar el sonido.
  }
}
