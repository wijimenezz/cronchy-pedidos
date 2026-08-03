"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import type { DiaConFranjas } from "@/lib/pedidos/franjas";

/**
 * "¿Cuándo lo quieres?" — lo más pronto posible, o una hora elegida.
 *
 * Las franjas llegan ya calculadas por el servidor (`opcionesDeEntrega`), que es el mismo que
 * las valida al confirmar: aquí no se decide qué horas son posibles, solo se pintan. Si esta
 * pantalla ofreciera una franja que el servidor no reconoce, el cliente llenaría todo el
 * formulario para que lo rechacen al final.
 *
 * Se despliega en línea y no en un modal —a diferencia de `SelectorFecha`, que sí lo es—
 * porque es un toque menos y porque la lista es corta: media docena de horas, no un calendario.
 */

/**
 * El modo va en el tipo y no en un booleano interno del componente, porque el formulario
 * necesita distinguir "eligió lo más pronto posible" de "eligió programar y todavía no tocó
 * ninguna hora". La segunda es un pedido incompleto y tiene que frenar el botón de confirmar;
 * si las dos se representaran como `null`, no habría forma de saberlo desde fuera.
 */
export type Cuando =
  | { modo: "pronto" }
  | { modo: "programar"; franja: { instante: string; etiqueta: string } | null };

/** Con la tienda cerrada no hay "para ya" que ofrecer: programar no es una elección, es lo
 *  único que queda, y el selector arranca abierto en esa rama. */
export function cuandoInicial(pronto: unknown): Cuando {
  return pronto ? { modo: "pronto" } : { modo: "programar", franja: null };
}

export function SelectorCuando({
  pronto,
  dias,
  mensajeCerrado,
  esDomicilio,
  valor,
  onCambiar,
  error,
}: {
  pronto: { min: number; max: number } | null;
  dias: DiaConFranjas[];
  mensajeCerrado: string | null;
  esDomicilio: boolean;
  valor: Cuando;
  onCambiar: (valor: Cuando) => void;
  error?: string;
}) {
  const [fecha, setFecha] = useState(dias[0]?.fecha ?? "");

  const dia = dias.find((d) => d.fecha === fecha) ?? dias[0] ?? null;
  const programando = valor.modo === "programar";
  const elegida = valor.modo === "programar" ? valor.franja : null;

  function elegirDia(nueva: string) {
    setFecha(nueva);
    // La selección NO se arrastra entre días: las 3:00 pm de hoy y las de mañana son franjas
    // distintas, y conservarla haría que un toque en "Mañana" cambiara el pedido sin que se
    // note. Se limpia y hay que volver a tocar una hora.
    onCambiar({ modo: "programar", franja: null });
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-titulo text-base font-semibold text-cafe">¿Cuándo lo quieres?</h3>

      {pronto && (
        <Opcion
          activa={!programando}
          titulo="Lo más pronto posible"
          detalle={`${esDomicilio ? "Llega" : "Listo"} en ${pronto.min}–${pronto.max} min`}
          onClick={() => onCambiar({ modo: "pronto" })}
        />
      )}

      {dias.length > 0 ? (
        <>
          <Opcion
            activa={programando}
            titulo="Programar"
            detalle={
              elegida
                ? `${esDomicilio ? "Llega" : "Lo recoges"} ${elegida.etiqueta}`
                : "Elige la hora que te sirva"
            }
            onClick={() => onCambiar({ modo: "programar", franja: elegida })}
          />

          {programando && dia && (
            <div className="flex flex-col gap-2 rounded-sm border border-crema-oscura p-3">
              {!pronto && mensajeCerrado && (
                <p className="font-cuerpo text-[13px] text-cafe-suave">
                  {mensajeCerrado} Programa tu pedido y lo tenemos listo a la hora que elijas.
                </p>
              )}

              {/* Con un solo día no hay nada que elegir: se rotula y ya. Pintarlo como pestaña
                  ofrecería una elección falsa. */}
              {dias.length > 1 ? (
                <div className="flex gap-2" role="tablist" aria-label="Día de entrega">
                  {dias.map((d) => (
                    <button
                      key={d.fecha}
                      type="button"
                      role="tab"
                      aria-selected={d.fecha === dia.fecha}
                      onClick={() => elegirDia(d.fecha)}
                      className={`min-h-11 flex-1 rounded-full border px-4 font-cuerpo text-sm font-bold transition-colors ${
                        d.fecha === dia.fecha
                          ? "border-naranja bg-naranja text-crema"
                          : "border-crema-oscura text-cafe-suave hover:bg-crema"
                      }`}
                    >
                      {d.dia === "hoy" ? "Hoy" : "Mañana"}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="font-cuerpo text-sm font-bold text-cafe">
                  {dia.dia === "hoy" ? "Hoy" : "Mañana"}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                {dia.franjas.map((f) => {
                  // ISO y no `toString()`: es lo que viaja en el payload y lo que el servidor
                  // compara contra sus propias franjas.
                  const iso = f.instante.toISOString();
                  const activa = elegida?.instante === iso;

                  return (
                    <button
                      key={iso}
                      type="button"
                      aria-pressed={activa}
                      onClick={() =>
                        onCambiar({
                          modo: "programar",
                          franja: {
                            instante: iso,
                            etiqueta: `${dia.dia === "hoy" ? "hoy" : "mañana"} a las ${f.etiqueta}`,
                          },
                        })
                      }
                      className={`min-h-11 rounded-full border px-4 font-cuerpo text-sm font-bold transition-colors ${
                        activa
                          ? "border-naranja bg-naranja text-crema"
                          : "border-crema-oscura text-cafe-suave hover:bg-crema"
                      }`}
                    >
                      {f.etiqueta}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="font-cuerpo text-[13px] text-cafe-suave">
          Hoy no quedan horas para programar.
        </p>
      )}

      {error && (
        <p role="alert" className="font-cuerpo text-[13px] font-semibold text-error">
          {error}
        </p>
      )}
    </div>
  );
}

function Opcion({
  activa,
  titulo,
  detalle,
  onClick,
}: {
  activa: boolean;
  titulo: string;
  detalle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={activa}
      onClick={onClick}
      className={`flex min-h-11 items-center gap-3 rounded-sm border p-3 text-left transition-colors ${
        activa ? "border-naranja bg-naranja/8" : "border-crema-oscura hover:bg-crema"
      }`}
    >
      <Clock className={`size-4 shrink-0 ${activa ? "text-naranja" : "text-cafe-suave"}`} />
      <span className="min-w-0 flex-1">
        <span className="block font-cuerpo text-sm font-bold text-cafe">{titulo}</span>
        <span className="block font-cuerpo text-[13px] text-cafe-suave">{detalle}</span>
      </span>
    </button>
  );
}
