"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Punto } from "@/components/checkout/MapaUbicacion";

/**
 * El mapa del seguimiento: dónde va a llegar el pedido, y nada más.
 *
 * Va aparte de `MapaUbicacion` y no como una prop suya porque aquel tiene un contrato
 * explícito —"el pin **siempre** es arrastrable"— que aquí sería justo lo contrario: el
 * pedido ya está hecho y su punto congelado, así que dejar mover el pin insinuaría que
 * todavía se puede corregir la dirección. Son dos mapas con dos propósitos, no uno con un
 * interruptor.
 *
 * Leaflet sobre tiles de OpenStreetMap, sin `react-leaflet`, e importado con
 * `dynamic(..., { ssr: false })` como el resto: toca `window`.
 */

/** El mismo pin naranja del checkout, para que el cliente reconozca su punto. */
const ICONO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">
  <path d="M16 0C7.2 0 0 7.2 0 16c0 11 16 26 16 26s16-15 16-26c0-8.8-7.2-16-16-16z" fill="#F26B1D"/>
  <circle cx="16" cy="16" r="6" fill="#FAF3E8"/>
</svg>`;

export default function MapaPedido({ punto }: { punto: Punto }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!contenedor.current || mapa.current) return;

    let vivo = true;

    (async () => {
      const L = (await import("leaflet")).default;
      if (!vivo || !contenedor.current) return;

      const m = L.map(contenedor.current, {
        // Todo apagado: esto es una ilustración, no un control. En un móvil, un mapa que
        // captura el gesto de scroll deja al cliente atrapado a mitad de la pantalla.
        zoomControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        keyboard: false,
      }).setView([punto.lat, punto.lng], 16);
      mapa.current = m;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(m);

      L.marker([punto.lat, punto.lng], {
        icon: L.divIcon({ html: ICONO_SVG, className: "", iconSize: [32, 42], iconAnchor: [16, 42] }),
        keyboard: false,
      }).addTo(m);

      // Sin esto Leaflet mide el contenedor antes de que el layout se asiente y las tiles
      // salen recortadas.
      setTimeout(() => m.invalidateSize(), 0);
    })();

    return () => {
      vivo = false;
      mapa.current?.remove();
      mapa.current = null;
    };
  }, [punto.lat, punto.lng]);

  return (
    <div
      ref={contenedor}
      className="h-44 w-full overflow-hidden rounded-md"
      role="img"
      aria-label="Mapa con el punto de entrega de tu pedido"
    />
  );
}
