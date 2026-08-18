import { listarCatalogoDelPanel } from "@/db/queries/catalogo";
import { listarCupones } from "@/db/queries/cupones";
import { getStore } from "@/db/queries/store";
import { SinPermisoError, exigirRol } from "@/lib/autorizacion";
import { diaDeBogota } from "@/lib/pedidos/dias";
import { EditorCupones } from "./EditorCupones";

export const dynamic = "force-dynamic";

/**
 * Donde se crean los cupones de descuento.
 *
 * Solo admin, ni lectura: un cupón decide cuánto se cobra, igual que una zona (regla 12). El enlace
 * del nav también se esconde, pero quien corta de verdad es este `exigirRol`.
 */
export default async function CuponesPage() {
  try {
    await exigirRol("admin");
  } catch (error) {
    // Se explica en vez de reventar en un 500, igual que en Ajustes. Tampoco se manda al login:
    // quien llega aquí ya tiene sesión.
    if (error instanceof SinPermisoError) return <SinPermiso />;
    throw error;
  }

  const tienda = await getStore();
  const [cupones, catalogo] = await Promise.all([
    listarCupones(tienda.id),
    listarCatalogoDelPanel(tienda.id),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-contenido flex-col gap-4">
      <h1 className="font-titulo text-xl font-bold text-cafe">Cupones</h1>
      <EditorCupones
        cupones={cupones}
        /**
         * Se recorta el catálogo a lo que el selector necesita en vez de pasar
         * `listarCatalogoDelPanel` entero: esa consulta trae también los enganches de cada
         * producto, y mandarlos al navegador para pintar unas casillas sería pura carga. La
         * consulta se reusa; lo que viaja, no.
         */
        categorias={catalogo.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          productos: c.productos.map((p) => ({ id: p.id, nombre: p.nombre })),
        }))}
        // El día de Bogotá, calculado en el servidor: el reloj del navegador puede estar en
        // cualquier zona, y de eso depende qué cupón se muestra como vencido.
        hoy={diaDeBogota()}
      />
    </div>
  );
}

function SinPermiso() {
  return (
    <div className="mx-auto w-full max-w-contenido rounded-md border border-crema-oscura bg-tarjeta p-6">
      <h1 className="font-titulo text-xl font-bold text-cafe">Cupones</h1>
      <p className="mt-2 font-cuerpo text-[15px] text-cafe-suave">
        Solo los dueños pueden crear cupones de descuento.
      </p>
    </div>
  );
}
