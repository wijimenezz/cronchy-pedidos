"use client";

import { useMemo, useState, useTransition } from "react";
import { Search } from "lucide-react";
import type { BarrioDelPanel } from "@/db/queries/barrios";
import { slugify } from "@/lib/texto";
import { guardarCorreccionesBarrio } from "./acciones";

/**
 * Los nombres de barrio que OpenStreetMap devuelve mal.
 *
 * Por qué existe esta pantalla: OSM tiene los 90 barrios de Fusagasugá como **nodos sueltos,
 * ninguno con polígono**, así que Nominatim no puede decir "el pin está dentro de Balmoral" y
 * responde por proximidad. Uno de los nombres que devuelve —"Managua"— no existe en la ciudad.
 * Aquí se arregla eso sin desplegar.
 *
 * Lo que NO arregla, y por eso el campo del checkout sigue siendo editable: que un pin reciba
 * el nombre de un barrio vecino que sí existe. Traducir nombres solo puede con los que están
 * mal siempre.
 *
 * Un único "Guardar cambios" que manda solo las filas tocadas. Con noventa filas, un botón por
 * fila serían noventa maneras de cambiar algo sin querer.
 */
export function Barrios({ barrios }: { barrios: BarrioDelPanel[] }) {
  const [pendiente, iniciar] = useTransition();
  const [busqueda, setBusqueda] = useState("");
  const [borrador, setBorrador] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  /** Lo que se ve en cada input: el borrador si se tocó, y si no, lo guardado. */
  function valor(b: BarrioDelPanel): string {
    return borrador[b.id] ?? b.nombre ?? "";
  }

  const cambiados = barrios.filter((b) => b.id in borrador && borrador[b.id] !== (b.nombre ?? ""));

  const visibles = useMemo(() => {
    const q = normalizar(busqueda);

    // Sin búsqueda se muestran solo las que alguien ya tocó —corregidas o descartadas— más las
    // que se estén editando ahora. Noventa filas idénticas de "X → X" no son una lista, son
    // ruido: lo que hay que poder ver de un vistazo es qué se ha cambiado.
    if (q === "") {
      return barrios.filter(
        (b) => b.nombre !== b.nombreOsm || b.id in borrador,
      );
    }

    return barrios.filter(
      (b) => normalizar(b.nombreOsm).includes(q) || normalizar(b.nombre ?? "").includes(q),
    );
  }, [barrios, busqueda, borrador]);

  function guardar() {
    setError(null);
    setAviso(null);

    iniciar(async () => {
      const resultado = await guardarCorreccionesBarrio({
        correcciones: cambiados.map((b) => ({ id: b.id, nombre: borrador[b.id] })),
      });

      if (resultado.ok) {
        // El borrador se suelta para que las filas vuelvan a leerse de la prop ya revalidada;
        // conservarlo dejaría dos versiones del mismo dato compitiendo.
        setBorrador({});
        setAviso("Guardado. Se aplica en el siguiente pedido.");
      } else {
        setError(resultado.error);
      }
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-crema-oscura bg-tarjeta p-4">
      <div>
        <h2 className="font-titulo text-base font-bold text-cafe">Barrios del mapa</h2>
        <p className="font-cuerpo text-[13px] text-cafe-tenue">
          El barrio se lo proponemos al cliente a partir del pin, y el mapa a veces devuelve un
          nombre que aquí no existe. Busca ese nombre y escribe al lado el bueno. Si lo dejas
          vacío no se propone nada y el cliente escribe el suyo.
        </p>
      </div>

      <label className="flex items-center gap-2 rounded-sm border border-crema-oscura px-3">
        <Search className="size-4 shrink-0 text-cafe-tenue" />
        <span className="sr-only">Buscar un barrio</span>
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar entre los 90 barrios del mapa…"
          className="min-h-11 flex-1 bg-transparent font-cuerpo text-[15px] text-cafe focus:outline-none"
        />
      </label>

      {visibles.length === 0 ? (
        <p className="font-cuerpo text-[13px] text-cafe-suave">
          {busqueda.trim() === ""
            ? "Todavía no has corregido ningún barrio. Búscalo arriba por el nombre que te salió mal."
            : `Ningún barrio del mapa se llama así. Puede que OSM lo tenga con otro nombre.`}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibles.map((b) => {
            const escrito = valor(b);
            const descartado = escrito.trim() === "";

            return (
              <li key={b.id} className="flex flex-wrap items-center gap-2">
                <span className="min-w-[9rem] flex-1 font-cuerpo text-[15px] text-cafe-suave">
                  {b.nombreOsm}
                </span>
                <span aria-hidden className="font-cuerpo text-cafe-tenue">
                  →
                </span>
                <label className="min-w-[9rem] flex-1">
                  <span className="sr-only">Cómo se llama {b.nombreOsm} de verdad</span>
                  <input
                    type="text"
                    value={escrito}
                    placeholder="Sin sugerencia"
                    onChange={(e) =>
                      setBorrador((prev) => ({ ...prev, [b.id]: e.target.value }))
                    }
                    className={`min-h-11 w-full rounded-sm border bg-tarjeta px-3 font-cuerpo text-[15px] focus:outline-none focus:ring-2 focus:ring-naranja ${
                      descartado
                        ? "border-crema-oscura text-cafe-tenue italic"
                        : "border-crema-oscura text-cafe"
                    }`}
                  />
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p role="alert" className="font-cuerpo text-[13px] font-semibold text-error">
          {error}
        </p>
      )}
      {aviso && !error && (
        <p role="status" className="font-cuerpo text-[13px] font-semibold text-exito">
          {aviso}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={guardar}
          disabled={pendiente || cambiados.length === 0}
          className="min-h-11 rounded-full bg-naranja px-5 font-cuerpo text-sm font-bold text-crema transition-colors hover:bg-naranja-osc disabled:opacity-50"
        >
          {pendiente ? "Guardando…" : "Guardar cambios"}
        </button>
        {cambiados.length > 0 && (
          <span className="font-cuerpo text-[13px] text-cafe-tenue">
            {cambiados.length === 1 ? "1 barrio sin guardar" : `${cambiados.length} barrios sin guardar`}
          </span>
        )}
      </div>
    </section>
  );
}

/**
 * Buscar "pekin" tiene que encontrar "Pekín": nadie escribe la tilde en un buscador.
 *
 * Se reusa `slugify` en vez de escribir otra normalización: ya quita diacríticos con NFD y su
 * regex está escapada, que es la parte fácil de estropear. Que además cambie los espacios por
 * guiones da igual, porque los dos lados de la comparación pasan por aquí.
 */
function normalizar(texto: string): string {
  return slugify(texto);
}
