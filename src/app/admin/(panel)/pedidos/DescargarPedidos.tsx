"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Modal, ModalCabecera, ModalCerrar } from "@/components/ui/Modal";
// De `lib/fechas` y no de `pedidos/dias`: este componente es cliente, y aquel módulo arrastra
// `horario.ts` —y con él la capa de base de datos— al bundle del navegador. Aquí no hace falta
// zona horaria: contar días entre dos fechas es calendario puro.
import { MAXIMO_DIAS_RANGO, contarDias, desplazarDia } from "@/lib/fechas";

/**
 * Descargar los pedidos de un rango en XLSX.
 *
 * El rango es propio y **no** el día que se está viendo en el tablero: son dos preguntas
 * distintas. El resumen cierra un turno; esto alimenta la contabilidad, que va por semanas o
 * por meses.
 *
 * La descarga es un `<a download>` a la ruta, no un `fetch` + `Blob`: el navegador ya sabe
 * guardar un archivo, y hacerlo a mano obliga a manejar el objeto URL y a tragarse los errores
 * —una sesión vencida acabaría bajando un .xlsx con un JSON de "sin sesión" dentro—.
 */

/** Los atajos que cubren el 90% de las descargas, sin tocar el calendario. */
const ATAJOS = [
  { etiqueta: "Hoy", dias: 1 },
  { etiqueta: "Últimos 7 días", dias: 7 },
  { etiqueta: "Últimos 30 días", dias: 30 },
] as const;

export function DescargarPedidos({ hoy }: { hoy: string }) {
  const [abierto, setAbierto] = useState(false);
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);

  // Se ordenan al vuelo: escribir "del 9 al 5" es un desliz, no una intención. El servidor hace
  // lo mismo con `rangoPedido`, así que lo que se ve aquí es lo que va a llegar.
  const inicio = desde <= hasta ? desde : hasta;
  const fin = desde <= hasta ? hasta : desde;
  const dias = contarDias(inicio, fin);
  const excede = dias > MAXIMO_DIAS_RANGO;

  function aplicarAtajo(cuantos: number) {
    setDesde(desplazarDia(hoy, -(cuantos - 1)));
    setHasta(hoy);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-haspopup="dialog"
        aria-label="Descargar pedidos"
        title="Descargar pedidos"
        className="flex size-11 shrink-0 items-center justify-center rounded-full border border-crema-oscura text-cafe transition-colors hover:bg-crema focus:outline-none focus:ring-2 focus:ring-naranja"
      >
        <Download className="size-5" />
      </button>

      {abierto && (
        <Modal etiqueta="Descargar pedidos" onCerrar={() => setAbierto(false)}>
          <ModalCabecera>Descargar pedidos</ModalCabecera>

          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-wrap gap-2">
              {ATAJOS.map((atajo) => (
                <button
                  key={atajo.etiqueta}
                  type="button"
                  onClick={() => aplicarAtajo(atajo.dias)}
                  className="min-h-11 rounded-full border border-crema-oscura px-4 font-cuerpo text-sm font-bold text-cafe-suave transition-colors hover:bg-crema"
                >
                  {atajo.etiqueta}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Desde" valor={desde} maximo={hoy} alCambiar={setDesde} />
              <Campo etiqueta="Hasta" valor={hasta} maximo={hoy} alCambiar={setHasta} />
            </div>

            <p className="font-cuerpo text-[13px] text-cafe-suave">
              {dias === 1 ? "1 día" : `${dias} días`}
              {excede && (
                <span className="text-cafe">
                  {" "}
                  — se descargarán los últimos {MAXIMO_DIAS_RANGO}
                </span>
              )}
            </p>

            <p className="font-cuerpo text-[12px] text-cafe-tenue">
              Cuatro hojas: resumen por día, pedidos, detalle por producto y productos vendidos.
            </p>

            <a
              href={`/api/admin/pedidos/export?desde=${inicio}&hasta=${fin}`}
              download
              onClick={() => setAbierto(false)}
              className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-naranja px-6 font-cuerpo text-base font-bold text-crema transition-colors hover:bg-naranja-osc focus:outline-none focus:ring-2 focus:ring-naranja focus:ring-offset-2"
            >
              <Download className="size-4" />
              Descargar XLSX
            </a>
          </div>

          <ModalCerrar onCerrar={() => setAbierto(false)} />
        </Modal>
      )}
    </>
  );
}

/**
 * Aquí sí se usa `<input type="date">`, a diferencia del selector del tablero.
 *
 * El picker nativo abre en el mes actual, que es justo donde hay que estar para elegir un rango
 * reciente —lo contrario del selector de cumpleaños del checkout, que por eso está escrito a
 * mano—. Y `max` deja que el propio navegador impida el futuro.
 */
function Campo({
  etiqueta,
  valor,
  maximo,
  alCambiar,
}: {
  etiqueta: string;
  valor: string;
  maximo: string;
  alCambiar: (valor: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 font-cuerpo text-[13px] font-bold text-cafe-suave">
      {etiqueta}
      <input
        type="date"
        value={valor}
        max={maximo}
        onChange={(e) => e.target.value && alCambiar(e.target.value)}
        className="min-h-11 rounded-sm border border-crema-oscura bg-tarjeta px-3 font-cuerpo text-[15px] font-normal text-cafe focus:outline-none focus:ring-2 focus:ring-naranja"
      />
    </label>
  );
}
