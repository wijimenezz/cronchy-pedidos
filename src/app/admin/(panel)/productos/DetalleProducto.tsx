"use client";

import { useState, useTransition } from "react";
import { Link2, Trash2 } from "lucide-react";
import { Campo, claseControl } from "@/components/checkout/Campo";
import { BotonSwitch } from "@/components/admin/Interruptor";
import type { CategoriaPanel, GrupoEnganchable, ProductoDelPanel } from "@/db/queries/catalogo";
import { Modificadores } from "./Modificadores";
import { SelectorEstado } from "./SelectorEstado";
import { SubidaFotos } from "./SubidaFotos";
import { cambiarUrlProducto, eliminarProductoDelCatalogo, guardarProducto } from "./acciones";

/**
 * La columna derecha: el producto seleccionado.
 *
 * El formulario se maneja con un único borrador en estado local, igual que el editor de
 * zonas. `precio` vive como string mientras se escribe —si no, borrar el último dígito
 * daría `NaN`— y se convierte con `Number()` al enviar.
 *
 * El componente se remonta al cambiar de producto (la `key` la pone el padre), así que el
 * borrador siempre arranca del producto que toca sin necesidad de sincronizarlo con un
 * efecto.
 */

type Pestana = "basicos" | "adiciones";

type Borrador = {
  categoryId: string;
  nombre: string;
  descripcion: string;
  precio: string;
  recomendado: boolean;
  disponibleDelivery: boolean;
  disponiblePickup: boolean;
};

function borradorDe(p: ProductoDelPanel): Borrador {
  return {
    categoryId: p.categoryId,
    nombre: p.nombre,
    descripcion: p.descripcion ?? "",
    precio: String(p.precioBase),
    recomendado: p.recomendado,
    disponibleDelivery: p.disponibleDelivery,
    disponiblePickup: p.disponiblePickup,
  };
}

export function DetalleProducto({
  producto,
  categorias,
  grupos,
  esAdmin,
  onEliminado,
  className,
}: {
  producto: ProductoDelPanel | null;
  categorias: CategoriaPanel[];
  grupos: GrupoEnganchable[];
  esAdmin: boolean;
  onEliminado: () => void;
  className: string;
}) {
  const [pestana, setPestana] = useState<Pestana>("basicos");

  if (!producto) {
    return (
      <section
        className={`min-h-0 flex-col items-center justify-center rounded-md border border-crema-oscura bg-tarjeta p-8 ${className}`}
      >
        <p className="text-center font-cuerpo text-[15px] text-cafe-tenue">
          Elige un producto para verlo aquí.
        </p>
      </section>
    );
  }

  return (
    <section
      className={`min-h-0 flex-col gap-4 rounded-md border border-crema-oscura bg-tarjeta p-4 ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="min-w-0 flex-1 font-titulo text-lg font-bold text-cafe">
          {producto.nombre}
        </h2>
        <SelectorEstado
          id={producto.id}
          activo={producto.activo}
          disponible={producto.disponible}
          esAdmin={esAdmin}
        />
      </header>

      {esAdmin && (
        <nav className="flex gap-1 border-b border-crema-oscura">
          <Pestaña activa={pestana === "basicos"} onClick={() => setPestana("basicos")}>
            Datos básicos
          </Pestaña>
          <Pestaña activa={pestana === "adiciones"} onClick={() => setPestana("adiciones")}>
            Adiciones y acompañantes
          </Pestaña>
        </nav>
      )}

      {!esAdmin ? (
        <SoloLectura producto={producto} />
      ) : pestana === "basicos" ? (
        <Basicos producto={producto} categorias={categorias} onEliminado={onEliminado} />
      ) : (
        <Modificadores producto={producto} grupos={grupos} />
      )}
    </section>
  );
}

function Pestaña({
  activa,
  onClick,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={activa}
      className={`-mb-px min-h-11 border-b-2 px-3 font-cuerpo text-sm font-bold transition-colors ${
        activa
          ? "border-naranja text-cafe"
          : "border-transparent text-cafe-tenue hover:text-cafe-suave"
      }`}
    >
      {children}
    </button>
  );
}

/** Lo que ve un colaborador: el producto, sin ningún control de edición. */
function SoloLectura({ producto }: { producto: ProductoDelPanel }) {
  return (
    <div className="flex flex-col gap-3">
      <SubidaFotos productId={producto.id} fotos={producto.imagenes} soloLectura />
      <p className="font-cuerpo text-[15px] text-cafe">
        {producto.descripcion || "Sin descripción."}
      </p>
      <p className="font-cuerpo text-sm text-cafe-tenue">
        Para cambiar precio, fotos o adiciones, pídeselo a un administrador.
      </p>
    </div>
  );
}

function Basicos({
  producto,
  categorias,
  onEliminado,
}: {
  producto: ProductoDelPanel;
  categorias: CategoriaPanel[];
  onEliminado: () => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [borrador, setBorrador] = useState<Borrador>(borradorDe(producto));
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function set<K extends keyof Borrador>(campo: K, valor: Borrador[K]) {
    setBorrador((b) => ({ ...b, [campo]: valor }));
    setAviso(null);
  }

  function guardar() {
    setError(null);
    setAviso(null);

    iniciar(async () => {
      const resultado = await guardarProducto({
        id: producto.id,
        categoryId: borrador.categoryId,
        nombre: borrador.nombre,
        descripcion: borrador.descripcion,
        precioBase: Number(borrador.precio),
        recomendado: borrador.recomendado,
        disponibleDelivery: borrador.disponibleDelivery,
        disponiblePickup: borrador.disponiblePickup,
      });

      if (resultado.ok) setAviso("Guardado. Ya se ve en la carta.");
      else setError(resultado.error);
    });
  }

  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto lg:max-h-[calc(100vh-20rem)]">
      <SubidaFotos productId={producto.id} fotos={producto.imagenes} />

      <Campo etiqueta="Nombre" requerido>
        {(props) => (
          <input
            {...props}
            value={borrador.nombre}
            onChange={(e) => set("nombre", e.target.value)}
            maxLength={80}
            className={claseControl()}
          />
        )}
      </Campo>

      <Campo
        etiqueta="Descripción"
        ayuda="Lo que el cliente lee bajo el nombre. Corto y concreto."
      >
        {(props) => (
          <textarea
            {...props}
            value={borrador.descripcion}
            onChange={(e) => set("descripcion", e.target.value)}
            rows={3}
            maxLength={500}
            className={`${claseControl()} resize-y`}
          />
        )}
      </Campo>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Precio" requerido ayuda="Pesos enteros, sin decimales.">
          {(props) => (
            <input
              {...props}
              value={borrador.precio}
              onChange={(e) => set("precio", e.target.value)}
              type="number"
              inputMode="numeric"
              min={0}
              step={500}
              className={claseControl()}
            />
          )}
        </Campo>

        <Campo etiqueta="Categoría">
          {(props) => (
            <select
              {...props}
              value={borrador.categoryId}
              onChange={(e) => set("categoryId", e.target.value)}
              className={claseControl()}
            >
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          )}
        </Campo>
      </div>

      <fieldset className="flex flex-col gap-2 rounded-sm border border-crema-oscura p-3">
        <legend className="px-1 font-cuerpo text-sm font-bold text-cafe">Dónde se vende</legend>

        <Fila
          etiqueta="A domicilio"
          activo={borrador.disponibleDelivery}
          onToggle={() => set("disponibleDelivery", !borrador.disponibleDelivery)}
        />
        <Fila
          etiqueta="Para recoger en tienda"
          activo={borrador.disponiblePickup}
          onToggle={() => set("disponiblePickup", !borrador.disponiblePickup)}
        />
        <Fila
          etiqueta="Recomendado en la portada"
          activo={borrador.recomendado}
          onToggle={() => set("recomendado", !borrador.recomendado)}
        />
      </fieldset>

      <UrlPublica id={producto.id} slug={producto.slug} />

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
          disabled={pendiente || !borrador.nombre.trim() || borrador.precio === ""}
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

      {/* Al fondo y tras una línea, no en la barra de arriba: es la única acción de esta pantalla
          sin vuelta atrás y no puede quedar pegada al botón que se pulsa cien veces al día. */}
      <div className="mt-2 border-t border-crema-oscura pt-3">
        <EliminarProducto
          id={producto.id}
          nombre={producto.nombre}
          onEliminado={onEliminado}
        />
      </div>
    </div>
  );
}

/**
 * Borrar el producto. Solo se llega aquí siendo admin —`Basicos` es la rama de admin— pero quien
 * corta de verdad es el `exigirRol` de la acción (regla 12).
 *
 * Pregunta antes, con el mismo panel en línea que "Cancelar pedido" y no un `window.confirm`. Y
 * adelanta la condición: si el producto ya se vendió no se va a poder, así que decirlo aquí evita
 * un viaje al servidor para recibir un no.
 */
function EliminarProducto({
  id,
  nombre,
  onEliminado,
}: {
  id: string;
  nombre: string;
  onEliminado: () => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function eliminar() {
    setError(null);
    iniciar(async () => {
      const resultado = await eliminarProductoDelCatalogo({ id });

      // El motivo se queda en pantalla y el panel se cierra: reintentar el mismo botón daría el
      // mismo no, y lo que toca hacer está escrito en el mensaje.
      if (resultado.ok) return onEliminado();

      setConfirmando(false);
      setError(resultado.error);
    });
  }

  if (!confirmando) {
    return (
      <div className="flex flex-col gap-2">
        {error && (
          <p role="alert" className="font-cuerpo text-[13px] font-semibold text-error">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setConfirmando(true);
            setError(null);
          }}
          className="flex min-h-11 items-center gap-1.5 self-start px-2 font-cuerpo text-[13px] font-bold text-cafe-tenue transition-colors hover:text-error"
        >
          <Trash2 className="size-4" />
          Eliminar producto
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-error/40 bg-error/5 p-3">
      <p className="font-cuerpo text-[13px] font-bold text-cafe">
        ¿Eliminar «{nombre}»? No se puede deshacer.
      </p>
      <p className="font-cuerpo text-[13px] text-cafe-suave">
        Se van también sus fotos y las adiciones que le configuraste. Si ya se vendió alguna vez no
        se podrá borrar: en ese caso ponlo en Oculto.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={eliminar}
          disabled={pendiente}
          className="min-h-11 flex-1 rounded-full bg-error px-4 font-cuerpo text-sm font-bold text-crema transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pendiente ? "Eliminando…" : "Sí, eliminar"}
        </button>
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          disabled={pendiente}
          className="min-h-11 flex-1 rounded-full border border-crema-oscura px-4 font-cuerpo text-sm font-bold text-cafe transition-colors hover:bg-crema disabled:opacity-50"
        >
          No
        </button>
      </div>
    </div>
  );
}

function Fila({
  etiqueta,
  activo,
  onToggle,
}: {
  etiqueta: string;
  activo: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-cuerpo text-[15px] text-cafe">{etiqueta}</span>
      <BotonSwitch activo={activo} etiqueta={etiqueta} onClick={onToggle} />
    </div>
  );
}

/**
 * La URL pública, aparte del formulario. Renombrar un producto NO la cambia: los clientes
 * comparten `/producto/<slug>` por WhatsApp y esos enlaces siguen circulando. Cambiarla es
 * una decisión consciente, con su propio botón y su aviso.
 */
function UrlPublica({ id, slug }: { id: string; slug: string }) {
  const [pendiente, iniciar] = useTransition();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(slug);
  const [error, setError] = useState<string | null>(null);

  function guardar() {
    setError(null);
    iniciar(async () => {
      const resultado = await cambiarUrlProducto({ id, slug: valor });
      if (resultado.ok) setEditando(false);
      else setError(resultado.error);
    });
  }

  return (
    <div className="flex flex-col gap-1 rounded-sm bg-crema/60 p-3">
      <span className="flex items-center gap-1.5 font-cuerpo text-sm font-bold text-cafe">
        <Link2 className="size-4" />
        Enlace público
      </span>

      {editando ? (
        <>
          <p className="font-cuerpo text-[13px] text-alerta">
            Los enlaces que ya compartiste por WhatsApp dejarán de funcionar.
          </p>
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            aria-label="Enlace público del producto"
            className={claseControl()}
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
              disabled={pendiente || !valor.trim()}
              className="min-h-11 rounded-full bg-naranja px-4 font-cuerpo text-sm font-bold text-crema disabled:opacity-50"
            >
              Cambiar
            </button>
            <button
              type="button"
              onClick={() => {
                setValor(slug);
                setEditando(false);
                setError(null);
              }}
              className="min-h-11 rounded-full px-4 font-cuerpo text-sm font-bold text-cafe-suave"
            >
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <code className="min-w-0 truncate font-cuerpo text-[13px] text-cafe-tenue">
            /producto/{slug}
          </code>
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="min-h-11 shrink-0 px-2 font-cuerpo text-[13px] font-bold text-naranja hover:underline"
          >
            Cambiar
          </button>
        </div>
      )}
    </div>
  );
}
