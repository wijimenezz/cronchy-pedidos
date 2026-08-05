"use client";

import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { DIAS_SEMANA, MESES_CORTOS, conMayuscula, diasDelMes } from "@/lib/fechas";
import { Modal, ModalCerrar } from "@/components/ui/Modal";

/**
 * Selector de fecha en tres etapas: año → mes → día.
 *
 * Se escribió a mano en vez de usar `<input type="date">` porque el picker nativo
 * arranca en el mes actual, y para un cumpleaños eso son decenas de toques hasta
 * llegar al año. Aquí el año es lo primero que se elige.
 *
 * TODA la aritmética usa `new Date(a, m - 1, d)` (hora local). Con
 * `new Date("1990-12-16")` el valor se interpretaría como UTC y en Colombia
 * caería un día antes — el clásico cumpleaños corrido.
 */

/** Años por página de la grilla (3 columnas × 7 filas). */
const ANIOS_POR_PAGINA = 21;
const ANIO_MINIMO = 1900;

type Borrador = { anio: number; mes: number; dia: number };

function aTexto({ anio, mes, dia }: Borrador): string {
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function desdeTexto(valor: string): Borrador | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const [anio, mes, dia] = valor.split("-").map(Number);
  return { anio, mes, dia };
}

function formatear(b: Borrador, opciones: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("es-CO", opciones).format(new Date(b.anio, b.mes - 1, b.dia));
}

export function SelectorFecha({
  valor,
  onCambiar,
  onCerrar,
  error,
  id,
  // `Campo` también manda `aria-invalid`, pero el rol implícito de un <button> no lo
  // admite: el error se anuncia por `aria-describedby`, que sí es válido aquí.
  "aria-describedby": ariaDescribedBy,
}: {
  /** "YYYY-MM-DD", o "" si todavía no eligió. */
  valor: string;
  onCambiar: (valor: string) => void;
  /** Se llama al cerrar el modal, para poder validar como haría un `blur`. */
  onCerrar?: () => void;
  error?: string;
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const hoy = new Date();
  const elegido = desdeTexto(valor);

  const [abierto, setAbierto] = useState(false);
  const [etapa, setEtapa] = useState<"anio" | "mes" | "dia">("anio");
  // Por defecto un adulto, no un recién nacido: arrancar en el año actual obligaría
  // a retroceder decenas de páginas.
  const [borrador, setBorrador] = useState<Borrador>(
    elegido ?? { anio: hoy.getFullYear() - 25, mes: 1, dia: 1 },
  );
  const [paginaAnios, setPaginaAnios] = useState(0);

  function abrir() {
    const base = desdeTexto(valor) ?? { anio: hoy.getFullYear() - 25, mes: 1, dia: 1 };
    setBorrador(base);
    setEtapa("anio");
    // Abrir en la página que ya contiene el año elegido, no siempre en la primera.
    setPaginaAnios(Math.floor((hoy.getFullYear() - base.anio) / ANIOS_POR_PAGINA));
    setAbierto(true);
  }

  function cerrar() {
    setAbierto(false);
    onCerrar?.();
  }

  /** Cambiar de mes o año puede dejar un día que no existe (31 de febrero). */
  function ajustada(b: Borrador): Borrador {
    return { ...b, dia: Math.min(b.dia, diasDelMes(b.anio, b.mes)) };
  }

  function elegirDia(dia: number) {
    const fecha = { ...borrador, dia };
    setBorrador(fecha);
    onCambiar(aTexto(fecha));
    cerrar();
  }

  // La grilla de años va de más nuevo a más viejo: el cumpleaños de un cliente está
  // mucho más cerca de hoy que de 1900.
  const anioTope = hoy.getFullYear() - paginaAnios * ANIOS_POR_PAGINA;
  const anios = Array.from({ length: ANIOS_POR_PAGINA }, (_, i) => anioTope - i).filter(
    (a) => a >= ANIO_MINIMO,
  );

  const primerDiaSemana = new Date(borrador.anio, borrador.mes - 1, 1).getDay();
  const totalDias = diasDelMes(borrador.anio, borrador.mes);

  const claseCelda = "flex min-h-11 items-center justify-center rounded-full font-cuerpo text-sm";

  return (
    <>
      <button
        type="button"
        id={id}
        aria-describedby={ariaDescribedBy}
        onClick={abrir}
        className={`flex min-h-11 w-full items-center justify-between rounded-sm border bg-tarjeta px-3 py-2 font-cuerpo text-[15px] focus:outline-none focus:ring-2 focus:ring-naranja ${
          error ? "border-error" : "border-crema-oscura"
        } ${elegido ? "text-cafe" : "text-cafe-tenue"}`}
      >
        {elegido
          ? conMayuscula(
              formatear(elegido, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
            )
          : "Elige tu fecha"}
        <CalendarDays className="size-4 shrink-0 text-cafe-suave" />
      </button>

      {abierto && (
        <Modal etiqueta="Elige tu fecha de cumpleaños" onCerrar={cerrar}>
          <div className="bg-naranja px-5 py-4">
            <button
              type="button"
              onClick={() => setEtapa("anio")}
              className="block font-cuerpo text-sm text-crema/80"
            >
              {borrador.anio}
            </button>
            <button
              type="button"
              onClick={() => setEtapa("dia")}
              className="block text-left font-titulo text-2xl font-semibold text-crema"
            >
              {conMayuscula(formatear(borrador, { weekday: "short", day: "numeric", month: "long" }))}
            </button>
          </div>

          <div className="p-4">
            {etapa === "anio" && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Años más recientes"
                  disabled={paginaAnios === 0}
                  onClick={() => setPaginaAnios((p) => p - 1)}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full text-cafe disabled:opacity-30"
                >
                  <ChevronLeft className="size-5" />
                </button>

                <div className="grid flex-1 grid-cols-3 gap-1">
                  {anios.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => {
                        setBorrador((b) => ajustada({ ...b, anio: a }));
                        setEtapa("mes");
                      }}
                      className={`${claseCelda} ${
                        a === borrador.anio ? "bg-naranja font-bold text-crema" : "text-cafe"
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  aria-label="Años anteriores"
                  disabled={anioTope - ANIOS_POR_PAGINA < ANIO_MINIMO}
                  onClick={() => setPaginaAnios((p) => p + 1)}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full text-cafe disabled:opacity-30"
                >
                  <ChevronRight className="size-5" />
                </button>
              </div>
            )}

            {etapa === "mes" && (
              <div className="grid grid-cols-3 gap-1">
                {MESES_CORTOS.map((nombre, i) => (
                  <button
                    key={nombre}
                    type="button"
                    onClick={() => {
                      setBorrador((b) => ajustada({ ...b, mes: i + 1 }));
                      setEtapa("dia");
                    }}
                    className={`${claseCelda} ${
                      i + 1 === borrador.mes ? "bg-naranja font-bold text-crema" : "text-cafe"
                    }`}
                  >
                    {nombre}
                  </button>
                ))}
              </div>
            )}

            {etapa === "dia" && (
              <>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setEtapa("mes")}
                    className="flex-1 rounded-sm px-2 py-1 font-cuerpo text-sm font-bold text-cafe"
                  >
                    {conMayuscula(formatear(borrador, { month: "long" }))}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEtapa("anio")}
                    className="rounded-sm px-2 py-1 font-cuerpo text-sm font-bold text-cafe"
                  >
                    {borrador.anio}
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-0.5">
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

                  {Array.from({ length: totalDias }, (_, i) => i + 1).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => elegirDia(d)}
                      className={`flex h-10 items-center justify-center rounded-full font-cuerpo text-sm ${
                        d === borrador.dia ? "bg-naranja font-bold text-crema" : "text-cafe"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <ModalCerrar onCerrar={cerrar} />
        </Modal>
      )}
    </>
  );
}
