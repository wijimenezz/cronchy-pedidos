import type { MetadataRoute } from "next";

/**
 * El manifest del PANEL, que es una app distinta de la tienda aunque compartan dominio.
 *
 * `app/manifest.ts` ya genera `/manifest.webmanifest`, pero apunta a `/` con el icono del churro:
 * es la carta, para el cliente. Un manifest solo tiene un `start_url`, un `scope` y un juego de
 * iconos, así que instalar el panel desde ahí habría instalado la tienda. Dos usos, dos personas,
 * dos manifests. Los cuelga cada layout con `metadata.manifest`.
 *
 * **Vive en la raíz y NO bajo `/admin`, y ese detalle es el que lo rompería.** `src/proxy.ts`
 * corta `/admin/*` sin sesión (regla 12): servido desde ahí, Chrome se encontraría una redirección
 * al login al ir a buscarlo y lo leería como inválido. Lo que tiene que estar dentro del `scope`
 * es el **documento**, no el archivo del manifest.
 *
 * **Que esto sea instalable de verdad no obliga a tocar `public/sw.js`.** Aquí llegó a estar
 * escrito que Chrome exige un service worker con handler de `fetch` para el botón de Instalar, y
 * dejó de ser cierto: se quitó en la v108 de Android y la v112 de escritorio. Lo que sigue
 * necesitando ese handler es `beforeinstallprompt` —el prompt programático—, así que aquí no hay
 * botón propio de "Instalar" y se instala desde el menú de Chrome. La regla 19 sigue en pie: ese
 * handler cachearía respuestas y rompería el polling del tablero.
 *
 * **Los iconos salen de `public/helado_cup.png`**, que es vertical (428×624). Se cuadran añadiendo
 * fondo crema arriba y abajo, nunca recortando: un `cover` le cortaría la cabeza y los pies al
 * vaso. Y el maskable no es el de 512 duplicado — Android le pasa un recorte redondo o de squircle
 * según el launcher, así que lleva el dibujo al 60 % del lienzo en vez de al 80 %. Se generaron con
 * `sharp` (`fit: "contain"` sobre lienzo `#faf3e8`) y se commitearon, igual que los `icono-*.png`
 * de la tienda.
 */
export function GET(): Response {
  const manifest: MetadataRoute.Manifest = {
    /**
     * La identidad de la app instalada. Explícito y no derivado de `start_url`, que es lo que
     * pasa si se omite: el día que el tablero cambie de ruta, la app ya instalada en la tablet
     * quedaría huérfana y habría que reinstalarla.
     */
    id: "/admin",
    name: "Cronchy · Panel de pedidos",
    // Lo que cabe debajo del icono. El tablero es a lo que se entra; "Cronchy" ya es la tienda.
    short_name: "Pedidos",
    description: "Recibe y gestiona los pedidos de Cronchy.",
    start_url: "/admin/pedidos",
    // Fuera de /admin se sale a el navegador, que es lo correcto: la carta pública es otra app.
    scope: "/admin",
    display: "standalone",
    // `--crema`, el fondo del layout del panel: es la pantalla de arranque.
    background_color: "#faf3e8",
    // `--tarjeta`, el de la cabecera: es lo que pinta la barra de estado de Android.
    theme_color: "#fdf9f2",
    orientation: "any",
    icons: [
      { src: "/panel-192.png", sizes: "192x192", type: "image/png" },
      { src: "/panel-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/panel-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };

  return Response.json(manifest, {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
