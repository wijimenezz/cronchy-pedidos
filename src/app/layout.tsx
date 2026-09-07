import type { Metadata } from "next";
import localFont from "next/font/local";
import { metadatosCompartidos } from "@/lib/metadatos";
import "./globals.css";

/**
 * Las fuentes viven en el repo, no se bajan de Google al construir.
 *
 * Con `next/font/google`, cada build y cada arranque de `next dev` pedían los `.woff2` a
 * `fonts.gstatic.com`. Eso reventó: Turbopack en dev construía URLs que Google ya había rotado
 * —`XRX_3I6Li01BKofi…` daba 404 mientras la buena, `XRXV3I6Li01BKofI…`, respondía 200— y la app
 * entera quedaba en 500. No era la red ni la caché; `next build` funcionaba y `next dev` no, que
 * es la firma del bug de Turbopack (vercel/next.js#81721).
 *
 * Auto-hospedar mata la causa en vez de esquivarla: ya no hay descarga en tiempo de build, así
 * que ni dev ni build dependen de que un tercero sirva una URL concreta. Es lo mismo que se hizo
 * con los iconos —generados una vez y commiteados como archivos planos— y la misma doctrina que
 * `barrio.ts`: nada del camino crítico colgando de un servicio gratuito ajeno.
 *
 * **Son fuentes VARIABLES y por eso `weight` es un rango, no un peso.** Es lo que autoriza al
 * navegador a interpolar; con un peso suelto fingiría los demás engordando los trazos, y en los
 * títulos se nota. Los rangos son los que declara Google para cada familia, y cubren de sobra lo
 * que usa el proyecto (Baloo 500/600/700, Nunito 400/500/700).
 *
 * El subconjunto es **latino y basta**: tildes, `ñ`, `¿` y `¡` viven todas en `U+0000-00FF`.
 *
 * `display: "swap"` va explícito porque `localFont` no lo trae por defecto como sí hacía
 * `next/font/google`; sin él el texto queda invisible mientras la fuente carga.
 *
 * Las dos son SIL Open Font License, que permite auto-hospedar y exige distribuir la licencia:
 * está en `./fonts/OFL-*.txt`.
 *
 * **El aviso de "preloaded but not used" en la consola de dev es un falso positivo, y está medido.**
 * Chrome lo dice de las dos `.woff2` unos segundos después del `load`, y suele significar una de
 * tres cosas: que al `<link>` le falte `crossorigin` —lo que obliga a una segunda descarga en modo
 * CORS—, que el preload y el `@font-face` apunten a URLs distintas, o que la fuente no se use. Aquí
 * no es ninguna:
 *
 * - En el HTML de producción el `<link>` sale una sola vez por fuente y completo:
 *   `rel="preload" as="font" crossorigin="" type="font/woff2"`.
 * - El `@font-face` apunta **al mismo archivo** que se preloada, y en `static/media/` solo hay una
 *   copia de cada una.
 * - Medido con `performance.getEntriesByType("resource")` en dev, cada `.woff2` se pide **una vez**
 *   y su `initiatorType` es `link`: la petición del preload es la única, y el `@font-face` la
 *   reutiliza. No hay bytes de más.
 * - `document.fonts` las da como `loaded` y el texto se pinta con ellas, no con el fallback de
 *   Arial.
 *
 * Lo que pasa es que en dev el CSS lo inyecta Turbopack por JavaScript **después** del `load`, así
 * que la familia se aplica fuera de la ventana que Chrome vigila. **No lo "arregles"** con
 * `preload: false` ni `display: "optional"`: callarían el aviso empeorando la carga real, que es
 * justo lo que el preload está haciendo bien.
 */
const baloo = localFont({
  src: "./fonts/baloo2-latin.woff2",
  variable: "--font-baloo",
  weight: "400 800",
  display: "swap",
});

const nunito = localFont({
  src: "./fonts/nunito-latin.woff2",
  variable: "--font-nunito",
  weight: "200 1000",
  display: "swap",
});

/**
 * El título y la descripción son los de la carta; lo demás —la tarjeta de WhatsApp— vive en
 * `metadatos.ts` y lo heredan todas las rutas, incluidas las dos de token que viajan por chat.
 */
export const metadata: Metadata = {
  ...metadatosCompartidos,
  title: "Cronchy - Churros y Helados",
  description: "Pide tus churros y helados favoritos en línea. Sonríe, que la vida es churrísima.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${baloo.variable} ${nunito.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      {/* Solo lo global. La columna angosta del storefront vive en `MarcoPublico`, que
          aplican las rutas del cliente: el panel necesita el ancho completo. */}
      <body
        className="min-h-full font-cuerpo text-cafe bg-crema-oscura"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
