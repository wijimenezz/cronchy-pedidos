import type { Metadata } from "next";
import { Fredoka, Nunito } from "next/font/google";
import Image from "next/image";
import "./globals.css";

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  weight: ["500", "600"],
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
      className={`${fredoka.variable} ${nunito.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className="min-h-full font-cuerpo text-cafe bg-crema-oscura"
        suppressHydrationWarning
      >
        <div className="relative min-h-full">
          {/* Textura decorativa: solo se ve en el espacio que sobra a los lados del
              rectángulo central en pantallas anchas. */}
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 bg-[url('/textura-happy-cronchy.png')] bg-[length:900px_auto] bg-repeat opacity-20"
          />
          <Image
            src="/churro-gorra.png"
            alt=""
            width={318}
            height={456}
            className="pointer-events-none fixed top-28 left-10 hidden w-36 drop-shadow-xl lg:block"
          />
          <Image
            src="/helado.png"
            alt=""
            width={326}
            height={432}
            className="pointer-events-none fixed right-10 bottom-24 hidden w-32 drop-shadow-xl lg:block"
          />

          <div className="relative mx-auto flex min-h-full w-full max-w-[520px] flex-col bg-crema shadow-modal">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
