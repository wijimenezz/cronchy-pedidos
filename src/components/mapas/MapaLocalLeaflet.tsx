"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import {
  ANCLA_PIN_TIENDA,
  HTML_PIN_TIENDA,
  TAMANO_PIN_TIENDA,
} from "@/components/mapas/iconos";
import type { Punto } from "@/components/checkout/MapaUbicacion";

/**
 * El mapa de Ajustes: dónde queda el local, y nada más.
 *
 * Va aparte de `MapaUbicacion` aunque el comportamiento se parezca —un pin arrastrable— por lo mismo
 * que `MapaPedidoLeaflet`: aquel tiene un contrato escrito para el cliente del checkout, con su pin
 * naranja y su `autoPan` pensado para un dedo en un teléfono. Aquí el pin es la tienda, la pantalla
 * es de escritorio o tablet, y el propósito es otro. Son mapas con un propósito cada uno, no uno con
 * interruptores.
 *
 * **El pin se mueve por fuera además de arrastrándose**: el botón «Buscar mi dirección» le pasa un
 * punto nuevo, y por eso hay un efecto que lo sigue. Sin él, buscar movería el estado del formulario
 * pero no el marcador, que es justo lo que hay que ver antes de confirmar.
 */
export default function MapaLocalLeaflet({
  punto,
  onMover,
}: {
  punto: Punto;
  onMover: (punto: Punto) => void;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const marcador = useRef<L.Marker | null>(null);

  // El callback cambia en cada render del padre; si el efecto de montaje dependiera de él, el mapa
  // se desmontaría y volvería a montar constantemente.
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

      const m = L.map(contenedor.current).setView([punto.lat, punto.lng], 17);
      mapa.current = m;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(m);

      const marca = L.marker([punto.lat, punto.lng], {
        draggable: true,
        icon: L.divIcon({
          html: HTML_PIN_TIENDA,
          className: "",
          iconSize: TAMANO_PIN_TIENDA,
          iconAnchor: ANCLA_PIN_TIENDA,
        }),
        autoPan: true,
      }).addTo(m);

      marca.on("dragend", () => {
        const { lat, lng } = marca.getLatLng();
        alMover.current({ lat, lng });
      });

      marcador.current = marca;

      // Sin esto Leaflet mide el contenedor antes de que el layout se asiente y las tiles salen
      // recortadas — el mismo remate que `MapaPedidoLeaflet`.
      setTimeout(() => m.invalidateSize(), 0);
    })();

    return () => {
      vivo = false;
      mapa.current?.remove();
      mapa.current = null;
      marcador.current = null;
    };
    // Solo al montar: mover el pin después se sincroniza en el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * El pin sigue al punto cuando lo cambia el buscador. Se compara antes de mover para no pelearse
   * con el propio arrastre del usuario, que ya dejó el marcador donde toca.
   *
   * **Se aleja a zoom 16, no 17.** Un punto guardado es exacto y se abre de cerca; uno recién
   * buscado cae a cuadras del local (OSM tiene la calle, no el número — ver `geocodificar.ts`), así
   * que hay que ver el entorno para poder arrastrarlo. A zoom 17 la puerta del local quedaría fuera
   * de pantalla y el mapa parecería equivocado.
   */
  useEffect(() => {
    const marca = marcador.current;
    if (!marca || !mapa.current) return;

    const actual = marca.getLatLng();
    if (actual.lat === punto.lat && actual.lng === punto.lng) return;

    marca.setLatLng([punto.lat, punto.lng]);
    mapa.current.setView([punto.lat, punto.lng], 16);
  }, [punto]);

  return (
    <div
      ref={contenedor}
      className="h-64 w-full rounded-md border border-crema-oscura"
      role="application"
      aria-label="Mapa de la ubicación del local"
    />
  );
}
