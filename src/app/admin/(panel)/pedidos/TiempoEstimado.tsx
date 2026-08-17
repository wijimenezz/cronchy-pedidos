"use client";

import { useState, useTransition } from "react";
import { Clock } from "lucide-react";
import { guardarTiempoEstimado } from "./acciones";

/**
 * El "llega en 30–45 min" que ve el cliente, editable sin salir de la pantalla de pedidos.
 *
 * Vive aquí y no en unos ajustes aparte porque este es el momento en que se cambia: se está
 * mirando la cola de pedidos, se ve que la cocina no da abasto, y se sube el estimado. Una
 * pantalla de configuración a la que hay que navegar no se abriría nunca en ese momento.
 *
 * Arranca plegado: es un dato que se toca una vez a la semana y esta pantalla es de operación.
 */
export function TiempoEstimado({ min, max }: { min: number; max: number }) {
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [borrador, setBorrador] = useState({ min: String(min), max: String(max) });
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function guardar() {
    setError(null);
    setAviso(null);
    iniciar(async () => {
      const resultado = await guardarTiempoEstimado({
        min: Number(borrador.min),
        max: Number(borrador.max),
      });
      if (resultado.ok) {
        setAviso("Guardado.");
        setAbierto(false);
      } else {
        setError(resultado.error);
      }
    });
  }

  /**
   * El envoltorio `relative` es lo que ancla el panel abierto: sin él se posicionaría contra
   * cualquier ancestro posicionado que hubiera por encima.
   */
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-crema-oscura px-2.5 font-cuerpo text-xs text-cafe-suave transition-colors hover:bg-crema"
      >
        <Clock className="size-3.5 shrink-0" />
        {min}–{max} min
        {aviso && <span className="font-bold text-exito">· {aviso}</span>}
      </button>

      {/*
        Abierto FLOTA sobre el tablero en vez de empujarlo.

        Vive dentro de una barra de herramientas de 48 px: si el formulario se quedara en el
        flujo, abrirlo estiraría esa fila y bajaría las cuatro columnas de golpe. Es un dato
        que se toca una vez a la semana, así que no vale ni un píxel de la altura fija.

        Va inline y no en un componente aparte definido aquí dentro: eso remontaría los inputs
        en cada tecla y el foco se perdería al escribir.
      */}
      {abierto && (
        <div className="absolute left-0 top-full z-30 mt-1 flex w-80 flex-col gap-2 rounded-md border border-crema-oscura bg-tarjeta p-3 shadow-modal">
      <p className="font-cuerpo text-[13px] text-cafe-suave">
        Lo que se le promete al cliente en “lo más pronto posible”. También corre la primera
        hora que se puede programar.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <CampoMinutos
          etiqueta="Desde"
          valor={borrador.min}
          onChange={(v) => setBorrador((b) => ({ ...b, min: v }))}
        />
        <CampoMinutos
          etiqueta="Hasta"
          valor={borrador.max}
          onChange={(v) => setBorrador((b) => ({ ...b, max: v }))}
        />
        <span className="pb-3 font-cuerpo text-[13px] text-cafe-tenue">minutos</span>
      </div>

      {error && (
        <p role="alert" className="font-cuerpo text-[13px] font-semibold text-error">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={guardar}
          disabled={pendiente}
          className="min-h-11 rounded-full bg-naranja px-5 font-cuerpo text-sm font-bold text-crema transition-colors hover:bg-naranja-osc disabled:opacity-50"
        >
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setBorrador({ min: String(min), max: String(max) });
            setError(null);
            setAbierto(false);
          }}
          className="min-h-11 rounded-full border border-crema-oscura px-5 font-cuerpo text-sm font-bold text-cafe-suave transition-colors hover:bg-crema"
        >
          Cancelar
        </button>
      </div>
        </div>
      )}
    </div>
  );
}

function CampoMinutos({
  etiqueta,
  valor,
  onChange,
}: {
  etiqueta: string;
  valor: string;
  onChange: (valor: string) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="font-cuerpo text-[11px] font-bold text-cafe-tenue">{etiqueta}</span>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={600}
        step={5}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 w-24 rounded-sm border border-crema-oscura bg-tarjeta px-2 font-cuerpo text-[15px] text-cafe focus:outline-none focus:ring-2 focus:ring-naranja"
      />
    </label>
  );
}
