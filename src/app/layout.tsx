import type { Metadata } from "next";
import { Baloo_2, Nunito } from "next/font/google";
import "./globals.css";

const baloo = Baloo_2({
  variable: "--font-baloo",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
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
