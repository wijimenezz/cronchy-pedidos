import type { MetadataRoute } from "next";

/**
 * El manifest de la app — lo que Android lee al "añadir a la pantalla de inicio".
 *
 * Sin él, el teléfono arma el acceso directo con lo que encuentre (una captura de la página, el
 * favicon diminuto) y por eso el icono salía siendo el de Vercel. Next genera desde aquí
 * `/manifest.webmanifest` y su `<link>`, así que `layout.tsx` no se entera.
 *
 * **Los dos iconos de 512 no son el mismo por duplicado.** Android recorta el icono a un círculo
 * o a un squircle según el launcher: el `maskable` lleva el churro más pequeño, con la zona
 * segura de rigor, para que el recorte no le quite los pies ni la mano. El otro se usa donde no
 * se recorta nada, y ahí el mismo margen lo dejaría ridículamente pequeño.
 *
 * `display: "standalone"` hace que se abra sin la barra del navegador.
 *
 * **Aquí decía que esto no era instalable de verdad porque Chrome exige un service worker con
 * handler de `fetch`. Dejó de ser cierto**: ese requisito se quitó en la v108 de Android y la
 * v112 de escritorio. Lo que sigue necesitando el handler es `beforeinstallprompt`, o sea el
 * prompt programático; instalar desde el menú del navegador funciona sin él. La prohibición de
 * la regla 19 sigue en pie, pero por su motivo real —cachear respuestas rompería el ISR de la
 * carta y el polling del tablero— y no porque sea el peaje de la instalación.
 *
 * **Este manifest es el de la TIENDA.** El panel tiene el suyo en `app/panel.webmanifest`, con
 * otro `start_url`, otro `scope` y otro icono, y lo cuelga `admin/layout.tsx` con
 * `metadata.manifest`. Son dos apps para dos personas distintas sobre el mismo dominio; un
 * manifest solo puede describir una.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cronchy - Churros y Helados",
    short_name: "Cronchy",
    description: "Pide tus churros y helados favoritos en línea.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf3e8",
    // El café de la cabecera de la tienda: es lo que pinta la barra de estado del teléfono.
    theme_color: "#50240a",
    icons: [
      { src: "/icono-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icono-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icono-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
