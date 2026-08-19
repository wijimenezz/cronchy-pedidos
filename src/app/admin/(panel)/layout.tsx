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
    /**
     * Alto exacto de viewport y el scroll dentro de `<main>`, no en el documento.
     *
     * Lo pide el tablero de pedidos, que necesita altura fija para que cada columna baje por su
     * cuenta en vez de arrastrar las cuatro a la vez. Al resto de pantallas no les cambia nada
     * visible —la cabecera ya era `sticky`, así que tampoco se iba antes—, pero es el punto que
     * hay que probar una por una si algo deja de bajar.
     */
    <div className="flex h-dvh flex-col">
      {/* Una sola fila, no dos. El nombre y las pestañas iban en filas separadas y eso costaba
          ~60 px de alto en TODAS las pantallas del panel, no solo aquí. `min-w-0` en el nav es
          lo que deja al `overflow-x-auto` hacer su trabajo dentro de un flex. */}
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-crema-oscura bg-tarjeta px-4">
        <span className="shrink-0 truncate font-titulo text-lg font-bold text-cafe">
          {tienda.nombre}
        </span>

        {/* `overflow-x-auto`: son siete pestañas y en un teléfono estrecho no caben. Antes
            de que se desbordaran no hacía falta. */}
        <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          <Enlace href="/admin/pedidos">Pedidos</Enlace>
          <Enlace href="/admin/catalogo">Qué hay hoy</Enlace>
          {/* El colaborador entra: necesita ver la carta y marcar agotados. Los controles
              de edición los esconde la propia pantalla según el rol. */}
          <Enlace href="/admin/productos">Carta</Enlace>
          {/* Igual que la Carta: el colaborador entra a apagar el sabor que se acabó. */}
          <Enlace href="/admin/opciones">Opciones</Enlace>
          {/* El colaborador no tiene acceso a zonas ni de lectura, así que tampoco ve el
              enlace. Ocultarlo es cortesía; quien corta de verdad es el `exigirRol` de la
              propia pantalla (regla 12). */}
          {sesion.rol === "admin" && <Enlace href="/admin/zonas">Zonas</Enlace>}
          {/* Igual que Zonas: un cupón decide cuánto se cobra. */}
          {sesion.rol === "admin" && <Enlace href="/admin/cupones">Cupones</Enlace>}
          {/* Lo mismo que Zonas: la llave de pago decide a qué cuenta llega la plata. */}
          {sesion.rol === "admin" && <Enlace href="/admin/ajustes">Ajustes</Enlace>}
        </nav>

        <div className="shrink-0">
          <BotonSalir />
        </div>
      </header>

      {/*
        El tope de ancho NO vive aquí, y esa es la diferencia con la versión anterior.
        Estaba en `<main>` y era lo que estrechaba el tablero a 1080 px en un monitor de 1920,
        partiendo en dos líneas el nombre, el barrio y los productos de cada tarjeta. Ahora lo
        pone cada pantalla que lo quiere (`mx-auto w-full max-w-contenido`), y la de pedidos
        —la única que se opera de un vistazo y no se lee— se queda sin él.
      */}
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</main>
    </div>
  );
}

function Enlace({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex min-h-11 shrink-0 items-center rounded-full px-4 font-cuerpo text-sm font-bold text-cafe-suave transition-colors hover:bg-crema-oscura"
    >
      {children}
    </Link>
  );
}
