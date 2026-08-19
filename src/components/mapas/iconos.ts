/**
 * Los pines de los mapas.
 *
 * Existe por un motivo muy concreto: **el icono por defecto de Leaflet no se ve**. Lo resuelve con
 * rutas relativas a `marker-icon.png` y `marker-shadow.png` que el bundler no empaqueta, así que el
 * marcador queda en el DOM, arrastrable y funcionando, pero sin dibujar nada. Ese fue justo el bug
 * del pin del local en `/admin/zonas`: se podía mover a ciegas y guardaba bien.
 *
 * La salida es siempre un `divIcon`, que recibe **HTML propio** y no depende de ninguna imagen que
 * Leaflet tenga que resolver por su cuenta.
 */

/**
 * El pin del CLIENTE: dónde va el pedido.
 *
 * Estaba escrito dos veces, idéntico, en `MapaUbicacion` y `MapaPedidoLeaflet`. Vive aquí para que
 * el cliente reconozca el mismo punto en el checkout y en el seguimiento — si divergieran, parecería
 * que son dos sitios distintos.
 */
export const SVG_PIN_CLIENTE = `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">
  <path d="M16 0C7.2 0 0 7.2 0 16c0 11 16 26 16 26s16-15 16-26c0-8.8-7.2-16-16-16z" fill="#F26B1D"/>
  <circle cx="16" cy="16" r="6" fill="#FAF3E8"/>
</svg>`;

/** Tamaño del pin del cliente: la gota, con la punta abajo. */
export const TAMANO_PIN_CLIENTE: [number, number] = [32, 42];
/** La punta de la gota es lo que señala, así que ahí va el ancla. */
export const ANCLA_PIN_CLIENTE: [number, number] = [16, 42];

/**
 * El pin de la TIENDA: el churro con gorra, la misma mascota que el storefront pinta al costado
 * (`MarcoPublico`). No se parece en nada al pin del cliente, y eso es lo que se busca: en el mapa de
 * zonas el admin mira las dos cosas a la vez y el local no puede confundirse con una dirección.
 *
 * **Es un `<img>` a pelo y no `next/image`, y no se puede evitar**: `L.divIcon` recibe una cadena de
 * HTML, no JSX, así que ahí no cabe un componente de React. La convención de `next/image` es para
 * las fotos del catálogo que llegan de Supabase; esto es un asset estático de `public/`, servido tal
 * cual desde la raíz — y es precisamente esa URL fija la que funciona donde Leaflet falla.
 *
 * `pointer-events:none` para que el arrastre lo capture el marcador y no la imagen, y
 * `drop-shadow` para que la mascota se despegue de las tiles y de los polígonos.
 */
export const HTML_PIN_TIENDA = `
<img src="/churro-gorra.png" alt="" width="36" height="52"
     style="width:36px;height:52px;pointer-events:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))">`;

/** 36×52 conserva la proporción del archivo (318×456) y deja leer la cara y la gorra. */
export const TAMANO_PIN_TIENDA: [number, number] = [36, 52];
/**
 * Abajo y al centro, **no** en el centro del dibujo: el churro está de pie y lo que señala son sus
 * zapatos. Anclarlo por el medio dejaría el local corrido media cuadra al norte.
 */
export const ANCLA_PIN_TIENDA: [number, number] = [18, 52];
