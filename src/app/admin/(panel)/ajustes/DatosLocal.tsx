"use client";

import { useState, useTransition } from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import { MapaLocal } from "@/components/mapas/MapaLocal";
import type { Punto } from "@/components/checkout/MapaUbicacion";
import { buscarDireccionEnMapa, guardarDatosLocal, guardarUbicacionLocal } from "./acciones";

/**
 * Dónde queda el local, a qué número se le llama, y el pin en el mapa.
 *
 * La dirección sale en el pie de la carta, en el checkout y en el seguimiento del cliente — y es lo
 * único que tiene quien va a recoger su pedido para saber a dónde ir. El pin es de donde sale el
 * mapa que se le abre al cliente cuando el GPS le falla (regla 14) y el «Cómo llegar».
 *
 * Todo junto en una tarjeta a propósito: un traslado se resuelve escribiendo la dirección,
 * buscándola, ajustando el pin y guardando, sin cambiar de pantalla. **El mismo pin se sigue
 * pudiendo arrastrar en el mapa grande de Zonas**, que es donde tiene sentido colocarlo mirando las
 * zonas de cobertura.
 */
export function DatosLocal({
  direccion,
  telefono,
  ubicacion,
}: {
  direccion: string | null;
  telefono: string | null;
  /** Dónde abrir el mapa: el pin guardado, o el centro por defecto si nadie lo ha fijado. */
  ubicacion: Punto;
}) {
  const [pendiente, iniciar] = useTransition();
  const [buscando, setBuscando] = useState(false);
  const [borrador, setBorrador] = useState({
    direccion: direccion ?? "",
    telefono: telefono ?? "",
  });
  const [punto, setPunto] = useState<Punto>(ubicacion);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function limpiar() {
    setError(null);
    setAviso(null);
  }

  function guardar() {
    limpiar();

    iniciar(async () => {
      const resultado = await guardarDatosLocal({
        direccion: borrador.direccion.trim() || null,
        telefono: borrador.telefono.trim() || null,
      });

      if (resultado.ok) setAviso("Guardado.");
      else setError(resultado.error);
    });
  }

  /**
   * Mover el pin lo guarda en el momento, sin botón.
   *
   * Es distinto de la dirección escrita, que espera al «Guardar» porque se teclea y hay que poder
   * corregirla antes de publicarla: soltar un pin ya es la confirmación, y pedir un clic más solo
   * conseguiría que alguien arrastre, se vaya, y deje el local en el sitio de siempre creyendo que
   * lo movió.
   */
  function moverPin(nuevo: Punto) {
    limpiar();
    setPunto(nuevo);

    iniciar(async () => {
      const resultado = await guardarUbicacionLocal(nuevo);
      if (resultado.ok) setAviso("Ubicación del local guardada.");
      else setError(resultado.error);
    });
  }

  /**
   * Busca la dirección escrita y **solo mueve el pin**: no guarda.
   *
   * El aviso dice "aproximada" y no "encontrada" porque está medido: OSM tiene la calle pero no el
   * número, así que el resultado cae a ~800-1.000 m del local (ver `geocodificar.ts`). Prometer que
   * lo encontró haría que alguien lo diera por bueno y dejara la tienda a un kilómetro.
   */
  function buscar() {
    limpiar();
    setBuscando(true);

    void buscarDireccionEnMapa({ direccion: borrador.direccion })
      .then((resultado) => {
        if (resultado.ok) {
          setPunto(resultado.punto);
          setAviso(
            "Te dejamos el mapa cerca. El mapa conoce la calle pero no el número, así que arrastra el pin hasta la puerta.",
          );
        } else {
          setError(resultado.error);
        }
      })
      .finally(() => setBuscando(false));
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-crema-oscura bg-tarjeta p-4">
      <div>
        <h2 className="font-titulo text-base font-bold text-cafe">Datos del local</h2>
        <p className="font-cuerpo text-[13px] text-cafe-tenue">
          Salen en la carta, en el checkout y en el seguimiento del pedido. La dirección es lo que
          lee quien va a recoger, así que escríbela como se la darías a alguien por teléfono.
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="font-cuerpo text-sm font-bold text-cafe">Dirección</span>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={borrador.direccion}
            onChange={(e) => setBorrador((b) => ({ ...b, direccion: e.target.value }))}
            placeholder="Calle 17 # 7-44, Balmoral"
            className="min-h-11 min-w-[12rem] flex-1 rounded-sm border border-crema-oscura bg-tarjeta px-3 font-cuerpo text-[15px] text-cafe focus:outline-none focus:ring-2 focus:ring-naranja"
          />
          <button
            type="button"
            onClick={buscar}
            disabled={buscando || !borrador.direccion.trim()}
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-crema-oscura px-4 font-cuerpo text-sm font-bold text-cafe disabled:opacity-40"
          >
            {buscando ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Buscar en el mapa
          </button>
        </div>
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-cuerpo text-sm font-bold text-cafe">Teléfono</span>
        <input
          type="tel"
          inputMode="numeric"
          value={borrador.telefono}
          onChange={(e) => setBorrador((b) => ({ ...b, telefono: e.target.value }))}
          placeholder="3116435036"
          className="min-h-11 rounded-sm border border-crema-oscura bg-tarjeta px-3 font-cuerpo text-[15px] text-cafe focus:outline-none focus:ring-2 focus:ring-naranja"
        />
        {/* La consecuencia de dejarlo vacío, dicha antes de que pase: mismo trato que la llave de
            pago, que también avisa de qué se apaga al quitarla. */}
        <span className="font-cuerpo text-[13px] text-cafe-tenue">
          Sin teléfono desaparece el botón de «Escríbenos y te cotizamos» que ve quien queda fuera
          de cobertura.
        </span>
      </label>

      <div className="flex flex-col gap-1">
        <span className="font-cuerpo text-sm font-bold text-cafe">Pin del local</span>
        <span className="font-cuerpo text-[13px] text-cafe-tenue">
          Arrástralo hasta la puerta del local: se guarda solo al soltarlo. De aquí sale el mapa que
          se le abre al cliente cuando su GPS falla, y el «Cómo llegar» de quien recoge.
        </span>
        <MapaLocal punto={punto} onMover={moverPin} />
      </div>

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
          disabled={pendiente}
          className="min-h-11 rounded-full bg-naranja px-5 font-cuerpo text-sm font-bold text-crema transition-colors hover:bg-naranja-osc disabled:opacity-50"
        >
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
        <span className="flex items-center gap-1 font-cuerpo text-[13px] text-cafe-tenue">
          <MapPin className="size-3.5" />
          El pin se guarda solo; el botón es para la dirección y el teléfono.
        </span>
      </div>
    </section>
  );
}
