"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import type { ListaDelPanel, ProductoOfrecible } from "@/db/queries/opciones";
import { ColumnaListas } from "./ColumnaListas";
import { ColumnaOpciones } from "./ColumnaOpciones";

/**
 * Dos columnas: Listas · Opciones. Es la Carta con una columna menos, y a propósito: quien
 * sabe moverse por una sabe moverse por esta.
 *
 * Por debajo de `md` se navega por pasos con un "Atrás". El paso es estado explícito y no
 * algo derivado de "¿hay lista elegida?", porque al volver a la lista en escritorio la
 * selección tiene que seguir viéndose.
 */

type Paso = "listas" | "opciones";

export function EditorOpciones({
  listas,
  productos,
  esAdmin,
}: {
  listas: ListaDelPanel[];
  /** La carta entera, para el selector de las listas que ofrecen productos (regla 8). */
  productos: ProductoOfrecible[];
  esAdmin: boolean;
}) {
  const router = useRouter();
  const [listaId, setListaId] = useState<string | null>(listas[0]?.id ?? null);
  const [paso, setPaso] = useState<Paso>("listas");

  // Igual que en la Carta: la selección se resuelve al pintar y no con un efecto. Cada
  // acción revalida y devuelve una lista nueva; si lo elegido ya no está, el `??` cae solo
  // a la primera.
  const lista = listas.find((l) => l.id === listaId) ?? listas[0] ?? null;

  function elegirLista(id: string) {
    setListaId(id);
    setPaso("opciones");
  }

  /** Después de crear una lista: seleccionarla y abrirla, que es lo que sigue. */
  function alCrearLista(id: string) {
    router.refresh();
    elegirLista(id);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-titulo text-xl font-bold text-cafe">Opciones</h1>
          <p className="font-cuerpo text-[13px] text-cafe-tenue">
            {esAdmin
              ? "Las salsas, los toppings y los sabores que el cliente elige dentro de un producto, y lo que se le ofrece encima. Qué producto lleva cuáles se decide en la Carta."
              : "Puedes apagar lo que se acabó. El resto lo edita un administrador."}
          </p>
        </div>

        {paso !== "listas" && (
          <button
            type="button"
            onClick={() => setPaso("listas")}
            className="flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-crema-oscura px-4 font-cuerpo text-sm font-bold text-cafe-suave hover:bg-crema md:hidden"
          >
            <ChevronLeft className="size-4" />
            Atrás
          </button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <ColumnaListas
          listas={listas}
          seleccionada={lista?.id ?? null}
          esAdmin={esAdmin}
          onElegir={elegirLista}
          onCreada={alCrearLista}
          className={paso === "listas" ? "flex" : "hidden md:flex"}
        />

        <ColumnaOpciones
          key={lista?.id ?? "vacia"}
          lista={lista}
          productos={productos}
          esAdmin={esAdmin}
          className={paso === "opciones" ? "flex" : "hidden md:flex"}
        />
      </div>
    </div>
  );
}
