import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Panel · Cronchy",
  // El panel no tiene nada que hacer en un buscador.
  robots: { index: false, follow: false },
  /**
   * Su propio manifest, que **sustituye** al de la tienda que Next inyecta por convención desde
   * `app/manifest.ts`. Sin esto, instalar desde el panel instalaría la carta pública.
   *
   * Va en este layout y no en el de `(panel)` porque tiene que cubrir **también el login**: al
   * tocar el icono sin sesión se cae ahí, y esa pantalla también tiene que declarar qué app es.
   */
  manifest: "/panel.webmanifest",
  /**
   * iOS **no lee los iconos del manifest** ni su `display`: para la pantalla de inicio usa
   * `apple-touch-icon` (lo genera Next desde `admin/apple-icon.png`) y para abrir sin barra del
   * navegador, esto.
   */
  appleWebApp: { capable: true, title: "Pedidos", statusBarStyle: "default" },
};

/**
 * Marco del panel. A diferencia del storefront no se encierra en la columna de 520 px
 * (ver `MarcoPublico`): aquí hay tablas y detalles de pedido que agradecen el ancho,
 * aunque el diseño siga siendo mobile-first — el negocio opera desde el teléfono.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-crema">{children}</div>;
}
