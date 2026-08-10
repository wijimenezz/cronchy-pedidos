"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { BotonOrden } from "@/components/admin/BotonOrden";
import { BotonSwitch } from "@/components/admin/Interruptor";
import type { CategoriaPanel } from "@/db/queries/catalogo";
import { BannerCategoria } from "./BannerCategoria";
import {
  crearCategoriaNueva,
  marcarCategoriaActiva,
  renombrarCategoriaExistente,
  reordenarCategoriasDelMenu,
} from "./acciones";

/**
 * La columna izquierda: Churros, Churros con Helado, Bebidas, Adicionales.
 *
 * No hay borrado. Apagar y no borrar (regla 9), y además la FK de `product.category_id` no
 * lleva `ON DELETE`: una categoría con productos no se puede borrar aunque se intente. El
 * switch la saca de la carta y es reversible.
 *
 * El orden se cambia con ↑/↓, igual que en zonas y por la misma razón (regla 15).
 */
export function ColumnaCategorias({
  categorias,
  seleccionada,
  esAdmin,
  onElegir,
  className,
}: {
  categorias: CategoriaPanel[];
  seleccionada: string | null;
  esAdmin: boolean;
  onElegir: (id: string) => void;
  className: string;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  function mover(indice: number, delta: number) {
    const destino = indice + delta;
    if (destino < 0 || destino >= categorias.length) return;

    const ids = categorias.map((c) => c.id);
    [ids[indice], ids[destino]] = [ids[destino], ids[indice]];

    setError(null);
    iniciar(async () => {
      const resultado = await reordenarCategoriasDelMenu({ ids });
      if (!resultado.ok) setError(resultado.error);
    });
  }

  function alternarActiva(categoria: CategoriaPanel) {
    setError(null);
    iniciar(async () => {
      const resultado = await marcarCategoriaActiva({
        id: categoria.id,
        activa: !categoria.activa,
      });
      if (!resultado.ok) setError(resultado.error);
    });
  }

  return (
    <section
      className={`min-h-0 flex-col rounded-md border border-crema-oscura bg-tarjeta ${className}`}
    >
      <header className="flex items-center justify-between gap-2 border-b border-crema-oscura px-3 py-2">
        <h2 className="font-titulo text-base font-bold text-cafe">Categorías</h2>
        {esAdmin && (
          <button
            type="button"
            onClick={() => setCreando(true)}
            aria-label="Añadir categoría"
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

      {creando && <FormularioNueva onCerrar={() => setCreando(false)} />}

      <ol className="min-h-0 flex-1 divide-y divide-crema-oscura overflow-y-auto">
        {categorias.map((categoria, i) => (
          <li key={categoria.id} className="px-2 py-1">
            {editandoId === categoria.id ? (
              <FormularioRenombrar
                categoria={categoria}
                onCerrar={() => setEditandoId(null)}
              />
            ) : (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onElegir(categoria.id)}
                  aria-current={categoria.id === seleccionada}
                  className={`flex min-h-11 flex-1 items-center gap-2 rounded-sm px-2 text-left transition-colors ${
                    categoria.id === seleccionada ? "bg-crema" : "hover:bg-crema"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate font-cuerpo text-[15px] ${
                        categoria.activa ? "text-cafe" : "text-cafe-tenue line-through"
                      }`}
                    >
                      {categoria.nombre}
                    </span>
                    <span className="block font-cuerpo text-[13px] text-cafe-tenue">
                      {categoria.productos.length}{" "}
                      {categoria.productos.length === 1 ? "producto" : "productos"}
                    </span>
                  </span>
                </button>

                {esAdmin && (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditandoId(categoria.id)}
                      aria-label={`Renombrar ${categoria.nombre}`}
                      className="flex size-9 shrink-0 items-center justify-center rounded-full text-cafe-tenue transition-colors hover:bg-crema hover:text-cafe"
                    >
                      <Pencil className="size-4" />
                    </button>

                    <span className="flex shrink-0 flex-col">
                      <BotonOrden
                        direccion="subir"
                        nombre={categoria.nombre}
                        onClick={() => mover(i, -1)}
                        deshabilitado={pendiente || i === 0}
                      />
                      <BotonOrden
                        direccion="bajar"
                        nombre={categoria.nombre}
                        onClick={() => mover(i, 1)}
                        deshabilitado={pendiente || i === categorias.length - 1}
                      />
                    </span>
                  </>
                )}
              </div>
            )}

            {esAdmin && editandoId !== categoria.id && (
              /* La foto va en esta fila y no arriba: la de arriba ya está al límite en los
                 220 px de la columna y un cuarto botón truncaría nombres como
                 "Churros con Helado". */
              <div className="flex items-center gap-1 pb-1 pl-1 pr-2">
                <BannerCategoria categoria={categoria} />

                <span className="min-w-0 flex-1 truncate font-cuerpo text-[13px] text-cafe-tenue">
                  {categoria.activa ? "En la carta" : "Fuera de la carta"}
                </span>

                <BotonSwitch
                  activo={categoria.activa}
                  etiqueta={`${categoria.nombre}: ${categoria.activa ? "en la carta" : "fuera de la carta"}`}
                  onClick={() => alternarActiva(categoria)}
                  deshabilitado={pendiente}
                />
              </div>
            )}
          </li>
        ))}

        {categorias.length === 0 && (
          <li className="px-3 py-6 text-center font-cuerpo text-[13px] text-cafe-tenue">
            Todavía no hay categorías.
          </li>
        )}
      </ol>
    </section>
  );
}

function FormularioNueva({ onCerrar }: { onCerrar: () => void }) {
  const [pendiente, iniciar] = useTransition();
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);

  function guardar() {
    setError(null);
    iniciar(async () => {
      const resultado = await crearCategoriaNueva({ nombre });
      if (resultado.ok) onCerrar();
      else setError(resultado.error);
    });
  }

  return (
    <div className="flex flex-col gap-2 border-b border-crema-oscura bg-crema/50 p-3">
      <input
        autoFocus
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Nombre de la categoría"
        aria-label="Nombre de la categoría"
        maxLength={80}
        className="min-h-11 w-full rounded-sm border border-crema-oscura bg-tarjeta px-3 font-cuerpo text-[15px] text-cafe placeholder:text-cafe-tenue focus:outline-none focus:ring-2 focus:ring-naranja"
      />

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
  categoria,
  onCerrar,
}: {
  categoria: CategoriaPanel;
  onCerrar: () => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [nombre, setNombre] = useState(categoria.nombre);
  const [error, setError] = useState<string | null>(null);

  function guardar() {
    setError(null);
    iniciar(async () => {
      const resultado = await renombrarCategoriaExistente({ id: categoria.id, nombre });
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
          aria-label={`Nuevo nombre de ${categoria.nombre}`}
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
    </div>
  );
}
