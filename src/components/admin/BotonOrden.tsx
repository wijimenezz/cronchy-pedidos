"use client";

import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * El par ↑/↓ con el que se reordena cualquier lista del panel: categorías, productos y las
 * opciones de una lista de salsas.
 *
 * Se reordena con botones y no arrastrando (regla 15): el drag nativo de HTML5 no funciona
 * en táctil y el panel se opera desde el teléfono.
 *
 * Vive aquí porque estaba escrito idéntico en `ColumnaCategorias` y en `ColumnaProductos`, y
 * `/admin/opciones` iba a ser la tercera copia. `EditorZonas` tiene lo suyo en JSX suelto con
 * otra forma y se queda como está.
 */
export function BotonOrden({
  direccion,
  nombre,
  onClick,
  deshabilitado,
}: {
  direccion: "subir" | "bajar";
  nombre: string;
  onClick: () => void;
  deshabilitado: boolean;
}) {
  const Icono = direccion === "subir" ? ChevronUp : ChevronDown;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      aria-label={`${direccion === "subir" ? "Subir" : "Bajar"} ${nombre}`}
      className="flex h-6 w-8 items-center justify-center text-cafe-tenue transition-colors hover:text-cafe disabled:opacity-30"
    >
      <Icono className="size-4" />
    </button>
  );
}
