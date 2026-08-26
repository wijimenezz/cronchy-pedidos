"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Heart } from "lucide-react";
import { ProductBadge } from "@/components/tienda/ProductBadge";
import { ProductoFicha } from "@/components/tienda/ProductoFicha";
import { pesos } from "@/lib/notificaciones/plantillas";
import { useCarrito } from "@/lib/carrito";
import { useTipoPedido } from "@/lib/tienda/tipo-pedido";
import { precargarProducto } from "@/lib/tienda/productos-cache";
import type { ProductoDeMenu } from "@/db/queries/menu";

export function ProductCard({ producto }: { producto: ProductoDeMenu }) {
  const agregarSimple = useCarrito((s) => s.agregarSimple);
  const tipoPedido = useTipoPedido();
  // Puramente visual: sin persistencia, no es una regla de dominio.
  const [favorito, setFavorito] = useState(false);
  const [fichaAbierta, setFichaAbierta] = useState(false);
  const foto = producto.imagenes[0];
  const agotado = !producto.disponible;

  /**
   * No se vende por el canal que el cliente eligió.
   *
   * Con `tipoPedido === null` —en el servidor, y el instante que va hasta la hidratación— esto
   * es `false` y la tarjeta se pinta normal. Es lo correcto por partida doble: mientras no se
   * sepa el canal no hay nada que desaconsejar, y así lo que aparece al hidratar es una etiqueta
   * sobre la foto (posicionada en absoluto) en vez de un hueco que mueva la rejilla.
   */
  const sinCanal =
    (tipoPedido === "domicilio" && !producto.disponibleDelivery) ||
    (tipoPedido === "recoger" && !producto.disponiblePickup);

  // Las dos razones para no poder pedirlo se tratan igual en todo salvo en la etiqueta: son
  // motivos distintos y el cliente merece saber cuál de los dos es.
  const bloqueado = agotado || sinCanal;
  const raizRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = raizRef.current;
    // No tiene sentido descargar la ficha de algo que no se puede pedir.
    if (!el || !producto.tieneModificadores || bloqueado) return;

    // Precarga solo cuando la tarjeta entra en pantalla, no todas al montar:
    // así el tap se sigue sintiendo instantáneo sin disparar un fetch por
    // cada producto del catálogo apenas se abre el menú.
    const observer = new IntersectionObserver(([entrada]) => {
      if (entrada.isIntersecting) {
        precargarProducto(producto.id).catch(() => {});
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [producto.id, producto.tieneModificadores, bloqueado]);

  function alTocarTarjeta() {
    if (bloqueado) return;
    if (producto.tieneModificadores) {
      setFichaAbierta(true);
    } else {
      agregarSimple({
        id: producto.id,
        nombre: producto.nombre,
        precioBase: producto.precioBase,
        // Viajan al carrito para poder sacar la línea si el cliente cambia de canal.
        disponibleDelivery: producto.disponibleDelivery,
        disponiblePickup: producto.disponiblePickup,
      });
    }
  }

  return (
    <div
      ref={raizRef}
      role={producto.tieneModificadores ? "button" : undefined}
      tabIndex={producto.tieneModificadores ? 0 : undefined}
      onClick={producto.tieneModificadores ? alTocarTarjeta : undefined}
      onKeyDown={(e) => {
        if (
          producto.tieneModificadores &&
          (e.key === "Enter" || e.key === " ")
        ) {
          e.preventDefault();
          alTocarTarjeta();
        }
      }}
      className={`overflow-hidden rounded-md bg-tarjeta shadow-tarjeta ${bloqueado ? "opacity-75" : ""} ${
        producto.tieneModificadores && !bloqueado ? "cursor-pointer" : ""
      }`}
    >
      <div className="relative aspect-square bg-crema-oscura">
        {foto ? (
          /* La tarjeta mide ~239 px CSS en los DOS layouts, y eso no se ve mirando el
             `grid`: en móvil la columna pública está capada a `max-w-[520px]`
             (`MarcoPublico`), así que a partir de ese ancho las dos columnas dejan de
             crecer; y desde `lg` son cuatro dentro de `max-w-contenido` (1080 − 64 de
             `px-8`, menos tres huecos de 20) → (1016 − 60) / 4 ≈ 239. El mismo número por
             dos caminos distintos.

             Por eso el `50vw` que había solo era cierto por debajo de 520 px. En escritorio
             declaraba 640 px CSS para una tarjeta de 239 y el navegador se traía el archivo
             grande, que ni se nota ni se agradece con datos móviles. */
          <Image
            src={foto}
            alt={producto.nombre}
            fill
            sizes="(min-width: 520px) 240px, 50vw"
            quality={82}
            className={`object-cover ${bloqueado ? "grayscale" : ""}`}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-cafe-tenue">
            <span className="font-titulo text-sm">Cronchy</span>
          </div>
        )}

        {/* Una sola etiqueta, y el orden no es arbitrario: "Agotado" gana porque es el hecho más
            básico —no hay ninguno, da igual el canal—. Solo si lo hay se explica que este canal
            no lo lleva, que es lo accionable: el cliente puede cambiar de canal y pedirlo. */}
        {(bloqueado || producto.recomendado) && (
          <div className="absolute top-2 left-2 z-10 flex gap-1">
            {agotado ? (
              <ProductBadge variant="agotado">Agotado</ProductBadge>
            ) : sinCanal ? (
              <ProductBadge variant="agotado">
                {tipoPedido === "domicilio"
                  ? "Solo para recoger"
                  : "Solo a domicilio"}
              </ProductBadge>
            ) : (
              <ProductBadge variant="recomendado">Recomendado</ProductBadge>
            )}
          </div>
        )}

        <button
          type="button"
          aria-label={favorito ? "Quitar de favoritos" : "Agregar a favoritos"}
          aria-pressed={favorito}
          onClick={(e) => {
            e.stopPropagation();
            setFavorito((f) => !f);
          }}
          className="absolute top-2 right-2 z-10 flex size-8 items-center justify-center rounded-full bg-tarjeta/70 backdrop-blur-sm"
        >
          <Heart
            className={`size-4 ${favorito ? "fill-naranja text-naranja" : "text-cafe"}`}
          />
        </button>
      </div>

      <div className="flex flex-col gap-1.5 p-3">
        <h3 className="font-titulo text-lg font-semibold text-cafe">
          {producto.nombre}
        </h3>
        {/* Altura reservada aunque no haya descripción: hoy ningún producto la
            tiene, pero cuando se cargue solo para algunos, el grid no debe
            desalinearse entre tarjetas con y sin texto. */}
        <p className="line-clamp-2 min-h-[34px] text-[13px] text-cafe-suave">
          {producto.descripcion || " "}
        </p>
        {/* En columna en el teléfono y en fila desde `sm`, y no por gusto: en una tarjeta de
            dos columnas a 390 px la fila mide 142 px y el precio más el botón necesitan 167,
            así que el botón se salía y el `overflow-hidden` de la tarjeta lo recortaba —sin
            barra horizontal que lo delatara—. Achicarlo no alcanza: tendría que bajar de 98 px
            a 72, y a ~49 en la tarjeta que dice "desde $4.000".

            `sm` y no un valor a medida: con dos columnas la fila mide `ancho/2 − 46`, así que
            la versión en línea deja de caber por debajo de ~426 px (~472 con un "desde"). A
            640 px sobran 107 px, o sea que no queda ningún ancho intermedio donde se recorte.

            Y `flex-wrap` como red: desde `lg` la rejilla pasa a cuatro columnas y la tarjeta
            vuelve a estrecharse —"desde $4.000" cabe ahí por 2 px—, así que un precio un poco
            más largo volvería a recortarse. Con la envoltura, el botón se va a su propia línea
            en vez de salirse. Hoy no se activa en ningún ancho: es para el día que suba un
            precio. */}
        <div className="mt-1 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          {/* "desde" en pequeño y tenue: el número sigue siendo lo que se lee de un vistazo,
              y la palabra solo avisa de que el precio final depende de lo que se elija.

              El número es `precioDesde` y NO `precioBase`: un producto cuyos tamaños llevan el
              precio entero tiene el base en 0, y pintar el base decía "desde $0". */}
          {/* Centrado solo en el teléfono, donde el precio ocupa una línea entera encima de un
              botón que también va a lo ancho: alineado a la izquierda quedaba descolgado. Desde
              `sm` vuelve a la izquierda, que es donde tiene que estar cuando comparte línea con
              el botón. */}
          <span className="text-center font-cuerpo text-base font-bold text-naranja sm:text-left">
            {producto.precioDesde !== null && (
              <span className="mr-1 text-xs font-semibold text-cafe-suave">desde</span>
            )}
            {pesos(producto.precioDesde ?? producto.precioBase)}
          </span>
          <button
            type="button"
            disabled={bloqueado}
            onClick={(e) => {
              e.stopPropagation();
              alTocarTarjeta();
            }}
            className="shrink-0 rounded-full bg-naranja px-4 py-1.5 font-cuerpo text-sm font-bold text-crema transition-colors hover:bg-naranja-osc disabled:pointer-events-none disabled:opacity-50"
          >
            Agregar +
          </button>
        </div>
      </div>

      {fichaAbierta && (
        <ProductoFicha
          productId={producto.id}
          onClose={() => setFichaAbierta(false)}
        />
      )}
    </div>
  );
}
