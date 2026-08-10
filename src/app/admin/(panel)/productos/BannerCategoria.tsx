"use client";

import { useRef, useState, useTransition } from "react";
import { Image as ImagenIcono, ImagePlus, Loader2 } from "lucide-react";
import { Modal, ModalCabecera, ModalCerrar } from "@/components/ui/Modal";
import { CategoryBanner } from "@/components/tienda/CategoryBanner";
import type { CategoriaPanel } from "@/db/queries/catalogo";
import { LADO_MAXIMO_BANNER, MAX_BYTES } from "@/lib/imagenes";
import { SUBTITULO_CATEGORIA } from "@/lib/tienda/categoria-meta";
import { comprimirImagen } from "./comprimir";
import { guardarBanner } from "./acciones";

/**
 * La foto de portada de una categoría: una sola, la que abre su sección en la carta.
 *
 * Va en un diálogo y no en la columna porque esa columna mide 220 px y un hero de 21:9 ahí no
 * se puede juzgar. Dentro se pinta el `CategoryBanner` de verdad, no una maqueta: el velo café
 * tapa el tercio izquierdo y el encuadre es lo único que el admin no puede adivinar mirando la
 * foto en su galería. Reusarlo también evita que la vista previa se quede vieja el día que
 * cambie el diseño de la carta.
 *
 * Mismo flujo de dos pasos que `SubidaFotos`: el route handler sube el objeto al bucket y
 * devuelve la URL, y la server action la persiste en la columna. La foto se sube al elegirla.
 */
export function BannerCategoria({ categoria }: { categoria: CategoriaPanel }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={`Foto de ${categoria.nombre}`}
        className={`flex size-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-crema ${
          categoria.bannerUrl ? "text-naranja" : "text-cafe-tenue hover:text-cafe"
        }`}
      >
        {/* Naranja con foto, tenue sin ella: así se ve de un vistazo a qué categoría le falta,
            sin gastar en la lista el espacio de una miniatura. */}
        {categoria.bannerUrl ? (
          <ImagenIcono className="size-4" />
        ) : (
          <ImagePlus className="size-4" />
        )}
      </button>

      {abierto && <Dialogo categoria={categoria} onCerrar={() => setAbierto(false)} />}
    </>
  );
}

function Dialogo({
  categoria,
  onCerrar,
}: {
  categoria: CategoriaPanel;
  onCerrar: () => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ocupado = subiendo || pendiente;

  // Sin estado local para la URL: la acción revalida `/admin/productos`, así que la prop llega
  // actualizada sola. Duplicarla aquí solo abriría la puerta a que las dos discrepen.
  function persistir(url: string | null) {
    setError(null);
    iniciar(async () => {
      const resultado = await guardarBanner({ id: categoria.id, url });
      if (!resultado.ok) setError(resultado.error);
    });
  }

  async function subir(archivo: File) {
    setError(null);
    setSubiendo(true);

    try {
      const comprimida = await comprimirImagen(archivo, LADO_MAXIMO_BANNER);

      // Después de comprimir esto no debería pasar nunca; si pasa, es una imagen absurda
      // y es mejor decirlo aquí que recibir un 413 del servidor.
      if (comprimida.size > MAX_BYTES) {
        setError("Esa imagen es demasiado grande incluso comprimida.");
        return;
      }

      const cuerpo = new FormData();
      cuerpo.append("archivo", comprimida, "banner.webp");
      cuerpo.append("categoryId", categoria.id);

      const r = await fetch("/api/admin/fotos", { method: "POST", body: cuerpo });
      const json = await r.json().catch(() => null);

      if (!r.ok) {
        setError(json?.error ?? "No pudimos subir la foto.");
        return;
      }

      persistir(json.url);
    } catch {
      setError("No pudimos procesar esa imagen. Prueba con otra.");
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Modal etiqueta={`Foto de ${categoria.nombre}`} ancho="xl" onCerrar={onCerrar}>
      <ModalCabecera>Foto de {categoria.nombre}</ModalCabecera>

      <div className="flex flex-col gap-3 overflow-y-auto p-4">
        {/* El componente de la carta, no una maqueta. Sin `ctaHref`: un enlace a una sección
            de la tienda no lleva a ninguna parte desde el panel. */}
        <CategoryBanner
          nombre={categoria.nombre}
          bannerUrl={categoria.bannerUrl}
          subtitulo={SUBTITULO_CATEGORIA[categoria.slug]}
        />

        <p className="font-cuerpo text-[13px] text-cafe-tenue">
          Así se ve al abrir la categoría en la carta. El nombre va encima, sobre un velo oscuro
          a la izquierda: deja el churro —o lo que quieras que se vea— hacia la derecha. En el
          celular la foto se recorta más cuadrada y en computador más panorámica, así que lo
          importante debe quedar centrado de arriba a abajo.
        </p>

        {error && (
          <p role="alert" className="font-cuerpo text-[13px] font-semibold text-error">
            {error}
          </p>
        )}

        {/* SIN `capture`: la foto de la categoría casi siempre ya está en la galería. Ese
            atributo abriría la cámara directamente y escondería la galería. */}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            if (archivo) void subir(archivo);
          }}
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={ocupado}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-naranja px-4 font-cuerpo text-sm font-bold text-crema transition-colors hover:bg-naranja-osc disabled:opacity-50"
          >
            {subiendo ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Subiendo…
              </>
            ) : (
              <>
                <ImagePlus className="size-4" />
                {categoria.bannerUrl ? "Cambiar foto" : "Subir foto"}
              </>
            )}
          </button>

          {categoria.bannerUrl && (
            <button
              type="button"
              onClick={() => persistir(null)}
              disabled={ocupado}
              className="min-h-11 rounded-full border border-crema-oscura px-4 font-cuerpo text-sm font-bold text-cafe-suave transition-colors hover:bg-crema disabled:opacity-50"
            >
              {pendiente ? "Guardando…" : "Quitar foto"}
            </button>
          )}
        </div>
      </div>

      <ModalCerrar onCerrar={onCerrar} />
    </Modal>
  );
}
