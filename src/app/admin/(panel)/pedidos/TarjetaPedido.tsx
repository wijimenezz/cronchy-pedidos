"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, useTransition } from "react";
import type { PedidoEnLista } from "@/db/queries/panel";
import { cuandoCorto, horaCorta, pesos } from "@/lib/notificaciones/plantillas";
import { ETIQUETA_ESTADO, METODO_PAGO_ETIQUETA } from "@/lib/pedidos/estados";
import { cambiarEstado, prepararAviso } from "./acciones";

/** Cuánto puede esperar un pedido sin aceptar antes de que sea un problema. */
const AVISO_MIN = 10;
const ALARMA_MIN = 20;

/** Cada cuánto se repinta el "lleva esperando". Al minuto no se le nota el segundo. */
const TIC_MS = 30_000;

/**
 * Un solo reloj para todo el tablero, fuera de React.
 *
 * Vive en el módulo y no en cada tarjeta porque en una columna con veinte pedidos serían
 * veinte intervalos midiendo lo mismo. Se apaga solo cuando no queda ninguna tarjeta mirando.
 */
let ahoraCache = 0;
const oyentes = new Set<() => void>();
let reloj: ReturnType<typeof setInterval> | null = null;

function suscribirAlReloj(avisar: () => void): () => void {
  oyentes.add(avisar);

  reloj ??= setInterval(() => {
    ahoraCache = Date.now();
    for (const oyente of oyentes) oyente();
  }, TIC_MS);

  return () => {
    oyentes.delete(avisar);
    if (oyentes.size === 0 && reloj) {
      clearInterval(reloj);
      reloj = null;
    }
  };
}

/**
 * La hora actual, o `null` en el servidor.
 *
 * Se lee con `useSyncExternalStore` —igual que el carrito y el tipo de pedido— porque
 * "lleva 3 minutos" calculado durante el render daría un valor en el servidor y otro en el
 * navegador; con el snapshot del servidor en `null`, React concilia la diferencia sin error
 * de hidratación.
 *
 * El valor se cachea entre tics a propósito: si `getSnapshot` devolviera `Date.now()` fresco
 * en cada llamada, React lo vería cambiar en cada render y no pararía nunca.
 */
function useAhora(): number | null {
  return useSyncExternalStore(
    suscribirAlReloj,
    () => (ahoraCache ||= Date.now()),
    () => null,
  );
}

/** 8 -> "8 min" · 95 -> "1 h 35" · 120 -> "2 h". Compacto: es una etiqueta, no una frase. */
function espera(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;

  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;

  return resto === 0 ? `${horas} h` : `${horas} h ${resto}`;
}

/**
 * Solo la hora: el tablero es del turno de hoy, la fecha sobra y ocupa.
 *
 * Se usa `horaCorta` y **no** un `Intl.DateTimeFormat("es-CO").format()`, aunque parezca más
 * directo. Esta tarjeta se pinta en el servidor y se rehidrata en el navegador, y `es-CO` mete
 * un espacio duro entre "a." y "m." que **no es el mismo carácter en los dos**: Node emite
 * U+00A0 y Chrome U+202F. Se ven idénticos, se imprimen idénticos en el log, y React tira un
 * error de hidratación mostrando dos líneas que parecen iguales.
 *
 * `horaCorta` esquiva eso porque lee las partes con `formatToParts` y las une con un espacio
 * normal, así que el separador del locale nunca llega a la pantalla.
 */
const hora = horaCorta;

export function TarjetaPedido({
  pedido,
  alCambiar,
}: {
  pedido: PedidoEnLista;
  alCambiar: () => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ahora = useAhora();

  // El polling entrega las fechas como string al pasar por JSON; el render del servidor las
  // da como Date. Se normalizan aquí en vez de en dos sitios.
  const creadoEn = new Date(pedido.creadoEn);
  const programadoPara = pedido.programadoPara ? new Date(pedido.programadoPara) : null;

  const minutosEsperando =
    ahora === null ? null : Math.max(0, Math.floor((ahora - creadoEn.getTime()) / 60_000));

  // El reloj solo alarma en la primera columna. Que un pedido lleve dos horas es normal si ya
  // está en camino; que lleve veinte minutos sin que nadie lo mire, no.
  const urgencia =
    pedido.estado !== "nuevo" || minutosEsperando === null
      ? "normal"
      : minutosEsperando >= ALARMA_MIN
        ? "alarma"
        : minutosEsperando >= AVISO_MIN
          ? "aviso"
          : "normal";

  function avanzar(estado: string) {
    setError(null);
    iniciar(async () => {
      const resultado = await cambiarEstado({ pedidoId: pedido.id, estado });
      if (!resultado.ok) setError(resultado.error);
      alCambiar();
    });
  }

  function avisar() {
    setError(null);
    iniciar(async () => {
      const resultado = await prepararAviso({ numero: pedido.numero, estado: pedido.estado });
      if (!resultado.ok) {
        setError(resultado.error);
      } else if (resultado.url) {
        // `_blank` y no `location.href`: el panel se queda abierto en su pestaña, que es
        // donde el empleado va a seguir trabajando cuando vuelva de WhatsApp.
        window.open(resultado.url, "_blank", "noopener");
      }
      alCambiar();
    });
  }

  return (
    // `relative` + el enlace estirado de abajo: toda la tarjeta abre el detalle sin meter un
    // <button> dentro de un <a>, que no es HTML válido. Antes solo se podía entrar por el
    // número, un objetivo de dos centímetros en una pantalla que se opera con el dedo.
    <article className="relative flex flex-col gap-2 rounded-md border border-crema-oscura bg-tarjeta p-3 shadow-tarjeta transition-colors focus-within:border-naranja hover:border-naranja/60">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-titulo text-base font-bold text-cafe">
            #{pedido.numero}
            <span className="ml-2 font-cuerpo text-[13px] font-normal text-cafe-tenue">
              {hora(creadoEn)}
            </span>
          </p>
          <p className="truncate font-cuerpo text-[15px] text-cafe">{pedido.clienteNombre}</p>
        </div>

        {minutosEsperando !== null && (
          <span
            title={`Entró hace ${espera(minutosEsperando)}`}
            className={`shrink-0 rounded-full px-2 py-0.5 font-cuerpo text-[12px] font-bold ${
              urgencia === "alarma"
                ? "bg-error/15 text-error"
                : urgencia === "aviso"
                  ? "bg-alerta/20 text-cafe"
                  : "bg-crema text-cafe-tenue"
            }`}
          >
            {espera(minutosEsperando)}
          </span>
        )}
      </div>

      <p className="truncate font-cuerpo text-[13px] text-cafe-suave">
        {pedido.tipo === "domicilio" ? "Domicilio" : "Recoge"}
        {pedido.barrio && ` · ${pedido.barrio}`}
      </p>

      {/* Lo que hay que preparar, sin abrir nada. Dos líneas y se corta: para armar el pedido
          está el detalle; esto es para reconocerlo. */}
      {pedido.resumenItems && (
        <p className="line-clamp-2 font-cuerpo text-[13px] text-cafe">{pedido.resumenItems}</p>
      )}

      {programadoPara && (
        <p className="font-cuerpo text-[12px] font-bold text-cafe">
          {/* Con pedidos de hoy y de mañana mezclados, una hora suelta es una promesa
              ambigua: el día va siempre, y por eso `cuandoCorto` y no la hora pelada. */}
          Programado · {cuandoCorto(programadoPara)}
        </p>
      )}

      <p className="font-cuerpo text-[13px] text-cafe-suave">
        <span className="font-bold text-cafe">{pesos(pedido.total)}</span> ·{" "}
        {METODO_PAGO_ETIQUETA[pedido.metodoPago] ?? pedido.metodoPago}
        {/* Un Nequi sin comprobante no puede avanzar: mejor decirlo aquí que dejar que
            el empleado descubra el bloqueo al tocar el botón. */}
        {pedido.metodoPago === "nequi" && !pedido.tieneComprobante && (
          <span className="font-bold text-error"> · sin comprobante</span>
        )}
      </p>

      {error && (
        <p role="alert" className="font-cuerpo text-[13px] font-semibold text-error">
          {error}
        </p>
      )}

      {/* El enlace que cubre la tarjeta. Va antes que los botones en el DOM y sin `z`, para
          que cualquier cosa con `relative z-10` quede por encima y siga siendo pulsable. */}
      <Link
        href={`/admin/pedidos/${pedido.numero}`}
        className="absolute inset-0 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-naranja"
      >
        <span className="sr-only">Ver el pedido #{pedido.numero}</span>
      </Link>

      {(pedido.siguiente || pedido.avisoPendiente) && (
        <div className="relative z-10 mt-1 flex flex-wrap items-center gap-2">
          {pedido.siguiente && (
            <button
              type="button"
              onClick={() => avanzar(pedido.siguiente!)}
              disabled={pendiente}
              className="min-h-11 flex-1 rounded-full bg-naranja px-3 font-cuerpo text-sm font-bold text-crema transition-colors hover:bg-naranja-osc focus:outline-none focus:ring-2 focus:ring-naranja focus:ring-offset-2 disabled:opacity-50"
            >
              {pedido.estado === "nuevo" ? "Aceptar" : ETIQUETA_ESTADO[pedido.siguiente]}
            </button>
          )}

          {pedido.avisoPendiente && (
            <button
              type="button"
              onClick={avisar}
              disabled={pendiente}
              className="min-h-11 rounded-full border border-crema-oscura px-3 font-cuerpo text-sm font-bold text-cafe transition-colors hover:bg-crema focus:outline-none focus:ring-2 focus:ring-naranja disabled:opacity-50"
            >
              Avisar
            </button>
          )}
        </div>
      )}
    </article>
  );
}
