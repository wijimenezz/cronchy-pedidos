"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { PedidoEnLista } from "@/db/queries/panel";
import { cuandoCorto, pesos } from "@/lib/notificaciones/plantillas";
import { ETIQUETA_ESTADO, METODO_PAGO_ETIQUETA, toneDeEstado } from "@/lib/pedidos/estados";
import { cambiarEstado, prepararAviso } from "./acciones";

const TONO_BADGE = {
  activo: "bg-naranja/15 text-naranja-osc",
  exito: "bg-exito/15 text-exito",
  cancelado: "bg-agotado/20 text-cafe-suave",
} as const;

/** Solo la hora: la lista es del turno de hoy, la fecha sobra y ocupa. */
function hora(fecha: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  }).format(fecha);
}

export function TarjetaPedido({
  pedido,
  alCambiar,
}: {
  pedido: PedidoEnLista;
  alCambiar: () => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // El polling entrega las fechas como string al pasar por JSON; el render del servidor las
  // da como Date. Se normalizan aquí en vez de en dos sitios.
  const creadoEn = new Date(pedido.creadoEn);
  const programadoPara = pedido.programadoPara ? new Date(pedido.programadoPara) : null;

  function avanzar(estado: string) {
    setError(null);
    iniciar(async () => {
      const resultado = await cambiarEstado({ pedidoId: pedido.id, estado });
      if (!resultado.ok) setError(resultado.error);
      alCambiar();
    });
  }

  function avisar() {
    setError(null);
    iniciar(async () => {
      const resultado = await prepararAviso({ numero: pedido.numero, estado: pedido.estado });
      if (!resultado.ok) {
        setError(resultado.error);
      } else if (resultado.url) {
        // `_blank` y no `location.href`: el panel se queda abierto en su pestaña, que es
        // donde el empleado va a seguir trabajando cuando vuelva de WhatsApp.
        window.open(resultado.url, "_blank", "noopener");
      }
      alCambiar();
    });
  }

  return (
    <article className="rounded-md border border-crema-oscura bg-tarjeta p-4 shadow-tarjeta">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href={`/admin/pedidos/${pedido.numero}`}
            className="font-titulo text-lg font-bold text-cafe underline-offset-2 hover:underline"
          >
            #{pedido.numero}
          </Link>
          <p className="font-cuerpo text-[15px] text-cafe">{pedido.clienteNombre}</p>
          <p className="font-cuerpo text-[13px] text-cafe-tenue">
            {hora(creadoEn)} · {pedido.tipo === "domicilio" ? "Domicilio" : "Recoge"}
            {pedido.barrio && ` · ${pedido.barrio}`}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1">
          {/* Con pedidos de hoy y de mañana mezclados, una hora suelta es una promesa
              ambigua: el día va siempre, y por eso `cuandoCorto` y no la hora pelada. */}
          {programadoPara && (
            <span className="rounded-full bg-cafe px-2.5 py-1 font-cuerpo text-xs font-bold text-crema">
              Programado · {cuandoCorto(programadoPara)}
            </span>
          )}
          <span
            className={`rounded-full px-2.5 py-1 font-cuerpo text-xs font-bold ${TONO_BADGE[toneDeEstado(pedido.estado)]}`}
          >
            {ETIQUETA_ESTADO[pedido.estado]}
          </span>
          <span className="font-cuerpo text-[15px] font-bold text-cafe">
            {pesos(pedido.total)}
          </span>
        </div>
      </div>

      <p className="mt-2 font-cuerpo text-[13px] text-cafe-suave">
        {pedido.cantidadItems} {pedido.cantidadItems === 1 ? "producto" : "productos"} ·{" "}
        {METODO_PAGO_ETIQUETA[pedido.metodoPago] ?? pedido.metodoPago}
        {/* Un Nequi sin comprobante no puede avanzar: mejor decirlo aquí que dejar que
            el empleado descubra el bloqueo al tocar el botón. */}
        {pedido.metodoPago === "nequi" && !pedido.tieneComprobante && (
          <span className="font-bold text-error"> · sin comprobante</span>
        )}
      </p>

      {error && (
        <p role="alert" className="mt-2 font-cuerpo text-[13px] font-semibold text-error">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {pedido.siguiente && (
          <button
            type="button"
            onClick={() => avanzar(pedido.siguiente!)}
            disabled={pendiente}
            className="min-h-11 rounded-full bg-naranja px-4 font-cuerpo text-sm font-bold text-crema transition-colors hover:bg-naranja-osc focus:outline-none focus:ring-2 focus:ring-naranja focus:ring-offset-2 disabled:opacity-50"
          >
            {ETIQUETA_ESTADO[pedido.siguiente]}
          </button>
        )}

        {pedido.avisoPendiente && (
          <button
            type="button"
            onClick={avisar}
            disabled={pendiente}
            className="min-h-11 rounded-full border border-crema-oscura px-4 font-cuerpo text-sm font-bold text-cafe transition-colors hover:bg-crema focus:outline-none focus:ring-2 focus:ring-naranja disabled:opacity-50"
          >
            Avisar al cliente
          </button>
        )}

        {pedido.siguiente && (
          <button
            type="button"
            onClick={() => avanzar("cancelado")}
            disabled={pendiente}
            className="ml-auto min-h-11 rounded-full px-3 font-cuerpo text-sm font-bold text-cafe-tenue transition-colors hover:text-error focus:outline-none focus:ring-2 focus:ring-naranja disabled:opacity-50"
          >
            Cancelar
          </button>
        )}
      </div>
    </article>
  );
}
