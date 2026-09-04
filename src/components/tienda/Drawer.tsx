"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { MessageCircle, Star, X } from "lucide-react";
import { linkContactoWhatsapp } from "@/lib/notificaciones/transporte";
import { useEnElNavegador } from "@/components/ui/Modal";
import { useCerrarConAtras } from "@/lib/tienda/cerrar-con-atras";

type Tienda = {
  nombre: string;
  telefono: string | null;
  whatsappUrl: string | null;
  direccion: string | null;
  googleResenasUrl: string | null;
};

export function Drawer({ tienda }: { tienda: Tienda }) {
  const [abierto, setAbierto] = useState(false);
  const linkWhatsapp = linkContactoWhatsapp(tienda);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Menú"
        className="flex shrink-0 flex-col gap-1 p-2"
      >
        <span className="block h-0.5 w-5 rounded-full bg-cafe" />
        <span className="block h-0.5 w-5 rounded-full bg-cafe" />
        <span className="block h-0.5 w-5 rounded-full bg-cafe" />
      </button>

      {abierto && <Panel tienda={tienda} linkWhatsapp={linkWhatsapp} onCerrar={() => setAbierto(false)} />}
    </>
  );
}

/**
 * El panel se separa del botón para que los efectos —Escape y el bloqueo del scroll— nazcan y
 * mueran con él, en vez de tener que mirar `abierto` en cada uno.
 */
function Panel({
  tienda,
  linkWhatsapp,
  onCerrar,
}: {
  tienda: Tienda;
  linkWhatsapp: string | null;
  onCerrar: () => void;
}) {
  // Cerrar es retroceder en el historial, y por eso lo usan los TRES gestos —Escape, el velo y la
  // X— y no solo el botón atrás del teléfono: uno que cerrara por estado dejaría colgando la
  // entrada que empujó el menú al abrirse.
  const cerrar = useCerrarConAtras(onCerrar);

  useEffect(() => {
    function alPulsar(evento: KeyboardEvent) {
      if (evento.key === "Escape") cerrar();
    }

    document.addEventListener("keydown", alPulsar);
    return () => document.removeEventListener("keydown", alPulsar);
  }, [cerrar]);

  // El fondo no se desplaza mientras el menú está abierto. Se guarda el valor previo en vez de
  // asumir `""`, igual que en `Modal`: cualquier otra cosa que algún día toque el body dejaría el
  // scroll bloqueado para siempre al cerrar.
  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, []);

  const enElNavegador = useEnElNavegador();

  if (!enElNavegador) return null;

  // El menú se cuelga de `<body>` y no de donde se abre, que es lo que arregla que la barra de
  // categorías se le pintara encima. No era un z-index bajo: el `<Drawer>` se monta dentro del
  // `<header relative z-30>`, y `position:relative` con z-index crea un contexto de apilamiento,
  // así que estos `z-40`/`z-50` se resolvían solo puertas adentro y el menú entero valía 30 hacia
  // fuera. `CategoryNav` móvil es también z-30 pero va después en el DOM, y a igual z-index gana
  // el orden de documento. Portarlo lo arregla de raíz, sin tocar el z-index de nadie.
  return createPortal(
    <>
      <div onClick={cerrar} className="fixed inset-0 z-40 bg-cafe/40" aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Menú de ${tienda.nombre}`}
        className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[80vw] flex-col gap-4 overflow-y-auto bg-tarjeta px-5 pt-5 pb-8 text-center shadow-modal"
      >
        <button
          type="button"
          onClick={cerrar}
          aria-label="Cerrar"
          className="absolute top-3 right-3 flex min-h-11 min-w-11 items-center justify-center text-naranja"
        >
          <X className="size-6" />
        </button>

        <div className="relative mx-auto h-20 w-40">
          <Image
            src="/logo-cronchy-recortado.png"
            alt={tienda.nombre}
            fill
            sizes="160px"
            className="object-contain"
          />
        </div>

        <div>
          <h2 className="font-titulo text-lg font-semibold text-cafe">{tienda.nombre}</h2>
          {tienda.direccion && <p className="mt-1 text-sm text-cafe-suave">{tienda.direccion}</p>}
        </div>

        {/* Los dos botones van seguidos y no anclados al fondo: con este contenido, un `mt-auto`
            deja media pantalla en blanco entre la dirección y el único botón. */}
        <div className="mt-2 flex flex-col gap-3">
          {linkWhatsapp && (
            <a
              href={linkWhatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-naranja px-4 py-2.5 font-cuerpo font-bold text-crema"
            >
              <MessageCircle className="size-4" />
              Contáctanos
            </a>
          )}

          {/* En outline y no en naranja macizo: son dos acciones, pero escribirle al negocio pesa
              más que dejarle una reseña, y dos bloques llenos seguidos borran esa jerarquía. */}
          {tienda.googleResenasUrl && (
            <a
              href={tienda.googleResenasUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-naranja px-4 py-2.5 font-cuerpo font-bold text-naranja"
            >
              <Star className="size-4" />
              Danos tu opinión
            </a>
          )}
        </div>
      </aside>
    </>,
    document.body,
  );
}
