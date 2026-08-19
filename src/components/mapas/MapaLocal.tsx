"use client";

import dynamic from "next/dynamic";
import type { Punto } from "@/components/checkout/MapaUbicacion";

/**
 * La cáscara de cliente del mapa del local, igual que `MapaPedido`: existe solo para poder decir
 * `ssr: false`, que Next no admite dentro de un Server Component.
 *
 * El mapa de verdad está en `MapaLocalLeaflet`.
 */
const Leaflet = dynamic(() => import("./MapaLocalLeaflet"), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-md bg-crema-oscura" />,
});

export function MapaLocal({
  punto,
  onMover,
}: {
  /** Dónde está el local ahora, o el centro por defecto si nadie lo ha fijado. */
  punto: Punto;
  onMover: (punto: Punto) => void;
}) {
  return <Leaflet punto={punto} onMover={onMover} />;
}
