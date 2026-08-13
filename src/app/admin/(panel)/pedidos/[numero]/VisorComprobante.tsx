"use client";

import Image from "next/image";
import { useState } from "react";
import { Modal, ModalCabecera, ModalCerrar } from "@/components/ui/Modal";

/**
 * El comprobante de Nequi, mirable sin salir del pedido.
 *
 * Antes era un enlace "Ver comprobante" al final de la columna derecha: para verificar un pago
 * había que bajar hasta el fondo de la pantalla y luego irse a otra pestaña. Aquí es una
 * miniatura al lado del método de pago, y el visor se abre encima.
 *
 * **La imagen se pide siempre por `/api/admin/comprobante/[numero]`**, nunca por la URL de
 * Storage: el bucket es privado —guarda datos bancarios de clientes— y ese endpoint es el que
 * valida la sesión antes de bajar el objeto con la service key.
 *
 * Consecuencia de poner miniatura donde antes había un enlace: la imagen se descarga al abrir el
 * detalle, no al pulsar. Es una pantalla que ya exige sesión y el endpoint responde
 * `Cache-Control: private, no-store`, así que no queda copia en ningún intermediario.
 *
 * `unoptimized`, como el resto de imágenes del panel: la ruta es nuestra y sirve el original.
 */
export function VisorComprobante({ numero }: { numero: number }) {
  const [abierto, setAbierto] = useState(false);
  const [fallo, setFallo] = useState(false);

  const src = `/api/admin/comprobante/${numero}`;
  const alt = `Comprobante del pedido #${numero}`;

  // El comprobante se purga a los 60 días. La purga también pone `comprobante_url` a NULL, así
  // que este caso no debería llegar aquí; si llega, mejor decirlo que dejar el icono de imagen
  // rota en el sitio más visible de la pantalla.
  if (fallo) {
    return <span className="font-normal">· comprobante no disponible</span>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={`Ver el ${alt.toLowerCase()}`}
        className="relative size-10 shrink-0 overflow-hidden rounded-full border border-crema-oscura bg-crema transition-colors hover:border-naranja focus:outline-none focus-visible:ring-2 focus-visible:ring-naranja"
      >
        <Image
          src={src}
          alt={alt}
          fill
          sizes="40px"
          className="object-cover"
          unoptimized
          onError={() => setFallo(true)}
        />
      </button>

      {abierto && (
        <Modal etiqueta={alt} ancho="xl" onCerrar={() => setAbierto(false)}>
          <ModalCabecera>Comprobante del pedido #{numero}</ModalCabecera>

          {/* `object-contain` y alto fijo: un comprobante es una captura de pantalla y su
              proporción la pone el teléfono del cliente, así que no se puede recortar. */}
          <div className="relative h-[70vh] w-full bg-crema">
            <Image
              src={src}
              alt={alt}
              fill
              sizes="(min-width: 896px) 896px, 100vw"
              className="object-contain"
              unoptimized
            />
          </div>

          <div className="flex items-center justify-between gap-2 pl-5">
            {/* Para ampliar de verdad o imprimirlo: el visor lo muestra, el navegador lo amplía. */}
            <a
              href={src}
              target="_blank"
              rel="noopener"
              className="flex min-h-11 items-center font-cuerpo text-sm font-bold text-cafe-suave underline-offset-2 hover:underline"
            >
              Abrir en pestaña
            </a>
            <ModalCerrar onCerrar={() => setAbierto(false)} />
          </div>
        </Modal>
      )}
    </>
  );
}
