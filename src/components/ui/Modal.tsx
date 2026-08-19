"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

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
  children,
}: {
  /** Lo que anuncia el lector de pantalla al abrirse. */
  etiqueta: string;
  onCerrar: () => void;
  ancho?: keyof typeof ANCHO;
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
  // Se guarda el valor previo en vez de asumir `""`: dos modales anidados, o cualquiera que algún
  // día toque el body, dejarían el scroll bloqueado para siempre al cerrar el de arriba.
  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, []);

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
  // El guardia es porque en el servidor no existe `document`. Hoy ningún modal se abre en el
  // primer render —todos nacen cerrados y los abre un clic—, así que no cuesta un frame visible;
  // está para que siga siendo cierto si algún día alguno nace abierto. Se hace con
  // `useSyncExternalStore` y no con un `useState` en un efecto porque es la vía que React da para
  // que el render de hidratación coincida con el del servidor —ahí devuelve el snapshot del
  // servidor— en vez de provocar un render en cascada.
  const enElNavegador = useSyncExternalStore(
    SIN_SUSCRIPCION,
    () => true,
    () => false,
  );

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
        className={`flex max-h-full w-full flex-col overflow-hidden rounded-lg bg-tarjeta shadow-modal ${ANCHO[ancho]}`}
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
