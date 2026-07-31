import { getStore } from "@/db/queries/store";
import { listarPedidos } from "@/db/queries/panel";
import { exigirRol } from "@/lib/autorizacion";
import { ListaPedidos } from "./ListaPedidos";

export const dynamic = "force-dynamic";

export default async function PedidosPage() {
  await exigirRol("colaborador");
  const tienda = await getStore();

  // Se renderiza en el servidor la primera carga y de ahí en adelante manda el polling:
  // así el empleado ve los pedidos de inmediato al abrir, sin un salto de pantalla vacía.
  const iniciales = await listarPedidos(tienda.id);

  return <ListaPedidos iniciales={iniciales} />;
}
