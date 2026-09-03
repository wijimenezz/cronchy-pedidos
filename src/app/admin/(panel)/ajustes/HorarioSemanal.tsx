"use client";

import { useState, useTransition } from "react";
import type { DiaSemanal } from "@/db/queries/horario";
import { BotonSwitch } from "@/components/admin/Interruptor";
import { DIAS_SEMANA_LARGOS } from "@/lib/fechas";
import { guardarHorario } from "./acciones";

/**
 * El horario de cada día de la semana.
 *
 * **La semana se pinta de lunes a domingo, pero el número que se guarda es el de Postgres**
 * (0 = domingo, igual que `EXTRACT(DOW)` y que `ahoraEnBogota().diaSemana`). Son dos cosas
 * distintas: el orden es de lectura y el número es del dominio, así que se traducen aquí y no
 * en la base.
 *
 * **Un día apagado no guarda nada**: la ausencia de fila ES el día cerrado (`rangosDelDia`
 * devuelve una lista vacía y el checkout no ofrece ni una franja). Por eso el botón guarda la
 * semana entera de una vez, y no día por día: lo que se manda es la foto completa.
 *
 * Un solo tramo por día. La tabla admite varios —turno partido— pero hoy no hay ninguno y una
 * pantalla que lo permitiera sería el doble de controles para un caso que no existe. Está escrito
 * en `guardarHorarioSemanal` por si algún día vuelve.
 */

/** De lunes a domingo, que es como se lee una semana aquí. */
const ORDEN = [1, 2, 3, 4, 5, 6, 0];

/** Lo que se propone al encender un día que estaba cerrado: el horario normal del negocio. */
const POR_DEFECTO = { abre: "12:00", cierra: "20:00" };

type FilaDia = { abierto: boolean; abre: string; cierra: string };

function estadoInicial(dias: DiaSemanal[]): Record<number, FilaDia> {
  return Object.fromEntries(
    ORDEN.map((numero) => {
      const guardado = dias.find((d) => d.diaSemana === numero);

      return [
        numero,
        guardado
          ? { abierto: true, abre: guardado.abre, cierra: guardado.cierra }
          : { abierto: false, ...POR_DEFECTO },
      ];
    }),
  );
}

/** Una firma comparable de la semana, para saber si hay algo sin guardar. */
function firma(filas: Record<number, FilaDia>): string {
  return ORDEN.map((n) => (filas[n].abierto ? `${n}:${filas[n].abre}-${filas[n].cierra}` : `${n}:x`))
    .join("|");
}

export function HorarioSemanal({ dias }: { dias: DiaSemanal[] }) {
  const [pendiente, iniciar] = useTransition();
  const [filas, setFilas] = useState<Record<number, FilaDia>>(() => estadoInicial(dias));
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cambiado = firma(filas) !== firma(estadoInicial(dias));
  const todosCerrados = ORDEN.every((n) => !filas[n].abierto);

  function cambiar(numero: number, cambio: Partial<FilaDia>) {
    // El error se borra al tocar cualquier hora, no solo al volver a guardar: quien acaba de leer
    // «el lunes cierra antes de abrir» está corrigiéndolo, y dejar el aviso rojo puesto sobre el
    // valor ya arreglado se lee como que sigue fallando.
    setError(null);
    setAviso(null);
    setFilas((prev) => ({ ...prev, [numero]: { ...prev[numero], ...cambio } }));
  }

  function guardar() {
    setError(null);
    setAviso(null);

    iniciar(async () => {
      const resultado = await guardarHorario({
        dias: ORDEN.filter((n) => filas[n].abierto).map((n) => ({
          diaSemana: n,
          abre: filas[n].abre,
          cierra: filas[n].cierra,
        })),
      });

      if (resultado.ok) setAviso("Horario guardado.");
      else setError(resultado.error);
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-crema-oscura bg-tarjeta p-4">
      <div>
        <h2 className="font-titulo text-base font-bold text-cafe">Horario de atención</h2>
        <p className="font-cuerpo text-[13px] text-cafe-tenue">
          De aquí salen las horas que el cliente puede elegir al programar su pedido, en tramos de
          media hora. La hora de cierre no se ofrece: si cierras a las 20:00, la última es 19:30.
          Un día apagado no acepta pedidos ni programados.
        </p>
      </div>

      <ul className="flex flex-col divide-y divide-crema-oscura">
        {ORDEN.map((numero) => {
          const fila = filas[numero];

          return (
            <li key={numero} className="flex flex-wrap items-center gap-3 py-2">
              <span className="min-w-[6.5rem] font-cuerpo text-[15px] font-semibold text-cafe">
                {DIAS_SEMANA_LARGOS[numero]}
              </span>

              {fila.abierto ? (
                <div className="flex flex-1 items-center gap-2">
                  <Hora
                    valor={fila.abre}
                    etiqueta={`Hora a la que abre el ${DIAS_SEMANA_LARGOS[numero].toLowerCase()}`}
                    onChange={(abre) => cambiar(numero, { abre })}
                  />
                  <span className="font-cuerpo text-[13px] text-cafe-tenue">a</span>
                  <Hora
                    valor={fila.cierra}
                    etiqueta={`Hora a la que cierra el ${DIAS_SEMANA_LARGOS[numero].toLowerCase()}`}
                    onChange={(cierra) => cambiar(numero, { cierra })}
                  />
                </div>
              ) : (
                <span className="flex-1 font-cuerpo text-[15px] text-cafe-tenue italic">
                  Cerrado
                </span>
              )}

              <BotonSwitch
                activo={fila.abierto}
                etiqueta={`${DIAS_SEMANA_LARGOS[numero]}: ${fila.abierto ? "abierto" : "cerrado"}`}
                onClick={() => cambiar(numero, { abierto: !fila.abierto })}
                deshabilitado={pendiente}
              />
            </li>
          );
        })}
      </ul>

      {/* Avisa, no bloquea: cerrar toda la semana es raro pero puede ser lo que se quiere
          (vacaciones largas). Lo que no puede es pasar sin que nadie lo diga. */}
      {todosCerrados && (
        <p role="status" className="font-cuerpo text-[13px] font-semibold text-alerta">
          Con los siete días cerrados nadie puede pedir, ningún día.
        </p>
      )}

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
        {pendiente ? "Guardando…" : "Guardar horario"}
      </button>
    </section>
  );
}

function Hora({
  valor,
  etiqueta,
  onChange,
}: {
  valor: string;
  etiqueta: string;
  onChange: (valor: string) => void;
}) {
  return (
    <label>
      <span className="sr-only">{etiqueta}</span>
      <input
        type="time"
        value={valor}
        // Los tramos son de media hora (`PASO_MINUTOS`), así que el selector nativo no tiene por
        // qué ofrecer minutos sueltos. No es una validación: escribir 12:07 sigue siendo posible
        // y el servidor lo aceptaría — solo cambia dónde caen las franjas.
        step={1800}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 rounded-sm border border-crema-oscura bg-tarjeta px-2 font-cuerpo text-[15px] text-cafe focus:outline-none focus:ring-2 focus:ring-naranja"
      />
    </label>
  );
}
