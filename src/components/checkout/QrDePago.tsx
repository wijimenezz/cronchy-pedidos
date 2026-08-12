import Image from "next/image";
import { Download } from "lucide-react";

/**
 * El QR interoperable con el que se paga desde la app de cualquier banco.
 *
 * **Lo importante aquí es el botón de guardar, no la imagen.** El cliente está mirando esta
 * pantalla en el mismo teléfono con el que va a pagar, así que no puede escanear el QR: lo
 * guarda de un toque y lo abre desde la galería en su app bancaria, que es el recorrido que
 * de verdad funciona. Enseñarlo sin ofrecer la descarga solo serviría a quien pide desde el
 * computador.
 *
 * La descarga va contra `/api/qr-pago` y no contra la URL de Storage porque el atributo
 * `download` se ignora en enlaces cross-origin: apuntando a Supabase, el navegador abriría la
 * imagen en otra pestaña en lugar de guardarla.
 */
export function QrDePago({ url }: { url: string }) {
  return (
    <div className="flex flex-col items-center gap-2 border-t border-crema-oscura pt-3">
      <span className="self-start font-cuerpo text-[13px] font-bold text-cafe">
        Escanea este QR
      </span>

      <div className="relative aspect-square w-44 overflow-hidden rounded-sm bg-tarjeta">
        {/* `unoptimized`: el optimizador recomprime con pérdida, y un QR denso pierde módulos
            por el camino. Son 124 KB que además ya están en el CDN de Supabase. */}
        <Image
          src={url}
          alt="Código QR para pagar"
          fill
          sizes="176px"
          className="object-contain"
          unoptimized
        />
      </div>

      <a
        href="/api/qr-pago"
        download
        className="flex min-h-11 items-center gap-2 rounded-full border border-naranja px-5 font-cuerpo text-sm font-bold text-naranja transition-colors hover:bg-naranja/10"
      >
        <Download className="size-4" />
        Guardar el QR
      </a>

      <p className="text-center font-cuerpo text-[13px] text-cafe-suave">
        Guárdalo y escanéalo desde tu app: casi todas dejan elegir un QR de la
        galería.
      </p>
    </div>
  );
}
