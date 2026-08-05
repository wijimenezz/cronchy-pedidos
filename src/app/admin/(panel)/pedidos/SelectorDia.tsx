"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { DIAS_SEMANA, MESES, conMayuscula, diasDelMes } from "@/lib/fechas";

/**
 * La barra de fecha del panel: `‹ 📅 Martes, 9 de diciembre ›  [Hoy]`.
 *
 * Las flechas y el atajo son `<Link>` de verdad, no `router.push` a mano: la fecha vive en la
 * URL, así que el enlace se puede compartir por WhatsApp y el botón atrás del navegador hace lo
 * que debe. El calendario es lo único con estado, y por eso este componente es cliente.
 *
 * **`hoy` llega resuelto en Bogotá desde el servidor**, y eso es lo que hace segura toda la
 * aritmética de aquí: la rejilla solo responde "qué días tiene diciembre de 2025 y en qué día de
 * la semana cae el 1", que es calendario puro. Si `hoy` se calculara con el reloj del navegador,
 * una tablet mal configurada —o las once de la noche, cuando el servidor ya cambió de día— daría
 * un tope distinto al que aplica la consulta.
 */

/** El día que se pinta en la rejilla, sin zona horaria: es solo un número de calendario. */
type Mes = { anio: number; mes: number };

function mesDe(fecha: string): Mes {
  const [anio, mes] = fecha.split("-").map(Number);
  return { anio, mes };
}

function aTexto(anio: number, mes: number, dia: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Un mes atrás o adelante, con el salto de año incluido. */
function moverMes({ anio, mes }: Mes, paso: number): Mes {
  const total = anio * 12 + (mes - 1) + paso;
  return { anio: Math.floor(total / 12), mes: (total % 12) + 1 };
}

export function SelectorDia({
  dia,
  hoy,
  rotulo,
}: {
  /** El día que se está viendo, "YYYY-MM-DD". */
  dia: string;
  /** Hoy en Bogotá, "YYYY-MM-DD". Es el tope: no hay pedidos creados mañana. */
  hoy: string;
  /** Ya formateado en el servidor: "Hoy", "Ayer" o "Martes, 9 de diciembre". */
  rotulo: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [mes, setMes] = useState<Mes>(() => mesDe(dia));

  const esHoy = dia === hoy;

  function abrir() {
    // Siempre en el mes del día que se está viendo, no donde quedó la última vez.
    setMes(mesDe(dia));
    setAbierto(true);
  }

  const primerDiaSemana = new Date(mes.anio, mes.mes - 1, 1).getDay();
  const totalDias = diasDelMes(mes.anio, mes.mes);
  // Un mes entero por delante de hoy no tiene un solo día pulsable.
  const mesFuturo = aTexto(mes.anio, mes.mes, 1) > hoy;

  return (
    <div className="flex items-center justify-center gap-1">
      <Flecha
        href={`/admin/pedidos?fecha=${desplazarDia(dia, -1)}`}
        etiqueta="Día anterior"
        icono={<ChevronLeft className="size-5" />}
      />

      <button
        type="button"
        onClick={abrir}
        aria-haspopup="dialog"
        className="flex min-h-11 items-center gap-2 rounded-full border border-crema-oscura px-4 font-cuerpo text-sm font-bold text-cafe transition-colors hover:bg-crema focus:outline-none focus:ring-2 focus:ring-naranja"
      >
        <CalendarDays className="size-4 shrink-0 text-cafe-suave" />
        {rotulo}
      </button>

      {/* Hacia adelante no hay nada que ver: un pedido no se puede crear mañana. */}
      {esHoy ? (
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center text-cafe opacity-30"
        >
          <ChevronRight className="size-5" />
        </span>
      ) : (
        <Flecha
          href={`/admin/pedidos?fecha=${desplazarDia(dia, 1)}`}
          etiqueta="Día siguiente"
          icono={<ChevronRight className="size-5" />}
        />
      )}

      {!esHoy && (
        <Link
          href="/admin/pedidos"
          className="ml-2 flex min-h-11 items-center rounded-full border border-naranja px-4 font-cuerpo text-sm font-bold text-naranja-osc transition-colors hover:bg-naranja/10"
        >
          Hoy
        </Link>
      )}

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-cafe/40 p-4"
          onClick={() => setAbierto(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Elige el día"
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-sm flex-col overflow-hidden rounded-lg bg-tarjeta shadow-modal"
          >
            <div className="flex items-center justify-between gap-2 bg-naranja px-3 py-2">
              <button
                type="button"
                aria-label="Mes anterior"
                onClick={() => setMes((m) => moverMes(m, -1))}
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-crema"
              >
                <ChevronLeft className="size-5" />
              </button>

              <span className="font-titulo text-base font-semibold text-crema">
                {conMayuscula(MESES[mes.mes - 1])} {mes.anio}
              </span>

              <button
                type="button"
                aria-label="Mes siguiente"
                disabled={mesFuturo}
                onClick={() => setMes((m) => moverMes(m, 1))}
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-crema disabled:opacity-30"
              >
                <ChevronRight className="size-5" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5 p-4">
              {DIAS_SEMANA.map((d) => (
                <span
                  key={d}
                  className="flex h-8 items-center justify-center font-cuerpo text-[11px] text-cafe-tenue"
                >
                  {d}
                </span>
              ))}

              {Array.from({ length: primerDiaSemana }, (_, i) => (
                <span key={`hueco-${i}`} aria-hidden />
              ))}

              {Array.from({ length: totalDias }, (_, i) => i + 1).map((d) => {
                const fecha = aTexto(mes.anio, mes.mes, d);
                const futuro = fecha > hoy;
                const elegido = fecha === dia;

                // Un día futuro no es un enlace roto: no existe. Se pinta apagado y sin href.
                if (futuro) {
                  return (
                    <span
                      key={d}
                      aria-disabled
                      className="flex h-10 items-center justify-center font-cuerpo text-sm text-cafe-tenue opacity-30"
                    >
                      {d}
                    </span>
                  );
                }

                return (
                  <Link
                    key={d}
                    href={`/admin/pedidos?fecha=${fecha}`}
                    onClick={() => setAbierto(false)}
                    aria-current={elegido ? "date" : undefined}
                    className={`flex h-10 items-center justify-center rounded-full font-cuerpo text-sm ${
                      elegido ? "bg-naranja font-bold text-crema" : "text-cafe hover:bg-crema"
                    }`}
                  >
                    {d}
                  </Link>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="min-h-11 self-end px-5 pb-3 font-cuerpo text-sm font-bold uppercase text-naranja"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Flecha({
  href,
  etiqueta,
  icono,
}: {
  href: string;
  etiqueta: string;
  icono: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={etiqueta}
      className="flex size-11 shrink-0 items-center justify-center rounded-full text-cafe transition-colors hover:bg-crema focus:outline-none focus:ring-2 focus:ring-naranja"
    >
      {icono}
    </Link>
  );
}

/**
 * Un día atrás o adelante, para los `href` de las flechas.
 *
 * Aquí sí se hace con `Date` local y no con el helper de Bogotá de `dias.ts`: esto es aritmética
 * de calendario sobre un número de día, no una conversión de instante. `new Date(a, m - 1, d)`
 * construye la fecha en hora local y las tres partes se vuelven a leer con `getFullYear/Month/Date`,
 * así que la zona horaria entra y sale por el mismo sitio y se cancela. Lo que jamás hay que
 * hacer es `new Date("2025-12-09")`, que se interpreta como UTC y en Colombia cae un día antes.
 */
function desplazarDia(fecha: string, paso: number): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const d = new Date(anio, mes - 1, dia + paso);

  return aTexto(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
