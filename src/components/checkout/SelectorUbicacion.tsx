"use client";

import dynamic from "next/dynamic";
import { MapPin, RefreshCw } from "lucide-react";
import { useState } from "react";
import { pesos } from "@/lib/notificaciones/plantillas";
import {
  accionDelFallo,
  contextoDelNavegador,
  diagnosticar,
  textoDelFallo,
  type FalloUbicacion,
} from "@/lib/checkout/ubicacion";
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
  onCotizar,
}: {
  centroTienda: Punto;
  pin: Punto | null;
  onPin: (punto: Punto) => void;
  cobertura: Cobertura;
  /**
   * Cotizar es del formulario y no de este mapa: el pin guardado hay que volver a cotizarlo
   * al montar, y para entonces este componente puede no estar en pantalla (el paso 2 no se
   * renderiza cuando el cliente vuelve directo al 3).
   */
  onCotizar: (punto: Punto) => void;
}) {
  const [gps, setGps] = useState<Punto | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [fallo, setFallo] = useState<FalloUbicacion | null>(null);

  function mover(punto: Punto) {
    onPin(punto);
    onCotizar(punto);
  }

  function usarMiUbicacion() {
    if (!navigator.geolocation) {
      setFallo(diagnosticar(null));
      return;
    }

    setBuscando(true);
    setFallo(null);

    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        const punto = { lat: posicion.coords.latitude, lng: posicion.coords.longitude };
        setGps(punto);
        setBuscando(false);
        mover(punto);
      },
      // El `code` es la ÚNICA señal que tenemos: WebKit no implementa `permissions.query` para
      // geolocalización, así que fuera de aquí no hay forma de saber qué pasó. La versión
      // anterior recibía el error sin parámetro y lo tiraba, y por eso un iPhone con la
      // Localización apagada para el navegador —que falla en un milisegundo, sin diálogo— se
      // veía exactamente igual que si el botón no hiciera nada.
      (error) => {
        setBuscando(false);
        setFallo(diagnosticar(error.code));
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

      {/*
        Pegado al botón y no debajo del mapa, que es donde estaba: con 256 px de mapa y un
        párrafo de ayuda en medio, en un teléfono este aviso caía fuera de pantalla. Y como el
        permiso denegado falla en un milisegundo, el rótulo "Ubicándote…" ni se alcanza a ver:
        entre las dos cosas, tocar el botón no producía ningún cambio visible.
      */}
      {fallo && <AvisoFallo fallo={fallo} onReintentar={usarMiUbicacion} />}

      <MapaUbicacion centro={centroTienda} pin={pin} onMover={mover} />

      <p className="font-cuerpo text-[13px] text-cafe-tenue">
        Arrastra el pin o toca el mapa hasta dejarlo en tu puerta. De ahí sale el costo del
        domicilio.
      </p>

      {lejosDelGps && (
        <p role="status" className="rounded-sm bg-alerta/12 px-3 py-2 font-cuerpo text-[13px] text-alerta">
          El pin quedó lejos de donde estás. Verifica que esté en tu dirección exacta.
        </p>
      )}

      <ResumenCobertura cobertura={cobertura} />
    </div>
  );
}

/**
 * Qué pasó con el GPS y qué hacer al respecto.
 *
 * El texto sale de `lib/checkout/ubicacion.ts`, que es puro y está probado; aquí solo se pinta.
 * Se lee el user agent durante el render y eso es seguro: `fallo` arranca en `null`, así que
 * este componente solo existe después de que alguien tocó el botón — nunca en el HTML del
 * servidor, donde no hay `navigator` y la hidratación no cuadraría.
 */
function AvisoFallo({
  fallo,
  onReintentar,
}: {
  fallo: FalloUbicacion;
  onReintentar: () => void;
}) {
  const contexto = contextoDelNavegador(navigator.userAgent);
  const { titulo, pasos, alternativa } = textoDelFallo(fallo, contexto);
  const accion = accionDelFallo(fallo);

  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-sm bg-alerta/15 px-3 py-3 font-cuerpo text-[13px] text-cafe"
    >
      <p className="font-semibold">{titulo}</p>

      {pasos.length > 0 && (
        <ol className="ml-4 flex list-decimal flex-col gap-1">
          {pasos.map((paso) => (
            <li key={paso}>{paso}</li>
          ))}
        </ol>
      )}

      {accion !== "ninguna" && (
        <button
          type="button"
          // Recargar y no reintentar cuando faltó el permiso: iOS no lo reevalúa en la misma
          // carga de página, así que un reintento volvería a fallar y el cliente concluiría
          // que activarlo no sirvió. Recargar aquí no cuesta nada — el paso, el carrito y los
          // datos viven en localStorage.
          onClick={accion === "recargar" ? () => window.location.reload() : onReintentar}
          className="mt-1 flex min-h-11 items-center justify-center gap-2 self-start rounded-sm border border-crema-oscura bg-tarjeta px-4 font-bold text-cafe transition-colors hover:bg-crema focus:outline-none focus:ring-2 focus:ring-naranja"
        >
          <RefreshCw className="size-4" />
          {accion === "recargar" ? "Ya lo activé, recargar" : "Intentar de nuevo"}
        </button>
      )}

      <p className="text-cafe-suave">{alternativa}</p>
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
