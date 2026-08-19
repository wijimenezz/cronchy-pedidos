import type { Metadata } from "next";
import localFont from "next/font/local";
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

export const metadata: Metadata = {
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
