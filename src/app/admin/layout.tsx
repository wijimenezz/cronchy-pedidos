import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Panel · Cronchy",
  // El panel no tiene nada que hacer en un buscador.
  robots: { index: false, follow: false },
};

/**
 * Marco del panel. A diferencia del storefront no se encierra en la columna de 520 px
 * (ver `MarcoPublico`): aquí hay tablas y detalles de pedido que agradecen el ancho,
 * aunque el diseño siga siendo mobile-first — el negocio opera desde el teléfono.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-crema">{children}</div>;
}
