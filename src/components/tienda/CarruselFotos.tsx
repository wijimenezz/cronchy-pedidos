"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { FotoConFoco } from "@/lib/imagenes";

/**
 * Las fotos de un producto en la ficha, con puntos y flechas para pasarlas.
 *
 * **Se instancia DOS veces**, una por cada layout de `ProductoFicha` —y las dos viven en el DOM
 * a la vez, ocultándose con `lg:hidden` / `hidden lg:flex`—. Por eso el "en qué foto voy" vive
 * aquí dentro y no en la ficha: cada contenedor tiene su propio scroll, así que un estado único
 * arriba describiría mal a uno de los dos.
 *
 * El movimiento lo hace el **scroll nativo con snap**, no un `transform` calculado a mano: así
 * el dedo sigue arrastrando la foto como en cualquier galería del teléfono, sin que haya que
 * escribir ni un manejador de gestos. Los botones no son otro mecanismo, solo empujan ese mismo
 * scroll.
 */
export function CarruselFotos({
  fotos: recibidas,
  nombre,
  className = "",
  conFlechas = false,
}: {
  fotos: FotoConFoco[];
  nombre: string;
  /**
   * Posición y tamaño de la caja de fotos: lo pone cada layout, que son muy distintos.
   *
   * **Tiene que incluir `relative` o `absolute`**, porque los puntos y las flechas van
   * posicionados contra esta caja. No se pone un `relative` fijo aquí dentro a propósito: la
   * rama móvil necesita `absolute`, y las dos clases juntas no se anulan por orden en el
   * atributo sino por el orden del CSS que genera Tailwind —donde `relative` va después—, así
   * que el `absolute` del layout perdería sin que nada lo avisara.
   */
  className?: string;
  /** Flechas de anterior/siguiente. Solo escritorio: en táctil ya se desliza con el dedo. */
  conFlechas?: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [indice, setIndice] = useState(0);

  // Sin fotos se pinta un solo hueco con el marcador de marca, y entonces no hay nada que pasar.
  const fotos: (FotoConFoco | null)[] = recibidas.length > 0 ? recibidas : [null];
  const hayVarias = fotos.length > 1;

  function alDesplazar() {
    const el = scrollerRef.current;
    // La instancia oculta mide 0 y la división daría NaN.
    if (!el || !el.clientWidth) return;
    // Con snap obligatorio y diapositivas de ancho completo, la posición ES el índice.
    setIndice(Math.round(el.scrollLeft / el.clientWidth));
  }

  function irA(destino: number) {
    const el = scrollerRef.current;
    if (!el || !el.clientWidth) return;
    el.scrollTo({ left: destino * el.clientWidth, behavior: "smooth" });
  }

  return (
    <div className={className}>
      <div
        ref={scrollerRef}
        onScroll={alDesplazar}
        aria-label={`Fotos de ${nombre}`}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto"
      >
        {fotos.map((foto, i) => (
          <div
            key={i}
            className="relative h-full w-full shrink-0 snap-center bg-crema-oscura"
          >
            {foto ? (
              /* **El 760 es el ALTO, no el ancho**, y es el único `sizes` del proyecto donde el
                 número no mide a lo ancho. En escritorio la columna de la foto es `w-[45%]` de un
                 `max-w-4xl` (~403 px) por hasta 760 px de alto, y con `object-cover` sobre una foto
                 cuadrada manda el lado grande: declarando los 403 reales, el navegador pedía 828 px
                 y los estiraba 1,84× en retina — que era justo el "se ve borroso".

                 En móvil sí es el ancho: la caja ocupa la columna entera (`100vw`, capada a 520). */
              <Image
                src={foto.url}
                alt={i === 0 ? nombre : `${nombre} — foto ${i + 1}`}
                fill
                sizes="(min-width: 1024px) 760px, 100vw"
                quality={82}
                /* Las dos cajas de la ficha recortan y por lados distintos —la del teléfono es
                   apaisada y la de escritorio vertical—, así que el encuadre elegido en el panel
                   sirve para las dos sin tener que decidir por pantalla. */
                style={{ objectPosition: foto.foco }}
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-cafe-tenue">
                <span className="font-titulo text-sm">Cronchy</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {hayVarias && conFlechas && (
        <>
          <Flecha
            hacia="anterior"
            onClick={() => irA(indice - 1)}
            deshabilitada={indice === 0}
          />
          <Flecha
            hacia="siguiente"
            onClick={() => irA(indice + 1)}
            deshabilitada={indice === fotos.length - 1}
          />
        </>
      )}

      {/* **Estos puntos dependen de que la ficha NO les robe el gesto**, y aquí llegó a estar
          escrito que en el teléfono eran solo un indicador porque el panel de información —un
          hermano posterior en absoluto— capturaba el toque con su espaciador transparente. Era
          cierto, y era peor de lo que decía: esa misma capa se comía también el deslizar, así que
          el carrusel no funcionaba de ninguna de las dos formas y solo se veía la portada. Se
          arregla con `pointer-events-none` en el **contenedor de scroll** de la ficha —no en el
          espaciador, que fue el primer intento y no bastaba— y `pointer-events-auto` de vuelta en
          el panel blanco. El porqué está entero allá.

          Lo que sigue valiendo de aquella nota es la advertencia: **no los subas con `z-20`**
          como el botón de cerrar. Los haría tocables por su cuenta, sí, pero también los dejaría
          flotando sobre el texto al subir la información. Que el panel los tape al scrollear es
          lo que se quiere. */}
      {hayVarias && (
        <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
          {fotos.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => irA(i)}
              aria-label={`Ver foto ${i + 1}`}
              aria-current={i === indice}
              /* La sombra no es decoración: estos puntos van sobre una foto cualquiera, y un
                 punto crema sobre helado de vainilla desaparece. */
              className={`size-2 rounded-full shadow-[0_0_2px_rgba(0,0,0,0.6)] transition-colors ${
                i === indice ? "bg-crema" : "bg-crema/50"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Se deshabilita en los extremos en vez de dar la vuelta, igual que `BotonMover` en el panel:
 * con tres fotos, saltar de la última a la primera se lee como un fallo, no como una función.
 */
function Flecha({
  hacia,
  onClick,
  deshabilitada,
}: {
  hacia: "anterior" | "siguiente";
  onClick: () => void;
  deshabilitada: boolean;
}) {
  const esAnterior = hacia === "anterior";
  const Icono = esAnterior ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitada}
      aria-label={esAnterior ? "Foto anterior" : "Foto siguiente"}
      className={`absolute top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-cafe/60 text-crema backdrop-blur-sm transition-opacity hover:bg-cafe/75 disabled:opacity-0 ${
        esAnterior ? "left-2" : "right-2"
      }`}
    >
      <Icono className="size-4" />
    </button>
  );
}
