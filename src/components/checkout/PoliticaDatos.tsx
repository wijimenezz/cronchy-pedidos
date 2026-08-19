"use client";

import { useState } from "react";
import { Modal, ModalCabecera, ModalCerrar } from "@/components/ui/Modal";
import {
  SECCIONES_POLITICA,
  TITULO_POLITICA,
} from "@/lib/legal/politica-datos";

/**
 * El "Ver más" que abre la política de tratamiento de datos.
 *
 * Se pinta **dentro del párrafo de la casilla y fuera de su `<label>`**, para que fluya detrás de
 * la frase y parta de línea con ella. Lo segundo no es maquetación: si viviera dentro del label, el
 * clic lo activaría y abrir la política desmarcaría la aceptación —o la marcaría sin haber leído
 * nada—. Quien lo coloca es `CheckoutForm`; aquí solo hay que saber que el botón es inline y por
 * eso no lleva `min-h-11` ni `self-start`, que lo sacarían del flujo del texto.
 *
 * El texto sale de `lib/legal/politica-datos.ts` y no está escrito aquí: el documento tiene que
 * poder cambiar sin tocar un componente, y su versión es lo que se guarda en cada pedido.
 */
export function PoliticaDatos() {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-haspopup="dialog"
        aria-label="Ver la política de tratamiento de datos"
        className="font-cuerpo text-[13px] font-bold text-naranja underline underline-offset-2"
      >
        Ver más
      </button>

      {abierto && (
        <Modal
          etiqueta={TITULO_POLITICA}
          ancho="lg"
          onCerrar={() => setAbierto(false)}
        >
          <ModalCabecera>{TITULO_POLITICA}</ModalCabecera>

          {/* El tope es del contenido y no del panel: sin él, un documento de este largo empuja
              la cabecera y el botón de cerrar fuera de la pantalla en un teléfono. */}
          <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto p-4">
            {SECCIONES_POLITICA.map((seccion) => (
              <section key={seccion.titulo} className="flex flex-col gap-2">
                <h3 className="font-titulo text-base font-semibold text-cafe">
                  {seccion.titulo}
                </h3>
                {seccion.parrafos.map((parrafo, i) => (
                  <p
                    key={i}
                    className="font-cuerpo text-[13px] leading-relaxed text-cafe-suave"
                  >
                    {parrafo}
                  </p>
                ))}
              </section>
            ))}
          </div>

          <ModalCerrar onCerrar={() => setAbierto(false)} />
        </Modal>
      )}
    </>
  );
}
