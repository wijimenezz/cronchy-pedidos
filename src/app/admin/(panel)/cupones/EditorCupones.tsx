"use client";

import { useState, useTransition } from "react";
import { Plus, TicketPercent } from "lucide-react";
import type { CuponDelPanel } from "@/db/queries/cupones";
import { normalizarCodigo } from "@/lib/cupones";
import { pesos } from "@/lib/notificaciones/plantillas";
import { cambiarActivo, guardar } from "./acciones";

/**
 * Los cupones de la tienda: la lista a la izquierda, el que se está editando a la derecha.
 *
 * Dos columnas como `/admin/opciones`, y por lo mismo: se crean pocos y se consultan seguido, así
 * que ver la lista completa mientras se edita uno vale más que una pantalla por cupón.
 *
 * Regla 15 — aquí no se nombra el modelo: se dice «Toda la carta» o «Solo algunos productos», nunca
 * `alcance`. Nada se arrastra, que el panel se opera en una tablet.
 */

type Categoria = { id: string; nombre: string; productos: { id: string; nombre: string }[] };

/** Lo que se está editando. `id: null` es el cupón nuevo que todavía no existe. */
type Borrador = {
  id: string | null;
  codigo: string;
  porcentaje: number;
  alcance: "todo" | "seleccion";
  venceEl: string;
  anuncio: string;
  categoriaIds: string[];
  productoIds: string[];
};

const PORCENTAJES = [5, 10, 15, 20];

const NUEVO: Borrador = {
  id: null,
  codigo: "",
  porcentaje: 10,
  alcance: "todo",
  venceEl: "",
  anuncio: "",
  categoriaIds: [],
  productoIds: [],
};

function aBorrador(c: CuponDelPanel): Borrador {
  return {
    id: c.id,
    codigo: c.codigo,
    porcentaje: c.porcentaje,
    alcance: c.alcance,
    venceEl: c.venceEl ?? "",
    anuncio: c.anuncio ?? "",
    categoriaIds: c.categoriaIds,
    productoIds: c.productoIds,
  };
}

export function EditorCupones({
  cupones,
  categorias,
  hoy,
}: {
  cupones: CuponDelPanel[];
  categorias: Categoria[];
  /** El día de Bogotá, del servidor: de él depende qué cupón se marca como vencido. */
  hoy: string;
}) {
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function editar(b: Borrador | null) {
    setError(null);
    setAviso(null);
    setBorrador(b);
  }

  function enviar() {
    if (!borrador) return;
    setError(null);
    setAviso(null);

    iniciar(async () => {
      const resultado = await guardar({
        id: borrador.id ?? undefined,
        codigo: borrador.codigo,
        porcentaje: borrador.porcentaje,
        alcance: borrador.alcance,
        venceEl: borrador.venceEl || null,
        anuncio: borrador.anuncio || null,
        // Solo viaja el alcance que se está usando: mandar las casillas de "toda la carta" dejaría
        // filas que no significan nada en la base.
        categoriaIds: borrador.alcance === "seleccion" ? borrador.categoriaIds : [],
        productoIds: borrador.alcance === "seleccion" ? borrador.productoIds : [],
      });

      if (resultado.ok) {
        // Se suelta el borrador para que la lista vuelva a leerse de la prop ya revalidada:
        // conservarlo dejaría dos versiones del mismo cupón compitiendo.
        setBorrador(null);
        setAviso("Cupón guardado.");
      } else {
        setError(resultado.error);
      }
    });
  }

  function alternar(c: CuponDelPanel) {
    setError(null);
    setAviso(null);

    iniciar(async () => {
      const resultado = await cambiarActivo({ id: c.id, activo: !c.activo });
      if (!resultado.ok) setError(resultado.error);
    });
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <section className="flex flex-col gap-2 lg:w-2/5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-titulo text-base font-bold text-cafe">
            {cupones.length === 1 ? "1 cupón" : `${cupones.length} cupones`}
          </h2>
          <button
            type="button"
            onClick={() => editar(NUEVO)}
            className="flex min-h-11 items-center gap-2 rounded-full bg-naranja px-4 font-cuerpo text-sm font-bold text-crema transition-colors hover:bg-naranja-osc"
          >
            <Plus className="size-4" />
            Nuevo cupón
          </button>
        </div>

        {cupones.length === 0 ? (
          <p className="rounded-md border border-crema-oscura bg-tarjeta p-4 font-cuerpo text-[13px] text-cafe-suave">
            Todavía no hay cupones. Crea uno, pégalo en Instagram y el cliente lo escribe al pagar.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {cupones.map((c) => (
              <Fila
                key={c.id}
                cupon={c}
                hoy={hoy}
                seleccionado={borrador?.id === c.id}
                pendiente={pendiente}
                onEditar={() => editar(aBorrador(c))}
                onAlternar={() => alternar(c)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-crema-oscura bg-tarjeta p-4 lg:flex-1">
        {!borrador ? (
          <p className="font-cuerpo text-[13px] text-cafe-suave">
            Elige un cupón de la lista para editarlo, o crea uno nuevo.
          </p>
        ) : (
          <Formulario
            borrador={borrador}
            categorias={categorias}
            pendiente={pendiente}
            onCambiar={(cambios) => setBorrador({ ...borrador, ...cambios })}
            onGuardar={enviar}
            onCancelar={() => editar(null)}
          />
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
      </section>
    </div>
  );
}

function Fila({
  cupon,
  hoy,
  seleccionado,
  pendiente,
  onEditar,
  onAlternar,
}: {
  cupon: CuponDelPanel;
  hoy: string;
  seleccionado: boolean;
  pendiente: boolean;
  onEditar: () => void;
  onAlternar: () => void;
}) {
  // Vencido es distinto de apagado, y hay que poder distinguirlos: uno se arregla cambiando la
  // fecha y el otro con el switch.
  const vencido = cupon.venceEl !== null && hoy > cupon.venceEl;

  return (
    <li
      className={`flex flex-col gap-2 rounded-md border bg-tarjeta p-3 ${
        seleccionado ? "border-naranja" : "border-crema-oscura"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onEditar}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <TicketPercent
            className={`size-4 shrink-0 ${
              cupon.activo && !vencido ? "text-exito" : "text-cafe-tenue"
            }`}
          />
          <span className="min-w-0">
            <span className="block truncate font-cuerpo text-[15px] font-bold text-cafe">
              {cupon.codigo}
            </span>
            <span className="block font-cuerpo text-[13px] text-cafe-suave">
              {cupon.porcentaje}% ·{" "}
              {cupon.alcance === "todo" ? "toda la carta" : "algunos productos"}
            </span>
          </span>
        </button>

        {/* A un clic y sin confirmación: es operación diaria, y encender es tan reversible como
            apagar. */}
        <button
          type="button"
          onClick={onAlternar}
          disabled={pendiente}
          aria-pressed={cupon.activo}
          className={`min-h-11 shrink-0 rounded-full px-3 font-cuerpo text-[13px] font-bold disabled:opacity-50 ${
            cupon.activo
              ? "bg-exito/15 text-exito"
              : "border border-crema-oscura text-cafe-suave"
          }`}
        >
          {cupon.activo ? "Activo" : "Apagado"}
        </button>
      </div>

      <p className="font-cuerpo text-[13px] text-cafe-tenue">
        {/* Las cifras de uso son lo que dice si la promo sirvió, que es para lo que se mira esta
            pantalla al mes siguiente. */}
        {cupon.usos === 0
          ? "Sin usar todavía"
          : `${cupon.usos === 1 ? "1 pedido" : `${cupon.usos} pedidos`} · ${pesos(
              cupon.descontado,
            )} descontados`}
        {vencido && " · venció"}
        {cupon.anuncio && " · se anuncia en la carta"}
      </p>
    </li>
  );
}

function Formulario({
  borrador,
  categorias,
  pendiente,
  onCambiar,
  onGuardar,
  onCancelar,
}: {
  borrador: Borrador;
  categorias: Categoria[];
  pendiente: boolean;
  onCambiar: (cambios: Partial<Borrador>) => void;
  onGuardar: () => void;
  onCancelar: () => void;
}) {
  const acotado = borrador.alcance === "seleccion";

  function alternarEn(lista: string[], id: string): string[] {
    return lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id];
  }

  return (
    <>
      <h2 className="font-titulo text-base font-bold text-cafe">
        {borrador.id ? `Editar ${borrador.codigo}` : "Nuevo cupón"}
      </h2>

      <label className="flex flex-col gap-1">
        <span className="font-cuerpo text-sm font-bold text-cafe">Código</span>
        <input
          type="text"
          value={borrador.codigo}
          // Se normaliza mientras se escribe: lo que se ve aquí es exactamente lo que el cliente
          // va a tener que teclear.
          onChange={(e) => onCambiar({ codigo: normalizarCodigo(e.target.value) })}
          placeholder="CHURRO10"
          autoCapitalize="characters"
          className="min-h-11 rounded-sm border border-crema-oscura bg-tarjeta px-3 font-cuerpo text-[15px] text-cafe focus:outline-none focus:ring-2 focus:ring-naranja"
        />
        <span className="font-cuerpo text-[13px] text-cafe-tenue">
          Es lo que el cliente escribe al pagar. Solo letras y números.
        </span>
      </label>

      <div className="flex flex-col gap-1">
        <span className="font-cuerpo text-sm font-bold text-cafe">Descuento</span>
        <div className="flex flex-wrap gap-2">
          {PORCENTAJES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onCambiar({ porcentaje: p })}
              aria-pressed={borrador.porcentaje === p}
              className={`min-h-11 rounded-full px-4 font-cuerpo text-sm font-bold ${
                borrador.porcentaje === p
                  ? "bg-naranja text-crema"
                  : "border border-crema-oscura text-cafe-suave"
              }`}
            >
              {p}%
            </button>
          ))}
          {/* Campo libre además de los botones: 5-10-15-20 cubre lo que se usa a diario, y el
              número suelto evita tener que volver aquí a añadir un botón por una promo puntual. */}
          <label className="flex items-center gap-2">
            <span className="sr-only">Otro porcentaje</span>
            <input
              type="number"
              min={1}
              max={50}
              value={borrador.porcentaje}
              onChange={(e) => onCambiar({ porcentaje: Number(e.target.value) })}
              className="min-h-11 w-20 rounded-sm border border-crema-oscura bg-tarjeta px-3 font-cuerpo text-[15px] text-cafe focus:outline-none focus:ring-2 focus:ring-naranja"
            />
            <span className="font-cuerpo text-sm text-cafe-suave">%</span>
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-cuerpo text-sm font-bold text-cafe">¿A qué aplica?</span>
        <div className="flex gap-2">
          {(
            [
              ["todo", "Toda la carta"],
              ["seleccion", "Solo algunos productos"],
            ] as const
          ).map(([valor, etiqueta]) => (
            <button
              key={valor}
              type="button"
              onClick={() => onCambiar({ alcance: valor })}
              aria-pressed={borrador.alcance === valor}
              className={`min-h-11 flex-1 rounded-sm border px-3 font-cuerpo text-sm font-bold ${
                borrador.alcance === valor
                  ? "border-cafe bg-crema text-cafe"
                  : "border-crema-oscura text-cafe-suave"
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>

        {acotado && (
          <div className="flex flex-col gap-3 rounded-sm bg-crema p-3">
            <p className="font-cuerpo text-[13px] text-cafe-suave">
              Marca una categoría entera y lo que entre en ella después queda cubierto solo. O marca
              productos sueltos.
            </p>

            {categorias.map((c) => (
              <div key={c.id} className="flex flex-col gap-1">
                <label className="flex min-h-11 cursor-pointer items-center gap-2 font-cuerpo text-[15px] font-bold text-cafe">
                  <input
                    type="checkbox"
                    checked={borrador.categoriaIds.includes(c.id)}
                    onChange={() =>
                      onCambiar({ categoriaIds: alternarEn(borrador.categoriaIds, c.id) })
                    }
                    className="size-4 accent-[var(--naranja)]"
                  />
                  {c.nombre}
                </label>

                {/* Los productos de una categoría ya marcada se esconden: marcarlos además no
                    cambiaría nada y solo daría a entender que hace falta. */}
                {!borrador.categoriaIds.includes(c.id) && (
                  <div className="flex flex-wrap gap-x-4 pl-6">
                    {c.productos.map((p) => (
                      <label
                        key={p.id}
                        className="flex min-h-11 cursor-pointer items-center gap-2 font-cuerpo text-[13px] text-cafe-suave"
                      >
                        <input
                          type="checkbox"
                          checked={borrador.productoIds.includes(p.id)}
                          onChange={() =>
                            onCambiar({ productoIds: alternarEn(borrador.productoIds, p.id) })
                          }
                          className="size-4 accent-[var(--naranja)]"
                        />
                        {p.nombre}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <label className="flex flex-col gap-1">
        <span className="font-cuerpo text-sm font-bold text-cafe">Vence el</span>
        <input
          type="date"
          value={borrador.venceEl}
          onChange={(e) => onCambiar({ venceEl: e.target.value })}
          className="min-h-11 rounded-sm border border-crema-oscura bg-tarjeta px-3 font-cuerpo text-[15px] text-cafe focus:outline-none focus:ring-2 focus:ring-naranja"
        />
        <span className="font-cuerpo text-[13px] text-cafe-tenue">
          Sirve durante todo ese día. Déjalo vacío y no vence — tendrás que apagarlo a mano.
        </span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-cuerpo text-sm font-bold text-cafe">Aviso en la carta</span>
        <input
          type="text"
          value={borrador.anuncio}
          onChange={(e) => onCambiar({ anuncio: e.target.value })}
          placeholder={`Con ${borrador.codigo || "TUCUPÓN"} tienes ${borrador.porcentaje}% de descuento`}
          className="min-h-11 rounded-sm border border-crema-oscura bg-tarjeta px-3 font-cuerpo text-[15px] text-cafe focus:outline-none focus:ring-2 focus:ring-naranja"
        />
        <span className="font-cuerpo text-[13px] text-cafe-tenue">
          Sale arriba en la carta. Solo puede haber uno: al poner este, se quita el del otro cupón.
          Déjalo vacío y no se anuncia.
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onGuardar}
          disabled={pendiente}
          className="min-h-11 rounded-full bg-naranja px-5 font-cuerpo text-sm font-bold text-crema transition-colors hover:bg-naranja-osc disabled:opacity-50"
        >
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={pendiente}
          className="min-h-11 rounded-full border border-crema-oscura px-5 font-cuerpo text-sm font-bold text-cafe-suave disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </>
  );
}
