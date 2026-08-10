"use client";

import { useState } from "react";
import { ChartColumn } from "lucide-react";
import type { ResumenDelDia } from "@/db/queries/resumen";
import { Modal, ModalCabecera, ModalCerrar } from "@/components/ui/Modal";
import { pesos } from "@/lib/notificaciones/plantillas";
import { METODO_PAGO_ETIQUETA } from "@/lib/pedidos/estados";

/**
 * Las cifras del día, para cerrar el turno.
 *
 * Presentación pura: el resumen llega ya calculado desde el servidor, así que aquí no hay
 * `fetch` ni estado de carga. Lo único que este componente decide es cuándo se ve.
 *
 * Las cifras salen de una consulta agregada sobre los pedidos **creados** ese día, no de la lista
 * que está en pantalla — el tablero de hoy arrastra pedidos vivos de ayer y está topado en 100
 * filas, así que sumarlo daría otra cosa. Ver `resumenDelDia`.
 */
export function ResumenDia({ resumen, rotulo }: { resumen: ResumenDelDia; rotulo: string }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-haspopup="dialog"
        aria-label="Resumen del día"
        title="Resumen del día"
        className="flex size-11 shrink-0 items-center justify-center rounded-full border border-crema-oscura text-cafe transition-colors hover:bg-crema focus:outline-none focus:ring-2 focus:ring-naranja"
      >
        <ChartColumn className="size-5" />
      </button>

      {abierto && (
        <Modal etiqueta="Resumen del día" ancho="md" onCerrar={() => setAbierto(false)}>
          <ModalCabecera>Resumen de ventas — {rotulo}</ModalCabecera>

          <div className="flex flex-col gap-4 overflow-y-auto p-4">
            <div className="grid grid-cols-3 gap-2">
              <Dato
                titulo="# de Pedidos"
                valor={String(resumen.pedidos)}
                // Los tres conteos suman el total, así que los cancelados tienen que verse en
                // alguna parte: si no, las cuentas del recuadro no cuadrarían entre sí.
                nota={
                  resumen.cancelados > 0
                    ? `${resumen.cancelados} cancelado${resumen.cancelados > 1 ? "s" : ""}`
                    : undefined
                }
              />
              <Dato titulo="# de Domicilios" valor={String(resumen.domicilios)} />
              <Dato titulo="# de Recoger" valor={String(resumen.recoger)} />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Dato titulo="Total de ventas" valor={pesos(resumen.ventas)} destacado />
              <Dato titulo="Valor productos" valor={pesos(resumen.productos)} />
              <Dato titulo="Valor en domicilios" valor={pesos(resumen.domicilio)} />
            </div>

            {/* Hoy siempre es 0 —no hay cupones ni promociones—, así que aparece solo si algún
                día deja de serlo. Un recuadro fijo en cero es ruido. */}
            {resumen.descuento > 0 && (
              <Dato titulo="Descuentos" valor={`− ${pesos(resumen.descuento)}`} />
            )}

            <div>
              <h3 className="mb-2 font-cuerpo text-[13px] font-bold text-cafe-suave">
                Cuadre de caja — por método de pago
              </h3>
              <ul className="flex flex-col gap-1 rounded-md border border-crema-oscura p-3">
                {resumen.porMetodo.map((m) => (
                  <li
                    key={m.metodo}
                    className="flex items-baseline justify-between gap-3 font-cuerpo text-sm"
                  >
                    <span className="text-cafe">
                      {METODO_PAGO_ETIQUETA[m.metodo] ?? m.metodo}
                      <span className="ml-1.5 text-cafe-tenue">({m.pedidos})</span>
                    </span>
                    <span className="font-bold text-cafe">{pesos(m.monto)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {resumen.pedidos === 0 && (
              <p className="text-center font-cuerpo text-[13px] text-cafe-tenue">
                No entró ningún pedido este día.
              </p>
            )}
          </div>

          <ModalCerrar onCerrar={() => setAbierto(false)} />
        </Modal>
      )}
    </>
  );
}

function Dato({
  titulo,
  valor,
  nota,
  destacado,
}: {
  titulo: string;
  valor: string;
  nota?: string;
  destacado?: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-3 ${
        destacado ? "border-naranja bg-naranja/10" : "border-crema-oscura"
      }`}
    >
      <p className="font-cuerpo text-[12px] text-cafe-suave">{titulo}</p>
      <p className="font-titulo text-lg font-bold text-cafe">{valor}</p>
      {nota && <p className="font-cuerpo text-[12px] text-cafe-tenue">{nota}</p>}
    </div>
  );
}
