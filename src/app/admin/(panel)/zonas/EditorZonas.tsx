"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Campo, claseControl } from "@/components/checkout/Campo";
import type { ZonaDelPanel } from "@/db/queries/zonas";
import { pesos } from "@/lib/notificaciones/plantillas";
import { COLORES, type Punto } from "./MapaZonas";
import { cambiarActiva, fijarUbicacionTienda, guardarZona, reordenar } from "./acciones";

// Leaflet toca `window` al importarse: sin `ssr: false` el build revienta al prerenderizar.
const MapaZonas = dynamic(() => import("./MapaZonas"), {
  ssr: false,
  loading: () => (
    <div className="grid h-[60vh] min-h-[320px] w-full place-items-center rounded-md border border-crema-oscura bg-tarjeta font-cuerpo text-sm text-cafe-tenue">
      Cargando el mapa…
    </div>
  ),
});

type Borrador = { id?: string; nombre: string; precio: string; color: string };

const VACIO: Borrador = { nombre: "", precio: "", color: COLORES[0] };

export function EditorZonas({
  zonas,
  ubicacionTienda,
}: {
  zonas: ZonaDelPanel[];
  ubicacionTienda: Punto;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Borrador>(VACIO);
  const [geometria, setGeometria] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const creando = borrador.id === undefined && geometria !== null;

  function elegir(id: string | null) {
    setError(null);
    if (id === null) {
      setSeleccionada(null);
      setBorrador(VACIO);
      setGeometria(null);
      return;
    }

    const zona = zonas.find((z) => z.id === id);
    if (!zona) return;

    setSeleccionada(id);
    setBorrador({
      id: zona.id,
      nombre: zona.nombre,
      precio: String(zona.precio),
      color: zona.color ?? COLORES[0],
    });
    // Hasta que el admin mueva un vértice, la geometría guardada es la buena.
    setGeometria(zona.poligono);
  }

  function guardar() {
    setError(null);
    setAviso(null);

    if (!geometria) {
      setError("Dibuja la zona en el mapa antes de guardarla.");
      return;
    }

    const precio = Number(borrador.precio);
    iniciar(async () => {
      const resultado = await guardarZona({
        id: borrador.id,
        nombre: borrador.nombre,
        precio: Number.isFinite(precio) ? precio : 0,
        color: borrador.color,
        poligono: geometria,
      });

      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }

      setAviso(borrador.id ? "Zona actualizada." : "Zona creada.");
      elegir(null);
      router.refresh();
    });
  }

  function alternar(id: string, activa: boolean) {
    setError(null);
    iniciar(async () => {
      const resultado = await cambiarActiva({ id, activa });
      if (!resultado.ok) setError(resultado.error);
      router.refresh();
    });
  }

  /**
   * Mueve una zona en la lista y reescribe la prioridad completa.
   *
   * CLAUDE.md pide arrastrar. Se usan botones porque el drag nativo de HTML5 no funciona en
   * táctil y el panel se opera desde el teléfono; hacerlo funcionar exigiría otra
   * dependencia. Se respeta lo que la regla busca: nadie escribe el número a mano.
   */
  function mover(indice: number, delta: number) {
    const destino = indice + delta;
    if (destino < 0 || destino >= zonas.length) return;

    const ids = zonas.map((z) => z.id);
    [ids[indice], ids[destino]] = [ids[destino], ids[indice]];

    setError(null);
    iniciar(async () => {
      const resultado = await reordenar({ ids });
      if (!resultado.ok) setError(resultado.error);
      router.refresh();
    });
  }

  function moverTienda(punto: Punto) {
    iniciar(async () => {
      const resultado = await fijarUbicacionTienda(punto);
      setAviso(resultado.ok ? "Ubicación de la tienda guardada." : null);
      if (!resultado.ok) setError(resultado.error);
    });
  }

  const sinDibujar = useMemo(() => zonas.filter((z) => !z.poligono).length, [zonas]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-titulo text-xl font-bold text-cafe">Zonas de cobertura</h1>
        <p className="font-cuerpo text-[13px] text-cafe-tenue">
          Dibuja cada zona y ponle su precio. Si dos se superponen, cobra la que esté más
          arriba en la lista.
        </p>
      </div>

      {sinDibujar > 0 && (
        <p className="rounded-sm bg-alerta/15 px-3 py-2 font-cuerpo text-[13px] font-semibold text-cafe">
          {sinDibujar === 1
            ? "Hay 1 zona sin dibujar: no cubre ninguna dirección todavía."
            : `Hay ${sinDibujar} zonas sin dibujar: no cubren ninguna dirección todavía.`}
        </p>
      )}

      <MapaZonas
        zonas={zonas}
        ubicacionTienda={ubicacionTienda}
        seleccionada={seleccionada}
        onSeleccionar={elegir}
        onGeometria={setGeometria}
        onUbicacionTienda={moverTienda}
        dibujando={creando || seleccionada !== null}
      />

      <section className="rounded-md border border-crema-oscura bg-tarjeta p-4">
        <h2 className="mb-3 font-titulo text-base font-bold text-cafe">
          {borrador.id ? `Editando ${borrador.nombre || "la zona"}` : "Zona nueva"}
        </h2>

        <div className="flex flex-col gap-3">
          <Campo etiqueta="Nombre" requerido>
            {(props) => (
              <input
                {...props}
                type="text"
                value={borrador.nombre}
                onChange={(e) => setBorrador((b) => ({ ...b, nombre: e.target.value }))}
                placeholder="Centro"
                className={claseControl()}
              />
            )}
          </Campo>

          <Campo etiqueta="Precio del domicilio" requerido ayuda="Siempre se cobra, nunca $0.">
            {(props) => (
              <input
                {...props}
                type="number"
                inputMode="numeric"
                min={1}
                step={500}
                value={borrador.precio}
                onChange={(e) => setBorrador((b) => ({ ...b, precio: e.target.value }))}
                placeholder="3000"
                className={claseControl()}
              />
            )}
          </Campo>

          <fieldset>
            <legend className="mb-1 font-cuerpo text-sm font-bold text-cafe">Color</legend>
            <div className="flex flex-wrap gap-2">
              {COLORES.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Color ${color}`}
                  aria-pressed={borrador.color === color}
                  onClick={() => setBorrador((b) => ({ ...b, color }))}
                  style={{ backgroundColor: color }}
                  className={`size-11 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-naranja focus:ring-offset-2 ${
                    borrador.color === color ? "ring-2 ring-cafe ring-offset-2" : ""
                  }`}
                />
              ))}
            </div>
          </fieldset>

          {!geometria && (
            <p className="font-cuerpo text-[13px] text-cafe-tenue">
              Usa la herramienta de polígono del mapa (arriba a la derecha) para trazar el
              contorno.
            </p>
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

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={guardar}
              disabled={pendiente || !geometria || !borrador.nombre.trim()}
              className="min-h-11 rounded-full bg-naranja px-5 font-cuerpo text-sm font-bold text-crema transition-colors hover:bg-naranja-osc focus:outline-none focus:ring-2 focus:ring-naranja focus:ring-offset-2 disabled:opacity-50"
            >
              {borrador.id ? "Guardar cambios" : "Crear zona"}
            </button>

            {(borrador.id || geometria) && (
              <button
                type="button"
                onClick={() => elegir(null)}
                disabled={pendiente}
                className="min-h-11 rounded-full border border-crema-oscura px-5 font-cuerpo text-sm font-bold text-cafe transition-colors hover:bg-crema disabled:opacity-50"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-md border border-crema-oscura bg-tarjeta p-4">
        <h2 className="mb-1 font-titulo text-base font-bold text-cafe">Orden de cobro</h2>
        <p className="mb-3 font-cuerpo text-[13px] text-cafe-tenue">
          La primera que cubra la dirección es la que cobra.
        </p>

        {zonas.length === 0 ? (
          <p className="font-cuerpo text-[15px] text-cafe-suave">Todavía no hay zonas.</p>
        ) : (
          <ol className="divide-y divide-crema-oscura">
            {zonas.map((zona, i) => (
              <li key={zona.id} className="flex items-center gap-2 py-2">
                <span
                  aria-hidden
                  style={{ backgroundColor: zona.color ?? COLORES[0] }}
                  className="size-4 shrink-0 rounded-full"
                />

                <button
                  type="button"
                  onClick={() => elegir(zona.id)}
                  className="min-w-0 flex-1 text-left font-cuerpo focus:outline-none focus:ring-2 focus:ring-naranja"
                >
                  <span
                    className={`text-[15px] ${zona.activa ? "text-cafe" : "text-agotado line-through"}`}
                  >
                    {zona.nombre}
                  </span>
                  <span className="ml-2 text-[13px] text-cafe-tenue">{pesos(zona.precio)}</span>
                  {!zona.poligono && (
                    <span className="ml-2 text-[13px] font-bold text-alerta">sin dibujar</span>
                  )}
                </button>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => mover(i, -1)}
                    disabled={pendiente || i === 0}
                    aria-label={`Subir ${zona.nombre}`}
                    className="size-11 rounded-full font-cuerpo text-cafe-suave transition-colors hover:bg-crema focus:outline-none focus:ring-2 focus:ring-naranja disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => mover(i, 1)}
                    disabled={pendiente || i === zonas.length - 1}
                    aria-label={`Bajar ${zona.nombre}`}
                    className="size-11 rounded-full font-cuerpo text-cafe-suave transition-colors hover:bg-crema focus:outline-none focus:ring-2 focus:ring-naranja disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={zona.activa}
                    aria-label={`${zona.nombre}: ${zona.activa ? "activa" : "apagada"}`}
                    onClick={() => alternar(zona.id, !zona.activa)}
                    disabled={pendiente}
                    className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-naranja focus:ring-offset-2 disabled:opacity-60 ${zona.activa ? "bg-exito" : "bg-agotado"}`}
                  >
                    <span
                      className={`absolute top-1 size-5 rounded-full bg-tarjeta transition-all ${zona.activa ? "left-6" : "left-1"}`}
                    />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
