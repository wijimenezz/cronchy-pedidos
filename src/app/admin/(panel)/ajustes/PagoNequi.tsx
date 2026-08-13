"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { MAX_BYTES } from "@/lib/imagenes";
import { guardarLlaveNequi, guardarQrNequi } from "./acciones";

/**
 * Con qué paga el cliente: la llave y el QR que salen en el checkout.
 *
 * Son dos guardados independientes a propósito. El QR se persiste solo, en cuanto se sube
 * —igual que las fotos de la carta—, mientras que la llave espera al botón: se escribe a
 * mano y hay que poder corregirla antes de publicarla. Un único "Guardar" para las dos cosas
 * obligaría a pulsarlo después de subir una imagen que ya está en el bucket.
 *
 * El QR NO se comprime antes de subir, al revés que las fotos de producto y el banner. Dos
 * motivos, y los dos importan: `comprimirImagen` recomprime a WebP con pérdida y un QR denso
 * pierde módulos por el camino, y el archivo que el cliente descarga tiene que abrirse en el
 * selector de imágenes de la app de su banco, donde JPG y PNG son apuestas más seguras que
 * WebP. Pesa 124 KB; no hay nada que ahorrar.
 */
export function PagoNequi({
  llave,
  titular,
  qrUrl,
}: {
  llave: string | null;
  titular: string | null;
  qrUrl: string | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-md border border-crema-oscura bg-tarjeta p-4">
        <div>
          <h2 className="font-titulo text-base font-bold text-cafe">Llave para recibir pagos</h2>
          <p className="font-cuerpo text-[13px] text-cafe-tenue">
            Es lo primero que ve el cliente al elegir «Nequi o Bre-B», con un botón para
            copiarla. Sin llave, ese método de pago desaparece del checkout y solo queda el
            efectivo — incluso en los pedidos para recoger, que entonces dejan de cobrarse por
            adelantado.
          </p>
        </div>
        <FormularioLlave llave={llave} titular={titular} />
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-crema-oscura bg-tarjeta p-4">
        <div>
          <h2 className="font-titulo text-base font-bold text-cafe">QR de pago</h2>
          <p className="font-cuerpo text-[13px] text-cafe-tenue">
            El cliente lo guarda con un toque y lo escanea desde la app de su banco: no puede
            escanear la pantalla del mismo teléfono con el que está pidiendo. Súbelo tal como
            te lo dio el banco, sin recortar.
          </p>
        </div>
        <SubidaQr qrUrl={qrUrl} />
      </section>
    </div>
  );
}

function FormularioLlave({ llave, titular }: { llave: string | null; titular: string | null }) {
  const [pendiente, iniciar] = useTransition();
  const [borrador, setBorrador] = useState({ llave: llave ?? "", titular: titular ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function guardar() {
    setError(null);
    setAviso(null);
    iniciar(async () => {
      const resultado = await guardarLlaveNequi({
        llave: borrador.llave.trim() || null,
        titular: borrador.titular.trim() || null,
      });
      if (resultado.ok) setAviso("Guardado. Ya se ve en el checkout.");
      else setError(resultado.error);
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Campo
          etiqueta="Llave"
          valor={borrador.llave}
          placeholder="0091090861"
          onChange={(v) => setBorrador((b) => ({ ...b, llave: v }))}
        />
        <Campo
          etiqueta="A nombre de"
          valor={borrador.titular}
          placeholder="Cronchy Churros"
          onChange={(v) => setBorrador((b) => ({ ...b, titular: v }))}
        />
      </div>

      <p className="font-cuerpo text-[13px] text-cafe-tenue">
        El nombre sale debajo de la llave. Ponlo: quien va a transferir necesita reconocer a
        quién le está mandando la plata.
      </p>

      {error && (
        <p role="alert" className="font-cuerpo text-[13px] font-semibold text-error">
          {error}
        </p>
      )}
      {aviso && !error && (
        <p role="status" className="font-cuerpo text-[13px] font-semibold text-exito">
          {aviso}
        </p>
      )}

      <button
        type="button"
        onClick={guardar}
        disabled={pendiente}
        className="min-h-11 self-start rounded-full bg-naranja px-5 font-cuerpo text-sm font-bold text-crema transition-colors hover:bg-naranja-osc disabled:opacity-50"
      >
        {pendiente ? "Guardando…" : "Guardar"}
      </button>
    </>
  );
}

function SubidaQr({ qrUrl }: { qrUrl: string | null }) {
  const [pendiente, iniciar] = useTransition();
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ocupado = subiendo || pendiente;

  // Sin estado local para la URL: la acción revalida esta ruta, así que la prop vuelve
  // actualizada. Duplicarla solo abriría la puerta a que las dos discrepen.
  function persistir(url: string | null) {
    setError(null);
    iniciar(async () => {
      const resultado = await guardarQrNequi({ url });
      if (!resultado.ok) setError(resultado.error);
    });
  }

  async function subir(archivo: File) {
    setError(null);

    // El tope se comprueba aquí porque no hay compresión que pueda salvar un archivo grande:
    // lo que se elige es lo que se sube.
    if (archivo.size > MAX_BYTES) {
      setError("Esa imagen pesa demasiado. Prueba con una captura, no con la foto original.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setSubiendo(true);
    try {
      const cuerpo = new FormData();
      cuerpo.append("archivo", archivo);
      cuerpo.append("tienda", "1");

      const r = await fetch("/api/admin/fotos", { method: "POST", body: cuerpo });
      const json = await r.json().catch(() => null);

      if (!r.ok) {
        setError(json?.error ?? "No pudimos subir el QR.");
        return;
      }

      persistir(json.url);
    } catch {
      setError("No pudimos subir el QR. Revisa la conexión e inténtalo otra vez.");
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      {qrUrl ? (
        <div className="relative aspect-square w-48 overflow-hidden rounded-md border border-crema-oscura bg-crema">
          {/* `unoptimized`: pasar un QR por el optimizador lo recomprime con pérdida, que es
              justo lo que no puede pasarle a una imagen que hay que escanear. */}
          <Image src={qrUrl} alt="QR de pago" fill sizes="192px" className="object-contain" unoptimized />
        </div>
      ) : (
        <p className="font-cuerpo text-[13px] text-cafe-suave">
          Todavía no hay QR. El checkout muestra solo la llave.
        </p>
      )}

      {error && (
        <p role="alert" className="font-cuerpo text-[13px] font-semibold text-error">
          {error}
        </p>
      )}

      {/* SIN `capture`: el QR ya está en la galería, es la imagen que dio el banco. Ese
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
          className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-naranja px-5 font-cuerpo text-sm font-bold text-crema transition-colors hover:bg-naranja-osc disabled:opacity-50"
        >
          {subiendo ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Subiendo…
            </>
          ) : (
            <>
              <ImagePlus className="size-4" />
              {qrUrl ? "Cambiar QR" : "Subir QR"}
            </>
          )}
        </button>

        {qrUrl && (
          <button
            type="button"
            onClick={() => persistir(null)}
            disabled={ocupado}
            className="min-h-11 rounded-full border border-crema-oscura px-5 font-cuerpo text-sm font-bold text-cafe-suave transition-colors hover:bg-crema disabled:opacity-50"
          >
            {pendiente ? "Guardando…" : "Quitar QR"}
          </button>
        )}
      </div>
    </>
  );
}

function Campo({
  etiqueta,
  valor,
  placeholder,
  onChange,
}: {
  etiqueta: string;
  valor: string;
  placeholder: string;
  onChange: (valor: string) => void;
}) {
  return (
    <label className="flex min-w-[12rem] flex-1 flex-col gap-0.5">
      <span className="font-cuerpo text-[11px] font-bold text-cafe-tenue">{etiqueta}</span>
      <input
        type="text"
        value={valor}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 rounded-sm border border-crema-oscura bg-tarjeta px-3 font-cuerpo text-[15px] text-cafe focus:outline-none focus:ring-2 focus:ring-naranja"
      />
    </label>
  );
}
