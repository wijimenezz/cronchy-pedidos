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
 * **Esto NO sirve para el mismo toque que abre un `window.open`, y da igual el orden.** Un gesto
 * trae una sola activación transitoria; la salida que va segunda se queda sin ella, y sin
 * activación **Chrome no lanza el protocolo externo: lo bloquea en silencio**, sin diálogo y sin
 * error. Aquí llegó a estar escrito que lo peor era un «¿Abrir POS Printer?»; no es cierto, y
 * mientras lo fue nadie se enteró de que había dejado de imprimirse.
 *
 * Cuando hacen falta las dos salidas en un toque, la impresión **no** sale por esta función sino
 * como acción por defecto de un `<a href="cronchyprinter://…">` precargado, que es el gesto real.
 * Ver `avanzar` en `TarjetaPedido`. Esta sigue valiendo para lo que es un toque y una salida: el
 * icono de la tarjeta y el modal de tickets.
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
