"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Copy, Download } from "lucide-react";
import type { CuponDelPanel } from "@/db/queries/cupones";
import { linkDeCupon } from "@/lib/cupones";

/**
 * El link y el QR de un cupón: lo que se pega en Instagram o se imprime en el mostrador para que el
 * cliente llegue al checkout con el descuento ya puesto, sin teclear nada (`CapturarCupon`).
 *
 * Recibe el cupón GUARDADO y no el borrador del formulario: un código editado sin guardar daría un
 * QR impreso que no descuenta, y eso solo se descubre cuando un cliente reclama.
 *
 * Tres decisiones que no se deducen del código:
 *
 * - **El origen sale de `window.location.origin`**, no de una variable de entorno: el panel y la
 *   carta viven en el mismo dominio. Por eso el link se arma en un efecto (en el servidor no hay
 *   `window`), y hasta entonces no se pinta nada.
 * - **`qrcode` se carga con `import()`**: solo lo necesita esta sección, así que no entra ni en la
 *   carta ni en el resto del panel.
 * - **Negro sobre blanco, 1024 px y margen de 2 módulos.** Los colores de marca bajan el contraste
 *   y un QR impreso en papel barato deja de leerse. El tamaño grande es para imprimir sin pixelar.
 *
 * La descarga va por un `<a download>` sobre un data URL. Es mismo origen, así que el navegador sí
 * respeta `download` (con un archivo de Supabase no lo haría — ver `/api/qr-pago`).
 */
export function CompartirCupon({ cupon, hoy }: { cupon: CuponDelPanel; hoy: string }) {
  // `null` en el servidor y en la hidratación; el dominio real en cuanto hay navegador.
  const origen = useSyncExternalStore(sinSuscripcion, origenDelNavegador, sinOrigen);
  const link = origen ? linkDeCupon(origen, cupon.codigo) : null;

  // El QR y el "Copiado" se guardan junto al link al que pertenecen, en vez de resetearlos al
  // cambiar de cupón: así el del cupón anterior no se ve nunca y no hace falta un setState
  // síncrono dentro del efecto. `dataUrl: null` = no se pudo generar.
  const [qr, setQr] = useState<{ link: string; dataUrl: string | null } | null>(null);
  const [copiadoDe, setCopiadoDe] = useState<string | null>(null);
  const [sinPortapapeles, setSinPortapapeles] = useState(false);

  useEffect(() => {
    if (!link) return;

    let vigente = true;
    import("qrcode")
      .then((QRCode) =>
        QRCode.toDataURL(link, {
          width: 1024,
          margin: 2,
          errorCorrectionLevel: "M",
          color: { dark: "#000000", light: "#ffffff" },
        }),
      )
      .then((dataUrl) => {
        if (vigente) setQr({ link, dataUrl });
      })
      .catch(() => {
        if (vigente) setQr({ link, dataUrl: null });
      });

    // Si se cambia de cupón antes de que termine, el QR del anterior no debe pisar al nuevo.
    return () => {
      vigente = false;
    };
  }, [link]);

  const qrActual = qr && qr.link === link ? qr : null;
  const copiado = link !== null && copiadoDe === link;

  async function copiar() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiadoDe(link);
      setSinPortapapeles(false);
    } catch {
      // Sin permiso de portapapeles (HTTP, o un navegador que lo niega): el link queda a la vista
      // y seleccionable, que es la salida manual.
      setSinPortapapeles(true);
    }
  }

  const vencido = cupon.venceEl !== null && hoy > cupon.venceEl;
  const motivoInactivo = !cupon.activo ? "apagado" : vencido ? "vencido" : null;

  return (
    <div className="flex flex-col gap-3 rounded-sm bg-crema p-3">
      <h3 className="font-titulo text-[15px] font-bold text-cafe">Link y QR de {cupon.codigo}</h3>

      {motivoInactivo && (
        <p role="alert" className="font-cuerpo text-[13px] font-semibold text-error">
          Este cupón está {motivoInactivo}: el link y el QR abren la carta, pero no descuentan nada
          hasta que lo {motivoInactivo === "apagado" ? "enciendas" : "renueves con otra fecha"}.
        </p>
      )}

      {link && (
        <div className="flex flex-col gap-1">
          <span className="font-cuerpo text-[13px] font-bold text-cafe-suave">Link</span>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              aria-label={`Link del cupón ${cupon.codigo}`}
              className="min-h-11 min-w-0 flex-1 rounded-sm border border-crema-oscura bg-tarjeta px-3 font-cuerpo text-[13px] text-cafe focus:outline-none focus:ring-2 focus:ring-naranja"
            />
            <button
              type="button"
              onClick={copiar}
              className="flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-crema-oscura bg-tarjeta px-4 font-cuerpo text-sm font-bold text-cafe transition-colors hover:bg-crema-oscura"
            >
              {copiado ? <Check className="size-4 text-exito" /> : <Copy className="size-4" />}
              {copiado ? "Copiado" : "Copiar link"}
            </button>
          </div>
          {sinPortapapeles && (
            <span className="font-cuerpo text-[13px] text-cafe-tenue">
              No se pudo copiar solo: toca el link, selecciónalo y cópialo a mano.
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex size-40 shrink-0 items-center justify-center rounded-sm border border-crema-oscura bg-white">
          {qrActual?.dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL local: no hay nada que optimizar
            <img
              src={qrActual.dataUrl}
              alt={`Código QR del cupón ${cupon.codigo}`}
              className="size-full"
            />
          ) : (
            <span className="px-2 text-center font-cuerpo text-[12px] text-cafe-tenue">
              {qrActual ? "No se pudo generar el QR" : "Generando QR…"}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {qrActual?.dataUrl && (
            <a
              href={qrActual.dataUrl}
              download={`cupon-${cupon.codigo}.png`}
              className="flex min-h-11 w-fit items-center gap-2 rounded-full bg-naranja px-4 font-cuerpo text-sm font-bold text-crema transition-colors hover:bg-naranja-osc"
            >
              <Download className="size-4" />
              Descargar QR
            </a>
          )}
          <p className="font-cuerpo text-[13px] text-cafe-tenue">
            Quien lo escanee llega a la carta con el cupón puesto y lo ve aplicado al pagar.
          </p>
          <p className="font-cuerpo text-[13px] text-cafe-tenue">
            No hay tope de usos: cualquiera que tenga el QR lo puede usar hasta que apagues el cupón
            o se venza.
          </p>
        </div>
      </div>
    </div>
  );
}

// El origen no cambia mientras la página está abierta: no hay nada a lo que suscribirse.
function sinSuscripcion(): () => void {
  return () => {};
}

function origenDelNavegador(): string {
  return window.location.origin;
}

function sinOrigen(): null {
  return null;
}
