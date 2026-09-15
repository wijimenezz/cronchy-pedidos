"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { MAX_BYTES, LADO_MAXIMO_BANNER } from "@/lib/imagenes";
import { comprimirImagenMedida } from "@/app/admin/(panel)/productos/comprimir";
import type { BannerDelPanel } from "@/db/queries/banners";
import { agregarBanner, borrarAnuncio, publicarAnuncio, quitarAnuncio } from "./acciones";

/**
 * LA BIBLIOTECA DE ANUNCIOS: lo primero que ve el cliente al abrir la carta.
 *
 * Se suben varios y se enciende uno. Los demás quedan guardados para reutilizarlos, que es lo que
 * hace que la promo de los martes no haya que volver a subirla cada semana.
 *
 * **Subir no publica.** Un banner nace apagado, así que se puede dejar listo el del viernes sin
 * que salga el miércoles. Publicar es el segundo gesto, y apaga el anterior por construcción — hay
 * un índice único parcial en la base, no un `UPDATE` de dos pasos que se pueda quedar a medias.
 *
 * **El cliente lo ve UNA VEZ por banner.** Lo que su teléfono recuerda es el id, así que publicar
 * otro lo vuelve a mostrar solo. Corolario que conviene saber antes de pedirlo: *reemplazar* la
 * imagen de uno que ya circuló no lo vuelve a mostrar — para eso se sube uno nuevo.
 *
 * A diferencia del QR, la imagen **sí se comprime**: es una pieza gráfica que se ve a pantalla
 * casi completa, no un código que pierde módulos al recomprimir.
 */
export function Banners({ banners }: { banners: BannerDelPanel[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [nombre, setNombre] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enCurso, empezar] = useTransition();

  const activo = banners.find((b) => b.activo) ?? null;

  function accion(ejecutar: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    empezar(async () => {
      const r = await ejecutar();
      if (!r.ok) setError(r.error ?? "No pudimos guardar el cambio.");
    });
  }

  async function subir(archivo: File) {
    setError(null);

    if (!nombre.trim()) {
      setError("Ponle un nombre antes de subir la imagen, para reconocerlo después.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setSubiendo(true);
    try {
      // Se comprime ANTES de subir, como las fotos de la carta: el tope de 4 MB es del body de la
      // función serverless, y una historia exportada del móvil lo pasa con facilidad.
      // Se piden las medidas de vuelta: con ellas el modal de la carta se dibuja con la
      // proporción del arte, y así la imagen no queda con un marco alrededor.
      const { blob: comprimida, ancho, alto } = await comprimirImagenMedida(
        archivo,
        LADO_MAXIMO_BANNER,
      );
      if (comprimida.size > MAX_BYTES) {
        setError("Esa imagen pesa demasiado incluso comprimida. Prueba con una más pequeña.");
        return;
      }

      const cuerpo = new FormData();
      cuerpo.append("archivo", new File([comprimida], "banner.webp", { type: comprimida.type }));
      // `tienda: "1"` y no un id: el `storeId` sale de la sesión en el servidor (regla 5).
      cuerpo.append("tienda", "1");

      const r = await fetch("/api/admin/fotos", { method: "POST", body: cuerpo });
      const json = await r.json().catch(() => null);
      if (!r.ok) {
        setError(json?.error ?? "No pudimos subir la imagen.");
        return;
      }

      accion(() => agregarBanner({ nombre: nombre.trim(), url: json.url, ancho, alto }));
      setNombre("");
    } catch {
      setError("No pudimos subir la imagen. Revisa la conexión e inténtalo otra vez.");
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const ocupado = subiendo || enCurso;

  return (
    <section className="flex flex-col gap-4 rounded-md border border-crema-oscura bg-tarjeta p-4">
      <div>
        <h2 className="font-titulo text-base font-bold text-cafe">Anuncio de la carta</h2>
        <p className="font-cuerpo text-[13px] text-cafe-tenue">
          Se abre encima de la carta al entrar, después de que el cliente elija domicilio o
          recoger. Cada cliente lo ve <strong>una sola vez</strong>; si publicas otro, vuelve a
          verlo.
        </p>
      </div>

      <div className="rounded-sm bg-crema p-3 font-cuerpo text-[13px] text-cafe-suave">
        {activo ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Mostrando ahora: <strong className="text-cafe">{activo.nombre}</strong>
            </span>
            <button
              type="button"
              onClick={() => accion(quitarAnuncio)}
              disabled={ocupado}
              className="min-h-11 rounded-sm border border-crema-oscura bg-tarjeta px-4 font-bold text-cafe disabled:opacity-50"
            >
              Dejar de mostrarlo
            </button>
          </div>
        ) : (
          <span>Ahora mismo no se muestra ningún anuncio.</span>
        )}
      </div>

      {banners.length > 0 && (
        <ul className="flex flex-col gap-2">
          {banners.map((b) => (
            <li
              key={b.id}
              className={`flex items-center gap-3 rounded-sm border p-2 ${
                b.activo ? "border-naranja bg-naranja/8" : "border-crema-oscura"
              }`}
            >
              {/* Sin `unoptimized`: es el panel, y servir el máster de 1280 px sin transformar
                  serían cientos de KB por miniatura. Mismo criterio que la lista de catálogo. */}
              <div className="relative size-16 shrink-0 overflow-hidden rounded-sm bg-crema">
                <Image src={b.imagenUrl} alt="" fill sizes="64px" className="object-contain" />
              </div>

              <span className="flex-1 font-cuerpo text-sm font-bold text-cafe">{b.nombre}</span>

              {/* Encender es un clic sin confirmación: es operación, y se deshace con otro clic. */}
              {!b.activo && (
                <button
                  type="button"
                  onClick={() => accion(() => publicarAnuncio({ id: b.id }))}
                  disabled={ocupado}
                  className="min-h-11 rounded-full bg-naranja px-4 font-cuerpo text-sm font-bold text-crema disabled:opacity-50"
                >
                  Mostrar
                </button>
              )}

              {/* Borrar sí confirma: se lleva la imagen del bucket y no se puede deshacer. */}
              <button
                type="button"
                onClick={() => {
                  if (!confirm(`Se borrará "${b.nombre}" y su imagen. ¿Seguimos?`)) return;
                  accion(() => borrarAnuncio({ id: b.id }));
                }}
                disabled={ocupado}
                aria-label={`Borrar ${b.nombre}`}
                className="flex size-11 items-center justify-center rounded-sm text-error disabled:opacity-50"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 border-t border-crema-oscura pt-3">
        <label className="font-cuerpo text-[13px] font-bold text-cafe" htmlFor="banner-nombre">
          Nombre del anuncio
        </label>
        <input
          id="banner-nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value.slice(0, 60))}
          maxLength={60}
          placeholder="Big Godo"
          className="min-h-11 rounded-sm border border-crema-oscura bg-crema px-3 font-cuerpo text-[15px] text-cafe"
        />
        <p className="font-cuerpo text-[12px] text-cafe-tenue">
          Solo para reconocerlo en esta lista. El cliente no lo ve.
        </p>

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
          disabled={ocupado}
          className="flex min-h-11 items-center justify-center gap-2 self-start rounded-full bg-naranja px-5 font-cuerpo text-sm font-bold text-crema disabled:opacity-50"
        >
          {subiendo ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          {subiendo ? "Subiendo…" : "Subir banner"}
        </button>
      </div>

      {error && (
        <p role="alert" className="font-cuerpo text-[13px] font-semibold text-error">
          {error}
        </p>
      )}
    </section>
  );
}
