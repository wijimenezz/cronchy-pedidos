"use client";

import Link from "next/link";
import { Bike, CalendarClock, type LucideIcon, MessageCircle, Printer } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import type { Domiciliario } from "@/db/queries/domiciliarios";
import type { PedidoEnLista } from "@/db/queries/panel";
import { cuandoCorto, horaCorta, pesos } from "@/lib/notificaciones/plantillas";
import {
  ETIQUETA_AVANCE,
  imprimeComanda,
  METODO_PAGO_ETIQUETA,
} from "@/lib/pedidos/estados";
import { accionesDeTarjeta } from "./acciones-tarjeta";
import { cambiarEstado, prepararAviso, prepararImpresion } from "./acciones";
import { DesgloseDomicilio } from "./DesgloseDomicilio";
import { dispararImpresion } from "./imprimir";
import { ModalAsignar } from "./ModalAsignar";
import { ModalImprimir } from "./ModalImprimir";

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
  domiciliarios,
  alCambiar,
}: {
  pedido: PedidoEnLista;
  /**
   * La agenda, cargada una vez en el servidor y bajada hasta aquí. No se pide por tarjeta: son
   * los mismos tres o cuatro nombres para todas, y `ModalAsignar` ya añade en local al que se
   * cree sobre la marcha.
   */
  domiciliarios: Domiciliario[];
  alCambiar: () => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [urlBloqueada, setUrlBloqueada] = useState<string | null>(null);
  const [asignando, setAsignando] = useState(false);
  const [eligiendoTicket, setEligiendoTicket] = useState(false);
  /** La comanda lista ANTES del toque. Ver `avanzar`: de esto depende que salga el papel. */
  const [urlComanda, setUrlComanda] = useState<string | null>(null);
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

  // Qué botones lleva esta tarjeta. La tabla vive en un módulo puro y probado porque desde que
  // los secundarios son iconos sin texto, uno de más no se lee como un error: se lee como un
  // botón, y quien lo pulse llama a un domiciliario para un pedido que nadie va a llevar.
  const acciones = accionesDeTarjeta({
    estado: pedido.estado,
    tipo: pedido.tipo,
    siguiente: pedido.siguiente,
    avisoPendiente: pedido.avisoPendiente,
  });

  // A una constante y no leído desde `acciones` dentro del JSX: TypeScript pierde el estrechado
  // al cruzar la frontera del `onClick`, y esto evita el `!` que había antes.
  const avance = acciones.avanzar;

  // Este avance manda el pedido a cocina, así que su botón tiene que llevar la comanda dentro.
  const avanceImprime = avance !== null && imprimeComanda(avance);

  /**
   * Trae la comanda **antes** de que nadie toque nada, para que el botón pueda ser un enlace ya
   * cargado y la impresión salga con el gesto del clic (ver `avanzar`). Después del toque sería
   * tarde: es justo el orden que tenía el bug.
   *
   * Solo en las tarjetas que se pueden aceptar, que son unas pocas de la primera columna. Por eso
   * no viaja en la consulta del tablero: ahí engordaría la respuesta del polling cada 15 s con un
   * ticket por tarjeta, y la mayoría ya no se pueden aceptar.
   */
  useEffect(() => {
    if (!avanceImprime) return;

    let cancelado = false;
    prepararImpresion({ numero: pedido.numero, formato: "comanda" })
      .then((r) => {
        if (!cancelado && r.ok) setUrlComanda(r.url);
      })
      // Si falla no hay nada que decir: el botón sigue siendo un <button> y queda la red del
      // servidor. Un error aquí sería ruido sobre algo que el empleado no pidió.
      .catch(() => {});

    return () => {
      cancelado = true;
    };
  }, [avanceImprime, pedido.numero]);

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

  /**
   * Avanza, avisa e imprime en el mismo toque: el pedido cambió de sitio, el cliente se entera y
   * la cocina tiene su comanda.
   *
   * **UN TOQUE TRAE UNA SOLA ACTIVACIÓN Y AQUÍ HAY DOS SALIDAS. ESA ES TODA LA HISTORIA.**
   *
   * Las dos entregan algo al sistema operativo y las dos necesitan la *activación transitoria*
   * del gesto, así que la que va segunda se queda sin ella. Se probaron los dos órdenes y los dos
   * rompen algo, cada uno lo suyo:
   *
   * - Con la impresión delante, el WhatsApp se quedaba en un «Continue to WhatsApp Business?».
   *   Son tres saltos hasta la app —`window.open`, `wa.me` → `api.whatsapp.com`, y es *esa*
   *   página la que salta a `whatsapp://`— y sin gesto heredado Chrome corta en el último.
   * - Con el WhatsApp delante, **no salía el papel y nadie se enteró**: Chrome no pide
   *   confirmación para lanzar un protocolo externo sin activación, lo bloquea en silencio. Aquí
   *   se llegó a escribir que lo peor era un «¿Abrir POS Printer?»; era falso.
   *
   * La salida no es elegir a quién sacrificar, es **dejar de pedir dos activaciones**. La comanda
   * se precarga (`urlComanda`) y el botón de Aceptar es un `<a href="cronchyprinter://…">`: la
   * impresión sale como **acción por defecto del clic real**, antes de que ningún script consuma
   * nada, y este `avanzar` ya solo tiene una salida que pedir — el `window.open` del WhatsApp.
   *
   * De ahí `yaImprimio`: si el enlace se encargó, no hay que volver a disparar. El servidor sigue
   * mandando `urlImpresion` igual, y es la red para cuando no hubo precarga.
   */
  function avanzar(estado: string, yaImprimio = false) {
    setError(null);
    setUrlBloqueada(null);
    iniciar(async () => {
      const resultado = await cambiarEstado({ pedidoId: pedido.id, estado });
      if (!resultado.ok) setError(resultado.error);
      else {
        abrirWhatsapp(resultado.url);
        if (!yaImprimio && resultado.urlImpresion) dispararImpresion(resultado.urlImpresion);
      }
      alCambiar();
    });
  }

  /** La comanda de un toque, sin preguntar. Solo la ofrece la columna de sin aceptar. */
  function imprimirComanda() {
    setError(null);
    iniciar(async () => {
      const resultado = await prepararImpresion({ numero: pedido.numero, formato: "comanda" });
      if (!resultado.ok) setError(resultado.error);
      else dispararImpresion(resultado.url);
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

      {/* Tipo, barrio y quién lo lleva como píldoras y no como una frase con puntos: son datos
          que se buscan por separado —cómo sale, a dónde va y con quién— y así se distinguen sin
          leer.

          El barrio es el que cede anchura (`truncate` sobre el único que no es `shrink-0`): un
          nombre a medias sigue orientando, y las otras dos píldoras o están enteras o no dicen
          nada. */}
      <div className="flex min-w-0 items-center gap-1">
        <span className="shrink-0 rounded-full bg-crema px-1.5 py-0.5 font-cuerpo text-[11px] font-bold text-cafe-suave">
          {pedido.tipo === "domicilio" ? "Domicilio" : "Recoge"}
        </span>
        {pedido.barrio && (
          <span className="truncate rounded-full bg-crema px-1.5 py-0.5 font-cuerpo text-[11px] text-cafe-suave">
            {pedido.barrio}
          </span>
        )}
        {/* Quién lo lleva. Antes se leía en el rótulo del botón —"Asignar" contra "Cambiar"—, y
            al pasar ese botón a icono esa información se habría perdido justo cuando el trabajo
            en curso la bajó hasta aquí. Sin ella el operador no distingue el pedido que nadie ha
            llamado del que ya tiene domiciliario, y llama dos veces al mismo. */}
        {pedido.domiciliarioNombre && (
          <span
            title={`Lo lleva ${pedido.domiciliarioNombre}`}
            className="flex max-w-28 shrink-0 items-center gap-1 rounded-full bg-crema px-1.5 py-0.5 font-cuerpo text-[11px] text-cafe-suave"
          >
            <Bike className="size-3 shrink-0" />
            <span className="truncate">{pedido.domiciliarioNombre}</span>
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
        El total, en su propia línea y a todo el ancho.

        Compartía fila con el botón naranja, y salió de ahí porque los ~215 px útiles de la
        tarjeta —columna de ~239 en la tablet en vertical— no dan para el total, tres iconos y el
        rótulo del botón que avanza el pedido. Antes se resolvía apilando DOS filas de
        botones; ahora la que cede es esta, que no necesita compañía: aquí no compite con nada y
        los avisos que cuelgan de él —"sin comprobante", "sin avisos"— dejaron de estrujarlo.

        Se queda FUERA del `z-10`: ese enlace invisible que cubre la tarjeta abre el detalle, y
        subir el total por encima dejaría un trozo muerto donde tocar no hace nada.
      */}
      <p className="mt-0.5 font-cuerpo text-xs text-cafe-suave">
        <span className="font-bold text-cafe">{pesos(pedido.total)}</span> ·{" "}
        {METODO_PAGO_ETIQUETA[pedido.metodoPago] ?? pedido.metodoPago}
        {/* Un Nequi sin comprobante no puede avanzar: mejor decirlo aquí que dejar que
            el empleado descubra el bloqueo al tocar el botón. */}
        {pedido.metodoPago === "nequi" && !pedido.tieneComprobante && (
          <span className="font-bold text-error"> · sin comprobante</span>
        )}
        {/* Este cliente no quiso avisos, así que el botón ámbar no aparece para su pedido.
            Sin decirlo, un botón que falta se lee como que el panel está roto —y el tablero
            es donde se opera, no el detalle—. En gris y no en rojo: no es un problema que
            resolver, es lo que el cliente pidió. El detalle explica el resto, incluido que
            llamarlo sí se puede. */}
        {!pedido.aceptaAvisos && (
          <span className="font-bold text-cafe-tenue"> · sin avisos</span>
        )}
      </p>

      {/* Cuánto de ese total es el envío, que es lo que se le paga al domiciliario. Va FUERA del
          `z-10` igual que el total: el enlace invisible que cubre la tarjeta abre el detalle, y
          subir esto por encima dejaría un trozo muerto donde tocar no hace nada. */}
      <DesgloseDomicilio pedido={pedido} />

      {/* TODAS las acciones en UNA fila, ancladas al borde DERECHO y cada una a su tamaño.

          Nadie crece: la fila mide 188 px en su caso normal y la tarjeta suele dejar más, así que
          el sobrante tiene que caer en algún lado y cae **antes del primer icono**. A cambio, el
          borde derecho del naranja queda en el mismo sitio en todas las tarjetas, mida lo que mida
          la columna y lleve los iconos que lleve — con la fila pegada a la izquierda su posición
          bailaba según cuántos hubiera al lado.

          Los tres secundarios son iconos de 40×40 sin texto y el naranja se queda con el rótulo.
          No es simetría mal resuelta: el naranja es la única acción irreversible de la tarjeta
          —cambia el estado y dispara el WhatsApp al cliente— y su significado cambia con la
          columna, así que es justo el que no puede ser un dibujo. De paso se evita que "En camino"
          y "Asignar" acaben siendo la misma bici, uno al lado del otro.

          Nada de esto se estira para llenar la columna, y el porqué está en el botón naranja.

          `flex-wrap` cubre el único caso de cuatro botones: tres iconos y sus huecos son 138 px y
          el naranja pide 96, así que en la columna estrecha de la tablet —215 px útiles— no caben
          los 234 y el naranja baja a la segunda línea. Es raro y se ve; un rótulo truncado no se
          vería. En preparación, que es el caso de todos los días, son 188 y sobra.

          `relative z-10` es lo que mantiene los botones por encima del enlace que cubre la
          tarjeta. Sin él dejan de ser pulsables. */}
      {/* Las cuatro, aunque hoy `asignar` implique `imprimir`: el día que la impresión deje de
          salir en alguna columna, esa implicación se rompe y la fila entera desaparecería con
          los otros botones dentro. */}
      {(acciones.imprimir || acciones.asignar || acciones.avisar || avance) && (
        <div className="relative z-10 flex flex-wrap items-center justify-end gap-1.5">
          {/* Neutro y no ámbar: imprimir no es una tarea pendiente que alguien tenga que cerrar
              —la comanda ya salió sola al aceptar—, es algo que se puede volver a hacer. El ámbar
              está reservado a lo que falta por hacer, que aquí es asignar y avisar.

              Sin aceptar imprime la comanda de una; a partir de ahí abre el modal. Quien decide
              es `accionesDeTarjeta`, que está probado: el porqué vive ahí. */}
          {acciones.imprimir && (
            <BotonIcono
              icono={Printer}
              etiqueta={
                acciones.imprimir === "comanda"
                  ? `Imprimir la comanda del pedido #${pedido.numero}`
                  : `Imprimir el pedido #${pedido.numero} — elegir comanda o recibo`
              }
              onClick={
                acciones.imprimir === "comanda"
                  ? imprimirComanda
                  : () => setEligiendoTicket(true)
              }
              disabled={pendiente}
              abreDialogo={acciones.imprimir === "menu"}
            />
          )}

          {/* Mismo criterio de tono que el detalle: mientras nadie lo lleve esto es una tarea
              pendiente y va en ámbar; asignado baja de tono, porque reasignar es la excepción.
              Ámbar y nunca naranja lleno — ese es del botón que mueve el pedido de columna, y
              aquí queda en la misma fila: un naranja al lado insinuaría que asignar lo avanza, y
              no lo hace (regla 18).

              Sin rótulo, el tono y la píldora del nombre de arriba son lo que distingue "nadie lo
              lleva" de "ya salió con alguien". */}
          {acciones.asignar && (
            <BotonIcono
              icono={Bike}
              etiqueta={
                pedido.domiciliarioNombre
                  ? `Cambiar el domiciliario del pedido #${pedido.numero} · ahora lo lleva ${pedido.domiciliarioNombre}`
                  : `Asignar domiciliario al pedido #${pedido.numero}`
              }
              tono={pedido.domiciliarioNombre ? "neutro" : "alerta"}
              onClick={() => setAsignando(true)}
              disabled={pendiente}
              abreDialogo
            />
          )}

          {/* Ámbar y no gris: avanzar y avisar son dos toques, y el segundo se olvidaba. Los
              mismos tokens que el badge de espera de arriba. */}
          {acciones.avisar && (
            <BotonIcono
              icono={MessageCircle}
              etiqueta={`Avisar al cliente del pedido #${pedido.numero} por WhatsApp`}
              tono="alerta"
              onClick={avisar}
              disabled={pendiente}
            />
          )}

          {/* NUNCA `flex-1` aquí, por más espacio libre que sobre a la derecha.

              Lo llevó, y en un monitor de 1850 px —donde las columnas miden ~579 y no los 239 de
              la tablet, porque este tablero renunció al tope de ancho a propósito (ver
              `layout.tsx`)— el elemento más gritón de la tarjeta se estiraba a ~470 px, cambiaba
              de tamaño según cuántos iconos tuviera al lado y dejaba a los tres apretados contra
              el borde. La fila es una barra de herramientas: cada botón mide lo suyo.

              Con el `justify-end` de la fila hay un motivo más: un botón que crece empujaría a los
              iconos y el grupo dejaría de estar anclado a la derecha, que es justo lo que le da su
              posición fija.

              `min-w-24` es lo que hace que "Aceptar", "En camino", "Listo" y "Entregado" midan
              igual; a su ancho natural iban de 62 a 90 px y el botón bailaba al cambiar de
              columna. Y `shrink-0` para que, cuando la fila vaya apretada, baje de línea en vez
              de comprimirse hasta enseñar "En cami…". */}
          {avance &&
            /* **Un `<a>` y no un `<button>` cuando la comanda está precargada**, y no es cosmética:
               es lo que hace que salga el papel. El clic real lanza `cronchyprinter://` como su
               acción por defecto, antes de que el `onClick` gaste la activación del gesto en el
               `window.open` del WhatsApp. Con los dos como script, uno de los dos se quedaba sin
               gesto siempre — ver el comentario largo de `avanzar`.

               No unloadea la página: un enlace a un esquema externo lo trata el navegador como
               entrega a otra aplicación y el tablero se queda donde está, igual que en
               `dispararImpresion`.

               Sin precarga cae al `<button>` de siempre y la comanda la dispara el servidor por el
               camino de antes. Es peor, pero no es nada. */
            (urlComanda ? (
              <a
                href={urlComanda}
                onClick={() => avanzar(avance, true)}
                aria-disabled={pendiente}
                className={`flex h-10 min-w-24 shrink-0 items-center justify-center rounded-full bg-naranja px-4 font-cuerpo text-xs font-bold text-crema transition-colors hover:bg-naranja-osc focus:outline-none focus:ring-2 focus:ring-naranja focus:ring-offset-2 ${
                  pendiente ? "pointer-events-none opacity-50" : ""
                }`}
              >
                {ETIQUETA_AVANCE[avance]}
              </a>
            ) : (
              <button
                type="button"
                onClick={() => avanzar(avance)}
                disabled={pendiente}
                className="h-10 min-w-24 shrink-0 rounded-full bg-naranja px-4 font-cuerpo text-xs font-bold text-crema transition-colors hover:bg-naranja-osc focus:outline-none focus:ring-2 focus:ring-naranja focus:ring-offset-2 disabled:opacity-50"
              >
                {ETIQUETA_AVANCE[avance]}
              </button>
            ))}
        </div>
      )}

      {eligiendoTicket && (
        <ModalImprimir numero={pedido.numero} onCerrar={() => setEligiendoTicket(false)} />
      )}

      {asignando && (
        <ModalAsignar
          pedidoId={pedido.id}
          numero={pedido.numero}
          domiciliarios={domiciliarios}
          onCerrar={() => setAsignando(false)}
          onAsignado={(url) => {
            abrirWhatsapp(url);
            alCambiar();
          }}
        />
      )}
    </article>
  );
}

/** Ámbar = tarea pendiente · neutro = se puede hacer. */
type TonoIcono = "neutro" | "alerta";

const TONO_ICONO: Record<TonoIcono, string> = {
  neutro: "border-crema-oscura text-cafe-suave hover:bg-crema",
  alerta: "border-alerta bg-alerta/20 text-cafe hover:bg-alerta/35",
};

/**
 * Una acción secundaria de la tarjeta: 40×40, solo icono.
 *
 * **`etiqueta` no es decorativa y por eso es obligatoria.** Sin texto visible, es lo único que
 * queda para el lector de pantalla y para el tooltip de quien opera en escritorio, así que dice la
 * acción entera —con el número del pedido— y no la palabra suelta que llevaba el botón cuando
 * tenía rótulo.
 *
 * El naranja que avanza el pedido NO usa esto: conserva su texto, que es lo que lo distingue.
 */
function BotonIcono({
  icono: Icono,
  etiqueta,
  tono = "neutro",
  onClick,
  disabled,
  abreDialogo,
}: {
  icono: LucideIcon;
  etiqueta: string;
  tono?: TonoIcono;
  onClick?: () => void;
  disabled?: boolean;
  /** Avisa de que detrás hay un modal y no una acción inmediata. */
  abreDialogo?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={etiqueta}
      aria-label={etiqueta}
      aria-haspopup={abreDialogo ? "dialog" : undefined}
      className={`flex size-10 shrink-0 items-center justify-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-naranja disabled:opacity-50 ${TONO_ICONO[tono]}`}
    >
      <Icono className="size-5" />
    </button>
  );
}
