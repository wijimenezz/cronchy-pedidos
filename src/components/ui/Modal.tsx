"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useFondoQuieto } from "@/lib/fondo-quieto";

/** Nadie emite: lo único que cambia entre el servidor y el navegador es *dónde* estamos, y eso
 *  pasa una sola vez. Vive fuera del componente porque `useSyncExternalStore` exige que la
 *  suscripción sea estable entre renders. */
const SIN_SUSCRIPCION = () => () => {};

/** `xl` existe para las vistas previas: un banner de categoría a 672 px se juzga mal, porque
 *  el título se ve la mitad de grande de lo que será en la carta. */
const ANCHO: Record<"sm" | "md" | "lg" | "xl", string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

/**
 * `true` solo una vez montados en el navegador.
 *
 * Es el guardia que necesita cualquier cosa portada a `document.body`: en el servidor no existe
 * `document`. Se hace con `useSyncExternalStore` y no con un `useState` en un efecto porque es la
 * vía que React da para que el render de hidratación coincida con el del servidor —ahí devuelve el
 * snapshot del servidor— en vez de provocar un render en cascada.
 *
 * Se exporta porque el menú lateral de la carta se porta por el mismo motivo (`Drawer.tsx`).
 */
export function useEnElNavegador() {
  return useSyncExternalStore(
    SIN_SUSCRIPCION,
    () => true,
    () => false,
  );
}

/**
 * El diálogo del proyecto.
 *
 * Nace de tres copias del mismo patrón —el calendario del checkout, el selector de día del panel
 * y el selector de tipo de pedido—, que además diferían en detalles que no debían diferir: una no
 * llevaba `role="dialog"` y ninguna cerraba con Escape.
 *
 * No usa `<dialog>` nativo: su `::backdrop` no acepta las clases de Tailwind y `showModal()` hay
 * que llamarlo desde un efecto, así que el montaje condicional acaba siendo más simple y más
 * fácil de leer que el imperativo.
 */
export function Modal({
  etiqueta,
  onCerrar,
  ancho = "sm",
  ajustado = false,
  children,
}: {
  /** Lo que anuncia el lector de pantalla al abrirse. */
  etiqueta: string;
  onCerrar: () => void;
  ancho?: keyof typeof ANCHO;
  /**
   * **El contenido trae su propio marco**: la caja se encoge a él y no pinta fondo ni ancho.
   *
   * Lo usa el anuncio de la carta, que es una imagen a pantalla casi completa: con la caja a un
   * ancho fijo y con fondo, por los lados asoma el crema de la tarjeta alrededor del arte.
   *
   * Es UNA prop y no un cuarto modal hecho a mano a propósito. `SelectorTipoPedido` se quedó fuera
   * de aquí por diferir en **dos** cosas que definen un modal —ser bloqueante y ser hoja inferior—,
   * y este caso no es ese: solo cambia el marco. Copiar el portal, el Escape y el candado de fondo
   * una vez más es exactamente lo que costó la carta sin scroll, que eran tres copias del mismo
   * guardar-y-reponer.
   */
  ajustado?: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function alPulsar(evento: KeyboardEvent) {
      if (evento.key === "Escape") onCerrar();
    }

    document.addEventListener("keydown", alPulsar);
    return () => document.removeEventListener("keydown", alPulsar);
  }, [onCerrar]);

  // El fondo no se desplaza mientras hay un modal abierto. Con los modales cortos apenas se nota;
  // con un documento largo —la política de datos son veinte pantallas en un teléfono— el dedo
  // arrastra la página de atrás en cuanto el contenido llega a su tope, y se pierde el sitio.
  //
  // Aquí decía que guardar el valor previo protegía de "dos modales anidados". Era al revés: cada
  // capa guardaba lo que había puesto la de abajo y se lo reponía al cerrarse, que es como el
  // bloqueo se volvía permanente. `useFondoQuieto` cuenta capas, y además saca el body del flujo
  // con `position: fixed` — `overflow: hidden` a secas lo ignora el gesto táctil en iOS.
  useFondoQuieto(true);

  // El diálogo se cuelga de `<body>`, no de donde se abre, y eso no es cosmética: el "Ver más"
  // de la política de datos vive **dentro del `<p>`** de la casilla del checkout, y un `<div>`
  // dentro de un `<p>` es HTML inválido. El parser cierra el párrafo por su cuenta, así que el
  // árbol que arma el navegador deja de ser el que mandó el servidor y React lanza un error de
  // hidratación por cada nodo del modal. Portarlo lo arregla de raíz y para todos los usos, en
  // vez de obligar a cada sitio a vigilar dónde puede montarlo.
  //
  // De regalo, `fixed` deja de depender de que ningún ancestro tenga `transform`, `filter` ni
  // `contain`, que lo anclarían a esa caja en vez de a la ventana.
  //
  // El guardia (ver `useEnElNavegador`) hoy no cuesta un frame visible: ningún modal se abre en el
  // primer render, todos nacen cerrados y los abre un clic. Está para que siga siendo cierto si
  // algún día alguno nace abierto.
  const enElNavegador = useEnElNavegador();

  if (!enElNavegador) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-cafe/40 p-4"
      onClick={onCerrar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={etiqueta}
        // Sin esto, un clic dentro del panel burbujea hasta el overlay y lo cierra.
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-full flex-col overflow-hidden rounded-lg shadow-modal ${
          ajustado ? "w-auto max-w-full" : `w-full bg-tarjeta ${ANCHO[ancho]}`
        }`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** La barra naranja de arriba. Opcional: el calendario del checkout usa la suya. */
export function ModalCabecera({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 bg-naranja px-4 py-3">
      <h2 className="font-titulo text-base font-semibold text-crema">{children}</h2>
    </div>
  );
}

export function ModalCerrar({ onCerrar }: { onCerrar: () => void }) {
  return (
    <button
      type="button"
      onClick={onCerrar}
      className="min-h-11 self-end px-5 pb-3 font-cuerpo text-sm font-bold uppercase text-naranja"
    >
      Cerrar
    </button>
  );
}
