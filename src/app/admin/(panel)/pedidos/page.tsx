import { getStore } from "@/db/queries/store";
import { listarPedidos, listarPedidosDelDia } from "@/db/queries/panel";
import { resumenDelDia } from "@/db/queries/resumen";
import { exigirRol } from "@/lib/autorizacion";
import { diaDeBogota, diaPedido, rotuloDeDia } from "@/lib/pedidos/dias";
import { DescargarPedidos } from "./DescargarPedidos";
import { ListaPedidos } from "./ListaPedidos";
import { PedidosDelDia } from "./PedidosDelDia";
import { ResumenDia } from "./ResumenDia";
import { SelectorDia } from "./SelectorDia";
import { TiempoEstimado } from "./TiempoEstimado";

export const dynamic = "force-dynamic";

/**
 * Dos pantallas bajo la misma ruta, y la fecha decide cuál.
 *
 * Sin `?fecha=` (o con la de hoy) es el **tablero**: cuatro columnas, polling de 15 s y alarma.
 * Con una fecha pasada es una **consulta**: la lista estática de lo que entró ese día. No son la
 * misma vista con un filtro — el día pasado termina con cero pedidos activos, así que un tablero
 * ahí serían tres columnas vacías.
 *
 * El corte va aquí y no dentro de `ListaPedidos` a propósito: así ese componente —que es el que
 * lleva la alarma del local— no se entera de que existen los días pasados, y no hay forma de
 * romperlo tocando esto.
 */
export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const sesion = await exigirRol("colaborador");
  const tienda = await getStore();

  const { fecha } = await searchParams;
  const hoy = diaDeBogota();
  // Lo que venga de la URL pasa por aquí: formato malo o fecha futura caen en hoy.
  const dia = diaPedido(fecha, hoy);
  const esHoy = dia === hoy;
  const rotulo = rotuloDeDia(dia, hoy);

  // Las ventas del día son del dueño, no del turno. La consulta ni siquiera se lanza para un
  // colaborador; esconder el icono es lo de menos.
  const esAdmin = sesion.rol === "admin";
  const resumen = esAdmin ? await resumenDelDia(tienda.id, dia) : null;

  return (
    <div className="flex flex-col gap-3">
      {/* Solo admin: el estimado es una promesa comercial, no una operación de turno. El
          `exigirRol("admin")` de la acción es quien corta de verdad (regla 12). */}
      {esAdmin && esHoy && (
        <TiempoEstimado min={tienda.minutosEstimadoMin} max={tienda.minutosEstimadoMax} />
      )}

      {/* Tres zonas: la fecha queda centrada en la pantalla y las acciones a la derecha, aunque
          el hueco de la izquierda esté vacío. Los `flex-1` son lo que sostiene ese centrado. */}
      <div className="flex items-center gap-2">
        <div className="hidden flex-1 sm:block" />

        <SelectorDia dia={dia} hoy={hoy} rotulo={rotulo} />

        <div className="flex flex-1 items-center justify-end gap-2">
          {resumen && <ResumenDia resumen={resumen} rotulo={rotulo} />}
          {esAdmin && <DescargarPedidos hoy={hoy} />}
        </div>
      </div>

      {esHoy ? (
        // Se renderiza en el servidor la primera carga y de ahí en adelante manda el polling:
        // así el empleado ve los pedidos de inmediato al abrir, sin un salto de pantalla vacía.
        <ListaPedidos iniciales={await listarPedidos(tienda.id)} />
      ) : (
        <PedidosDelDia pedidos={await listarPedidosDelDia(tienda.id, dia)} rotulo={rotulo} />
      )}
    </div>
  );
}
