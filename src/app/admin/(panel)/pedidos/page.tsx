import { getStore } from "@/db/queries/store";
import { listarDomiciliarios } from "@/db/queries/domiciliarios";
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

  const acciones = (
    <>
      {resumen && <ResumenDia resumen={resumen} rotulo={rotulo} />}
      {esAdmin && <DescargarPedidos hoy={hoy} />}
    </>
  );

  // El tablero de hoy ocupa el alto del viewport y hace scroll por columna, así que se lleva
  // su propia barra: el contador y el botón de avisos son estado suyo y tienen que compartir
  // fila con estos controles, que son de servidor. Se los pasamos como nodos; nada de estado
  // se mueve de sitio.
  //
  // **Los dos que van sueltos en esa barra llevan `key` y no es decorativo.** `ListaPedidos` los
  // pinta como hermanos del contador, y una fila de hermanos es un array para el reconciliador.
  // Un elemento creado en posición de **prop** —no de child— nunca pasa por `validateChildKeys`,
  // así que cruza la frontera RSC sin marcar y React reclama la key al reconciliar. `acciones` no
  // la necesita: es un Fragment, y ahí lo que se reconcilia es el fragmento entero. Tampoco la
  // rama de abajo, donde estos mismos componentes sí son children estáticos y quedan marcados al
  // crearse. Es un aviso solo de desarrollo, pero uno que sale en cada carga enseña a no mirar la
  // consola.
  if (esHoy) {
    return (
      <ListaPedidos
        // Se renderiza en el servidor la primera carga y de ahí en adelante manda el polling:
        // así el empleado ve los pedidos de inmediato al abrir, sin un salto de pantalla vacía.
        iniciales={await listarPedidos(tienda.id)}
        // La agenda para el botón de asignar de cada tarjeta. Va solo en esta rama: la vista de
        // un día pasado es de consulta y no opera nada, así que no tiene a quién asignar.
        domiciliarios={await listarDomiciliarios(tienda.id)}
        selectorDia={<SelectorDia key="selector-dia" dia={dia} hoy={hoy} rotulo={rotulo} />}
        /* Solo admin: el estimado es una promesa comercial, no una operación de turno. El
           `exigirRol("admin")` de la acción es quien corta de verdad (regla 12). */
        estimado={
          esAdmin ? (
            <TiempoEstimado
              key="estimado"
              min={tienda.minutosEstimadoMin}
              max={tienda.minutosEstimadoMax}
            />
          ) : null
        }
        acciones={acciones}
      />
    );
  }

  // Un día pasado es una consulta, no una operación: barra más corta —sin contador, sin avisos
  // y sin estimado— y el ancho vuelve al tope del panel, porque esto se lee.
  return (
    <div className="mx-auto flex w-full max-w-contenido flex-col gap-2">
      <div className="flex h-12 items-center gap-3">
        <SelectorDia dia={dia} hoy={hoy} rotulo={rotulo} />
        <div className="ml-auto flex items-center gap-2">{acciones}</div>
      </div>

      <PedidosDelDia pedidos={await listarPedidosDelDia(tienda.id, dia)} rotulo={rotulo} />
    </div>
  );
}
