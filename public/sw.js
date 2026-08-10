/**
 * El service worker del panel. Existe para UNA cosa: recibir avisos de pedido nuevo cuando el
 * panel no está abierto, o cuando lo está pero en Android.
 *
 * **NO LLEVA HANDLER DE `fetch`, Y NO ES UN OLVIDO.** Es lo que alguien va a querer añadir algún
 * día "para que funcione sin conexión", y un service worker que cachea respuestas rompería de
 * raíz las dos cosas de las que vive este proyecto: el ISR de la carta pública y el polling de
 * 15 s del tablero. Un pedido servido desde caché es un pedido que no existe. Si algún día hace
 * falta caché, se piensa entero, no se añade aquí.
 *
 * Va en `public/` a propósito: así se sirve desde la raíz del sitio y su scope cubre todo. Servido
 * desde `/admin/` solo controlaría el panel, y el registro fallaría desde cualquier otra ruta.
 *
 * Sin `import` ni dependencias: es JavaScript plano que ejecuta el navegador tal cual, igual que
 * el tono del aviso se genera en vez de descargarse.
 */

/** Lo mismo que usa la notificación de la página, para que las dos se vean iguales. */
const ICONO = "/churro_icon.png";
const ETIQUETA = "cronchy-pedidos";
const DESTINO = "/admin/pedidos";

// Tomar el control sin esperar a que se cierren las pestañas viejas: si no, una versión nueva del
// service worker se queda "waiting" hasta que el empleado cierre el panel, que puede ser nunca.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (evento) => evento.waitUntil(self.clients.claim()));

/**
 * Llegó un pedido.
 *
 * El payload viene cifrado de punta a punta y lo manda `lib/notificaciones/push.ts`. Trae lo
 * mínimo —número y cuántos van— porque esto se ve en una pantalla bloqueada: mismo criterio que
 * la pantalla del domiciliario, que tampoco expone la ficha de nadie.
 */
self.addEventListener("push", (evento) => {
  let datos = {};
  try {
    datos = evento.data ? evento.data.json() : {};
  } catch {
    // Un payload que no parsea no puede dejar al empleado sin aviso: se muestra el genérico.
  }

  const titulo = datos.titulo || "Cronchy · pedidos";
  const cuerpo = datos.cuerpo || "Entró un pedido nuevo";

  evento.waitUntil(
    self.registration.showNotification(titulo, {
      body: cuerpo,
      icon: ICONO,
      badge: ICONO,
      tag: ETIQUETA,
      // Reemplaza a la anterior en vez de apilar, pero vuelve a alertar: cinco pedidos seguidos
      // son cinco avisos, no una torre de cinco notificaciones.
      renotify: true,
      // Se queda hasta que alguien la toca. En una cocina, una notificación que se desvanece a
      // los cinco segundos es una que nadie vio.
      requireInteraction: true,
    }),
  );
});

/**
 * Tocaron la notificación: al panel.
 *
 * Se busca una ventana del panel ya abierta y se enfoca antes de abrir una nueva. Sin esto, tres
 * pedidos en una tarde dejan tres pestañas del panel abiertas, cada una con su propio polling.
 */
self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();

  evento.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((ventanas) => {
        for (const ventana of ventanas) {
          if (ventana.url.includes(DESTINO)) return ventana.focus();
        }
        return self.clients.openWindow(DESTINO);
      }),
  );
});
