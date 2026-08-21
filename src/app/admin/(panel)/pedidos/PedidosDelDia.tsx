import Link from "next/link";
import { BellOff } from "lucide-react";
import type { PedidoEnLista } from "@/db/queries/panel";
import { cuandoCorto, horaCorta, pesos } from "@/lib/notificaciones/plantillas";
import { ETIQUETA_ESTADO, METODO_PAGO_ETIQUETA, toneDeEstado } from "@/lib/pedidos/estados";
import { DesgloseDomicilio } from "./DesgloseDomicilio";

/**
 * Los pedidos de un día pasado.
 *
 * **Server component, sin una línea de cliente, y esa es toda la idea.** Un día cerrado no
 * cambia: no hay nada que refrescar, nada que sonar y ningún estado que llevar. Por eso esta
 * vista es otra pantalla y no el tablero con una bandera — `ListaPedidos`, con su polling de
 * 15 s y su alarma, ni siquiera se monta cuando se está mirando atrás.
 *
 * Y es una lista y no cuatro columnas porque el día termina con cero pedidos activos: todo se
 * despacha el mismo día salvo lo programado. Un tablero de un día cerrado serían tres columnas
 * vacías y todo apilado en la cuarta.
 *
 * No lleva botones: esto es consulta. Cada fila abre el detalle del pedido, que sí opera.
 */

export function PedidosDelDia({
  pedidos,
  rotulo,
}: {
  pedidos: PedidoEnLista[];
  /** Ya formateado en el servidor: "Ayer", "Martes, 9 de diciembre". */
  rotulo: string;
}) {
  // Lo cancelado no entró a la caja, así que no suma. Se cuenta aparte para que la diferencia
  // entre "entraron 14" y "se cobraron 12" quede a la vista en vez de esconderse en el total.
  const cobrados = pedidos.filter((p) => p.estado !== "cancelado");
  const vendido = cobrados.reduce((n, p) => n + p.total, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="font-titulo text-xl font-bold text-cafe">{rotulo}</h1>

        {pedidos.length > 0 && (
          <p className="font-cuerpo text-sm text-cafe-suave">
            {pedidos.length === 1 ? "1 pedido" : `${pedidos.length} pedidos`}
            {cobrados.length < pedidos.length && ` · ${cobrados.length} sin cancelar`}
            <span className="ml-2 font-bold text-cafe">{pesos(vendido)}</span>
          </p>
        )}
      </div>

      {/* El aviso no es decorativo: al salir de hoy el tablero se desmontó y con él la alarma,
          así que este panel dejó de vigilar el local. Quien lo tenga abierto tiene que saberlo. */}
      <p
        role="status"
        className="flex items-center gap-2 rounded-md bg-alerta/15 px-4 py-2 font-cuerpo text-[13px] text-cafe"
      >
        <BellOff className="size-4 shrink-0 text-cafe-suave" />
        <span>
          Estás consultando un día pasado. No suena el aviso de pedidos nuevos.
        </span>
        <Link
          href="/admin/pedidos"
          className="ml-auto shrink-0 font-bold text-naranja-osc underline-offset-2 hover:underline"
        >
          Volver a hoy
        </Link>
      </p>

      {pedidos.length === 0 ? (
        <p className="rounded-md border border-dashed border-crema-oscura px-4 py-10 text-center font-cuerpo text-sm text-cafe-tenue">
          No entró ningún pedido este día.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {pedidos.map((pedido) => (
            <li key={pedido.id}>
              <Fila pedido={pedido} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Fila({ pedido }: { pedido: PedidoEnLista }) {
  const tone = toneDeEstado(pedido.estado);

  return (
    <Link
      href={`/admin/pedidos/${pedido.numero}`}
      className="flex flex-col gap-1 rounded-md border border-crema-oscura bg-tarjeta p-3 shadow-tarjeta transition-colors hover:border-naranja/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-naranja"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-titulo text-base font-bold text-cafe">#{pedido.numero}</span>
        <span className="font-cuerpo text-[13px] text-cafe-tenue">
          {horaCorta(new Date(pedido.creadoEn))}
        </span>
        <span className="min-w-0 flex-1 truncate font-cuerpo text-[15px] text-cafe">
          {pedido.clienteNombre}
        </span>

        <span
          className={`shrink-0 rounded-full px-2 py-0.5 font-cuerpo text-[12px] font-bold ${
            tone === "cancelado"
              ? "bg-error/15 text-error"
              : tone === "exito"
                ? "bg-exito/15 text-cafe"
                : "bg-alerta/20 text-cafe"
          }`}
        >
          {ETIQUETA_ESTADO[pedido.estado]}
        </span>
      </div>

      <p className="font-cuerpo text-[13px] text-cafe-suave">
        {pedido.tipo === "domicilio" ? "Domicilio" : "Recoge"}
        {pedido.barrio && ` · ${pedido.barrio}`}
        {/* Un programado es la excepción que cruza el día: entró aquí pero pudo salir en otro,
            así que la hora sola no basta. `cuandoCorto` compara contra ahora, no contra el día
            que se consulta: en una lista vieja eso da la fecha explícita ("9 diciembre, 7:00
            pm"), y en la de ayer un pedido dejado para hoy se anuncia como lo que es. */}
        {pedido.programadoPara && (
          <span className="font-bold text-cafe">
            {" "}
            · Programado {cuandoCorto(new Date(pedido.programadoPara))}
          </span>
        )}
      </p>

      {pedido.resumenItems && (
        <p className="font-cuerpo text-[13px] text-cafe">{pedido.resumenItems}</p>
      )}

      <p className="font-cuerpo text-[13px] text-cafe-suave">
        <span className="font-bold text-cafe">{pesos(pedido.total)}</span> ·{" "}
        {METODO_PAGO_ETIQUETA[pedido.metodoPago] ?? pedido.metodoPago}
      </p>

      {/* Cuánto de ese total fue el envío. Aquí sirve incluso más que en el tablero: esta es la
          pantalla donde se cuadra al final del día lo que se le pagó a los domiciliarios. */}
      <DesgloseDomicilio pedido={pedido} />
    </Link>
  );
}
