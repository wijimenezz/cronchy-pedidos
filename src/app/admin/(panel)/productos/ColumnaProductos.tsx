"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { ImageOff, Plus, Star } from "lucide-react";
import { BotonOrden } from "@/components/admin/BotonOrden";
import type { CategoriaPanel } from "@/db/queries/catalogo";
import { pesos } from "@/lib/notificaciones/plantillas";
import { crearProductoNuevo, reordenarProductosDeCategoria } from "./acciones";
import { PuntoEstado } from "./SelectorEstado";

/**
 * La columna del medio: los productos de la categoría elegida, en el orden en que salen
 * en la carta.
 *
 * El orden se cambia con botones ↑/↓ y no arrastrando (regla 15): el drag nativo de HTML5
 * no funciona en táctil y esta pantalla también se abre desde el teléfono.
 */
export function ColumnaProductos({
  categoria,
  seleccionado,
  esAdmin,
  onElegir,
  onCreado,
  className,
}: {
  categoria: CategoriaPanel | null;
  seleccionado: string | null;
  esAdmin: boolean;
  onElegir: (id: string) => void;
  onCreado: (id: string) => void;
  className: string;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  const productos = categoria?.productos ?? [];

  function mover(indice: number, delta: number) {
    if (!categoria) return;

    const destino = indice + delta;
    if (destino < 0 || destino >= productos.length) return;

    const ids = productos.map((p) => p.id);
    [ids[indice], ids[destino]] = [ids[destino], ids[indice]];

    setError(null);
    iniciar(async () => {
      const resultado = await reordenarProductosDeCategoria({ categoryId: categoria.id, ids });
      if (!resultado.ok) setError(resultado.error);
    });
  }

  return (
    <section
      className={`min-h-0 flex-col rounded-md border border-crema-oscura bg-tarjeta ${className}`}
    >
      <header className="flex items-center justify-between gap-2 border-b border-crema-oscura px-3 py-2">
        <h2 className="truncate font-titulo text-base font-bold text-cafe">Productos</h2>
        {esAdmin && categoria && (
          <button
            type="button"
            onClick={() => setCreando(true)}
            aria-label="Añadir producto"
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

      {creando && categoria && (
        <FormularioNuevo
          categoryId={categoria.id}
          onCerrar={() => setCreando(false)}
          onCreado={(id) => {
            setCreando(false);
            onCreado(id);
          }}
        />
      )}

      <ul className="min-h-0 flex-1 divide-y divide-crema-oscura overflow-y-auto lg:max-h-[calc(100vh-16rem)]">
        {productos.map((producto, i) => (
          <li key={producto.id} className="flex items-center gap-1 pr-1">
            <button
              type="button"
              onClick={() => onElegir(producto.id)}
              aria-current={producto.id === seleccionado}
              className={`flex min-h-11 flex-1 items-center gap-2 px-3 py-2 text-left transition-colors ${
                producto.id === seleccionado ? "bg-crema" : "hover:bg-crema"
              }`}
            >
              <Miniatura url={producto.imagenes[0]} nombre={producto.nombre} />

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1">
                  <span
                    className={`truncate font-cuerpo text-[15px] ${
                      producto.activo ? "text-cafe" : "text-cafe-tenue line-through"
                    }`}
                  >
                    {producto.nombre}
                  </span>
                  {producto.recomendado && (
                    <Star
                      className="size-3 shrink-0 fill-alerta text-alerta"
                      aria-label="Recomendado"
                    />
                  )}
                </span>
                <span className="block font-cuerpo text-[13px] text-cafe-tenue">
                  {pesos(producto.precioBase)}
                </span>
              </span>

              <PuntoEstado activo={producto.activo} disponible={producto.disponible} />
            </button>

            {esAdmin && (
              <span className="flex shrink-0 flex-col">
                <BotonOrden
                  direccion="subir"
                  nombre={producto.nombre}
                  onClick={() => mover(i, -1)}
                  deshabilitado={pendiente || i === 0}
                />
                <BotonOrden
                  direccion="bajar"
                  nombre={producto.nombre}
                  onClick={() => mover(i, 1)}
                  deshabilitado={pendiente || i === productos.length - 1}
                />
              </span>
            )}
          </li>
        ))}

        {productos.length === 0 && (
          <li className="px-3 py-6 text-center font-cuerpo text-[13px] text-cafe-tenue">
            {categoria ? "Esta categoría no tiene productos todavía." : "Elige una categoría."}
          </li>
        )}
      </ul>
    </section>
  );
}

function Miniatura({ url, nombre }: { url: string | undefined; nombre: string }) {
  if (!url) {
    return (
      <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-crema text-cafe-tenue">
        <ImageOff className="size-4" />
      </span>
    );
  }

  return (
    <span className="relative size-10 shrink-0 overflow-hidden rounded-sm bg-crema">
      {/* **Sin `unoptimized`, al revés que antes.** Llevaba uno porque "las fotos ya se suben
          comprimidas a ~800 px", y esa premisa murió: ahora lo que hay en Storage es un máster
          de 1280 px y ~450 KB. Servirlo tal cual para pintar 40 px hacía que esta lista bajara
          ~13 MB con treinta productos. El optimizador la deja en unos pocos KB. */}
      <Image src={url} alt={nombre} fill sizes="40px" className="object-cover" />
    </span>
  );
}

/** Alta mínima: nombre y precio. Lo demás se completa en el detalle, ya con el id creado. */
function FormularioNuevo({
  categoryId,
  onCerrar,
  onCreado,
}: {
  categoryId: string;
  onCerrar: () => void;
  onCreado: (id: string) => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState("");
  const [error, setError] = useState<string | null>(null);

  function guardar() {
    setError(null);
    iniciar(async () => {
      const resultado = await crearProductoNuevo({
        categoryId,
        nombre,
        precioBase: Number(precio),
      });
      if (resultado.ok) onCreado(resultado.id);
      else setError(resultado.error);
    });
  }

  return (
    <div className="flex flex-col gap-2 border-b border-crema-oscura bg-crema/50 p-3">
      <input
        autoFocus
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Nombre del producto"
        aria-label="Nombre del producto"
        className="min-h-11 w-full rounded-sm border border-crema-oscura bg-tarjeta px-3 font-cuerpo text-[15px] text-cafe placeholder:text-cafe-tenue focus:outline-none focus:ring-2 focus:ring-naranja"
      />
      <input
        value={precio}
        onChange={(e) => setPrecio(e.target.value)}
        type="number"
        inputMode="numeric"
        min={0}
        step={500}
        placeholder="Precio"
        aria-label="Precio"
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
          disabled={pendiente || !nombre.trim() || precio === ""}
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
