"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Enlace({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const ruta = usePathname();
  // Con la barra final para que /admin/pedidos/abc marque Pedidos, pero
  // /admin/productos no arrastre a /admin/producto-x si algún día existe.
  const activa = ruta === href || ruta.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={activa ? "page" : undefined}
      className={[
        "flex min-h-11 shrink-0 items-center rounded-full px-4 font-cuerpo text-sm font-bold transition-colors",
        activa
          ? "bg-naranja text-crema"
          : "text-cafe-suave hover:bg-crema-oscura",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
