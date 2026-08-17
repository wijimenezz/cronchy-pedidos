"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, SlidersHorizontal } from "lucide-react";
import type { CategoriaPanel, GrupoEnganchable } from "@/db/queries/catalogo";
import { ColumnaCategorias } from "./ColumnaCategorias";
import { ColumnaProductos } from "./ColumnaProductos";
import { DetalleProducto } from "./DetalleProducto";

/**
 * Las tres columnas: Categorías · Productos · Detalle.
 *
 * En escritorio se ven las tres a la vez, que es como se trabaja el catálogo de verdad.
 * Por debajo de `lg` la de categorías se convierte en una barra de píldoras y por debajo
 * de `md` se navega por pasos con un "Atrás": el panel se opera desde el teléfono cuando
 * toca, y tres columnas en 390 px no son tres columnas, son tres rendijas.
 *
 * El paso es estado explícito y no algo derivado de "¿hay producto elegido?", porque desde
 * el detalle se vuelve a la lista sin deseleccionar nada: en escritorio la selección tiene
 * que seguir viéndose.
 */

type Paso = "categorias" | "productos" | "detalle";

export function EditorCatalogo({
  categorias,
  grupos,
  esAdmin,
}: {
  categorias: CategoriaPanel[];
  grupos: GrupoEnganchable[];
  esAdmin: boolean;
}) {
  const router = useRouter();
  const [categoriaId, setCategoriaId] = useState<string | null>(categorias[0]?.id ?? null);
  const [productoId, setProductoId] = useState<string | null>(null);
  const [paso, setPaso] = useState<Paso>("productos");

  // La selección se resuelve al pintar y no se sincroniza con un efecto: cada acción
  // revalida y devuelve una lista nueva, y si lo que estaba elegido ya no está, el `??`
  // cae solo a la primera categoría o a "ningún producto". Un efecto que corrigiera el
  // estado provocaría un render de más para llegar al mismo sitio.
  const categoria = categorias.find((c) => c.id === categoriaId) ?? categorias[0] ?? null;
  const producto = categoria?.productos.find((p) => p.id === productoId) ?? null;

  function elegirCategoria(id: string) {
    setCategoriaId(id);
    setProductoId(null);
    setPaso("productos");
  }

  function elegirProducto(id: string) {
    setProductoId(id);
    setPaso("detalle");
  }

  /** Después de crear: seleccionarlo y abrirlo, que es lo que se quiere hacer enseguida. */
  function alCrearProducto(id: string) {
    router.refresh();
    elegirProducto(id);
  }

  /**
   * Después de borrar: a la lista. El `setProductoId(null)` es casi de más —la selección se
   * resuelve al pintar y cae sola al `??` cuando lo elegido ya no está—, pero el `setPaso` no:
   * por debajo de `md` esto es un drill-down, y sin él el admin se queda mirando un "Elige un
   * producto" donde estaba el detalle, en vez de volver a la columna de la que vino.
   */
  function alEliminarProducto() {
    router.refresh();
    setProductoId(null);
    setPaso("productos");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-titulo text-xl font-bold text-cafe">Carta</h1>
          <p className="font-cuerpo text-[13px] text-cafe-tenue">
            {esAdmin
              ? "Lo que guardes aquí se ve en la carta al instante."
              : "Puedes marcar lo que se agotó. El resto lo edita un administrador."}
          </p>
        </div>

        {/* Vuelta atrás del drill-down. Solo por debajo de `md`, donde de verdad hay pasos. */}
        {paso !== "productos" && (
          <button
            type="button"
            onClick={() => setPaso("productos")}
            className="flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-crema-oscura px-4 font-cuerpo text-sm font-bold text-cafe-suave hover:bg-crema md:hidden"
          >
            <ChevronLeft className="size-4" />
            Atrás
          </button>
        )}
      </div>

      {/* Cambio rápido de categoría donde no cabe la columna. */}
      <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
        {esAdmin && (
          <button
            type="button"
            onClick={() => setPaso(paso === "categorias" ? "productos" : "categorias")}
            aria-pressed={paso === "categorias"}
            aria-label="Editar categorías"
            className={`flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors ${
              paso === "categorias"
                ? "border-naranja bg-naranja text-crema"
                : "border-crema-oscura text-cafe-suave hover:bg-crema"
            }`}
          >
            <SlidersHorizontal className="size-4" />
          </button>
        )}

        {categorias.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => elegirCategoria(c.id)}
            aria-pressed={c.id === categoria?.id}
            className={`min-h-11 shrink-0 rounded-full border px-4 font-cuerpo text-sm font-bold transition-colors ${
              c.id === categoria?.id
                ? "border-naranja bg-naranja text-crema"
                : "border-crema-oscura text-cafe-suave hover:bg-crema"
            } ${c.activa ? "" : "opacity-60"}`}
          >
            {c.nombre}
            <span className="ml-1 font-normal opacity-70">{c.productos.length}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,300px)_minmax(0,1fr)]">
        <ColumnaCategorias
          categorias={categorias}
          seleccionada={categoria?.id ?? null}
          esAdmin={esAdmin}
          onElegir={elegirCategoria}
          className={
            paso === "categorias" ? "flex md:col-span-2 lg:col-span-1" : "hidden lg:flex"
          }
        />

        <ColumnaProductos
          categoria={categoria}
          seleccionado={producto?.id ?? null}
          esAdmin={esAdmin}
          onElegir={elegirProducto}
          onCreado={alCrearProducto}
          className={
            paso === "categorias"
              ? "hidden lg:flex"
              : paso === "productos"
                ? "flex"
                : "hidden md:flex"
          }
        />

        <DetalleProducto
          key={producto?.id ?? "vacio"}
          producto={producto}
          categorias={categorias}
          grupos={grupos}
          esAdmin={esAdmin}
          onEliminado={alEliminarProducto}
          className={
            paso === "categorias"
              ? "hidden lg:flex"
              : paso === "detalle"
                ? "flex"
                : "hidden md:flex"
          }
        />
      </div>
    </div>
  );
}
