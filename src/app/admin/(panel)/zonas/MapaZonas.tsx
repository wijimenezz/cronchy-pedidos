"use client";

import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import { useEffect, useRef } from "react";
import type { ZonaDelPanel } from "@/db/queries/zonas";

/**
 * El mapa donde se dibujan las zonas. Leaflet + tiles de OpenStreetMap, Geoman para dibujar
 * y arrastrar vértices (CLAUDE.md: nada de las APIs de Google).
 *
 * Se usa Leaflet a pelo y no `react-leaflet`: Geoman es un plugin de Leaflet, así que la
 * capa intermedia no ayuda donde está la dificultad —los eventos de dibujo— y sí sería una
 * dependencia más que mantener alineada con React 19.
 *
 * Todo el ciclo de vida vive en un `useEffect` con `[]`: Leaflet manda sobre el DOM del
 * contenedor y React no debe volver a tocarlo. Los cambios posteriores (zonas nuevas,
 * selección) se aplican imperativamente en efectos aparte.
 *
 * El componente se importa con `dynamic(..., { ssr: false })` desde la página: Leaflet toca
 * `window` en el import y revienta en el render del servidor.
 */

export const COLORES = [
  "#F26B1D",
  "#4A7C3F",
  "#2E6F9E",
  "#B4478F",
  "#D9A404",
  "#8B5E3C",
] as const;

export type Punto = { lat: number; lng: number };

type Props = {
  zonas: ZonaDelPanel[];
  ubicacionTienda: Punto;
  /** Cuál está seleccionada; su polígono es el editable. */
  seleccionada: string | null;
  onSeleccionar: (id: string | null) => void;
  /** Dibujó una figura nueva o movió los vértices de la seleccionada. */
  onGeometria: (geojson: string) => void;
  onUbicacionTienda: (punto: Punto) => void;
  /** Activo mientras el admin está creando una zona que aún no existe en la base. */
  dibujando: boolean;
};

export default function MapaZonas({
  zonas,
  ubicacionTienda,
  seleccionada,
  onSeleccionar,
  onGeometria,
  onUbicacionTienda,
  dibujando,
}: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capas = useRef<Map<string, L.Polygon>>(new Map());
  const borrador = useRef<L.Polygon | null>(null);
  const pinTienda = useRef<L.Marker | null>(null);

  // Los callbacks cambian en cada render del padre; si los efectos dependieran de ellos,
  // el mapa se desmontaría y volvería a montar constantemente.
  const cb = useRef({ onSeleccionar, onGeometria, onUbicacionTienda });
  useEffect(() => {
    cb.current = { onSeleccionar, onGeometria, onUbicacionTienda };
  });

  useEffect(() => {
    if (!contenedor.current || mapa.current) return;

    let vivo = true;

    (async () => {
      const L = (await import("leaflet")).default;
      await import("@geoman-io/leaflet-geoman-free");
      if (!vivo || !contenedor.current) return;

      const m = L.map(contenedor.current).setView(
        [ubicacionTienda.lat, ubicacionTienda.lng],
        14,
      );
      mapa.current = m;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(m);

      m.pm.setLang("es");
      m.pm.addControls({
        position: "topright",
        drawPolygon: true,
        editMode: true,
        dragMode: false,
        cutPolygon: false,
        removalMode: false,
        drawMarker: false,
        drawCircle: false,
        drawCircleMarker: false,
        drawPolyline: false,
        drawRectangle: true,
        drawText: false,
        rotateMode: false,
      });

      // Figura recién dibujada: se queda como borrador hasta que el formulario la guarde.
      m.on("pm:create", (evento) => {
        const capa = evento.layer as L.Polygon;
        borrador.current?.remove();
        borrador.current = capa;
        cb.current.onGeometria(JSON.stringify(capa.toGeoJSON().geometry));

        capa.on("pm:edit", () =>
          cb.current.onGeometria(JSON.stringify(capa.toGeoJSON().geometry)),
        );
      });

      // El pin de la tienda. Arrastrable porque la dirección de un local no se acierta a la
      // primera desde un mapa, y de aquí sale el centro del mapa del checkout (regla 14).
      const pin = L.marker([ubicacionTienda.lat, ubicacionTienda.lng], {
        draggable: true,
        title: "Tu tienda — arrástrala hasta la puerta del local",
      }).addTo(m);
      pin.on("dragend", () => {
        const { lat, lng } = pin.getLatLng();
        cb.current.onUbicacionTienda({ lat, lng });
      });
      pinTienda.current = pin;
    })();

    // Se captura la referencia al Map ahora, no en el cleanup: para entonces `capas.current`
    // podría apuntar a otro objeto y estaríamos limpiando el equivocado.
    const registro = capas.current;

    return () => {
      vivo = false;
      mapa.current?.remove();
      mapa.current = null;
      registro.clear();
      borrador.current = null;
    };
    // Solo al montar: el resto se sincroniza abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Repinta los polígonos guardados cada vez que cambian.
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;

    let cancelado = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelado || !mapa.current) return;

      for (const capa of capas.current.values()) capa.remove();
      capas.current.clear();

      for (const zona of zonas) {
        if (!zona.poligono) continue;

        const geometria = JSON.parse(zona.poligono) as { coordinates: number[][][] };
        // GeoJSON viene [lng, lat]; Leaflet quiere [lat, lng]. Invertir mal aquí pone
        // Fusagasugá en Somalia, y el error es silencioso.
        const anillos = geometria.coordinates.map((anillo) =>
          anillo.map(([lng, lat]) => [lat, lng] as [number, number]),
        );

        const color = zona.color ?? COLORES[0];
        const capa = L.polygon(anillos, {
          color,
          weight: zona.id === seleccionada ? 4 : 2,
          fillOpacity: zona.activa ? 0.25 : 0.08,
          dashArray: zona.activa ? undefined : "6 6",
        }).addTo(m);

        capa.bindTooltip(zona.nombre, { direction: "center" });
        capa.on("click", () => cb.current.onSeleccionar(zona.id));

        // Solo la seleccionada es editable: con todas activas a la vez, arrastrar el mapa
        // termina moviendo vértices sin querer.
        if (zona.id === seleccionada) {
          capa.pm.enable({ allowSelfIntersection: false });
          capa.on("pm:edit", () =>
            cb.current.onGeometria(JSON.stringify(capa.toGeoJSON().geometry)),
          );
        } else {
          capa.pm.disable();
        }

        capas.current.set(zona.id, capa);
      }

      // Al abrir, encuadra lo que ya está dibujado en vez de dejar al admin buscándolo.
      if (capas.current.size > 0 && !seleccionada) {
        const grupo = L.featureGroup([...capas.current.values()]);
        m.fitBounds(grupo.getBounds(), { padding: [24, 24] });
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [zonas, seleccionada]);

  // El borrador solo tiene sentido mientras se está creando.
  useEffect(() => {
    if (!dibujando) {
      borrador.current?.remove();
      borrador.current = null;
    }
  }, [dibujando]);

  return (
    <div
      ref={contenedor}
      className="h-[60vh] min-h-[320px] w-full rounded-md border border-crema-oscura"
      // Leaflet mide el contenedor al inicializarse; sin alto explícito nace de 0 px y no
      // se ve nada.
      role="application"
      aria-label="Mapa de zonas de cobertura"
    />
  );
}
