"use client";

import { useState } from "react";
import Image from "next/image";
import { MessageCircle } from "lucide-react";
import { linkContactoWhatsapp } from "@/lib/notificaciones/transporte";

type Tienda = {
  nombre: string;
  telefono: string | null;
  whatsappUrl: string | null;
  direccion: string | null;
};

export function Drawer({ tienda }: { tienda: Tienda }) {
  const [abierto, setAbierto] = useState(false);
  const linkWhatsapp = linkContactoWhatsapp(
    tienda,
    `Hola, quiero hacer un pedido en ${tienda.nombre}`,
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Menú"
        className="flex shrink-0 flex-col gap-1 p-2"
      >
        <span className="block h-0.5 w-5 rounded-full bg-naranja" />
        <span className="block h-0.5 w-5 rounded-full bg-naranja" />
        <span className="block h-0.5 w-5 rounded-full bg-naranja" />
      </button>

      {abierto && (
        <>
          <div
            onClick={() => setAbierto(false)}
            className="fixed inset-0 z-40 bg-cafe/40"
            aria-hidden
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[80vw] flex-col gap-5 overflow-y-auto bg-tarjeta p-5 shadow-modal">
            <div className="flex items-center justify-between">
              <div className="relative h-16 w-32">
                <Image
                  src="/logo-cronchy-recortado.png"
                  alt={tienda.nombre}
                  fill
                  sizes="128px"
                  className="object-contain"
                />
              </div>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar"
                className="text-xl font-bold text-naranja"
              >
                ✕
              </button>
            </div>

            <div>
              <h2 className="font-titulo text-lg font-semibold text-cafe">{tienda.nombre}</h2>
              {tienda.direccion && (
                <p className="mt-1 text-sm text-cafe-suave">{tienda.direccion}</p>
              )}
            </div>

            {linkWhatsapp && (
              <a
                href={linkWhatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-auto flex items-center justify-center gap-2 rounded-full bg-naranja px-4 py-2.5 font-cuerpo font-bold text-crema"
              >
                <MessageCircle className="size-4" />
                Contáctanos
              </a>
            )}
          </aside>
        </>
      )}
    </>
  );
}
