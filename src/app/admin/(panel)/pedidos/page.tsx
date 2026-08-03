import { getStore } from "@/db/queries/store";
import { listarPedidos } from "@/db/queries/panel";
import { exigirRol } from "@/lib/autorizacion";
import { ListaPedidos } from "./ListaPedidos";
import { TiempoEstimado } from "./TiempoEstimado";

export const dynamic = "force-dynamic";

export default async function PedidosPage() {
  const sesion = await exigirRol("colaborador");
  const tienda = await getStore();

  // Se renderiza en el servidor la primera carga y de ahí en adelante manda el polling:
  // así el empleado ve los pedidos de inmediato al abrir, sin un salto de pantalla vacía.
  const iniciales = await listarPedidos(tienda.id);

  return (
    <div className="flex flex-col gap-3">
      {/* Solo admin: el estimado es una promesa comercial, no una operación de turno. El
          `exigirRol("admin")` de la acción es quien corta de verdad (regla 12). */}
      {sesion.rol === "admin" && (
        <TiempoEstimado min={tienda.minutosEstimadoMin} max={tienda.minutosEstimadoMax} />
      )}
      <ListaPedidos iniciales={iniciales} />
    </div>
  );
}
