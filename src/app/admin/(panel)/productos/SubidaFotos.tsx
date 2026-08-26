"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Star, X } from "lucide-react";
import { MAX_BYTES, MAX_FOTOS } from "@/lib/imagenes";
import { comprimirImagen } from "./comprimir";
import { guardarFotos } from "./acciones";

/**
 * Hasta 3 fotos por producto. La primera es la portada: es la que sale en la tarjeta de la
 * carta, así que se marca con una etiqueta explícita en vez de esperar que se adivine.
 *
 * La foto se comprime y se sube al elegirla, no al guardar el formulario: así la subida se
 * solapa con el resto de la edición. Después se persiste la lista con su propia acción,
 * porque el orden de las fotos es un dato independiente del formulario de datos básicos.
 */
export function SubidaFotos({
  productId,
  fotos,
  soloLectura = false,
}: {
  productId: string;
  fotos: string[];
  soloLectura?: boolean;
}) {
  const [pendiente, iniciar] = useTransition();
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const lleno = fotos.length >= MAX_FOTOS;

  function persistir(urls: string[]) {
    setError(null);
    iniciar(async () => {
      const resultado = await guardarFotos({ id: productId, urls });
      if (!resultado.ok) setError(resultado.error);
    });
  }

  async function subir(archivo: File) {
    setError(null);
    setSubiendo(true);

    try {
      const comprimida = await comprimirImagen(archivo);

      // Después de comprimir esto no debería pasar nunca; si pasa, es una imagen absurda
      // y es mejor decirlo aquí que recibir un 413 del servidor.
      if (comprimida.size > MAX_BYTES) {
        setError("Esa imagen es demasiado grande incluso comprimida.");
        return;
      }

      const cuerpo = new FormData();
      cuerpo.append("archivo", comprimida, "foto.webp");
      cuerpo.append("productId", productId);

      const r = await fetch("/api/admin/fotos", { method: "POST", body: cuerpo });
      const json = await r.json().catch(() => null);

      if (!r.ok) {
        setError(json?.error ?? "No pudimos subir la foto.");
        return;
      }

      persistir([...fotos, json.url]);
    } catch {
      setError("No pudimos procesar esa imagen. Prueba con otra.");
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function quitar(indice: number) {
    persistir(fotos.filter((_, i) => i !== indice));
  }

  function mover(indice: number, delta: number) {
    const destino = indice + delta;
    if (destino < 0 || destino >= fotos.length) return;

    const copia = [...fotos];
    [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
    persistir(copia);
  }

  if (soloLectura && fotos.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {fotos.map((url, i) => (
          <figure
            key={url}
            className="relative size-24 overflow-hidden rounded-sm border border-crema-oscura bg-crema"
          >
            {/* Sin `unoptimized`, igual que la miniatura de `ColumnaProductos` y por el mismo
                motivo: lo que hay en Storage es un máster de 1280 px y ~450 KB, y traérselo
                entero para pintar 96 px son tres archivos grandes por producto abierto. */}
            <Image
              src={url}
              alt={i === 0 ? "Foto de portada" : `Foto ${i + 1}`}
              fill
              sizes="96px"
              className="object-cover"
            />

            {i === 0 && (
              <figcaption className="absolute inset-x-0 top-0 flex items-center gap-1 bg-cafe/70 px-1.5 py-0.5 font-cuerpo text-[11px] font-bold text-crema">
                <Star className="size-3 fill-crema" />
                Portada
              </figcaption>
            )}

            {!soloLectura && (
              <>
                <button
                  type="button"
                  onClick={() => quitar(i)}
                  disabled={pendiente}
                  aria-label={`Quitar foto ${i + 1}`}
                  className="absolute right-0.5 top-0.5 flex size-6 items-center justify-center rounded-full bg-cafe/70 text-crema disabled:opacity-50"
                >
                  <X className="size-3.5" />
                </button>

                <span className="absolute inset-x-0 bottom-0 flex justify-between bg-cafe/70">
                  <BotonMover
                    icono="izquierda"
                    etiqueta={`Mover foto ${i + 1} a la izquierda`}
                    onClick={() => mover(i, -1)}
                    deshabilitado={pendiente || i === 0}
                  />
                  <BotonMover
                    icono="derecha"
                    etiqueta={`Mover foto ${i + 1} a la derecha`}
                    onClick={() => mover(i, 1)}
                    deshabilitado={pendiente || i === fotos.length - 1}
                  />
                </span>
              </>
            )}
          </figure>
        ))}

        {!soloLectura && !lleno && (
          <>
            {/* SIN `capture`: la foto del producto casi siempre ya está en la galería. Ese
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
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={subiendo || pendiente}
              className="flex size-24 flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-crema-oscura font-cuerpo text-[11px] font-semibold text-cafe-suave transition-colors hover:bg-crema disabled:opacity-50"
            >
              {subiendo ? (
                <>
                  <Loader2 className="size-5 animate-spin" />
                  Subiendo…
                </>
              ) : (
                <>
                  <ImagePlus className="size-5" />
                  Añadir foto
                </>
              )}
            </button>
          </>
        )}
      </div>

      {!soloLectura && (
        <p className="font-cuerpo text-[13px] text-cafe-tenue">
          Hasta {MAX_FOTOS} fotos. La primera es la que sale en la carta.
        </p>
      )}

      {error && (
        <p role="alert" className="font-cuerpo text-[13px] font-semibold text-error">
          {error}
        </p>
      )}
    </div>
  );
}

function BotonMover({
  icono,
  etiqueta,
  onClick,
  deshabilitado,
}: {
  icono: "izquierda" | "derecha";
  etiqueta: string;
  onClick: () => void;
  deshabilitado: boolean;
}) {
  const Icono = icono === "izquierda" ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      aria-label={etiqueta}
      className="flex h-6 w-1/2 items-center justify-center text-crema disabled:opacity-30"
    >
      <Icono className="size-4" />
    </button>
  );
}
