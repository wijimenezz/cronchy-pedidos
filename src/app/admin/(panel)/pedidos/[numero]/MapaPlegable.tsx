"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { Punto } from "@/components/checkout/MapaUbicacion";
import { MapaPedido } from "@/components/pedido/MapaPedido";

/**
 * El mapa del pin, plegado hasta que alguien lo pida.
 *
 * Son 176 px en la mitad de la columna de entrega, y lo que de verdad se pulsa para salir a
 * repartir es el enlace de Google Maps —que queda fuera de esto, siempre visible—. Plegarlo es
 * lo que deja el resto del pedido por encima del pliegue en la tablet del mostrador.
 *
 * **Monta el mapa al abrir en vez de esconderlo con CSS, y eso no es una optimización: es la
 * única forma que funciona.** `MapaPedidoLeaflet` llama `invalidateSize()` una sola vez al
 * inicializarse; dentro de un contenedor con `display: none` mediría 0×0 y las tiles saldrían
 * recortadas al desplegarlo. De regalo, Leaflet y las tiles de OSM no se descargan en los
 * pedidos cuyo mapa nadie abre.
 *
 * Va aquí y no en `MapaPedido`: ese lo comparte el seguimiento público del cliente, donde el
 * mapa es media pantalla y tiene que verse de entrada.
 */
export function MapaPlegable({ punto }: { punto: Punto }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="my-2 flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setAbierto((estaba) => !estaba)}
        aria-expanded={abierto}
        className="flex min-h-11 items-center gap-1.5 self-start font-cuerpo text-sm font-bold text-cafe-suave transition-colors hover:text-cafe focus:outline-none focus-visible:ring-2 focus-visible:ring-naranja"
      >
        {abierto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        {abierto ? "Ocultar mapa" : "Ver mapa del pin"}
      </button>

      {abierto && <MapaPedido punto={punto} />}
    </div>
  );
}
