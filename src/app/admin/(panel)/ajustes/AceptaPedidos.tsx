"use client";

import { useOptimistic, useState, useTransition } from "react";
import { BotonSwitch } from "@/components/admin/Interruptor";
import { cambiarAceptaPedidos, guardarMensajeCerrado } from "./acciones";

/**
 * El interruptor de pánico de la regla 6 y el mensaje que lee el cliente.
 *
 * Son dos guardados independientes, igual que la llave y el QR de pago: el interruptor se mueve
 * a un toque —se apaga con la freidora dañada, no con calma— y el mensaje espera al botón porque
 * se escribe a mano y hay que poder corregirlo antes de publicarlo.
 */
export function AceptaPedidos({
  aceptaPedidos,
  mensajeCerrado,
}: {
  aceptaPedidos: boolean;
  mensajeCerrado: string | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-md border border-crema-oscura bg-tarjeta p-4">
        <div>
          <h2 className="font-titulo text-base font-bold text-cafe">¿Estás aceptando pedidos?</h2>
          <p className="font-cuerpo text-[13px] text-cafe-tenue">
            Apagarlo cierra la tienda al instante y gana sobre todo lo demás: no entra ningún
            pedido, <strong>ni siquiera programado para mañana</strong>. Es para cuando se dañó
            algo o se acabó la masa. Si lo que quieres es no abrir un día concreto, ponlo abajo
            como excepción y el resto sigue funcionando.
          </p>
        </div>
        <Interruptor aceptaPedidos={aceptaPedidos} />
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-crema-oscura bg-tarjeta p-4">
        <div>
          <h2 className="font-titulo text-base font-bold text-cafe">Mensaje cuando está cerrado</h2>
          <p className="font-cuerpo text-[13px] text-cafe-tenue">
            Lo ve el cliente en el checkout siempre que no se le pueda vender: fuera de horario,
            con la tienda apagada o un día sin horario. Que sirva para todos esos casos —«Volvemos
            mañana a las 12»— y no para uno solo; el motivo de un día suelto se escribe en su
            excepción. Vacío, se muestra un texto genérico.
          </p>
        </div>
        <FormularioMensaje mensaje={mensajeCerrado} />
      </section>
    </div>
  );
}

function Interruptor({ aceptaPedidos }: { aceptaPedidos: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const [optimista, setOptimista] = useOptimistic(aceptaPedidos);
  const [error, setError] = useState<string | null>(null);

  function alternar() {
    const nuevo = !optimista;
    setError(null);

    iniciar(async () => {
      setOptimista(nuevo);
      const resultado = await cambiarAceptaPedidos({ aceptaPedidos: nuevo });
      if (!resultado.ok) setError(resultado.error);
    });
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <span
          className={`font-cuerpo text-[15px] font-bold ${optimista ? "text-exito" : "text-error"}`}
        >
          {optimista ? "Abierta: entran pedidos" : "Apagada: no entra ningún pedido"}
        </span>
        {error && (
          <p role="alert" className="font-cuerpo text-[13px] font-semibold text-error">
            {error}
          </p>
        )}
      </div>

      <BotonSwitch
        activo={optimista}
        etiqueta={optimista ? "Dejar de aceptar pedidos" : "Volver a aceptar pedidos"}
        onClick={alternar}
        deshabilitado={pendiente}
      />
    </div>
  );
}

function FormularioMensaje({ mensaje }: { mensaje: string | null }) {
  const [pendiente, iniciar] = useTransition();
  const [borrador, setBorrador] = useState(mensaje ?? "");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cambiado = borrador.trim() !== (mensaje ?? "");

  function guardar() {
    setError(null);
    setAviso(null);

    iniciar(async () => {
      const resultado = await guardarMensajeCerrado({ mensaje: borrador });
      if (resultado.ok) setAviso("Guardado.");
      else setError(resultado.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="font-cuerpo text-[13px] font-semibold text-cafe-suave">
          Lo que se le dice al cliente
        </span>
        <input
          type="text"
          value={borrador}
          maxLength={160}
          onChange={(e) => setBorrador(e.target.value)}
          placeholder="Volvemos mañana a las 12:00"
          className="min-h-11 rounded-sm border border-crema-oscura bg-tarjeta px-3 font-cuerpo text-[15px] text-cafe focus:outline-none focus:ring-2 focus:ring-naranja"
        />
      </label>

      {error && (
        <p role="alert" className="font-cuerpo text-[13px] font-semibold text-error">
          {error}
        </p>
      )}
      {aviso && !error && (
        <p role="status" className="font-cuerpo text-[13px] font-semibold text-exito">
          {aviso}
        </p>
      )}

      <button
        type="button"
        onClick={guardar}
        disabled={pendiente || !cambiado}
        className="min-h-11 self-start rounded-full bg-naranja px-5 font-cuerpo text-sm font-bold text-crema transition-colors hover:bg-naranja-osc disabled:opacity-50"
      >
        {pendiente ? "Guardando…" : "Guardar mensaje"}
      </button>
    </div>
  );
}
