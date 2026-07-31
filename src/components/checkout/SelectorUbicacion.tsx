"use client";

import dynamic from "next/dynamic";
import { MapPin } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { pesos } from "@/lib/notificaciones/plantillas";
import type { Punto } from "./MapaUbicacion";

const MapaUbicacion = dynamic(() => import("./MapaUbicacion"), {
  ssr: false,
  loading: () => (
    <div className="grid h-64 w-full place-items-center rounded-sm border border-crema-oscura bg-crema font-cuerpo text-sm text-cafe-tenue">
      Cargando el mapa…
    </div>
  ),
});

export type Cobertura =
  | { estado: "sin_pin" }
  | { estado: "consultando" }
  | { estado: "cubierto"; zona: string; precio: number }
  | { estado: "fuera" }
  | { estado: "error" };

/** Metros entre dos puntos. Fórmula del haversine — a esta escala, de sobra. */
function distancia(a: Punto, b: Punto): number {
  const R = 6_371_000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Regla 14: pasado este margen desde la lectura del GPS, se avisa — sin bloquear. */
const MARGEN_AVISO_M = 500;

export function SelectorUbicacion({
  centroTienda,
  pin,
  onPin,
  cobertura,
  onCobertura,
}: {
  centroTienda: Punto;
  pin: Punto | null;
  onPin: (punto: Punto) => void;
  cobertura: Cobertura;
  onCobertura: (cobertura: Cobertura) => void;
}) {
  const [gps, setGps] = useState<Punto | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [errorGps, setErrorGps] = useState<string | null>(null);

  // Para descartar respuestas de cotizaciones viejas: si el cliente mueve el pin dos veces
  // seguidas, la primera puede llegar después y pintar el precio equivocado.
  const ultima = useRef(0);

  const cotizar = useCallback(
    async (punto: Punto) => {
      const turno = ++ultima.current;
      onCobertura({ estado: "consultando" });

      try {
        const respuesta = await fetch("/api/zonas/cotizar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(punto),
        });
        if (turno !== ultima.current) return;

        if (!respuesta.ok) {
          onCobertura({ estado: "error" });
          return;
        }

        const datos = (await respuesta.json()) as {
          cubierto: boolean;
          zona?: string;
          precio?: number;
        };
        if (turno !== ultima.current) return;

        onCobertura(
          datos.cubierto
            ? { estado: "cubierto", zona: datos.zona!, precio: datos.precio! }
            : { estado: "fuera" },
        );
      } catch {
        if (turno === ultima.current) onCobertura({ estado: "error" });
      }
    },
    [onCobertura],
  );

  // Cotiza el pin que venía guardado del intento anterior, sin esperar a que lo muevan.
  useEffect(() => {
    if (pin && cobertura.estado === "sin_pin") void cotizar(pin);
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function mover(punto: Punto) {
    onPin(punto);
    void cotizar(punto);
  }

  function usarMiUbicacion() {
    if (!navigator.geolocation) {
      setErrorGps("Tu navegador no puede darnos tu ubicación. Marca el punto en el mapa.");
      return;
    }

    setBuscando(true);
    setErrorGps(null);

    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        const punto = { lat: posicion.coords.latitude, lng: posicion.coords.longitude };
        setGps(punto);
        setBuscando(false);
        mover(punto);
      },
      () => {
        setBuscando(false);
        // Negar el permiso no es un error: el mapa queda centrado en la tienda y el cliente
        // marca a mano (regla 14).
        setErrorGps("No pudimos ubicarte. Marca el punto en el mapa, es igual de válido.");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  const lejosDelGps = gps && pin && distancia(gps, pin) > MARGEN_AVISO_M;

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={usarMiUbicacion}
        disabled={buscando}
        className="flex min-h-11 items-center justify-center gap-2 rounded-sm border border-crema-oscura bg-tarjeta px-4 font-cuerpo text-sm font-bold text-cafe transition-colors hover:bg-crema focus:outline-none focus:ring-2 focus:ring-naranja disabled:opacity-60"
      >
        <MapPin className="size-4" />
        {buscando ? "Ubicándote…" : "Usar mi ubicación actual"}
      </button>

      <MapaUbicacion centro={centroTienda} pin={pin} onMover={mover} />

      <p className="font-cuerpo text-[13px] text-cafe-tenue">
        Arrastra el pin o toca el mapa hasta dejarlo en tu puerta. De ahí sale el costo del
        domicilio.
      </p>

      {errorGps && (
        <p role="status" className="font-cuerpo text-[13px] text-cafe-suave">
          {errorGps}
        </p>
      )}

      {lejosDelGps && (
        <p role="status" className="rounded-sm bg-alerta/12 px-3 py-2 font-cuerpo text-[13px] text-alerta">
          El pin quedó lejos de donde estás. Verifica que esté en tu dirección exacta.
        </p>
      )}

      <ResumenCobertura cobertura={cobertura} />
    </div>
  );
}

function ResumenCobertura({ cobertura }: { cobertura: Cobertura }) {
  if (cobertura.estado === "sin_pin") {
    return (
      <p className="font-cuerpo text-[13px] font-semibold text-cafe-suave">
        Marca tu ubicación para ver el costo del domicilio.
      </p>
    );
  }

  if (cobertura.estado === "consultando") {
    return (
      <p role="status" className="font-cuerpo text-[13px] text-cafe-tenue">
        Calculando el domicilio…
      </p>
    );
  }

  if (cobertura.estado === "cubierto") {
    return (
      <p role="status" className="rounded-sm bg-exito/12 px-3 py-2 font-cuerpo text-[13px] text-cafe">
        Domicilio a <strong>{cobertura.zona}</strong>:{" "}
        <strong>{pesos(cobertura.precio)}</strong>
      </p>
    );
  }

  if (cobertura.estado === "error") {
    return (
      <p role="alert" className="font-cuerpo text-[13px] font-semibold text-error">
        No pudimos calcular el domicilio. Mueve el pin para reintentar.
      </p>
    );
  }

  // Fuera de cobertura: el aviso va aquí y el botón de WhatsApp lo pone el formulario, que
  // es quien tiene el carrito para armar el mensaje.
  return (
    <p role="alert" className="rounded-sm bg-alerta/15 px-3 py-2 font-cuerpo text-[13px] font-semibold text-cafe">
      Todavía no llegamos hasta ahí. Escríbenos y te cotizamos el domicilio.
    </p>
  );
}
