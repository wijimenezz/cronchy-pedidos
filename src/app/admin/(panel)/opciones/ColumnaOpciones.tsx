"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { BotonOrden } from "@/components/admin/BotonOrden";
import { Interruptor } from "@/components/admin/Interruptor";
import type { ListaDelPanel, OpcionDelPanel } from "@/db/queries/opciones";
import { pesos } from "@/lib/notificaciones/plantillas";
import {
  crearOpcionNueva,
  guardarAyudaDeLista,
  guardarOpcion,
  marcarOpcionDisponible,
  reordenarOpcionesDeLista,
} from "./acciones";

/**
 * La columna derecha: las opciones de la lista elegida, en el orden en que el cliente las ve.
 *
 * Nada se borra (regla 9): un sabor que desaparece rompe la trazabilidad de los pedidos que
 * lo llevaban. Un nombre mal escrito se corrige con el lápiz; una opción que ya no va, se
 * apaga con el switch —y eso último también lo puede hacer el colaborador, que es la
 * operación de media tarde.
 */
export function ColumnaOpciones({
  lista,
  esAdmin,
  className,
}: {
  lista: ListaDelPanel | null;
  esAdmin: boolean;
  className: string;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  if (!lista) {
    return (
      <section
        className={`min-h-0 flex-col items-center justify-center rounded-md border border-crema-oscura bg-tarjeta p-6 ${className}`}
      >
        <p className="text-center font-cuerpo text-[15px] text-cafe-tenue">
          Elige una lista para ver sus opciones.
        </p>
      </section>
    );
  }

  // Las listas de tipo upsell (las bebidas que se ofrecen desde un churro) no se editan
  // aquí: sus opciones no son texto sino productos de la carta (regla 8), y cambiarlas es
  // cambiar qué producto se ofrece. Se ven para saber qué hay, y se apagan como cualquier
  // otra, pero se crean y se editan desde la Carta.
  const editable = esAdmin && lista.tipo === "seleccion";

  function mover(indice: number, delta: number) {
    if (!lista) return;

    const destino = indice + delta;
    if (destino < 0 || destino >= lista.opciones.length) return;

    const ids = lista.opciones.map((o) => o.id);
    [ids[indice], ids[destino]] = [ids[destino], ids[indice]];

    setError(null);
    iniciar(async () => {
      const resultado = await reordenarOpcionesDeLista({ groupId: lista.id, ids });
      if (!resultado.ok) setError(resultado.error);
    });
  }

  return (
    <section
      className={`min-h-0 flex-col rounded-md border border-crema-oscura bg-tarjeta ${className}`}
    >
      <header className="flex items-center justify-between gap-2 border-b border-crema-oscura px-3 py-2">
        <div className="min-w-0">
          <h2 className="truncate font-titulo text-base font-bold text-cafe">{lista.nombre}</h2>
          <p className="font-cuerpo text-[13px] text-cafe-tenue">
            {lista.activo ? "En uso" : "Archivada"}
          </p>
        </div>
        {editable && (
          <button
            type="button"
            onClick={() => setCreando(true)}
            aria-label={`Añadir una opción a ${lista.nombre}`}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-naranja transition-colors hover:bg-crema"
          >
            <Plus className="size-5" />
          </button>
        )}
      </header>

      {lista.tipo === "upsell" && (
        <p className="border-b border-crema-oscura px-3 py-2 font-cuerpo text-[13px] text-cafe-tenue">
          Esta lista ofrece productos de la carta, no opciones escritas. Lo que llega al pedido
          es el producto mismo, con su precio: se edita en la Carta.
        </p>
      )}

      {esAdmin && <EditorAyuda key={lista.id} lista={lista} />}

      {error && (
        <p role="alert" className="px-3 py-2 font-cuerpo text-[13px] font-semibold text-error">
          {error}
        </p>
      )}

      {creando && (
        <FormularioNueva
          groupId={lista.id}
          precioSugerido={precioSugerido(lista.opciones)}
          onCerrar={() => setCreando(false)}
        />
      )}

      <ol className="min-h-0 flex-1 divide-y divide-crema-oscura overflow-y-auto px-3">
        {lista.opciones.map((opcion, i) => (
          <li key={opcion.id}>
            {editandoId === opcion.id ? (
              <FormularioEditar opcion={opcion} onCerrar={() => setEditandoId(null)} />
            ) : (
              <div className="flex items-center gap-1">
                <div className="min-w-0 flex-1">
                  <Interruptor
                    id={opcion.id}
                    nombre={etiqueta(opcion)}
                    disponible={opcion.disponible}
                    accion={marcarOpcionDisponible}
                  />
                </div>

                {editable && (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditandoId(opcion.id)}
                      aria-label={`Editar ${opcion.nombre}`}
                      className="flex size-9 shrink-0 items-center justify-center rounded-full text-cafe-tenue transition-colors hover:bg-crema hover:text-cafe"
                    >
                      <Pencil className="size-4" />
                    </button>

                    <span className="flex shrink-0 flex-col">
                      <BotonOrden
                        direccion="subir"
                        nombre={opcion.nombre}
                        onClick={() => mover(i, -1)}
                        deshabilitado={pendiente || i === 0}
                      />
                      <BotonOrden
                        direccion="bajar"
                        nombre={opcion.nombre}
                        onClick={() => mover(i, 1)}
                        deshabilitado={pendiente || i === lista.opciones.length - 1}
                      />
                    </span>
                  </>
                )}
              </div>
            )}
          </li>
        ))}

        {lista.opciones.length === 0 && (
          <li className="py-6 text-center font-cuerpo text-[13px] text-cafe-tenue">
            {/* Un grupo sin opciones no se puede enganchar: el cliente vería una sección
                vacía y, si es obligatoria, no podría añadir el producto al carrito. */}
            Esta lista todavía no tiene opciones, así que no se puede añadir a ningún producto.
          </li>
        )}
      </ol>
    </section>
  );
}

/**
 * Lo que el cliente lee bajo el título de esta sección en la ficha.
 *
 * Casi ninguna lista lo necesita —"Salsas" con cinco salsas dentro se entiende sola— así que el
 * campo arranca vacío y en tono discreto. El caso que lo justifica es "Azúcar y canela", donde
 * las opciones QUITAN algo que el churro ya trae: sin una frase, nadie sabe qué le llega si no
 * toca nada.
 *
 * El borrador es local y se monta con `key={lista.id}`, así que cambiar de lista lo resetea sin
 * un efecto que vigile la prop.
 */
function EditorAyuda({ lista }: { lista: ListaDelPanel }) {
  const [pendiente, iniciar] = useTransition();
  const [texto, setTexto] = useState(lista.ayuda ?? "");
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  const sucio = texto.trim() !== (lista.ayuda ?? "");

  function guardar() {
    setError(null);
    setGuardado(false);
    iniciar(async () => {
      const resultado = await guardarAyudaDeLista({ id: lista.id, ayuda: texto });
      if (resultado.ok) setGuardado(true);
      else setError(resultado.error);
    });
  }

  return (
    <div className="flex flex-col gap-1 border-b border-crema-oscura px-3 py-2">
      <label
        htmlFor={`ayuda-${lista.id}`}
        className="font-cuerpo text-[13px] font-bold text-cafe-suave"
      >
        Qué explicarle al cliente
      </label>
      <textarea
        id={`ayuda-${lista.id}`}
        rows={2}
        maxLength={200}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setGuardado(false);
        }}
        placeholder="Ej.: Tus churros van con azúcar y canela. Marca aquí solo si quieres quitar algo."
        className="w-full rounded-sm border border-crema-oscura bg-tarjeta px-2 py-1.5 font-cuerpo text-[13px] text-cafe placeholder:text-cafe-tenue focus:outline-none focus:ring-2 focus:ring-naranja"
      />

      {error && (
        <p role="alert" className="font-cuerpo text-[13px] font-semibold text-error">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={guardar}
          disabled={pendiente || !sucio}
          className="min-h-11 rounded-full border border-crema-oscura px-4 font-cuerpo text-sm font-bold text-cafe transition-colors hover:bg-crema disabled:opacity-40"
        >
          {pendiente ? "Guardando…" : "Guardar texto"}
        </button>
        {guardado && !sucio && (
          <span role="status" className="font-cuerpo text-[13px] font-semibold text-exito">
            Guardado. Ya se ve en la carta.
          </span>
        )}
        {!lista.ayuda && !sucio && (
          <span className="font-cuerpo text-[13px] text-cafe-tenue">
            Vacío: no se muestra nada.
          </span>
        )}
      </div>
    </div>
  );
}

/** El precio solo se escribe si lo hay: un sabor de helado vale $0 y el "$0" sería ruido. */
function etiqueta(opcion: OpcionDelPanel): string {
  return opcion.precioDelta > 0 ? `${opcion.nombre} · ${pesos(opcion.precioDelta)}` : opcion.nombre;
}

/**
 * El precio con el que llega el formulario de una opción nueva: el que más se repite entre
 * sus hermanas. Las cinco salsas valen $2.000 y los cuatro toppings también, así que
 * arrancar en $0 obligaría a corregirlo siempre y una salsa gratis por despiste es plata.
 */
function precioSugerido(opciones: OpcionDelPanel[]): number {
  const veces = new Map<number, number>();

  for (const o of opciones) veces.set(o.precioDelta, (veces.get(o.precioDelta) ?? 0) + 1);

  let sugerido = 0;
  let maximo = 0;
  for (const [precio, cuantas] of veces) {
    if (cuantas > maximo) {
      sugerido = precio;
      maximo = cuantas;
    }
  }

  return sugerido;
}

/**
 * El campo de precio necesita explicarse, porque el mismo número significa cosas distintas
 * según dónde se use la opción (regla 3): en modo incluido no se cobra nada, y en modo
 * adicional gana el `precio_unitario` que el producto haya fijado para toda la lista. Es la
 * contraparte del aviso que ya sale al editar las adiciones de un producto: "un precio vacío
 * significa que cada opción cobra el suyo".
 */
const AYUDA_PRECIO =
  "Lo que cuesta pedir esta opción como adicional. Dentro de lo que el producto ya incluye no se cobra, y si en la Carta le pusiste precio al adicional, ese gana sobre este.";

function CampoPrecio({
  valor,
  onChange,
}: {
  valor: string;
  onChange: (valor: string) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="font-cuerpo text-[11px] font-bold text-cafe-tenue">Precio</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={500}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 w-28 rounded-sm border border-crema-oscura bg-tarjeta px-2 font-cuerpo text-[15px] text-cafe focus:outline-none focus:ring-2 focus:ring-naranja"
      />
    </label>
  );
}

function FormularioNueva({
  groupId,
  precioSugerido,
  onCerrar,
}: {
  groupId: string;
  precioSugerido: number;
  onCerrar: () => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState(String(precioSugerido));
  const [error, setError] = useState<string | null>(null);

  function guardar() {
    setError(null);
    iniciar(async () => {
      const resultado = await crearOpcionNueva({
        groupId,
        nombre,
        precioDelta: Number(precio) || 0,
      });
      // La lista se queda abierta: añadir opciones se hace de tres en tres, no de una. El
      // precio se conserva porque las hermanas suelen valer lo mismo.
      if (resultado.ok) {
        setNombre("");
      } else {
        setError(resultado.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 border-b border-crema-oscura bg-crema/50 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <input
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Arequipe, Chocolate, Fresa…"
          aria-label="Nombre de la opción"
          maxLength={80}
          className="min-h-11 min-w-0 flex-1 rounded-sm border border-crema-oscura bg-tarjeta px-3 font-cuerpo text-[15px] text-cafe placeholder:text-cafe-tenue focus:outline-none focus:ring-2 focus:ring-naranja"
        />
        <CampoPrecio valor={precio} onChange={setPrecio} />
      </div>

      <p className="font-cuerpo text-[13px] text-cafe-tenue">{AYUDA_PRECIO}</p>

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
          {pendiente ? "Añadiendo…" : "Añadir"}
        </button>
        <button
          type="button"
          onClick={onCerrar}
          className="min-h-11 rounded-full border border-crema-oscura px-4 font-cuerpo text-sm font-bold text-cafe-suave transition-colors hover:bg-crema"
        >
          Listo
        </button>
      </div>
    </div>
  );
}

function FormularioEditar({
  opcion,
  onCerrar,
}: {
  opcion: OpcionDelPanel;
  onCerrar: () => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [nombre, setNombre] = useState(opcion.nombre);
  const [precio, setPrecio] = useState(String(opcion.precioDelta));
  const [error, setError] = useState<string | null>(null);

  function guardar() {
    setError(null);
    iniciar(async () => {
      const resultado = await guardarOpcion({
        id: opcion.id,
        nombre,
        precioDelta: Number(precio) || 0,
      });
      if (resultado.ok) onCerrar();
      else setError(resultado.error);
    });
  }

  return (
    <div className="flex flex-col gap-2 py-2">
      <div className="flex flex-wrap items-end gap-2">
        <input
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          aria-label={`Nuevo nombre de ${opcion.nombre}`}
          maxLength={80}
          className="min-h-11 min-w-0 flex-1 rounded-sm border border-crema-oscura bg-tarjeta px-2 font-cuerpo text-[15px] text-cafe focus:outline-none focus:ring-2 focus:ring-naranja"
        />
        <CampoPrecio valor={precio} onChange={setPrecio} />
        <button
          type="button"
          onClick={guardar}
          disabled={pendiente || !nombre.trim()}
          aria-label="Guardar opción"
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

      <p className="font-cuerpo text-[13px] text-cafe-tenue">{AYUDA_PRECIO}</p>

      {error && (
        <p role="alert" className="font-cuerpo text-[13px] font-semibold text-error">
          {error}
        </p>
      )}
    </div>
  );
}
