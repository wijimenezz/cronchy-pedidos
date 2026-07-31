"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

/**
 * El mapa donde el cliente pone su pin (regla 14).
 *
 * Leaflet sobre tiles de OpenStreetMap, sin `react-leaflet` — el mismo criterio que el mapa
 * del admin. Se importa con `dynamic(..., { ssr: false })` porque Leaflet toca `window`.
 *
 * El pin **siempre** es arrastrable, también cuando lo puso el GPS: en escritorio la
 * ubicación se deduce de la IP y puede fallar por cuadras, y el cliente tiene que poder
 * corregirla.
 */

export type Punto = { lat: number; lng: number };

/** El icono por defecto de Leaflet apunta a rutas que el bundler no resuelve; se dibuja uno. */
const ICONO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">
  <path d="M16 0C7.2 0 0 7.2 0 16c0 11 16 26 16 26s16-15 16-26c0-8.8-7.2-16-16-16z" fill="#F26B1D"/>
  <circle cx="16" cy="16" r="6" fill="#FAF3E8"/>
</svg>`;

export default function MapaUbicacion({
  centro,
  pin,
  onMover,
}: {
  /** Dónde abrir cuando todavía no hay pin: la tienda. */
  centro: Punto;
  pin: Punto | null;
  onMover: (punto: Punto) => void;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const marcador = useRef<L.Marker | null>(null);

  const alMover = useRef(onMover);
  useEffect(() => {
    alMover.current = onMover;
  });

  useEffect(() => {
    if (!contenedor.current || mapa.current) return;

    let vivo = true;

    (async () => {
      const L = (await import("leaflet")).default;
      if (!vivo || !contenedor.current) return;

      const inicial = pin ?? centro;
      const m = L.map(contenedor.current).setView([inicial.lat, inicial.lng], pin ? 17 : 15);
      mapa.current = m;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(m);

      const icono = L.divIcon({
        html: ICONO_SVG,
        className: "",
        iconSize: [32, 42],
        iconAnchor: [16, 42],
      });

      const marca = L.marker([inicial.lat, inicial.lng], {
        draggable: true,
        icon: icono,
        // Sin esto, el pin no se puede mover con el dedo en un teléfono, que es el caso
        // principal de esta pantalla.
        autoPan: true,
      }).addTo(m);

      marca.on("dragend", () => {
        const { lat, lng } = marca.getLatLng();
        alMover.current({ lat, lng });
      });

      // Tocar el mapa también mueve el pin: arrastrar un marcador de 32 px con el pulgar es
      // incómodo, y tocar donde queda tu casa es el gesto natural.
      m.on("click", (evento) => {
        marca.setLatLng(evento.latlng);
        alMover.current({ lat: evento.latlng.lat, lng: evento.latlng.lng });
      });

      marcador.current = marca;

      // El contenedor suele empezar oculto dentro del paso del formulario; sin esto Leaflet
      // lo mide en 0 px y las tiles salen recortadas.
      setTimeout(() => m.invalidateSize(), 0);
    })();

    return () => {
      vivo = false;
      mapa.current?.remove();
      mapa.current = null;
      marcador.current = null;
    };
    // Solo al montar: el pin se sincroniza abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cuando el pin cambia desde fuera (el botón "usar mi ubicación"), se sigue al mapa.
  useEffect(() => {
    if (!pin || !mapa.current || !marcador.current) return;

    marcador.current.setLatLng([pin.lat, pin.lng]);
    mapa.current.setView([pin.lat, pin.lng], Math.max(mapa.current.getZoom(), 17));
  }, [pin]);

  return (
    <div
      ref={contenedor}
      className="h-64 w-full rounded-sm border border-crema-oscura"
      role="application"
      aria-label="Mapa para ubicar tu dirección"
    />
  );
}
