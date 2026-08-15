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
 * `display: "standalone"` hace que el acceso directo abra la tienda sin la barra del navegador.
 * No convierte esto en una PWA instalable: para el botón de "Instalar", Chrome exige un service
 * worker con handler de `fetch`, y ese handler está prohibido en este proyecto porque cachearía
 * las respuestas y rompería de raíz el ISR de la carta y el polling del tablero.
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
