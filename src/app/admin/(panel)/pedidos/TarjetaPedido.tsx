"use client";

import Link from "next/link";
import { CalendarClock } from "lucide-react";
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
  const [urlBloqueada, setUrlBloqueada] = useState<string | null>(null);
  const ahora = useAhora();

  // El polling entrega las fechas como string al pasar por JSON; el render del servidor las
  // da como Date. Se normalizan aquí en vez de en dos sitios.
  const creadoEn = new Date(pedido.creadoEn);
  const programadoPara = pedido.programadoPara
    ? new Date(pedido.programadoPara)
    : null;
  const esProgramado = programadoPara !== null;

  const minutosEsperando =
    ahora === null
      ? null
      : Math.max(0, Math.floor((ahora - creadoEn.getTime()) / 60_000));

  // El reloj solo alarma en la primera columna. Que un pedido lleve dos horas es normal si ya
  // está en camino; que lleve veinte minutos sin que nadie lo mire, no.
  //
  // Y nunca alarma en un programado, por más que lleve horas creado: uno tomado anoche para hoy
  // a las 2 pm sale con "13 h" esperando y se pintaba en el mismo rojo que un pedido abandonado
  // —el elemento más gritón de la tarjeta, idéntico en las dos, justo compitiendo contra el azul
  // que las separa—. Esta cuenta mide desde `creadoEn` y ahí no significa nada.
  //
  // Lo que sí sería un problema es un programado que ya se pasó de su hora, pero eso se mide
  // contra `programadoPara` y este contador no lo sabe. Mientras ese cálculo no exista, un badge
  // callado es mejor que uno que grita por el motivo equivocado.
  const urgencia =
    pedido.estado !== "nuevo" || minutosEsperando === null || esProgramado
      ? "normal"
      : minutosEsperando >= ALARMA_MIN
        ? "alarma"
        : minutosEsperando >= AVISO_MIN
          ? "aviso"
          : "normal";

  /**
   * `_blank` y no `location.href`: el panel se queda abierto en su pestaña, que es donde el
   * empleado va a seguir trabajando cuando vuelva de WhatsApp.
   *
   * `window.open` devuelve `null` cuando el navegador bloquea la ventana. Es una señal fiable, y
   * con ella la tarjeta ofrece el enlace a mano en vez de tragarse el mensaje: el candado de
   * idempotencia ya se cerró en el servidor, así que si no se abre aquí no hay segunda vuelta.
   */
  function abrirWhatsapp(url: string | null) {
    if (!url) return;
    const ventana = window.open(url, "_blank", "noopener");
    setUrlBloqueada(ventana ? null : url);
  }

  /** Avanza y avisa en el mismo toque: el pedido cambió de sitio y el cliente se entera. */
  function avanzar(estado: string) {
    setError(null);
    setUrlBloqueada(null);
    iniciar(async () => {
      const resultado = await cambiarEstado({ pedidoId: pedido.id, estado });
      if (!resultado.ok) setError(resultado.error);
      else abrirWhatsapp(resultado.url);
      alCambiar();
    });
  }

  /** El reintento: solo aparece si quedó un aviso pendiente de antes. */
  function avisar() {
    setError(null);
    setUrlBloqueada(null);
    iniciar(async () => {
      const resultado = await prepararAviso({
        numero: pedido.numero,
        estado: pedido.estado,
      });
      if (!resultado.ok) setError(resultado.error);
      else abrirWhatsapp(resultado.url);
      alCambiar();
    });
  }

  return (
    // `relative` + el enlace estirado de abajo: toda la tarjeta abre el detalle sin meter un
    // <button> dentro de un <a>, que no es HTML válido. Antes solo se podía entrar por el
    // número, un objetivo de dos centímetros en una pantalla que se opera con el dedo.
    <article
      className={`relative flex flex-col gap-1.5 rounded-md border p-3 shadow-tarjeta transition-colors focus-within:border-naranja hover:border-naranja/60 ${
        esProgramado
          ? // `border` deja 1 px en los cuatro lados y `border-l-4` sobreescribe solo el
            // izquierdo: esa cinta es lo que se ve desde el otro lado del mostrador. El fondo
            // es un token propio y no `bg-programado/5`, que se desaturaba hasta parecer gris.
            "border-programado/30 border-l-4 border-l-programado bg-programado-suave"
          : "border-crema-oscura bg-tarjeta"
      }`}
    >
      {/* Número, hora, nombre y espera en UNA fila. El nombre iba debajo en 15 px y era la
          línea más alta de la tarjeta sin ser la más útil: para reconocer el pedido basta el
          número, y quien busca por nombre lo lee igual a 14. */}
      <div className="flex items-baseline gap-2">
        <p className="shrink-0 font-titulo text-sm font-bold text-cafe">#{pedido.numero}</p>
        <span className="shrink-0 font-cuerpo text-[11px] text-cafe-tenue">
          {hora(creadoEn)}
        </span>
        <p className="min-w-0 flex-1 truncate font-cuerpo text-sm font-semibold text-cafe">
          {pedido.clienteNombre}
        </p>

        {minutosEsperando !== null && (
          <span
            title={`Entró hace ${espera(minutosEsperando)}`}
            className={`shrink-0 rounded-full px-1.5 py-0.5 font-cuerpo text-[11px] font-bold ${
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

      {/* Tipo y barrio como dos píldoras y no como una frase con puntos: son dos datos que se
          buscan por separado —cómo sale y a dónde va— y así se distinguen sin leer. */}
      <div className="flex min-w-0 items-center gap-1">
        <span className="shrink-0 rounded-full bg-crema px-1.5 py-0.5 font-cuerpo text-[11px] font-bold text-cafe-suave">
          {pedido.tipo === "domicilio" ? "Domicilio" : "Recoge"}
        </span>
        {pedido.barrio && (
          <span className="truncate rounded-full bg-crema px-1.5 py-0.5 font-cuerpo text-[11px] text-cafe-suave">
            {pedido.barrio}
          </span>
        )}
      </div>

      {/* Lo que hay que preparar, sin abrir nada. Dos líneas y se corta: para armar el pedido
          está el detalle; esto es para reconocerlo. */}
      {pedido.resumenItems && (
        <p className="line-clamp-2 font-cuerpo text-xs text-cafe-suave">
          {pedido.resumenItems}
        </p>
      )}

      {/* Píldora y no una línea de texto más: en café y con el mismo peso que el resto, esto se
          leía solo si ya estabas leyendo la tarjeta. Es la misma que la cabecera del detalle.
          `w-fit` para que abrace su texto en vez de cruzar la tarjeta entera. */}
      {programadoPara && (
        <p className="flex w-fit items-center gap-1 rounded-full bg-programado/15 px-2 py-0.5 font-cuerpo text-[11px] font-bold text-programado">
          <CalendarClock className="size-3 shrink-0" />
          {/* Con pedidos de hoy y de mañana mezclados, una hora suelta es una promesa
              ambigua: el día va siempre, y por eso `cuandoCorto` y no la hora pelada. */}
          Programado · {cuandoCorto(programadoPara)}
        </p>
      )}

      {error && (
        <p role="alert" className="font-cuerpo text-xs font-semibold text-error">
          {error}
        </p>
      )}

      {/* La ventana se bloqueó, pero el mensaje no se perdió: está a un clic. Va con `z-10` como
          los botones, para quedar por encima del enlace que cubre la tarjeta. */}
      {urlBloqueada && (
        <a
          href={urlBloqueada}
          target="_blank"
          rel="noopener"
          onClick={() => setUrlBloqueada(null)}
          className="relative z-10 rounded-sm bg-alerta/20 px-2 py-1.5 text-center font-cuerpo text-[13px] font-bold text-cafe underline-offset-2 hover:underline"
        >
          Abrir WhatsApp
        </a>
      )}

      {/* El enlace que cubre la tarjeta. Va antes que los botones en el DOM y sin `z`, para
          que cualquier cosa con `relative z-10` quede por encima y siga siendo pulsable. */}
      <Link
        href={`/admin/pedidos/${pedido.numero}`}
        className="absolute inset-0 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-naranja"
      >
        <span className="sr-only">Ver el pedido #{pedido.numero}</span>
      </Link>

      {/*
        Dinero y acción en la MISMA fila. Eran dos bloques apilados —el total en su párrafo y
        debajo un botón a todo el ancho— y entre los dos se llevaban ~80 px de una tarjeta de
        290. El botón no gana nada por ser ancho: es el único de su fila.

        El texto se queda FUERA del `z-10`: ese enlace invisible que cubre la tarjeta abre el
        detalle, y subir el total por encima dejaría un trozo muerto donde tocar no hace nada.
      */}
      <div className="mt-0.5 flex items-center gap-2">
        <p className="min-w-0 flex-1 font-cuerpo text-xs text-cafe-suave">
          <span className="font-bold text-cafe">{pesos(pedido.total)}</span> ·{" "}
          {METODO_PAGO_ETIQUETA[pedido.metodoPago] ?? pedido.metodoPago}
          {/* Un Nequi sin comprobante no puede avanzar: mejor decirlo aquí que dejar que
              el empleado descubra el bloqueo al tocar el botón. */}
          {pedido.metodoPago === "nequi" && !pedido.tieneComprobante && (
            <span className="font-bold text-error"> · sin comprobante</span>
          )}
          {/* Este cliente no quiso avisos, así que el botón ámbar no aparece para su pedido.
              Sin decirlo, un botón que falta se lee como que el panel está roto —y el tablero
              es donde se opera, no el detalle—. Va aquí y no en su propia fila porque la
              tarjeta se mide en píxeles: es la misma línea y el mismo patrón que el aviso de
              arriba. En gris y no en rojo: no es un problema que resolver, es lo que el
              cliente pidió. El detalle explica el resto, incluido que llamarlo sí se puede. */}
          {!pedido.aceptaAvisos && (
            <span className="font-bold text-cafe-tenue"> · sin avisos</span>
          )}
        </p>

        {(pedido.siguiente || pedido.avisoPendiente) && (
          <div className="relative z-10 flex shrink-0 items-center gap-1.5">
            {/* 44 px de alto aunque el resto de la tarjeta encoja: esto se pulsa con el dedo en
                la tablet del mostrador, y es el único objetivo táctil que tiene. */}
            {pedido.siguiente && (
              <button
                type="button"
                onClick={() => avanzar(pedido.siguiente!)}
                disabled={pendiente}
                className="min-h-11 rounded-full bg-naranja px-3 font-cuerpo text-xs font-bold text-crema transition-colors hover:bg-naranja-osc focus:outline-none focus:ring-2 focus:ring-naranja focus:ring-offset-2 disabled:opacity-50"
              >
                {pedido.estado === "nuevo" ? "Aceptar" : ETIQUETA_ESTADO[pedido.siguiente]}
              </button>
            )}

            {/* Ámbar y no el gris de antes: avanzar y avisar son dos toques, y el segundo se
                olvidaba. Los mismos tokens que el badge de espera de arriba, para que el
                naranja sólido siga siendo solo del botón que mueve el pedido. */}
            {pedido.avisoPendiente && (
              <button
                type="button"
                onClick={avisar}
                disabled={pendiente}
                className="min-h-11 rounded-full border border-alerta bg-alerta/20 px-2.5 font-cuerpo text-xs font-bold text-cafe transition-colors hover:bg-alerta/35 focus:outline-none focus:ring-2 focus:ring-naranja disabled:opacity-50"
              >
                Avisar
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
