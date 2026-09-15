"use client";

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useTipoPedido } from "@/lib/tienda/tipo-pedido";
import { CLAVE_BANNER_VISTO, debeMostrarBanner } from "@/lib/tienda/banner-visto";
import type { BannerPublicado } from "@/db/queries/banners";

// A nivel de módulo para que su identidad no cambie entre renders: si no, React se resuscribiría
// en cada uno. Nadie emite — lo guardado solo cambia cuando este mismo componente lo escribe, y
// entonces ya se está re-renderizando por su propio estado.
const SIN_SUSCRIPCION = () => () => {};
const enServidor = () => null;

function leerVisto(): string | null {
  // Un navegador con el almacenamiento bloqueado (ventana privada, ajustes estrictos) lanza al
  // leer. Ahí se muestra el banner: enseñarlo de más es mucho menos malo que tragárselo.
  try {
    return localStorage.getItem(CLAVE_BANNER_VISTO);
  } catch {
    return null;
  }
}

/**
 * EL ANUNCIO QUE SE ABRE AL ENTRAR A LA CARTA.
 *
 * Dos reglas lo gobiernan, y ninguna vive aquí:
 *
 * - **Una vez por banner**, que decide `debeMostrarBanner` (puro y probado). Lo que se recuerda es
 *   el **id**, así que publicar otro lo vuelve a mostrar solo.
 * - **Después del «¿Domicilio o Recoger?»**, que no necesita coordinarse con nada: basta con no
 *   montarlo mientras `useTipoPedido()` sea `null`. Ese hook devuelve `null` exactamente mientras
 *   el modal bloqueante está en pantalla —también cuando la elección caduca a las 6 horas—, así
 *   que este aparece solo cuando el otro ya se respondió. Nadie ve dos modales encimados.
 *
 * **No lleva a ningún sitio al tocarlo, y es una decisión**: es un aviso, no un botón hacia otra
 * pantalla. Lo que promete lo dice la imagen, y la imagen la diseña el negocio.
 *
 * Se monta en la carta y **no en el layout**: ahí arrastraría al checkout y al seguimiento, y un
 * anuncio encima de quien está pagando es justo lo que no se quiere.
 */
export function AnuncioBanner({ banner }: { banner: BannerPublicado | null }) {
  const tipo = useTipoPedido();
  const [cerrado, setCerrado] = useState(false);

  // `useSyncExternalStore` y no un efecto: leer `localStorage` en el cuerpo del render rompería la
  // hidratación —en el servidor no existe—, y un `setState` dentro de un efecto provoca renders en
  // cascada. Es el mismo mecanismo que `useEnElNavegador` y `useTipoPedido`.
  const visto = useSyncExternalStore(SIN_SUSCRIPCION, leerVisto, enServidor);

  if (!banner || cerrado || tipo === null) return null;
  if (!debeMostrarBanner(banner.id, visto)) return null;

  function cerrar() {
    // Se marca al CERRAR y no al abrir: si se guardara al mostrarlo, un cliente al que se le cae
    // la pestaña antes de mirarlo se quedaría sin verlo nunca.
    try {
      if (banner) localStorage.setItem(CLAVE_BANNER_VISTO, banner.id);
    } catch {
      // Almacenamiento bloqueado: se cierra igual y volverá a salir. Es el mal menor.
    }
    setCerrado(true);
  }

  return (
    <Modal etiqueta="Anuncio de Cronchy" onCerrar={cerrar} ajustado>
      {/*
        TODO EL BANNER ES UN BOTÓN, y por eso la X de dentro no lo es.

        Tocar la imagen cierra, igual que la X: con el anuncio ocupando media pantalla, dejar como
        única salida un blanco de 44 px en una esquina es pedirle puntería a quien solo quiere
        seguir mirando la carta. Un `<button>` dentro de otro es HTML inválido, y además dos
        controles que hacen exactamente lo mismo se le anuncian dos veces a un lector de pantalla:
        aquí hay un control, una etiqueta y dos maneras de acertarle.

        **Quien da la forma es la imagen, no la caja**, y por eso lleva `width`/`height` reales en
        vez de `fill`. Con `fill` la imagen es absoluta: no ocupa sitio, así que el botón se quedaba
        en 0x0 y no se veía nada. Con las medidas de verdad, el navegador la escala respetando su
        proporción dentro de los dos topes, el botón se ajusta a ella (`w-fit`) y la tarjeta al
        botón. Resultado: ni marco ni recorte, sea cual sea el formato del arte.

        Los topes van en unidades de ventana y no en `%`: un `max-w-full` dentro de una caja que a
        su vez se ajusta al contenido es circular, y el navegador lo resuelve como le parece.
      */}
      <button
        type="button"
        onClick={cerrar}
        aria-label="Cerrar anuncio"
        className="relative block w-fit cursor-pointer"
      >
        <Image
          src={banner.imagenUrl}
          alt=""
          width={banner.ancho}
          height={banner.alto}
          priority
          // La tarjeta nunca pasa del ancho de la ventana, y en escritorio se queda en el tope del
          // diálogo. Declarar más sería pedirle al optimizador una variante que nadie ve.
          sizes="(min-width: 640px) 512px, 100vw"
          // El `2rem` descuenta el `p-4` del velo. `object-contain` es el seguro ante el redondeo
          // a píxeles: la caja ya tiene la proporción exacta, pero ahí `cover` recortaría una línea.
          className="h-auto max-h-[85dvh] w-auto max-w-[min(calc(100vw-2rem),32rem)] object-contain"
        />

        <span
          aria-hidden
          // Encima de la imagen y con su propio fondo: el arte puede ser claro u oscuro, y una X
          // suelta se pierde justo en el que sea del color equivocado. Sigue haciendo falta aunque
          // todo cierre — es lo que le dice al cliente que esto se cierra.
          className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-full bg-cafe/60 text-crema backdrop-blur-sm"
        >
          <X className="size-5" />
        </span>
      </button>
    </Modal>
  );
}
