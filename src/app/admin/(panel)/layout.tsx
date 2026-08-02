import Link from "next/link";
import { redirect } from "next/navigation";
import { getStore } from "@/db/queries/store";
import { exigirRol, NoAutenticadoError } from "@/lib/autorizacion";
import { BotonSalir } from "./BotonSalir";

export const dynamic = "force-dynamic";

/**
 * Rutas del panel que exigen sesión. El login queda fuera de este grupo porque, por
 * definición, se visita sin ella.
 *
 * El middleware ya cortó el paso, pero se vuelve a comprobar aquí: el middleware puede no
 * ejecutarse ante ciertas peticiones internas de Next, y `exigirRol` es lo que de verdad
 * decide (regla 12). Rol mínimo `colaborador` — el suelo para entrar al panel; cada
 * pantalla y cada acción exigen lo suyo por encima de esto.
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  let sesion;
  try {
    sesion = await exigirRol("colaborador");
  } catch (error) {
    if (error instanceof NoAutenticadoError) redirect("/admin/login");
    throw error;
  }

  const tienda = await getStore();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-crema-oscura bg-tarjeta">
        <div className="mx-auto flex w-full max-w-contenido items-center justify-between gap-3 px-4 py-3">
          <span className="truncate font-titulo text-lg font-bold text-cafe">{tienda.nombre}</span>
          <BotonSalir />
        </div>
        <nav className="mx-auto flex w-full max-w-contenido gap-1 px-4 pb-2">
          <Enlace href="/admin/pedidos">Pedidos</Enlace>
          <Enlace href="/admin/catalogo">Qué hay hoy</Enlace>
          {/* El colaborador entra: necesita ver la carta y marcar agotados. Los controles
              de edición los esconde la propia pantalla según el rol. */}
          <Enlace href="/admin/productos">Carta</Enlace>
          {/* El colaborador no tiene acceso a zonas ni de lectura, así que tampoco ve el
              enlace. Ocultarlo es cortesía; quien corta de verdad es el `exigirRol` de la
              propia pantalla (regla 12). */}
          {sesion.rol === "admin" && <Enlace href="/admin/zonas">Zonas</Enlace>}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-contenido flex-1 px-4 py-4">{children}</main>
    </div>
  );
}

function Enlace({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex min-h-11 items-center rounded-full px-4 font-cuerpo text-sm font-bold text-cafe-suave transition-colors hover:bg-crema-oscura"
    >
      {children}
    </Link>
  );
}
