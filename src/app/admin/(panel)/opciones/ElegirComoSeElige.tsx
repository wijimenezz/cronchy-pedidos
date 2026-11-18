"use client";

/**
 * Cómo se elige cada opción de una lista de opciones escritas, en el idioma del negocio
 * (regla 15): nadie lee `permite_cantidad`.
 *
 * - **Se marca o se desmarca**: cada opción se elige una vez (Azúcar y canela, sabores).
 * - **Se puede pedir varias veces**: la ficha pinta un − 0 + y cada toque se cobra. Es lo que
 *   tienen Salsas y Toppings, y lo que necesita "Agregar 10 churros".
 *
 * Lo usan el alta de una lista (`ColumnaListas`) y el encabezado de una ya creada
 * (`ColumnaOpciones`), para que las dos digan lo mismo con las mismas palabras.
 *
 * Radios y no un switch: las dos respuestas se leen enteras antes de elegir, igual que en
 * `ElegirTipo`.
 */
export function ElegirComoSeElige({
  nombre,
  valor,
  onChange,
  deshabilitado = false,
}: {
  /** El `name` del grupo de radios: tiene que ser único en la pantalla. */
  nombre: string;
  valor: boolean;
  onChange: (permiteCantidad: boolean) => void;
  deshabilitado?: boolean;
}) {
  const opciones: { valor: boolean; titulo: string; detalle: string }[] = [
    {
      valor: false,
      titulo: "Se marca o se desmarca",
      detalle: "Cada opción se elige una sola vez. Ej.: sabores, azúcar y canela.",
    },
    {
      valor: true,
      titulo: "Se puede pedir varias veces",
      detalle: "El cliente pone +1, +2, +3… y se cobra cada vez. Ej.: salsas, agregar 10 churros.",
    },
  ];

  return (
    <fieldset className="flex flex-col gap-1" disabled={deshabilitado}>
      <legend className="pb-1 font-cuerpo text-[13px] font-bold text-cafe-suave">
        Cómo se elige cada opción
      </legend>
      {opciones.map((o) => (
        <label
          key={String(o.valor)}
          className={`flex cursor-pointer items-start gap-2 rounded-sm border p-2 transition-colors ${
            valor === o.valor ? "border-naranja bg-tarjeta" : "border-crema-oscura hover:bg-tarjeta"
          } ${deshabilitado ? "opacity-60" : ""}`}
        >
          <input
            type="radio"
            name={nombre}
            checked={valor === o.valor}
            onChange={() => onChange(o.valor)}
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
