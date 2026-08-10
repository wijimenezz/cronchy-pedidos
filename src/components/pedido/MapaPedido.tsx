"use client";

import dynamic from "next/dynamic";
import type { Punto } from "@/components/checkout/MapaUbicacion";

/**
 * La cáscara de cliente del mapa del seguimiento.
 *
 * Existe solo para poder decir `ssr: false`, que Next no admite dentro de un Server Component
 * — y la página del seguimiento lo es, porque lee el pedido de la base. En el checkout esto
 * no hacía falta porque quien carga el mapa (`SelectorUbicacion`) ya era de cliente.
 *
 * El mapa de verdad está en `MapaPedidoLeaflet`.
 */
const Leaflet = dynamic(() => import("./MapaPedidoLeaflet"), {
  ssr: false,
  loading: () => <div className="h-44 w-full animate-pulse rounded-md bg-crema-oscura" />,
});

export function MapaPedido({ punto }: { punto: Punto }) {
  return <Leaflet punto={punto} />;
}
