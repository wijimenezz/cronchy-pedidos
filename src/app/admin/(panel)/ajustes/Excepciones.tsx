"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import type { ExcepcionDelPanel } from "@/db/queries/horario";
import { DIAS_SEMANA_LARGOS, MESES } from "@/lib/fechas";
import { eliminarExcepcionDelDia, guardarExcepcionDelDia } from "./acciones";

/**
 * Los días sueltos que no siguen el horario de la semana: un festivo que se cierra, un 24 de
 * diciembre que se abre solo la tarde.
 *
 * Dos cosas que hay que saber y no se ven en la pantalla:
 *
 * - **Un horario especial REEMPLAZA al de la semana ese día**, no se suma (`rangosDelDia`). Si el
 *   lunes es 12:00–20:00 y se pone una excepción de 14:00–18:00, ese lunes son 14:00–18:00 y nada
 *   más.
 * - **Cerrar un día no cancela lo que ya se pidió para él.** La excepción corta los pedidos
 *   nuevos; los que ya entraron siguen en el tablero y hay que resolverlos a mano.
 */

/** "Viernes 25 de diciembre", sin zona horaria: es calendario puro sobre una fecha "YYYY-MM-DD". */
function rotulo(fecha: string, hoy: string): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  // Hora local en los dos sentidos, así que la zona entra y sale por el mismo sitio y se cancela.
  // Lo que jamás hay que hacer es `new Date("2026-12-25")`, que se lee como UTC y en Colombia cae
  // el día anterior.
  const diaSemana = new Date(anio, mes - 1, dia).getDay();
  const texto = `${DIAS_SEMANA_LARGOS[diaSemana]} ${dia} de ${MESES[mes - 1]}`;

  return fecha === hoy ? `Hoy · ${texto}` : texto;
}

export function Excepciones({
  excepciones,
  hoy,
}: {
  excepciones: ExcepcionDelPanel[];
  /** Hoy en Bogotá, resuelto en el servidor: el reloj del navegador no manda (regla 6). */
  hoy: string;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-md border border-crema-oscura bg-tarjeta p-4">
      <div>
        <h2 className="font-titulo text-base font-bold text-cafe">Días especiales</h2>
        <p className="font-cuerpo text-[13px] text-cafe-tenue">
          Para cerrar un día concreto sin tocar el horario de siempre, o para abrir a otra hora ese
          día. Lo que escribas como motivo lo lee el cliente. Ten en cuenta que el checkout solo
          deja pedir para <strong>hoy y mañana</strong>: cerrar una fecha más lejana no se nota en
          la tienda hasta la víspera, y eso es normal.
        </p>
      </div>

      <Lista excepciones={excepciones} hoy={hoy} />
      <Formulario hoy={hoy} />
    </section>
  );
}

function Lista({ excepciones, hoy }: { excepciones: ExcepcionDelPanel[]; hoy: string }) {
  if (excepciones.length === 0) {
    return (
      <p className="font-cuerpo text-[13px] text-cafe-suave">
        No hay ningún día especial por delante. Los que ya pasaron no se muestran.
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-crema-oscura">
      {excepciones.map((excepcion) => (
        <Fila key={excepcion.id} excepcion={excepcion} hoy={hoy} />
      ))}
    </ul>
  );
}

function Fila({ excepcion, hoy }: { excepcion: ExcepcionDelPanel; hoy: string }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Un toque y sin confirmación, como el resto de los interruptores del panel: quitar un día
  // especial no borra historial ni pierde nada — se vuelve a poner abajo en diez segundos.
  function quitar() {
    setError(null);
    iniciar(async () => {
      const resultado = await eliminarExcepcionDelDia({ id: excepcion.id });
      if (!resultado.ok) setError(resultado.error);
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-3 py-2">
      <div className="flex-1">
        <span className="font-cuerpo text-[15px] font-semibold text-cafe">
          {rotulo(excepcion.fecha, hoy)}
        </span>
        <p
          className={`font-cuerpo text-[13px] ${excepcion.cerrado ? "font-bold text-error" : "text-cafe-suave"}`}
        >
          {excepcion.cerrado
            ? "Cerrado todo el día"
            : `Abre de ${excepcion.abre} a ${excepcion.cierra}`}
          {excepcion.motivo && ` · ${excepcion.motivo}`}
        </p>
        {error && (
          <p role="alert" className="font-cuerpo text-[13px] font-semibold text-error">
            {error}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={quitar}
        disabled={pendiente}
        aria-label={`Quitar el día especial del ${rotulo(excepcion.fecha, hoy)}`}
        className="flex min-h-11 items-center gap-1.5 px-2 font-cuerpo text-[13px] font-bold text-cafe-tenue transition-colors hover:text-error disabled:opacity-50"
      >
        <Trash2 className="size-4" />
        Quitar
      </button>
    </li>
  );
}

function Formulario({ hoy }: { hoy: string }) {
  const [pendiente, iniciar] = useTransition();
  const [fecha, setFecha] = useState("");
  const [cerrado, setCerrado] = useState(true);
  const [abre, setAbre] = useState("12:00");
  const [cierra, setCierra] = useState("20:00");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function guardar() {
    setError(null);
    setAviso(null);

    iniciar(async () => {
      const resultado = await guardarExcepcionDelDia({
        fecha,
        cerrado,
        // Un día cerrado no manda horas: no significan nada, y guardarlas dejaría basura que
        // reaparecería sola el día que se cambie a horario especial.
        abre: cerrado ? null : abre,
        cierra: cerrado ? null : cierra,
        motivo,
      });

      if (resultado.ok) {
        setFecha("");
        setMotivo("");
        setAviso("Guardado.");
      } else {
        setError(resultado.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-crema-oscura bg-crema/40 p-3">
      <h3 className="font-cuerpo text-[13px] font-bold text-cafe-suave">Añadir un día especial</h3>

      <label className="flex flex-col gap-1">
        <span className="font-cuerpo text-[13px] font-semibold text-cafe-suave">Fecha</span>
        <input
          type="date"
          value={fecha}
          min={hoy}
          onChange={(e) => setFecha(e.target.value)}
          className="min-h-11 self-start rounded-sm border border-crema-oscura bg-tarjeta px-3 font-cuerpo text-[15px] text-cafe focus:outline-none focus:ring-2 focus:ring-naranja"
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="font-cuerpo text-[13px] font-semibold text-cafe-suave">Ese día…</legend>

        <label className="flex items-center gap-2 font-cuerpo text-[15px] text-cafe">
          <input
            type="radio"
            name="tipo-excepcion"
            checked={cerrado}
            onChange={() => setCerrado(true)}
            className="size-4 accent-naranja"
          />
          No abro
        </label>

        <label className="flex flex-wrap items-center gap-2 font-cuerpo text-[15px] text-cafe">
          <input
            type="radio"
            name="tipo-excepcion"
            checked={!cerrado}
            onChange={() => setCerrado(false)}
            className="size-4 accent-naranja"
          />
          Abro de
          <input
            type="time"
            value={abre}
            step={1800}
            disabled={cerrado}
            aria-label="Hora a la que abre ese día"
            onChange={(e) => setAbre(e.target.value)}
            className="min-h-11 rounded-sm border border-crema-oscura bg-tarjeta px-2 font-cuerpo text-[15px] text-cafe focus:outline-none focus:ring-2 focus:ring-naranja disabled:opacity-50"
          />
          a
          <input
            type="time"
            value={cierra}
            step={1800}
            disabled={cerrado}
            aria-label="Hora a la que cierra ese día"
            onChange={(e) => setCierra(e.target.value)}
            className="min-h-11 rounded-sm border border-crema-oscura bg-tarjeta px-2 font-cuerpo text-[15px] text-cafe focus:outline-none focus:ring-2 focus:ring-naranja disabled:opacity-50"
          />
        </label>
      </fieldset>

      <label className="flex flex-col gap-1">
        <span className="font-cuerpo text-[13px] font-semibold text-cafe-suave">
          Motivo (lo lee el cliente)
        </span>
        <input
          type="text"
          value={motivo}
          maxLength={120}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Cerrado por festivo"
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
        disabled={pendiente || fecha === ""}
        className="min-h-11 self-start rounded-full bg-naranja px-5 font-cuerpo text-sm font-bold text-crema transition-colors hover:bg-naranja-osc disabled:opacity-50"
      >
        {pendiente ? "Guardando…" : "Guardar día"}
      </button>

      <p className="font-cuerpo text-[13px] text-cafe-tenue">
        Si ya habías puesto algo para esa fecha, esto lo reemplaza.
      </p>
    </div>
  );
}
