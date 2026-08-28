"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { BotonSwitch } from "@/components/admin/Interruptor";
import type { ListaDelPanel } from "@/db/queries/opciones";
import { archivarLista, crearListaNueva, renombrarListaExistente } from "./acciones";

/**
 * La columna izquierda: Salsas, Toppings, Sabor de helado…
 *
 * No hay borrado. Además de la regla 9, borrar aquí sería destructivo de verdad: las FK que
 * apuntan a `modifier_group` van en cascada, así que quitar una lista se llevaría por
 * delante sus opciones Y los enganches de todos los productos que la usaban, en silencio.
 * El switch la archiva y es reversible.
 *
 * Sin ↑/↓: el orden es alfabético. El orden en el que el cliente ve las secciones lo decide
 * cada producto en la Carta, así que un orden global aquí no significaría nada.
 */
export function ColumnaListas({
  listas,
  seleccionada,
  esAdmin,
  onElegir,
  onCreada,
  className,
}: {
  listas: ListaDelPanel[];
  seleccionada: string | null;
  esAdmin: boolean;
  onElegir: (id: string) => void;
  onCreada: (id: string) => void;
  className: string;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  function alternarActiva(lista: ListaDelPanel) {
    setError(null);
    iniciar(async () => {
      const resultado = await archivarLista({ id: lista.id, activo: !lista.activo });
      if (!resultado.ok) setError(resultado.error);
    });
  }

  return (
    <section
      className={`min-h-0 flex-col rounded-md border border-crema-oscura bg-tarjeta ${className}`}
    >
      <header className="flex items-center justify-between gap-2 border-b border-crema-oscura px-3 py-2">
        <h2 className="font-titulo text-base font-bold text-cafe">Listas</h2>
        {esAdmin && (
          <button
            type="button"
            onClick={() => setCreando(true)}
            aria-label="Añadir lista"
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-naranja transition-colors hover:bg-crema"
          >
            <Plus className="size-5" />
          </button>
        )}
      </header>

      {error && (
        <p role="alert" className="px-3 py-2 font-cuerpo text-[13px] font-semibold text-error">
          {error}
        </p>
      )}

      {creando && <FormularioNueva onCerrar={() => setCreando(false)} onCreada={onCreada} />}

      <ol className="min-h-0 flex-1 divide-y divide-crema-oscura overflow-y-auto">
        {listas.map((lista) => (
          <li key={lista.id} className="px-2 py-1">
            {editandoId === lista.id ? (
              <FormularioRenombrar lista={lista} onCerrar={() => setEditandoId(null)} />
            ) : (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onElegir(lista.id)}
                  aria-current={lista.id === seleccionada}
                  className={`flex min-h-11 flex-1 items-center gap-2 rounded-sm px-2 text-left transition-colors ${
                    lista.id === seleccionada ? "bg-crema" : "hover:bg-crema"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate font-cuerpo text-[15px] ${
                        lista.activo ? "text-cafe" : "text-cafe-tenue line-through"
                      }`}
                    >
                      {lista.nombre}
                    </span>
                    <span className="block font-cuerpo text-[13px] text-cafe-tenue">
                      {resumen(lista)}
                    </span>
                  </span>
                </button>

                {esAdmin && (
                  <button
                    type="button"
                    onClick={() => setEditandoId(lista.id)}
                    aria-label={`Renombrar ${lista.nombre}`}
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-cafe-tenue transition-colors hover:bg-crema hover:text-cafe"
                  >
                    <Pencil className="size-4" />
                  </button>
                )}
              </div>
            )}

            {esAdmin && editandoId !== lista.id && (
              <div className="flex items-center justify-between gap-2 px-2 pb-1">
                <span className="font-cuerpo text-[13px] text-cafe-tenue">
                  {lista.activo ? "En uso" : "Archivada"}
                </span>
                <BotonSwitch
                  activo={lista.activo}
                  etiqueta={`${lista.nombre}: ${lista.activo ? "en uso" : "archivada"}`}
                  onClick={() => alternarActiva(lista)}
                  deshabilitado={pendiente}
                />
              </div>
            )}
          </li>
        ))}

        {listas.length === 0 && (
          <li className="px-3 py-6 text-center font-cuerpo text-[13px] text-cafe-tenue">
            Todavía no hay listas.
          </li>
        )}
      </ol>

      {esAdmin && listas.some((l) => !l.activo) && (
        <p className="border-t border-crema-oscura px-3 py-2 font-cuerpo text-[13px] text-cafe-tenue">
          Una lista archivada no se puede añadir a productos nuevos ni sale en “Qué hay hoy”.
          Los productos que ya la usan siguen igual.
        </p>
      )}
    </section>
  );
}

/** "6 opciones · en 5 productos" — lo que hay que saber antes de tocar nada. */
function resumen(lista: ListaDelPanel): string {
  const opciones = `${lista.opciones.length} ${lista.opciones.length === 1 ? "opción" : "opciones"}`;

  if (lista.usadaEn === 0) return `${opciones} · sin usar`;

  return `${opciones} · en ${lista.usadaEn} ${lista.usadaEn === 1 ? "producto" : "productos"}`;
}

type TipoLista = "seleccion" | "upsell";

/**
 * Qué clase de lista se está creando, en el idioma del negocio (regla 15): ni "grupo" ni
 * "upsell" aparecen en pantalla.
 *
 * **Se pregunta al crear porque después no se puede cambiar**: las opciones de una son texto y
 * las de la otra son punteros a productos, así que convertir una en otra dejaría filas que no
 * significan nada. Por eso cada opción dice qué va a poder escribirse dentro.
 *
 * Radios y no un desplegable: son dos, y la diferencia hay que leerla entera antes de elegir.
 */
function ElegirTipo({
  valor,
  onChange,
}: {
  valor: TipoLista;
  onChange: (valor: TipoLista) => void;
}) {
  const opciones: { tipo: TipoLista; titulo: string; detalle: string }[] = [
    {
      tipo: "seleccion",
      titulo: "Opciones escritas",
      detalle: "Salsas, toppings, sabores. Cada una con su nombre y su precio.",
    },
    {
      tipo: "upsell",
      titulo: "Productos de la carta",
      detalle: "Para ofrecer algo más encima del pedido. Llega como una línea aparte, con su precio.",
    },
  ];

  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="pb-1 font-cuerpo text-[13px] font-bold text-cafe-suave">
        Qué va a tener dentro
      </legend>
      {opciones.map((o) => (
        <label
          key={o.tipo}
          className={`flex cursor-pointer items-start gap-2 rounded-sm border p-2 transition-colors ${
            valor === o.tipo ? "border-naranja bg-tarjeta" : "border-crema-oscura hover:bg-tarjeta"
          }`}
        >
          <input
            type="radio"
            name="tipo-lista"
            checked={valor === o.tipo}
            onChange={() => onChange(o.tipo)}
            className="mt-1 size-4 shrink-0 accent-naranja"
          />
          <span className="min-w-0">
            <span className="block font-cuerpo text-[14px] font-bold text-cafe">{o.titulo}</span>
            <span className="block font-cuerpo text-[12px] text-cafe-tenue">{o.detalle}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function FormularioNueva({
  onCerrar,
  onCreada,
}: {
  onCerrar: () => void;
  onCreada: (id: string) => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoLista>("seleccion");
  const [error, setError] = useState<string | null>(null);

  function guardar() {
    setError(null);
    iniciar(async () => {
      const resultado = await crearListaNueva({ nombre, tipo });
      if (resultado.ok) {
        onCerrar();
        onCreada(resultado.id);
      } else {
        setError(resultado.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 border-b border-crema-oscura bg-crema/50 p-3">
      <input
        autoFocus
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder={
          tipo === "seleccion" ? "Salsas, Toppings, Sabor de helado…" : "¿Deseas agregar algo más?"
        }
        aria-label="Nombre de la lista"
        maxLength={80}
        className="min-h-11 w-full rounded-sm border border-crema-oscura bg-tarjeta px-3 font-cuerpo text-[15px] text-cafe placeholder:text-cafe-tenue focus:outline-none focus:ring-2 focus:ring-naranja"
      />

      <ElegirTipo valor={tipo} onChange={setTipo} />

      {error && (
        <p role="alert" className="font-cuerpo text-[13px] font-semibold text-error">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={guardar}
          disabled={pendiente || !nombre.trim()}
          className="min-h-11 flex-1 rounded-full bg-naranja px-4 font-cuerpo text-sm font-bold text-crema transition-colors hover:bg-naranja-osc disabled:opacity-50"
        >
          {pendiente ? "Creando…" : "Crear"}
        </button>
        <button
          type="button"
          onClick={onCerrar}
          className="min-h-11 rounded-full border border-crema-oscura px-4 font-cuerpo text-sm font-bold text-cafe-suave transition-colors hover:bg-crema"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function FormularioRenombrar({
  lista,
  onCerrar,
}: {
  lista: ListaDelPanel;
  onCerrar: () => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [nombre, setNombre] = useState(lista.nombre);
  const [error, setError] = useState<string | null>(null);

  function guardar() {
    setError(null);
    iniciar(async () => {
      const resultado = await renombrarListaExistente({ id: lista.id, nombre });
      if (resultado.ok) onCerrar();
      else setError(resultado.error);
    });
  }

  return (
    <div className="flex flex-col gap-1 py-1">
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          aria-label={`Nuevo nombre de ${lista.nombre}`}
          maxLength={80}
          className="min-h-11 min-w-0 flex-1 rounded-sm border border-crema-oscura bg-tarjeta px-2 font-cuerpo text-[15px] text-cafe focus:outline-none focus:ring-2 focus:ring-naranja"
        />
        <button
          type="button"
          onClick={guardar}
          disabled={pendiente || !nombre.trim()}
          aria-label="Guardar nombre"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-exito transition-colors hover:bg-crema disabled:opacity-40"
        >
          <Check className="size-5" />
        </button>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cancelar"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-cafe-tenue transition-colors hover:bg-crema"
        >
          <X className="size-5" />
        </button>
      </div>

      {error && (
        <p role="alert" className="font-cuerpo text-[13px] font-semibold text-error">
          {error}
        </p>
      )}

      {lista.usadaEn > 0 && (
        <p className="px-1 font-cuerpo text-[13px] text-cafe-tenue">
          El nombre nuevo se ve al instante en{" "}
          {lista.usadaEn === 1 ? "el producto que la usa" : `los ${lista.usadaEn} productos que la usan`}.
        </p>
      )}
    </div>
  );
}
