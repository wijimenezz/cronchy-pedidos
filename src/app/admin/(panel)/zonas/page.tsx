import { getStore } from "@/db/queries/store";
import { listarZonas, obtenerUbicacionTienda } from "@/db/queries/zonas";
import { SinPermisoError, exigirRol } from "@/lib/autorizacion";
import { EditorZonas } from "./EditorZonas";

export const dynamic = "force-dynamic";

/** Si nunca se fijó la tienda, el parque principal de Fusagasugá. */
const CENTRO_POR_DEFECTO = { lat: 4.3372, lng: -74.3653 };

export default async function ZonasPage() {
  // Solo admin, ni siquiera lectura para el colaborador: estas figuras deciden cuánto se
  // cobra por cada domicilio.
  try {
    await exigirRol("admin");
  } catch (error) {
    // Se explica en vez de reventar en un 500. Tampoco se manda al login: quien llega aquí
    // ya tiene sesión, y redirigirlo lo dejaría dando vueltas.
    if (error instanceof SinPermisoError) return <SinPermiso />;
    throw error;
  }

  const tienda = await getStore();
  const [zonas, ubicacion] = await Promise.all([
    listarZonas(tienda.id),
    obtenerUbicacionTienda(tienda.id),
  ]);

  const punto = ubicacion
    ? (() => {
        const { coordinates } = JSON.parse(ubicacion) as { coordinates: [number, number] };
        // GeoJSON guarda [lng, lat]; el mapa espera lat primero.
        return { lat: coordinates[1], lng: coordinates[0] };
      })()
    : CENTRO_POR_DEFECTO;

  return <EditorZonas zonas={zonas} ubicacionTienda={punto} />;
}

function SinPermiso() {
  return (
    <div className="mx-auto w-full max-w-contenido rounded-md border border-crema-oscura bg-tarjeta p-6">
      <h1 className="font-titulo text-xl font-bold text-cafe">Zonas de cobertura</h1>
      <p className="mt-2 font-cuerpo text-[15px] text-cafe-suave">
        Solo los dueños pueden ver y editar las zonas de domicilio.
      </p>
    </div>
  );
}
