"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Loader2, Upload, X } from "lucide-react";
import { MAX_BYTES } from "@/lib/comprobantes";

type Estado = "vacio" | "subiendo" | "listo" | "error";

/**
 * Sube el comprobante en cuanto el cliente lo elige, no al enviar el formulario: así
 * la subida se solapa con el resto del llenado y el botón de confirmar no espera.
 *
 * La vista previa sale de `URL.createObjectURL` (local, instantánea) y no del bucket,
 * que es privado.
 */
export function SubidaComprobante({
  url,
  onSubido,
  error,
}: {
  url: string | null;
  onSubido: (url: string | null) => void;
  error?: string;
}) {
  const [estado, setEstado] = useState<Estado>(url ? "listo" : "vacio");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function subir(archivo: File) {
    if (archivo.size > MAX_BYTES) {
      setEstado("error");
      setMensaje("La imagen pesa demasiado. Intenta con una foto más liviana.");
      return;
    }

    setEstado("subiendo");
    setMensaje(null);
    setPreview(URL.createObjectURL(archivo));

    try {
      const cuerpo = new FormData();
      cuerpo.append("archivo", archivo);
      const r = await fetch("/api/comprobantes", { method: "POST", body: cuerpo });
      const json = await r.json().catch(() => null);

      if (!r.ok) {
        setEstado("error");
        setMensaje(json?.error ?? "No pudimos subir el comprobante.");
        onSubido(null);
        return;
      }

      setEstado("listo");
      onSubido(json.url);
    } catch {
      setEstado("error");
      setMensaje("No pudimos subir el comprobante. Revisa tu conexión.");
      onSubido(null);
    }
  }

  function quitar() {
    setEstado("vacio");
    setMensaje(null);
    setPreview(null);
    onSubido(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-2">
      {/* SIN `capture`: ese atributo abre la cámara directamente, y el comprobante de
          Nequi es una CAPTURA DE PANTALLA que está en la galería. Sin él, el sistema
          muestra su selector normal, que ofrece galería y cámara. */}
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

      {estado === "listo" && preview ? (
        <div className="flex items-center gap-3 rounded-sm border border-exito bg-exito/8 p-2">
          <div className="relative size-14 shrink-0 overflow-hidden rounded-sm">
            <Image src={preview} alt="Comprobante" fill sizes="56px" className="object-cover" />
          </div>
          <span className="flex-1 font-cuerpo text-sm font-semibold text-exito">
            Comprobante listo
          </span>
          <button
            type="button"
            onClick={quitar}
            aria-label="Quitar comprobante"
            className="flex size-11 items-center justify-center rounded-full text-cafe-suave"
          >
            <X className="size-5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={estado === "subiendo"}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-sm border border-dashed px-4 py-3 font-cuerpo text-sm font-semibold ${
            estado === "error" || error
              ? "border-error text-error"
              : "border-crema-oscura text-cafe-suave"
          }`}
        >
          {estado === "subiendo" ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Subiendo…
            </>
          ) : (
            <>
              <Upload className="size-4" />
              {estado === "error" ? "Reintentar" : "Elegir de la galería"}
            </>
          )}
        </button>
      )}

      {(mensaje ?? error) && (
        <p className="font-cuerpo text-[13px] font-semibold text-error">{mensaje ?? error}</p>
      )}
    </div>
  );
}
