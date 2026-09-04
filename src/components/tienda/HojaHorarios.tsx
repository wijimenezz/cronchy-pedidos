"use client";

import { Drawer } from "@base-ui/react/drawer";
import { CalendarClock, X } from "lucide-react";
import { DIAS_SEMANA_LARGOS } from "@/lib/fechas";
import { horaLegible, TEXTOS, type RespuestaEstado } from "@/lib/tienda/estado";

/**
 * La hoja inferior con el horario, que abre el personaje del header.
 *
 * Es el `Drawer` de `@base-ui/react` —la misma librería sobre la que shadcn arma los componentes
 * de este proyecto— y no un `<div>` a mano: con `modal` trae el foco atrapado, el bloqueo del
 * scroll de fondo, el cierre con Escape y con toque fuera, y devuelve el foco al personaje al
 * cerrar. Todo eso es justo lo que el `Modal` propio del proyecto **no** hace.
 *
 * Hoja inferior y no diálogo centrado porque esto solo existe en móvil: ahí abajo es donde llega
 * el pulgar.
 *
 * **El `Popup` va dentro de un `Viewport`, y no es opcional**: la lógica del swipe vive ahí, no en
 * el `Root`. Sin él, Base UI avisa por consola y el `swipeDirection="down"` no hace nada —la hoja
 * se abre y se cierra, pero no se puede arrastrar—. Y la zona con scroll va dentro de un
 * `Content`, que es lo que le dice al viewport dónde hay scroll: sin eso, arrastrar hacia abajo
 * dentro de la lista cerraría la hoja en vez de desplazarla.
 *
 * El movimiento del dedo llega como variables CSS (`--drawer-swipe-movement-y`) y **es la página
 * quien lo aplica**: Base UI es headless y no pinta un `transform` por su cuenta.
 */

/** De lunes a domingo, que es como se lee una semana aquí; el número sigue siendo el de Postgres. */
const ORDEN = [1, 2, 3, 4, 5, 6, 0];

export function HojaHorarios({
  datos,
  onCerrar,
}: {
  datos: RespuestaEstado;
  onCerrar: () => void;
}) {
  return (
    <Drawer.Portal>
      <Drawer.Backdrop className="fixed inset-0 z-40 bg-cafe/40" />
      {/* `pointer-events-none` en el viewport y `auto` en la hoja: el viewport tapa la pantalla
          entera, así que sin esto se comería el toque fuera y el velo de abajo no cerraría nunca.
          El swipe no se pierde por ello — los eventos nacen en la hoja y burbujean hasta aquí. */}
      <Drawer.Viewport className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center">
        <Drawer.Popup
          style={{
            transform: "translateY(var(--drawer-swipe-movement-y, 0px))",
          }}
          className="pointer-events-auto flex max-h-[85vh] w-full max-w-[520px] flex-col rounded-t-lg bg-tarjeta shadow-modal"
        >
          {/* El asa: dice sin palabras que la hoja se arrastra hacia abajo. */}
          <div
            aria-hidden
            className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-crema-oscura"
          />

          <div className="flex items-start justify-between gap-3 px-5 pt-3">
            <div>
              <Drawer.Title className="font-titulo text-xl font-semibold text-cafe">
                {datos.titulo}
              </Drawer.Title>
              {datos.detalle && (
                <Drawer.Description className="font-cuerpo text-[13px] text-cafe-suave">
                  {datos.detalle}
                </Drawer.Description>
              )}
            </div>

            <Drawer.Close
              aria-label="Cerrar"
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-naranja"
            >
              <X className="size-5" />
            </Drawer.Close>
          </div>

          <Drawer.Content className="flex flex-col gap-4 overflow-y-auto px-5 pt-4 pb-6">
            {/* Antes de la tabla y no después: explica por qué HOY el horario no es el de siempre,
                y quien abre esto con la tienda cerrada viene justo a preguntar eso. */}
            {datos.cierreDeHoy && (
              <p className="rounded-sm border border-alerta/40 bg-alerta/10 px-3 py-2 font-cuerpo text-[13px] text-cafe">
                <span className="font-bold">
                  Hoy: {datos.cierreDeHoy.motivo}
                </span>
                {!datos.cierreDeHoy.cerrado &&
                  datos.cierreDeHoy.abre &&
                  datos.cierreDeHoy.cierra && (
                    <>
                      {" · "}
                      {horaLegible(datos.cierreDeHoy.abre)} a{" "}
                      {horaLegible(datos.cierreDeHoy.cierra)}
                    </>
                  )}
              </p>
            )}

            <div>
              <h3 className="font-cuerpo text-[13px] font-bold text-cafe-suave">
                Horarios
              </h3>
              <ul className="mt-1 flex flex-col divide-y divide-crema-oscura">
                {ORDEN.map((numero) => (
                  <Fila
                    key={numero}
                    diaSemana={numero}
                    tramos={
                      datos.semana.find((d) => d.diaSemana === numero)
                        ?.tramos ?? []
                    }
                    esHoy={numero === datos.hoy.diaSemana}
                  />
                ))}
              </ul>
            </div>

            {/* Solo si el servidor dice que de verdad se puede: con el interruptor de pánico apagado
                no se programa nada, y prometerlo aquí llevaría al cliente a un checkout que lo
                rechaza. Ver `sePuedeProgramar` en el endpoint. */}
            {datos.estado !== "abierta" && datos.sePuedeProgramar && (
              <NotaProgramado onCerrar={onCerrar} />
            )}
          </Drawer.Content>
        </Drawer.Popup>
      </Drawer.Viewport>
    </Drawer.Portal>
  );
}

function Fila({
  diaSemana,
  tramos,
  esHoy,
}: {
  diaSemana: number;
  tramos: { abre: string; cierra: string }[];
  esHoy: boolean;
}) {
  return (
    <li
      className={`flex items-center justify-between gap-3 py-2 ${
        esHoy ? "-mx-2 rounded-sm bg-crema px-2" : ""
      }`}
    >
      <span
        className={`font-cuerpo text-[15px] ${esHoy ? "font-bold text-cafe" : "text-cafe-suave"}`}
      >
        {DIAS_SEMANA_LARGOS[diaSemana]}
        {esHoy && (
          <span className="ml-1 font-normal text-cafe-tenue">· hoy</span>
        )}
      </span>

      {/* Los dos tramos de un turno partido van en la misma fila, separados: son el mismo día. */}
      <span
        className={`text-right font-cuerpo text-[15px] ${
          tramos.length === 0
            ? "text-cafe-tenue italic"
            : esHoy
              ? "font-bold text-cafe"
              : "text-cafe"
        }`}
      >
        {tramos.length === 0
          ? TEXTOS.diaCerrado
          : tramos
              .map((t) => `${horaLegible(t.abre)} – ${horaLegible(t.cierra)}`)
              .join(" · ")}
      </span>
    </li>
  );
}

/**
 * "Aunque estemos cerrados, puedes dejar tu pedido programado."
 *
 * **El botón solo cierra la hoja, y con eso basta**: la carta ya está detrás. En móvil el header
 * no es pegajoso (`lg:sticky`), así que para haber tocado el personaje hay que estar arriba del
 * todo, y al cerrar las categorías quedan justo debajo. Un `<Link href="/">` desde `/` añadiría
 * una navegación que no cambia nada.
 *
 * No mira el carrito. Llegó a tener dos botones —«Elegir la hora» hacia `/checkout` con líneas, y
 * este cuando estaba vacío— y se unificó: la hora se elige igual dentro del checkout, así que el
 * segundo botón solo adelantaba un paso a costa de dos caminos que mantener.
 */
function NotaProgramado({ onCerrar }: { onCerrar: () => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-sm bg-naranja/10 px-3 py-3">
      <p className="flex items-start gap-2 font-cuerpo text-[13px] text-cafe">
        <CalendarClock className="mt-0.5 size-4 shrink-0 text-naranja" />
        <span>
          Estamos cerrados por ahora, pero puedes dejar tu pedido programado.
          Cuando abramos, ¡nos encargamos de prepararlo!
        </span>
      </p>

      <button
        type="button"
        onClick={onCerrar}
        className="flex min-h-11 items-center justify-center rounded-full bg-naranja px-4 font-cuerpo text-sm font-bold text-crema"
      >
        Armar mi pedido
      </button>
    </div>
  );
}
