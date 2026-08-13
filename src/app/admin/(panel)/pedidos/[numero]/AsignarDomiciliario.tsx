"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bike, Plus, Send } from "lucide-react";
import type { Domiciliario } from "@/db/queries/domiciliarios";
import { Modal, ModalCabecera, ModalCerrar } from "@/components/ui/Modal";
import { asignarDomiciliarioAccion, crearDomiciliarioAccion } from "../acciones";

/**
 * A quién se le pasa este pedido.
 *
 * Solo aparece en domicilios: un pedido para recoger no tiene a quién asignar.
 *
 * **Asignar no cambia el estado del pedido.** Entre que se llama al domiciliario y que llega
 * pasan entre cinco y quince minutos; durante esa espera el pedido sigue en preparación, que es
 * la verdad. "En camino" es un toque aparte, cuando el pedido de verdad sale por la puerta.
 */
export function AsignarDomiciliario({
  pedidoId,
  numero,
  domiciliarios,
  asignado,
}: {
  pedidoId: string;
  numero: number;
  /** Los activos de la agenda, cargados en el servidor. */
  domiciliarios: Domiciliario[];
  /** Quién lo lleva ya, si se asignó antes. */
  asignado: { nombre: string; telefono: string } | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [urlBloqueada, setUrlBloqueada] = useState<string | null>(null);

  // La lista se lleva en estado para que un domiciliario recién creado aparezca sin recargar.
  const [lista, setLista] = useState(domiciliarios);
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");

  function abrirWhatsapp(url: string | null) {
    if (!url) return;
    // `window.open` devuelve null cuando el navegador bloquea la ventana. Es señal fiable, y con
    // ella se ofrece el enlace a mano en vez de perder el mensaje en silencio.
    const ventana = window.open(url, "_blank", "noopener");
    setUrlBloqueada(ventana ? null : url);
  }

  function asignar(courierId: string) {
    setError(null);
    setUrlBloqueada(null);
    iniciar(async () => {
      const resultado = await asignarDomiciliarioAccion({ pedidoId, numero, courierId });
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      abrirWhatsapp(resultado.url);
      setAbierto(false);
      router.refresh();
    });
  }

  function crear() {
    setError(null);
    iniciar(async () => {
      const resultado = await crearDomiciliarioAccion({ nombre, telefono });
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      // Se añade y se asigna de una: si alguien lo está creando aquí, es para mandarle este pedido.
      setLista((previa) =>
        previa.some((d) => d.id === resultado.domiciliario.id)
          ? previa
          : [...previa, resultado.domiciliario],
      );
      setNombre("");
      setTelefono("");
      setCreando(false);
      asignar(resultado.domiciliario.id);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {asignado && (
        <p className="flex items-center gap-2 rounded-sm bg-crema px-3 py-2 font-cuerpo text-[13px] text-cafe">
          <Bike className="size-4 shrink-0 text-cafe-suave" />
          <span>
            Lo lleva <span className="font-bold">{asignado.nombre}</span> · {asignado.telefono}
          </span>
        </p>
      )}

      {/* Si la ventana se bloqueó, el mensaje no se perdió: está a un clic. */}
      {urlBloqueada && (
        <a
          href={urlBloqueada}
          target="_blank"
          rel="noopener"
          onClick={() => setUrlBloqueada(null)}
          className="rounded-sm bg-alerta/20 px-3 py-2 text-center font-cuerpo text-[13px] font-bold text-cafe underline-offset-2 hover:underline"
        >
          El navegador bloqueó WhatsApp — toca aquí para abrirlo
        </a>
      )}

      {error && !abierto && (
        <p role="alert" className="font-cuerpo text-[13px] font-semibold text-error">
          {error}
        </p>
      )}

      {/* El tono lo pone el estado, porque es lo único que el botón no decía: mientras nadie
          lleve el pedido esto es una tarea pendiente, y en ámbar —el mismo de "Avisar al
          cliente"— se distingue de "Llamar" y "Escribir", que antes eran idénticos. Una vez
          asignado baja de tono: reasignar es la excepción, no la tarea.

          Ámbar y no naranja lleno a propósito: ese es del botón que mueve el pedido de columna,
          y un "Asignar" naranja al lado de "En camino" insinuaría que asignar lo avanza. No lo
          hace (regla 18). */}
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-haspopup="dialog"
        className={`flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 font-cuerpo text-sm font-bold text-cafe transition-colors focus:outline-none focus:ring-2 focus:ring-naranja ${
          asignado
            ? "border-crema-oscura hover:bg-crema"
            : "border-alerta bg-alerta/20 hover:bg-alerta/35"
        }`}
      >
        <Bike className="size-4" />
        {asignado ? "Cambiar o reenviar" : "Asignar domiciliario"}
      </button>

      {abierto && (
        <Modal etiqueta="Asignar domiciliario" onCerrar={() => setAbierto(false)}>
          <ModalCabecera>Asignar domiciliario</ModalCabecera>

          <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto p-4">
            {error && (
              <p role="alert" className="font-cuerpo text-[13px] font-semibold text-error">
                {error}
              </p>
            )}

            {lista.length === 0 && !creando && (
              <p className="py-4 text-center font-cuerpo text-[13px] text-cafe-tenue">
                Todavía no hay domiciliarios guardados.
              </p>
            )}

            <ul className="flex flex-col gap-1">
              {lista.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => asignar(d.id)}
                    disabled={pendiente}
                    className="flex min-h-14 w-full items-center justify-between gap-3 rounded-md border border-crema-oscura px-3 text-left transition-colors hover:border-naranja hover:bg-crema disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-cuerpo text-[15px] font-bold text-cafe">
                        {d.nombre}
                      </span>
                      <span className="block font-cuerpo text-[13px] text-cafe-suave">
                        {d.telefono}
                      </span>
                    </span>
                    <Send className="size-4 shrink-0 text-naranja" />
                  </button>
                </li>
              ))}
            </ul>

            {creando ? (
              <div className="flex flex-col gap-2 rounded-md border border-naranja/40 bg-naranja/5 p-3">
                <input
                  autoFocus
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Nombre"
                  className="min-h-11 rounded-sm border border-crema-oscura bg-tarjeta px-3 font-cuerpo text-[15px] text-cafe focus:outline-none focus:ring-2 focus:ring-naranja"
                />
                <input
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  inputMode="tel"
                  placeholder="Celular (3XX XXX XXXX)"
                  className="min-h-11 rounded-sm border border-crema-oscura bg-tarjeta px-3 font-cuerpo text-[15px] text-cafe focus:outline-none focus:ring-2 focus:ring-naranja"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={crear}
                    disabled={pendiente || !nombre.trim() || !telefono.trim()}
                    className="min-h-11 flex-1 rounded-full bg-naranja px-4 font-cuerpo text-sm font-bold text-crema transition-colors hover:bg-naranja-osc disabled:opacity-50"
                  >
                    Guardar y enviar
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreando(false)}
                    disabled={pendiente}
                    className="min-h-11 rounded-full border border-crema-oscura px-4 font-cuerpo text-sm font-bold text-cafe disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreando(true)}
                className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-dashed border-crema-oscura px-4 font-cuerpo text-sm font-bold text-cafe-suave transition-colors hover:bg-crema"
              >
                <Plus className="size-4" />
                Agregar domiciliario
              </button>
            )}
          </div>

          <ModalCerrar onCerrar={() => setAbierto(false)} />
        </Modal>
      )}
    </div>
  );
}
