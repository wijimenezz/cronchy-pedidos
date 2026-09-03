"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { BotonOrden } from "@/components/admin/BotonOrden";
import { Interruptor } from "@/components/admin/Interruptor";
import type { ListaDelPanel, OpcionDelPanel, ProductoOfrecible } from "@/db/queries/opciones";
import { pesos } from "@/lib/notificaciones/plantillas";
import {
  crearOpcionNueva,
  guardarAyudaDeLista,
  guardarOpcion,
  marcarOpcionDisponible,
  quitarOpcion,
  reordenarOpcionesDeLista,
} from "./acciones";

/**
 * La columna derecha: las opciones de la lista elegida, en el orden en que el cliente las ve.
 *
 * **Hay dos clases de lista y el formulario cambia con ellas** (regla 15: aquí no se dice
 * "grupo" ni "upsell"). En una de opciones escritas —salsas, toppings, sabores— se teclea un
 * nombre y un precio. En una de productos de la carta se elige el producto, y lo que llega al
 * pedido es ese producto con su propio precio (regla 8): por eso ahí no hay campo de precio
 * que rellenar, y el que se ve sale de la Carta.
 *
 * Qué se puede quitar también cambia. En una lista de opciones escritas nada se borra
 * (regla 9): un sabor que desaparece rompe lo que significaba un pedido viejo, así que se
 * apaga con el switch. En una de productos sí, porque quitarla solo deja de ofrecer algo que
 * sigue entero en la Carta — el detalle está en `eliminarOpcion`.
 *
 * El switch es lo único que también puede tocar el colaborador: es la operación de media
 * tarde.
 */
export function ColumnaOpciones({
  lista,
  productos,
  esAdmin,
  className,
}: {
  lista: ListaDelPanel | null;
  productos: ProductoOfrecible[];
  esAdmin: boolean;
  className: string;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [quitandoId, setQuitandoId] = useState<string | null>(null);
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

  const ofreceProductos = lista.tipo === "upsell";
  const editable = esAdmin;

  // Un producto ya ofrecido no vuelve a salir en el selector: dos opciones apuntando al mismo
  // producto le enseñarían la misma bebida dos veces al cliente.
  const yaOfrecidos = new Set(
    lista.opciones.map((o) => o.productoRef).filter((id): id is string => id !== null),
  );

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

      {ofreceProductos && (
        <p className="border-b border-crema-oscura px-3 py-2 font-cuerpo text-[13px] text-cafe-tenue">
          Esta lista ofrece productos de la carta, no opciones escritas. Aquí eliges cuáles se
          ofrecen; lo que llega al pedido es el producto mismo, y su precio se cambia en la Carta.
        </p>
      )}

      {esAdmin && <EditorAyuda key={lista.id} lista={lista} />}

      {error && (
        <p role="alert" className="px-3 py-2 font-cuerpo text-[13px] font-semibold text-error">
          {error}
        </p>
      )}

      {creando &&
        (ofreceProductos ? (
          <FormularioNuevoProducto
            groupId={lista.id}
            productos={productos.filter((p) => !yaOfrecidos.has(p.id))}
            onCerrar={() => setCreando(false)}
          />
        ) : (
          <FormularioNueva
            groupId={lista.id}
            precioSugerido={precioSugerido(lista.opciones)}
            onCerrar={() => setCreando(false)}
          />
        ))}

      <ol className="min-h-0 flex-1 divide-y divide-crema-oscura overflow-y-auto px-3">
        {lista.opciones.map((opcion, i) => (
          <li key={opcion.id}>
            {quitandoId === opcion.id ? (
              <ConfirmarQuitar
                opcionId={opcion.id}
                nombre={nombreVisible(opcion)}
                onCerrar={() => setQuitandoId(null)}
              />
            ) : editandoId === opcion.id ? (
              ofreceProductos ? (
                <FormularioCambiarProducto
                  opcion={opcion}
                  productos={productos.filter(
                    (p) => !yaOfrecidos.has(p.id) || p.id === opcion.productoRef,
                  )}
                  onCerrar={() => setEditandoId(null)}
                />
              ) : (
                <FormularioEditar opcion={opcion} onCerrar={() => setEditandoId(null)} />
              )
            ) : (
              <div className="flex items-center gap-1">
                <div className="min-w-0 flex-1">
                  <Interruptor
                    id={opcion.id}
                    nombre={etiqueta(opcion, ofreceProductos)}
                    disponible={opcion.disponible}
                    accion={marcarOpcionDisponible}
                  />
                  {/* Ofrecer algo que el cliente no puede ver es una trampa silenciosa: la
                      sección le sale vacía y nadie sabe por qué. */}
                  {ofreceProductos && opcion.producto && !opcion.producto.activo && (
                    <p className="pb-1 pl-3 font-cuerpo text-[12px] font-semibold text-error">
                      Oculto en la Carta: el cliente no lo ve.
                    </p>
                  )}
                </div>

                {editable && (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditandoId(opcion.id)}
                      aria-label={
                        ofreceProductos
                          ? `Editar ${nombreVisible(opcion)}`
                          : `Editar ${opcion.nombre}`
                      }
                      className="flex size-9 shrink-0 items-center justify-center rounded-full text-cafe-tenue transition-colors hover:bg-crema hover:text-cafe"
                    >
                      <Pencil className="size-4" />
                    </button>

                    {/* Solo donde quitar es honesto: el producto se queda en la Carta y lo
                        único que desaparece es que se ofrezca. En una lista de salsas manda la
                        regla 9 y la salida es el interruptor. */}
                    {ofreceProductos && (
                      <button
                        type="button"
                        onClick={() => setQuitandoId(opcion.id)}
                        aria-label={`Quitar ${nombreVisible(opcion)} de la lista`}
                        className="flex size-9 shrink-0 items-center justify-center rounded-full text-cafe-tenue transition-colors hover:bg-crema hover:text-error"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}

                    <span className="flex shrink-0 flex-col">
                      <BotonOrden
                        direccion="subir"
                        nombre={nombreVisible(opcion)}
                        onClick={() => mover(i, -1)}
                        deshabilitado={pendiente || i === 0}
                      />
                      <BotonOrden
                        direccion="bajar"
                        nombre={nombreVisible(opcion)}
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
/**
 * El nombre que se lee en la fila.
 *
 * En un upsell manda el del producto y no el guardado en la opción: aquel es el catálogo vivo,
 * y si alguien renombra el Mini Churros en la Carta, aquí tiene que verse el nombre nuevo. El
 * `?? opcion.nombre` cubre el hueco de una opción sin producto — que el servidor ya no deja
 * crear, pero que pudo entrar por SQL antes de que esta pantalla existiera.
 */
function nombreVisible(opcion: OpcionDelPanel): string {
  return opcion.producto?.nombre ?? opcion.nombre;
}

/**
 * El precio de un upsell, con el mismo criterio que `nombreVisible`: manda el `precio_base` del
 * producto, que es lo que se cobra (regla 8), y no el `precioDelta` de la fila.
 *
 * Ese delta es una copia que envejece —ver `datosSegunTipo`— y ahora mismo miente: el Churro Loop
 * lo tiene en 0 con el producto a $4.000. Arrancar el formulario con él pondría el campo en $0 y
 * bastaría con guardar sin mirar para regalar el producto en toda la Carta.
 */
function precioVisible(opcion: OpcionDelPanel): number {
  return opcion.producto?.precioBase ?? opcion.precioDelta;
}

/**
 * Nombre y precio de una fila.
 *
 * **El precio de un upsell es el `precio_base` de su producto, no su `precioDelta`** (regla 8):
 * pintar el delta aquí sería decir una cifra que nadie va a cobrar. Es cero en todas, así que
 * ni siquiera se vería — y esa ausencia se lee como "esto es gratis".
 */
function etiqueta(opcion: OpcionDelPanel, ofreceProductos: boolean): string {
  if (ofreceProductos) {
    return opcion.producto
      ? `${opcion.producto.nombre} · ${pesos(opcion.producto.precioBase)}`
      : `${opcion.nombre} · sin producto`;
  }

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

// ------------------------------------------------------------
// Listas que ofrecen productos de la carta (regla 8)
// ------------------------------------------------------------

/**
 * El selector de producto. Un `<select>` nativo y no un combo propio ni un arrastre: el panel
 * se opera en una tablet táctil (regla 15), y ahí el desplegable del sistema es lo que mejor
 * funciona con el dedo.
 *
 * Agrupa por categoría porque es como está ordenada la Carta, así que cada producto se busca
 * donde se espera. Cada opción lleva su precio al lado: es el que se le va a cobrar al cliente
 * (regla 8), o sea el dato que decide si vale la pena ofrecerlo.
 */
function SelectorProducto({
  id,
  productos,
  valor,
  onChange,
}: {
  id: string;
  productos: ProductoOfrecible[];
  valor: string;
  onChange: (valor: string) => void;
}) {
  const categorias = [...new Set(productos.map((p) => p.categoria))];

  return (
    <select
      id={id}
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-11 w-full min-w-0 rounded-sm border border-crema-oscura bg-tarjeta px-2 font-cuerpo text-[15px] text-cafe focus:outline-none focus:ring-2 focus:ring-naranja"
    >
      <option value="">Elige un producto…</option>
      {categorias.map((categoria) => (
        <optgroup key={categoria} label={categoria}>
          {productos
            .filter((p) => p.categoria === categoria)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} · {pesos(p.precioBase)}
                {p.activo ? "" : " (oculto)"}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

/** Lo que hay que saber antes de elegir, y que no se deduce del desplegable. */
const AYUDA_PRODUCTO =
  "El cliente lo verá con el precio que tenga en la Carta, y llegará al pedido como una línea aparte. Para cambiarle el precio, ve a la Carta.";

/**
 * Lo mismo, más el alcance de la edición. Es una constante aparte de `AYUDA_PRODUCTO` porque en
 * el alta no hay ni nombre ni precio: prometer ahí que se pueden cambiar sería mentir.
 *
 * El aviso no es un adorno, y dice las dos cosas que no se ven en esta pantalla. La primera es
 * que aquí no se le pone un apodo ni una tarifa a la fila: se está editando el producto de la
 * Carta, y quien pulsa el lápiz está mirando una lista de upsell. La segunda es el precio de un
 * producto con tamaños —la Porción de Helado sale a $0 en la fila— donde el cliente paga este
 * más el del tamaño (`precioDesde`), así que la cifra de aquí no es la que él ve.
 *
 * **No sirve `AYUDA_PRECIO`**: ese habla del `precio_delta` de un adicional (regla 3), que es
 * otra cifra distinta.
 */
const AYUDA_NOMBRE_PRODUCTO =
  "Son el nombre y el precio del producto en la Carta: al cambiarlos aquí cambian en toda la tienda, no solo en esta lista. Si el producto tiene tamaños, el cliente paga este precio más el del tamaño que elija.";

function FormularioNuevoProducto({
  groupId,
  productos,
  onCerrar,
}: {
  groupId: string;
  productos: ProductoOfrecible[];
  onCerrar: () => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [productoRef, setProductoRef] = useState("");
  const [error, setError] = useState<string | null>(null);

  const sinNadaQueOfrecer = productos.length === 0;

  function guardar() {
    setError(null);
    iniciar(async () => {
      const resultado = await crearOpcionNueva({ groupId, productoRef });
      // La lista se queda abierta y el selector se vacía: se añaden de dos en dos, y el que
      // acaba de entrar ya no aparece entre los que quedan por ofrecer.
      if (resultado.ok) setProductoRef("");
      else setError(resultado.error);
    });
  }

  return (
    <div className="flex flex-col gap-2 border-b border-crema-oscura bg-crema/50 p-3">
      {sinNadaQueOfrecer ? (
        <p className="font-cuerpo text-[13px] text-cafe-tenue">
          Esta lista ya ofrece todos los productos de la Carta. Para ofrecer uno nuevo, créalo
          primero allá.
        </p>
      ) : (
        <>
          <label
            htmlFor={`nuevo-upsell-${groupId}`}
            className="font-cuerpo text-[13px] font-bold text-cafe-suave"
          >
            Qué producto ofrecer
          </label>
          <SelectorProducto
            id={`nuevo-upsell-${groupId}`}
            productos={productos}
            valor={productoRef}
            onChange={setProductoRef}
          />
          <p className="font-cuerpo text-[13px] text-cafe-tenue">{AYUDA_PRODUCTO}</p>
        </>
      )}

      {error && (
        <p role="alert" className="font-cuerpo text-[13px] font-semibold text-error">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        {!sinNadaQueOfrecer && (
          <button
            type="button"
            onClick={guardar}
            disabled={pendiente || !productoRef}
            className="min-h-11 flex-1 rounded-full bg-naranja px-4 font-cuerpo text-sm font-bold text-crema transition-colors hover:bg-naranja-osc disabled:opacity-50"
          >
            {pendiente ? "Añadiendo…" : "Añadir"}
          </button>
        )}
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

/**
 * Cambiar qué producto ofrece una opción ya puesta, y editarle el nombre y el precio.
 *
 * Los dos campos escriben en el PRODUCTO de la Carta, no en la fila de la lista: en una lista de
 * upsell no hay dos cosas que nombrar ni dos precios que cobrar, la opción *es* el producto
 * (regla 8). Guardarlos aparte dejaría al cliente pidiendo "Agua Cristal 600 ml" y al ticket
 * diciendo "Agua 600 ml"; el porqué largo está en el docblock de `guardarOpcion`.
 *
 * Arrancan con lo del producto y no con lo de la fila (`nombreVisible` / `precioVisible`), porque
 * la copia de la fila envejece si alguien lo editó en la Carta (ver `datosSegunTipo`).
 */
function FormularioCambiarProducto({
  opcion,
  productos,
  onCerrar,
}: {
  opcion: OpcionDelPanel;
  productos: ProductoOfrecible[];
  onCerrar: () => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [productoRef, setProductoRef] = useState(opcion.productoRef ?? "");
  const [nombre, setNombre] = useState(nombreVisible(opcion));
  const [precio, setPrecio] = useState(String(precioVisible(opcion)));
  const [error, setError] = useState<string | null>(null);

  /**
   * Elegir otro producto reescribe el nombre y el precio con los suyos.
   *
   * Es lo único de esta pantalla que puede hacer daño de verdad: sin esto, cambiar el
   * desplegable con los campos llenos de los valores anteriores le escribiría el nombre y el
   * precio del producto que se acaba de soltar al que se acaba de elegir, en toda la Carta.
   */
  function elegirProducto(id: string) {
    setProductoRef(id);
    const elegido = productos.find((p) => p.id === id);
    if (elegido) {
      setNombre(elegido.nombre);
      setPrecio(String(elegido.precioBase));
    }
  }

  const cambioAlgo =
    productoRef !== opcion.productoRef ||
    nombre.trim() !== nombreVisible(opcion) ||
    Number(precio) !== precioVisible(opcion);

  function guardar() {
    setError(null);
    iniciar(async () => {
      const resultado = await guardarOpcion({
        id: opcion.id,
        productoRef,
        nombre,
        precioBase: Number(precio) || 0,
      });
      if (resultado.ok) onCerrar();
      else setError(resultado.error);
    });
  }

  return (
    <div className="flex flex-col gap-2 py-2">
      <div className="flex items-end gap-2">
        {/* Con tres controles apilados las etiquetas dejan de ser opcionales: el lío que esto
            arregla era justo no saber qué hacía el desplegable cuando estaba solo. `CampoPrecio`
            trae la suya, así que la de arriba cubre el nombre y el precio juntos. */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <label
            htmlFor={`nombre-upsell-${opcion.id}`}
            className="font-cuerpo text-[13px] font-bold text-cafe-suave"
          >
            Cómo se llama y cuánto vale
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <input
              autoFocus
              id={`nombre-upsell-${opcion.id}`}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={80}
              className="min-h-11 min-w-0 flex-1 rounded-sm border border-crema-oscura bg-tarjeta px-2 font-cuerpo text-[15px] text-cafe focus:outline-none focus:ring-2 focus:ring-naranja"
            />
            <CampoPrecio valor={precio} onChange={setPrecio} />
          </div>

          <label
            htmlFor={`upsell-${opcion.id}`}
            className="font-cuerpo text-[13px] font-bold text-cafe-suave"
          >
            Qué producto ofrece
          </label>
          <SelectorProducto
            id={`upsell-${opcion.id}`}
            productos={productos}
            valor={productoRef}
            onChange={elegirProducto}
          />
        </div>
        <button
          type="button"
          onClick={guardar}
          // El precio vacío bloquea igual que el nombre vacío, y esa simetría no es cosmética: sin
          // ella, borrar el campo para reescribirlo y tocar el check antes de teclear mandaba
          // `Number("") || 0` y escribía **el producto de la Carta a $0**, en toda la tienda y sin
          // preguntar. Es justo lo que el docblock de `precioVisible` dice querer evitar.
          disabled={
            pendiente || !productoRef || !nombre.trim() || !precio.trim() || !cambioAlgo
          }
          aria-label="Guardar los cambios del producto"
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

      <p className="font-cuerpo text-[13px] text-cafe-tenue">{AYUDA_NOMBRE_PRODUCTO}</p>

      {error && (
        <p role="alert" className="font-cuerpo text-[13px] font-semibold text-error">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Pregunta antes de quitar, con el mismo panel en línea que "Eliminar producto" de la Carta y
 * no un `window.confirm`.
 *
 * El texto dice sobre todo qué NO pasa, que es la duda real de quien lo pulsa: el producto se
 * queda en la Carta con todos sus pedidos, y lo único que desaparece es que se ofrezca aquí.
 */
function ConfirmarQuitar({
  opcionId,
  nombre,
  onCerrar,
}: {
  opcionId: string;
  nombre: string;
  onCerrar: () => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function quitar() {
    setError(null);
    iniciar(async () => {
      const resultado = await quitarOpcion({ id: opcionId });
      if (resultado.ok) onCerrar();
      else setError(resultado.error);
    });
  }

  return (
    <div className="my-2 flex flex-col gap-2 rounded-md border border-error/40 bg-error/5 p-3">
      <p className="font-cuerpo text-[13px] font-bold text-cafe">
        ¿Dejar de ofrecer «{nombre}»?
      </p>
      <p className="font-cuerpo text-[13px] text-cafe-suave">
        El producto se queda en la Carta con todos sus pedidos; solo deja de aparecer en esta
        lista. Si es cosa de hoy, mejor apágalo con el interruptor.
      </p>

      {error && (
        <p role="alert" className="font-cuerpo text-[13px] font-semibold text-error">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={quitar}
          disabled={pendiente}
          className="min-h-11 flex-1 rounded-full bg-error px-4 font-cuerpo text-sm font-bold text-crema transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pendiente ? "Quitando…" : "Sí, quitar"}
        </button>
        <button
          type="button"
          onClick={onCerrar}
          disabled={pendiente}
          className="min-h-11 flex-1 rounded-full border border-crema-oscura px-4 font-cuerpo text-sm font-bold text-cafe transition-colors hover:bg-crema disabled:opacity-50"
        >
          No
        </button>
      </div>
    </div>
  );
}
