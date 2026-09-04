"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Drawer } from "@base-ui/react/drawer";
import type { EstadoDeTienda, RespuestaEstado } from "@/lib/tienda/estado";
import { HojaHorarios } from "@/components/tienda/HojaHorarios";

/**
 * El personaje del header que dice si la tienda está abierta, y abre el horario al tocarlo.
 *
 * **El estado NO viene con la página, y esa es la razón de ser de este componente.** La carta es
 * SSG + ISR con `revalidate = 60`, más el Router Cache y la pestaña que el cliente dejó abierta:
 * un "Cerrado" renderizado en el servidor se quedaría pegado en el HTML y seguiría ahí a las tres
 * de la tarde. Se pide en vivo a `/api/tienda/estado`, que es `force-dynamic` y `no-store`.
 *
 * Por lo mismo **aquí nunca se llama a `new Date()`**: si el navegador calculara el estado, un
 * teléfono con la hora mal puesta diría que estamos cerrados, y en el primer render habría un
 * valor distinto al del servidor. Mientras la respuesta no llega se pinta el personaje solo, sin
 * letrero ni frase — no hay estado que equivocar, así que no hay parpadeo que arreglar.
 */

/** Dónde vive el personaje. Una sola constante: hoy los tres estados usan el mismo dibujo. */
const IMAGEN = "/personajes/cup-churro.png";

/**
 * El alto manda y el ancho sale solo, como en `SelectorTipoPedido`.
 *
 * Estas medidas son la **relación** del archivo (848×1236), no píxeles de pantalla: `next/image`
 * las usa para reservar el hueco —sin salto al cargar— y para pedirle al optimizador un tamaño
 * acorde. Declarar 40×40 sobre un dibujo vertical le habría dejado 27 px útiles de los 40, o sea
 * un personaje pequeño en una caja con aire a los lados.
 */
const ANCHO = 28;
const ALTO = 40;

export function EstadoTienda({
  imagenPorEstado,
}: {
  /**
   * Un dibujo distinto por estado, cuando los haya.
   *
   * Declarado y **sin usar todavía a propósito**: el encargo pide dejarlo preparado, no
   * inventarse ilustraciones que no existen. El día que lleguen, esto es lo único que hay que
   * pasarle desde el header.
   */
  imagenPorEstado?: Partial<Record<EstadoDeTienda, string>>;
}) {
  const [datos, setDatos] = useState<RespuestaEstado | null>(null);
  const [abierta, setAbierta] = useState(false);

  const consultar = useCallback(async () => {
    try {
      const respuesta = await fetch("/api/tienda/estado", { cache: "no-store" });
      if (!respuesta.ok) return;
      setDatos((await respuesta.json()) as RespuestaEstado);
    } catch {
      // Sin conexión el personaje se queda mudo, que es exactamente lo que se quiere: un letrero
      // que se inventa "Abierto" cuando no pudo preguntar es peor que uno que no dice nada.
    }
  }, []);

  // Solo se pregunta en móvil. El `lg:hidden` del header esconde el personaje en escritorio,
  // pero esconder no es no montar: sin esta guardia, cada visita de escritorio pagaría una
  // llamada al endpoint por un letrero que nadie va a ver.
  const esMovil = useEsMovil();

  useVolverAPreguntar(consultar, esMovil);

  const imagen = (datos && imagenPorEstado?.[datos.estado]) ?? IMAGEN;

  return (
    <Drawer.Root open={abierta} onOpenChange={setAbierta} modal swipeDirection="down">
      <Drawer.Trigger
        // El foco vuelve solo a este botón al cerrar: lo hace Base UI, no hay que devolverlo a mano.
        aria-haspopup="dialog"
        aria-label={
          datos
            ? `${datos.badge}. ${datos.titulo}. Ver los horarios de la tienda`
            : "Ver los horarios de la tienda"
        }
        className="flex items-center gap-1.5 rounded-full p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-crema"
      >
        <Image
          src={imagen}
          alt=""
          width={ANCHO}
          height={ALTO}
          className="h-10 w-auto shrink-0 object-contain"
        />
        {/* El letrero solo existe cuando hay respuesta. Reservarle sitio en "cargando" movería el
            header al llegar los datos; sin reservarlo, lo que aparece es un chip a la derecha del
            personaje, fuera del camino del selector, que ya está centrado por la rejilla. */}
        {datos && (
          <span
            className={`rounded-full px-2 py-0.5 font-cuerpo text-[11px] font-bold ${
              datos.estado === "abierta" ? "bg-exito text-crema" : "bg-agotado text-crema"
            }`}
          >
            {datos.badge}
          </span>
        )}
      </Drawer.Trigger>

      {datos && <HojaHorarios datos={datos} onCerrar={() => setAbierta(false)} />}
    </Drawer.Root>
  );
}

/**
 * ¿Estamos por debajo de `lg`, que es donde vive el personaje?
 *
 * Arranca en `false` a propósito: es lo que el servidor renderiza, así que el primer render del
 * navegador coincide y no hay discrepancia de hidratación. El efecto —que solo corre en el
 * navegador— lo corrige enseguida. El `change` está escuchado porque el escritorio que encoge la
 * ventana por debajo de 1024 sí tiene que empezar a preguntar.
 */
function useEsMovil(): boolean {
  const [esMovil, setEsMovil] = useState(false);

  useEffect(() => {
    // El mismo 1024 de Tailwind, escrito como su `lg:` para que muevan juntos.
    const consulta = window.matchMedia("(min-width: 1024px)");
    const aplicar = () => setEsMovil(!consulta.matches);

    aplicar();
    consulta.addEventListener("change", aplicar);
    return () => consulta.removeEventListener("change", aplicar);
  }, []);

  return esMovil;
}

/** Tope entre consultas, el mismo que `RefrescarAlVolver`: alternar ventanas no dispara una por alt-tab. */
const CADA_MS = 60_000;

/**
 * Pregunta al montar y cada vez que el cliente vuelve a la pestaña.
 *
 * **No es polling** (CLAUDE.md lo descarta en la tienda pública): mientras nadie mira, no sale una
 * sola petición. Pero hace falta, porque el caso real es la carta abierta toda la tarde en el
 * móvil: el `router.refresh()` de `RefrescarAlVolver` rehace los componentes de servidor y no
 * toca un `fetch` de cliente, así que sin esto el letrero se quedaría en el de la mañana.
 */
function useVolverAPreguntar(consultar: () => void, activo: boolean) {
  const ultimo = useRef(0);

  useEffect(() => {
    if (!activo) return;

    ultimo.current = Date.now();
    consultar();

    function alVolver() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - ultimo.current < CADA_MS) return;

      ultimo.current = Date.now();
      consultar();
    }

    // Los dos eventos por lo mismo que en `RefrescarAlVolver`: `visibilitychange` cubre cambiar de
    // pestaña y desbloquear el teléfono, y `focus` cambiar de ventana en escritorio.
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);

    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, [consultar, activo]);
}
