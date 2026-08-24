"use client";

/**
 * Entrega un ticket ya armado al sistema para que lo imprima.
 *
 * La URL viene del servidor (`prepararImpresion`) con los bytes ESC/POS dentro, y a partir de
 * aquí quien manda es el sistema operativo: en la tablet lo recoge la app de impresión, en
 * Windows el handler registrado para el esquema.
 *
 * **Se navega con un `<a>` y no con `location.href`.** Los dos acaban en el mismo sitio cuando
 * hay quien atienda el esquema, pero un click de enlace lo trata el navegador como una entrega a
 * una aplicación externa y deja el documento actual intacto — que es lo que hace falta, porque el
 * empleado se queda en el tablero y ese tablero es el que vigila la cocina (regla 19).
 *
 * **No devuelve nada, y no es una omisión**: el navegador no se entera de si el papel salió. Es
 * el mismo trato que `wa.me` (regla 10); el acuse lo da el `Toast` de la app de impresión. Una
 * confirmación en pantalla aquí sería inventada.
 *
 * **Ojo si se llama junto a un `window.open`: esto GASTA la activación transitoria del toque.**
 * Un gesto solo trae una, así que la otra salida se queda sin ella. Por eso en `avanzar()` el
 * WhatsApp va primero — allí está escrito el porqué, y cambiarlo rompe el aviso al cliente.
 */
export function dispararImpresion(url: string): void {
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.rel = "noopener";

  // Fuera de la vista pero dentro del documento: un `<a>` suelto en memoria no dispara la
  // entrega al sistema en todos los navegadores.
  enlace.style.display = "none";
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
}
