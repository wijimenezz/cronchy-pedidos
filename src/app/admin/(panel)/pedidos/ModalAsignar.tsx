"use client";

import { useState, useTransition } from "react";
import { Plus, Send } from "lucide-react";
import type { Domiciliario } from "@/db/queries/domiciliarios";
import { Modal, ModalCabecera, ModalCerrar } from "@/components/ui/Modal";
import { asignarDomiciliarioAccion, crearDomiciliarioAccion } from "./acciones";

/**
 * A quién se le pasa este pedido: la lista de la agenda, el alta en caliente y el envío.
 *
 * Vive suelto porque lo abren **dos sitios** —el detalle del pedido y la tarjeta del tablero— y
 * duplicar esto era duplicar la única parte con lógica: qué pasa al crear a alguien y asignarle
 * el pedido en el mismo gesto.
 *
 * **No abre WhatsApp ni refresca nada**: devuelve la URL por `onAsignado` y que decida el padre.
 * Los dos ya tienen su propio manejo de la ventana bloqueada, y refrescan distinto — el detalle
 * con `router.refresh()`, la tarjeta con el `alCambiar()` del polling. Meter eso aquí obligaría a
 * pasarle a este componente cuál de los dos es, que es justo lo que no tiene por qué saber.
 */
export function ModalAsignar({
  pedidoId,
  numero,
  domiciliarios,
  onCerrar,
  onAsignado,
}: {
  pedidoId: string;
  numero: number;
  /** Los activos de la agenda, cargados en el servidor. */
  domiciliarios: Domiciliario[];
  onCerrar: () => void;
  /** La URL del WhatsApp al domiciliario, o `null` si el transporte lo mandó solo. */
  onAsignado: (url: string | null) => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // La lista se lleva en estado para que un domiciliario recién creado aparezca sin recargar.
  const [lista, setLista] = useState(domiciliarios);
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");

  function asignar(courierId: string) {
    setError(null);
    iniciar(async () => {
      const resultado = await asignarDomiciliarioAccion({ pedidoId, numero, courierId });
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      onAsignado(resultado.url);
      onCerrar();
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
    <Modal etiqueta="Asignar domiciliario" onCerrar={onCerrar}>
      <ModalCabecera>Asignar domiciliario · #{numero}</ModalCabecera>

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

      <ModalCerrar onCerrar={onCerrar} />
    </Modal>
  );
}
