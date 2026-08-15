"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import { BotonSwitch } from "@/components/admin/Interruptor";
import type { GrupoEnganchable, ProductoDelPanel } from "@/db/queries/catalogo";
import { configuracionDesde } from "@/lib/catalogo/engancles";
import { guardarModificadores } from "./acciones";

/**
 * Regla 15: el panel traduce, no expone el modelo.
 *
 * Aquí se lee "Salsas · incluidas 2" y "Salsas adicionales · hasta 3 · $2.000 c/u". Que por
 * debajo eso sean dos filas de `product_modifier_group` con el mismo `group_id` y distinto
 * `modo`, con `min_select = max_select` en una y `min_select = 0` en la otra, no aparece
 * por ningún lado. La traducción la hace `planificarEngancles` en el servidor.
 *
 * Son tres formas de enganchar un grupo, y se distinguen por lo que significan para el cliente:
 * lo **incluido** hay que elegirlo y ya está pagado; un **tamaño** hay que elegirlo y cambia el
 * precio; un **adicional** se puede saltar y se cobra aparte. En la base las dos últimas son el
 * mismo `modo` y solo las separa el `min_select`, pero eso es asunto de `engancles.ts`.
 *
 * Lo que este componente NO hace es crear grupos ni opciones: añadir una salsa nueva o un
 * sabor de la semana es `/admin/opciones`. Aquí solo se engancha lo que ya existe.
 */

const OPCIONES = "/admin/opciones";

/** El borrador es exactamente la configuración que espera el servidor, sin traducción extra. */
type Borrador = ReturnType<typeof configuracionDesde>;

function borradorDe(producto: ProductoDelPanel): Borrador {
  return configuracionDesde(producto.engancles);
}

export function Modificadores({
  producto,
  grupos,
}: {
  producto: ProductoDelPanel;
  grupos: GrupoEnganchable[];
}) {
  const [pendiente, iniciar] = useTransition();
  const [borrador, setBorrador] = useState<Borrador>(borradorDe(producto));
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // El mapa lleva TODOS los grupos, incluidos los archivados: es con el que se resuelve el
  // nombre de cada enganche ya guardado, y filtrarlo dejaría "Grupo desconocido" en un
  // producto que sigue funcionando perfectamente.
  const porId = new Map(grupos.map((g) => [g.id, g]));
  // Lo que se puede AÑADIR sí se filtra. Un grupo sin opciones no se puede ofrecer —el
  // cliente vería una sección vacía y, si es obligatoria, no podría añadir el producto al
  // carrito— y uno archivado se archivó justamente para no volver a engancharlo.
  const ofrecible = (g: GrupoEnganchable) => g.activo && g.totalOpciones > 0;
  const seleccionables = grupos.filter((g) => g.tipo === "seleccion" && ofrecible(g));
  // Un upsell ya encendido se sigue mostrando aunque su lista se haya archivado: si no, el
  // switch desaparecería de la pantalla sin haberse apagado y no habría forma de quitarlo.
  const deUpsell = grupos.filter(
    (g) => g.tipo === "upsell" && (ofrecible(g) || borrador.upsells.includes(g.id)),
  );

  function set(cambio: Partial<Borrador>) {
    setBorrador((b) => ({ ...b, ...cambio }));
    setAviso(null);
  }

  function guardar() {
    setError(null);
    setAviso(null);

    iniciar(async () => {
      const resultado = await guardarModificadores({ id: producto.id, ...borrador });
      if (resultado.ok) setAviso("Guardado. Ya se ve en la ficha del producto.");
      else setError(resultado.error);
    });
  }

  const nombre = (id: string) => porId.get(id)?.nombre ?? "Grupo desconocido";

  /**
   * Si el grupo ya está puesto como tamaño, como adicional o como upsell.
   *
   * Los tres se guardan con `modo = 'adicional'`, así que ofrecer el mismo grupo dos veces
   * entre ellos daría dos filas con la misma clave y chocaría contra el UNIQUE de la base. Lo
   * incluido no entra en la cuenta: ese es el otro modo, y el mismo grupo en los dos a la vez
   * es justo lo que hace la regla 3 con las salsas.
   */
  const enUso = (groupId: string) =>
    borrador.variantes.some((v) => v.groupId === groupId) ||
    borrador.adicionales.some((a) => a.groupId === groupId) ||
    borrador.upsells.includes(groupId);

  return (
    <div className="flex min-h-0 flex-col gap-5 overflow-y-auto lg:max-h-[calc(100vh-20rem)]">
      {/* ---------- Incluido ---------- */}
      <Bloque
        titulo="Lo que el producto ya incluye"
        ayuda="Ya está pagado dentro del precio, así que el cliente tiene que elegirlo todo para poder añadirlo al carrito."
      >
        {borrador.incluidos.map((inc, i) => (
          <Linea key={inc.groupId} nombre={nombre(inc.groupId)}>
            <NumeroCampo
              etiqueta="Cuántas elige"
              valor={inc.cantidad}
              min={1}
              onChange={(v) =>
                set({
                  incluidos: borrador.incluidos.map((x, j) =>
                    j === i ? { ...x, cantidad: v } : x,
                  ),
                })
              }
            />
            <BotonQuitar
              etiqueta={`Quitar ${nombre(inc.groupId)} de lo incluido`}
              onClick={() =>
                set({ incluidos: borrador.incluidos.filter((_, j) => j !== i) })
              }
            />
          </Linea>
        ))}

        <Anadir
          etiqueta="Añadir un grupo incluido"
          opciones={seleccionables.filter(
            (g) => !borrador.incluidos.some((i) => i.groupId === g.id),
          )}
          onElegir={(groupId) =>
            set({ incluidos: [...borrador.incluidos, { groupId, cantidad: 1 }] })
          }
        />
      </Bloque>

      {/* ---------- Tamaños ---------- */}
      <Bloque
        titulo="Tamaños y presentaciones"
        ayuda="El cliente elige uno sí o sí, y cada opción cuesta lo suyo. El precio de cada tamaño lo pones en Opciones, y es lo que se SUMA al precio del producto: si el producto vale $4.000, un mediano de $8.000 lleva $4.000."
      >
        {borrador.variantes.map((v, i) => (
          // Sin campos numéricos: la cantidad es siempre una y el precio vive en cada opción.
          // Un "$ c/u" aquí les pondría el mismo precio a todos los tamaños.
          <Linea key={v.groupId} nombre={nombre(v.groupId)}>
            <span className="font-cuerpo text-[13px] text-cafe-tenue">Elige 1</span>
            <BotonQuitar
              etiqueta={`Quitar ${nombre(v.groupId)} de los tamaños`}
              onClick={() => set({ variantes: borrador.variantes.filter((_, j) => j !== i) })}
            />
          </Linea>
        ))}

        <Anadir
          etiqueta="Añadir un grupo de tamaños"
          opciones={seleccionables.filter((g) => !enUso(g.id))}
          onElegir={(groupId) => set({ variantes: [...borrador.variantes, { groupId }] })}
        />
      </Bloque>

      {/* ---------- Adicionales ---------- */}
      <Bloque
        titulo="Adicionales"
        ayuda="Sección aparte, plegada por defecto. El cliente puede saltársela. Con el precio en 0 no se cobra nada: es la forma de ofrecer una elección opcional, como «Sin canela»."
      >
        {borrador.adicionales.map((ad, i) => (
          <Linea key={ad.groupId} nombre={nombre(ad.groupId)}>
            <NumeroCampo
              etiqueta="Hasta"
              valor={ad.hasta}
              min={1}
              onChange={(v) =>
                set({
                  adicionales: borrador.adicionales.map((x, j) =>
                    j === i ? { ...x, hasta: v } : x,
                  ),
                })
              }
            />
            <label className="flex flex-col gap-0.5">
              <span className="font-cuerpo text-[11px] font-bold text-cafe-tenue">$ c/u</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={500}
                value={ad.precio ?? ""}
                placeholder="c/u"
                onChange={(e) =>
                  set({
                    adicionales: borrador.adicionales.map((x, j) =>
                      j === i
                        ? { ...x, precio: e.target.value === "" ? null : Number(e.target.value) }
                        : x,
                    ),
                  })
                }
                className="min-h-11 w-24 rounded-sm border border-crema-oscura bg-tarjeta px-2 font-cuerpo text-[15px] text-cafe focus:outline-none focus:ring-2 focus:ring-naranja"
              />
            </label>
            <BotonQuitar
              etiqueta={`Quitar ${nombre(ad.groupId)} de los adicionales`}
              onClick={() =>
                set({ adicionales: borrador.adicionales.filter((_, j) => j !== i) })
              }
            />
          </Linea>
        ))}

        {borrador.adicionales.some((a) => a.precio === null) && (
          <p className="font-cuerpo text-[13px] text-cafe-tenue">
            Un precio vacío significa que cada opción cobra el suyo.
          </p>
        )}

        <Anadir
          etiqueta="Añadir un adicional"
          opciones={seleccionables.filter((g) => !enUso(g.id))}
          onElegir={(groupId) =>
            set({
              adicionales: [...borrador.adicionales, { groupId, hasta: 1, precio: 2000 }],
            })
          }
        />
      </Bloque>

      {/* ---------- Upsell ---------- */}
      {deUpsell.length > 0 && (
        <Bloque
          titulo="Ofrecer también"
          ayuda="Aparece al final de la ficha. Lo que el cliente añada llega como su propio renglón del pedido, cobrado a su precio normal."
        >
          {deUpsell.map((grupo) => {
            const encendido = borrador.upsells.includes(grupo.id);

            return (
              <div key={grupo.id} className="flex items-center justify-between gap-3 py-1">
                <span className="font-cuerpo text-[15px] text-cafe">{grupo.nombre}</span>
                <BotonSwitch
                  activo={encendido}
                  etiqueta={grupo.nombre}
                  onClick={() =>
                    set({
                      upsells: encendido
                        ? borrador.upsells.filter((id) => id !== grupo.id)
                        : [...borrador.upsells, grupo.id],
                    })
                  }
                />
              </div>
            );
          })}
        </Bloque>
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

      <div className="flex gap-2">
        <button
          type="button"
          onClick={guardar}
          disabled={pendiente}
          className="min-h-11 rounded-full bg-naranja px-5 font-cuerpo text-sm font-bold text-crema transition-colors hover:bg-naranja-osc disabled:opacity-50"
        >
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setBorrador(borradorDe(producto));
            setError(null);
            setAviso(null);
          }}
          disabled={pendiente}
          className="min-h-11 rounded-full border border-crema-oscura px-5 font-cuerpo text-sm font-bold text-cafe-suave transition-colors hover:bg-crema disabled:opacity-50"
        >
          Descartar
        </button>
      </div>

      {/* Aquí se engancha lo que ya existe; crear una salsa nueva o cambiar el sabor de la
          semana es la otra pantalla, y llegar a ella sin salir de esta ahorra el rodeo. */}
      <p className="font-cuerpo text-[13px] text-cafe-tenue">
        ¿Falta una salsa o un sabor?{" "}
        <Link href={OPCIONES} className="font-bold text-naranja underline">
          Edítalos en Opciones
        </Link>
        .
      </p>
    </div>
  );
}

function Bloque({
  titulo,
  ayuda,
  children,
}: {
  titulo: string;
  ayuda: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="font-titulo text-base font-bold text-cafe">{titulo}</h3>
        <p className="font-cuerpo text-[13px] text-cafe-tenue">{ayuda}</p>
      </div>
      {children}
    </section>
  );
}

function Linea({ nombre, children }: { nombre: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-sm border border-crema-oscura p-2">
      <span className="min-w-0 flex-1 font-cuerpo text-[15px] font-semibold text-cafe">
        {nombre}
      </span>
      {children}
    </div>
  );
}

function NumeroCampo({
  etiqueta,
  valor,
  min,
  onChange,
}: {
  etiqueta: string;
  valor: number;
  min: number;
  onChange: (valor: number) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="font-cuerpo text-[11px] font-bold text-cafe-tenue">{etiqueta}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={20}
        value={valor}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value) || min))}
        className="min-h-11 w-20 rounded-sm border border-crema-oscura bg-tarjeta px-2 font-cuerpo text-[15px] text-cafe focus:outline-none focus:ring-2 focus:ring-naranja"
      />
    </label>
  );
}

function BotonQuitar({ etiqueta, onClick }: { etiqueta: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      className="flex size-11 shrink-0 items-center justify-center rounded-full text-cafe-tenue transition-colors hover:bg-crema hover:text-error"
    >
      <X className="size-5" />
    </button>
  );
}

/** Un `select` nativo y no un menú propio: en móvil el picker del sistema gana siempre. */
function Anadir({
  etiqueta,
  opciones,
  onElegir,
}: {
  etiqueta: string;
  opciones: GrupoEnganchable[];
  onElegir: (groupId: string) => void;
}) {
  if (opciones.length === 0) {
    return (
      <p className="font-cuerpo text-[13px] text-cafe-tenue">
        No queda ninguna lista por añadir.{" "}
        <Link href={OPCIONES} className="font-bold text-naranja underline">
          Crea una nueva en Opciones
        </Link>
        .
      </p>
    );
  }

  return (
    <label className="flex items-center gap-2">
      <span className="flex size-9 items-center justify-center rounded-full bg-crema text-naranja">
        <Plus className="size-4" />
      </span>
      <span className="sr-only">{etiqueta}</span>
      <select
        value=""
        onChange={(e) => e.target.value && onElegir(e.target.value)}
        aria-label={etiqueta}
        className="min-h-11 flex-1 rounded-sm border border-crema-oscura bg-tarjeta px-2 font-cuerpo text-[15px] text-cafe-suave focus:outline-none focus:ring-2 focus:ring-naranja"
      >
        <option value="">{etiqueta}…</option>
        {opciones.map((g) => (
          <option key={g.id} value={g.id}>
            {g.nombre}
          </option>
        ))}
      </select>
    </label>
  );
}
