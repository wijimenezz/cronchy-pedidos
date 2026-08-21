"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff } from "lucide-react";
import type { Domiciliario } from "@/db/queries/domiciliarios";
import type { PedidoEnLista } from "@/db/queries/panel";
import { COLUMNAS_TABLERO, columnaDeTablero } from "@/lib/pedidos/estados";
import { TarjetaPedido } from "./TarjetaPedido";
import { idsNuevos } from "./alerta";
import {
  desbloquearSonido,
  detenerMantenerDespierto,
  ETIQUETA_NIVEL,
  guardarNivel,
  guardarPreferencia,
  iniciarMantenerDespierto,
  leerNivel,
  type Nivel,
  NIVELES,
  prefiereSonido,
  reanudarAlPrimerToque,
  silenciar,
  sonarAviso,
} from "./sonido";
import {
  avisarPedidosNuevos,
  pedirPermisoNotificaciones,
  permisoDenegado,
  problemaDeAvisos,
} from "./notificaciones";
import { activarPush, desactivarPush, type ResultadoPush } from "./push";

/**
 * Cada cuánto se pregunta por pedidos nuevos.
 *
 * Eran 5 s y era una cifra puesta a ojo: nadie acepta un pedido en menos de quince, así que
 * ese ritmo no compraba nada que un humano aprovechara y sí costaba lo suyo — con el panel
 * abierto de 12 a 8 pm eran ~173.000 invocaciones al mes por pestaña, contra ~58.000 ahora.
 *
 * Lo que hace que 15 s no se noten es lo de abajo: volver a la pestaña o recuperar la conexión
 * no esperan al siguiente tic.
 */
const CADA_MS = 15_000;

/** Tope entre consultas. Sin él, alternar pestañas rápido dispara una ráfaga. */
const MINIMO_ENTRE_MS = 3000;

/**
 * Cada cuánto vuelve a sonar mientras quede algo sin aceptar. Un solo pitido se pierde entre
 * el ruido de una cocina; que insista significa que el silencio es información: alguien lo
 * tiene.
 */
const INSISTIR_MS = 30_000;

const TITULO_BASE = "Pedidos — Cronchy";

/**
 * El tablero de operación. Se refresca solo cada 15 s (CLAUDE.md: polling, nada de
 * WebSockets) porque el negocio lo deja abierto en el mostrador y un pedido nuevo tiene
 * que aparecer sin que nadie recargue.
 *
 * Cuatro columnas y no una lista: en una lista plana, los cuatro pedidos sin aceptar y los
 * tres que ya van en camino se ven igual. Lo que se opera aquí es un flujo, y verlo por fases
 * es la diferencia entre saber cómo va la cocina y tener que leer pedido por pedido.
 *
 * Se pensó para la tablet de 12" del mostrador y para escritorio: a partir de 1024 px caben
 * las cuatro columnas (~239 px cada una en vertical, ~324 en horizontal). Por debajo —un
 * teléfono de urgencia— pasan a pestañas, porque cuatro columnas ahí no se leen.
 */
export function ListaPedidos({
  iniciales,
  domiciliarios,
  selectorDia,
  estimado,
  acciones,
}: {
  iniciales: PedidoEnLista[];
  /**
   * La agenda de domiciliarios, para el botón de asignar de cada tarjeta. Se carga una vez en el
   * servidor y baja como dato —no como nodo, a diferencia de los tres de abajo— porque quien la
   * consume es un componente de cliente que la mete en el estado del modal.
   */
  domiciliarios: Domiciliario[];
  /**
   * Controles de servidor que comparten la barra con el contador y el botón de avisos, que sí
   * son estado de este componente. Llegan como nodos ya renderizados: así conviven en una sola
   * fila de 48 px sin mover ningún estado de sitio.
   */
  selectorDia: React.ReactNode;
  estimado: React.ReactNode;
  acciones: React.ReactNode;
}) {
  const router = useRouter();
  const [pedidos, setPedidos] = useState(iniciales);
  const [sinConexion, setSinConexion] = useState(false);
  /** Solo manda en pantalla estrecha, donde las columnas son pestañas. */
  const [columnaVisible, setColumnaVisible] = useState(0);
  /**
   * Si el aviso puede sonar. Arranca en `false` **siempre**, también para quien ya lo tenía
   * activado: el navegador no deja sonar nada hasta que alguien toque la página, así que
   * decir lo contrario en el botón sería mentir. Lo reactiva el primer toque.
   */
  const [sonido, setSonido] = useState(false);
  /**
   * El volumen del aviso, recordado entre recargas. `leerNivel()` toca `localStorage`, así que va
   * en el inicializador perezoso del `useState` y no en el cuerpo: en el render del servidor no
   * existe y devolvería "alto" igual, pero llamarlo en cada render sería leer el almacenamiento
   * cincuenta veces para nada.
   */
  const [nivel, setNivel] = useState<Nivel>(leerNivel);
  /**
   * Si además del pitido va a salir la notificación del sistema. Se pinta porque un panel que
   * cree estar avisando y no avisa es peor que uno mudo declarado: quien deniega el permiso sin
   * querer no tiene otra forma de enterarse.
   *
   * Se lee del navegador al montar —el permiso sobrevive a la recarga— y no se pide aquí: un
   * diálogo de permiso que nadie invocó es de las cosas que se deniegan por reflejo. Lo pide el
   * botón. En el servidor no hay `Notification`, y da igual: el aviso solo se pinta con el
   * sonido armado, que ahí siempre es `false`.
   */
  const [notificaSistema, setNotificaSistema] = useState(() => !permisoDenegado());
  /**
   * Cómo quedó el push. `null` mientras no se ha intentado.
   *
   * Se guarda el motivo y no un sí/no porque el fallo de ayer fue justo ese: `activarPush()`
   * devolvía un booleano, quien llamaba lo descartaba, y un push que no se registró se veía
   * exactamente igual que uno que sí.
   */
  const [estadoPush, setEstadoPush] = useState<ResultadoPush | null>(null);

  /** Cuándo salió la última consulta, para el tope de `MINIMO_ENTRE_MS`. */
  const ultimoRefresco = useRef(0);

  const refrescar = useCallback(async () => {
    ultimoRefresco.current = Date.now();

    try {
      const respuesta = await fetch("/api/admin/pedidos", { cache: "no-store" });

      // La sesión se venció mientras la pantalla estaba abierta: al login, no a un tablero
      // congelado que aparenta estar vivo.
      if (respuesta.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!respuesta.ok) throw new Error(String(respuesta.status));

      const datos = (await respuesta.json()) as { pedidos: PedidoEnLista[] };
      setPedidos(datos.pedidos);
      setSinConexion(false);
    } catch {
      // Se avisa pero no se borra lo que ya está en pantalla: en el local el wifi se cae
      // y un tablero viejo sirve más que uno vacío.
      setSinConexion(true);
    }
  }, [router]);

  /**
   * El reloj, más los dos momentos en los que no tiene sentido esperarlo.
   *
   * **El intervalo no se pausa con la pestaña oculta, y es a propósito**: ya no solo pinta el
   * tablero, es lo que detecta el pedido para avisar. Pausarlo apagaría la alarma justo cuando
   * el empleado está en otra cosa, que es cuando más falta hace.
   *
   * Todo se suscribe y se limpia aquí: un solo sitio que engancha y un solo `return` que
   * desmonta, en vez de tres efectos que hay que leer juntos para saber qué queda vivo.
   */
  useEffect(() => {
    const reloj = setInterval(() => void refrescar(), CADA_MS);

    function refrescarSiToca() {
      if (Date.now() - ultimoRefresco.current < MINIMO_ENTRE_MS) return;
      void refrescar();
    }

    // Volver a la pestaña es justo cuando más falta: si entraron pedidos mientras el empleado
    // estaba en WhatsApp, al volver los ve **y suenan**, porque la detección reacciona a la
    // lista nueva y no a cómo llegó.
    //
    // Y de paso se reanima el audio: si Chrome suspendió el contexto mientras la pestaña estaba
    // de fondo, el siguiente aviso lo encontraría muerto. `sonarAviso` también reanima por su
    // cuenta, pero hacerlo aquí es gratis y llega antes.
    function alVolver() {
      if (document.visibilityState !== "visible") return;

      refrescarSiToca();
      if (sonido) void desbloquearSonido();
    }

    // El banner no espera a que falle una petición: en el local el wifi se cae y quien opera
    // tiene que saberlo en el momento, no dentro de quince segundos.
    function alCaerLaRed() {
      setSinConexion(true);
    }

    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", refrescarSiToca);
    window.addEventListener("offline", alCaerLaRed);

    return () => {
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("online", refrescarSiToca);
      window.removeEventListener("offline", alCaerLaRed);
    };
    // `sonido` entra en las deps y por tanto reengancha los listeners al tocar el botón. Es una
    // vez por clic de un humano, no por vuelta del polling: recrear el reloj ahí no cuesta nada.
  }, [refrescar, sonido]);

  const sinAceptar = pedidos.filter((p) => p.estado === "nuevo");

  /**
   * Los pedidos sin aceptar que ya conocíamos. **Se siembra con los `iniciales`**: si no, cada
   * recarga sonaría como si todo fuera nuevo y el aviso dejaría de significar "entró uno".
   */
  const vistos = useRef<string[]>(iniciales.filter((p) => p.estado === "nuevo").map((p) => p.id));
  // El contador para el temporizador que insiste. Va en un ref y no en las dependencias del
  // efecto: la lista se reemplaza cada 5 s con el polling, así que un efecto que dependiera
  // de ella recrearía el temporizador de 30 s antes de que llegue a disparar. Nunca sonaría.
  const pendientes = useRef(0);

  // Avisa en cuanto aparece uno que no estaba, y de paso deja los dos refs al día. Va en un
  // efecto y no en el render porque escribir un ref mientras se pinta es justo lo que React
  // prohíbe: el render tiene que poder repetirse sin dejar rastro.
  //
  // Los dos canales salen juntos: el pitido para quien está delante y la notificación del
  // sistema para quien está en otra aplicación. Antes solo estaba el primero, y por eso un
  // pedido podía entrar sin que nadie se enterara.
  useEffect(() => {
    const sinAceptarAhora = pedidos.filter((p) => p.estado === "nuevo").map((p) => p.id);
    const nuevos = idsNuevos(vistos.current, sinAceptarAhora);

    vistos.current = sinAceptarAhora;
    pendientes.current = sinAceptarAhora.length;

    // El gate estaba solo dentro de `sonarAviso`, mirando el estado del AudioContext: apagar el
    // botón cambiaba el icono y el pitido seguía saliendo igual.
    if (nuevos.length === 0 || !sonido) return;

    void sonarAviso();
    avisarPedidosNuevos(nuevos.length, sinAceptarAhora.length);
    // Reejecutarlo al tocar el botón es inofensivo: `vistos` ya quedó al día, así que `nuevos`
    // sale vacío y no suena nada.
  }, [pedidos, sonido]);

  // Y sigue insistiendo mientras nadie lo acepte. Solo el sonido: repetir la notificación cada
  // 30 s sería acoso, y la primera sigue en pantalla porque lleva `requireInteraction`.
  useEffect(() => {
    if (!sonido) return;

    const id = setInterval(() => {
      if (pendientes.current > 0) void sonarAviso();
    }, INSISTIR_MS);

    return () => clearInterval(id);
  }, [sonido]);

  // El título es la única señal que se ve **desde otra pestaña**, y sale gratis.
  useEffect(() => {
    document.title = sinAceptar.length > 0 ? `(${sinAceptar.length}) ${TITULO_BASE}` : TITULO_BASE;

    return () => {
      document.title = TITULO_BASE;
    };
  }, [sinAceptar.length]);

  // Devuelve el sonido al recargar sin obligar a tocar el botón cada mañana: el navegador
  // exige un gesto, pero cualquiera sirve y el empleado va a tocar algo igualmente.
  useEffect(() => {
    if (!prefiereSonido()) return;

    return reanudarAlPrimerToque(() => {
      setSonido(true);
      iniciarMantenerDespierto();
    });
  }, []);

  /**
   * Registrar el push en CADA carga del panel, y no solo al encender el botón.
   *
   * Este efecto es el arreglo del bug que dejó la tabla de suscripciones vacía: quien ya tenía
   * el sonido guardado nunca volvía a pasar por `alternarSonido`, así que nunca se suscribía —
   * mientras el botón afirmaba que los avisos estaban activos.
   *
   * Repetirlo no cuesta: `activarPush()` reutiliza la suscripción que ya exista y el servidor
   * hace upsert. Así se autorrepara si la fila se borró o si entró otro empleado.
   */
  useEffect(() => {
    if (!prefiereSonido()) return;

    void activarPush().then(setEstadoPush);
  }, []);

  // Al desmontar —salir del tablero, irse a un día pasado— se corta el tono testigo. Sin esto
  // la pestaña seguiría pidiéndole al navegador que la trate como si estuviera sonando.
  useEffect(() => detenerMantenerDespierto, []);

  const problema = problemaDeAvisos(notificaSistema, estadoPush);

  /**
   * Cambiar el volumen **suena en el momento**. Sin eso se ajusta a ciegas y hay que esperar un
   * pedido real para saber si sirvió, que es justo lo que no se puede provocar a voluntad. El
   * toque además vale como el gesto que el navegador exige para el audio.
   */
  function cambiarNivel(destino: Nivel) {
    setNivel(destino);
    guardarNivel(destino);
    void sonarAviso();
  }

  function alternarSonido() {
    const activar = !sonido;
    setSonido(activar);
    guardarPreferencia(activar);

    if (!activar) {
      silenciar();
      setEstadoPush(null);
      void desactivarPush();
      return;
    }

    // Este clic **es** el gesto que hace falta, y sirve para los tres canales: desbloquea el
    // audio, y es el único momento en que el navegador deja pedir el permiso de notificaciones.
    // Suena una vez para que quien lo active oiga qué va a oír cuando entre un pedido.
    void desbloquearSonido().then(() => {
      iniciarMantenerDespierto();
      void sonarAviso();
    });

    void pedirPermisoNotificaciones().then((concedido) => {
      setNotificaSistema(concedido);
      // El push solo se suscribe con el permiso ya concedido: sin él, `subscribe()` falla y
      // además no habría forma de mostrar lo que llegara.
      void activarPush().then(setEstadoPush);
    });
  }

  /**
   * Cada pedido en su columna, y dentro de cada una los programados **al final y por su
   * hora**: uno para las nueve de la noche encabezando la columna a las tres de la tarde es
   * una distracción. Lo inmediato manda, y entre lo inmediato manda lo más reciente, que es
   * como llega de la consulta.
   */
  const porColumna = COLUMNAS_TABLERO.map((_, i) =>
    pedidos
      .filter((p) => columnaDeTablero(p.estado, p.tipo) === i)
      .sort((a, b) => {
        if (Boolean(a.programadoPara) !== Boolean(b.programadoPara)) {
          return a.programadoPara ? 1 : -1;
        }
        if (a.programadoPara && b.programadoPara) {
          return +new Date(a.programadoPara) - +new Date(b.programadoPara);
        }
        return 0;
      }),
  );

  /**
   * La última columna ("Terminados") vacía se colapsa a una franja angosta.
   *
   * Un cuarto del ancho para un rótulo y un "Nada aún" es el peor reparto posible: ese espacio
   * lo necesitan las tres columnas que sí se operan. En cuanto entra el primer pedido terminado
   * la rejilla vuelve a cuatro columnas iguales.
   */
  const ultima = COLUMNAS_TABLERO.length - 1;
  const terminadosVacio = porColumna[ultima].length === 0;

  return (
    // `h-full` + `min-h-0`: el tablero ocupa el alto que le da `<main>` y NO crece con el
    // contenido. Es lo que permite que el scroll ocurra dentro de cada columna en vez de
    // arrastrar las cuatro a la vez.
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* Una sola barra de herramientas donde antes había un <h1>, el chip del estimado y una
          fila de acciones: tres bloques apilados para lo que cabe en una línea. */}
      <div className="flex h-12 shrink-0 items-center gap-3">
        {selectorDia}

        <span className="shrink-0 font-cuerpo text-sm text-cafe-suave">
          Pedidos <span className="font-bold text-cafe">{pedidos.length}</span>
        </span>

        {estimado}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {sinConexion && (
            <p
              role="status"
              className="rounded-full bg-alerta/15 px-2.5 py-1 font-cuerpo text-xs font-semibold text-cafe"
            >
              Sin conexión…
            </p>
          )}

          {acciones}

          {/* Se pinta llamativo cuando está apagado y hay pedidos esperando: un panel mudo sin
              que nadie lo sepa es peor que uno que no avisa. */}
          <button
            type="button"
            onClick={alternarSonido}
            aria-pressed={sonido}
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 font-cuerpo text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-naranja ${
              sonido
                ? "border-crema-oscura text-cafe-suave hover:bg-crema"
                : sinAceptar.length > 0
                  ? "border-naranja bg-naranja text-crema"
                  : "border-naranja text-naranja-osc hover:bg-naranja/10"
            }`}
          >
            {sonido ? <Bell className="size-4" /> : <BellOff className="size-4" />}
            {sonido ? "Avisos" : "Activar avisos"}
          </button>

          {/* A la DERECHA de la campana y no a su izquierda: así el botón que se busca y se pulsa
              no se mueve de sitio al aparecer este control. Y solo con los avisos armados —ofrecer
              volumen en un panel mudo no dice nada. */}
          {sonido && (
            <div
              role="group"
              aria-label="Volumen del aviso"
              className="flex h-9 shrink-0 items-center rounded-full border border-crema-oscura p-0.5"
            >
              {NIVELES.map((opcion) => (
                <button
                  key={opcion}
                  type="button"
                  onClick={() => cambiarNivel(opcion)}
                  aria-pressed={opcion === nivel}
                  className={`h-8 rounded-full px-2.5 font-cuerpo text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-naranja ${
                    opcion === nivel ? "bg-crema text-cafe" : "text-cafe-tenue hover:text-cafe"
                  }`}
                >
                  {ETIQUETA_NIVEL[opcion]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Qué canal quedó armado y cuál no. El silencio aquí solo puede significar que los tres
          funcionan: un panel que cree estar avisando y no avisa es peor que uno mudo declarado.

          Este SÍ se queda, a diferencia del banner de "N pedidos sin aceptar" que se quitó: aquel
          repetía un número que la columna ya canta, este dice algo que no está en ninguna otra
          parte de la pantalla. */}
      {sonido && problema && (
        <p
          role="status"
          className="shrink-0 rounded-md bg-alerta/15 px-3 py-1.5 font-cuerpo text-xs text-cafe"
        >
          {problema}
        </p>
      )}

      {/* Las pestañas solo existen en pantalla estrecha; a partir de `lg` mandan las columnas
          y estos botones sobran. */}
      <div className="flex shrink-0 gap-2 overflow-x-auto lg:hidden" role="tablist">
        {COLUMNAS_TABLERO.map((columna, i) => (
          <button
            key={columna.titulo}
            type="button"
            role="tab"
            aria-selected={i === columnaVisible}
            onClick={() => setColumnaVisible(i)}
            className={`min-h-11 shrink-0 rounded-full border px-4 font-cuerpo text-sm font-bold transition-colors ${
              i === columnaVisible
                ? "border-naranja bg-naranja text-crema"
                : "border-crema-oscura text-cafe-suave hover:bg-crema"
            }`}
          >
            {columna.titulo}
            <span className="ml-1.5 font-normal opacity-75">{porColumna[i].length}</span>
          </button>
        ))}
      </div>

      {/* `min-h-0` aquí es lo que hace funcionar todo el overflow de abajo: sin él, el contenido
          empuja la altura de la rejilla y el scroll de las columnas no llega a existir nunca. */}
      <div
        className={`grid min-h-0 flex-1 gap-3 ${
          terminadosVacio ? "lg:grid-cols-[1fr_1fr_1fr_auto]" : "lg:grid-cols-4"
        }`}
      >
        {COLUMNAS_TABLERO.map((columna, i) => (
          <Columna
            key={columna.titulo}
            titulo={columna.titulo}
            vacio={columna.vacio}
            pedidos={porColumna[i]}
            domiciliarios={domiciliarios}
            alCambiar={refrescar}
            oculta={i !== columnaVisible}
            urge={i === 0 && porColumna[0].length > 0}
            colapsada={i === ultima && terminadosVacio}
          />
        ))}
      </div>
    </div>
  );
}

function Columna({
  titulo,
  vacio,
  pedidos,
  domiciliarios,
  alCambiar,
  oculta,
  urge,
  colapsada,
}: {
  titulo: string;
  vacio: string;
  pedidos: PedidoEnLista[];
  domiciliarios: Domiciliario[];
  alCambiar: () => void;
  /** En pantalla estrecha solo se ve la pestaña elegida; en `lg` se ven todas. */
  oculta: boolean;
  /**
   * Hay algo esperando a que alguien lo mire. Sustituye al banner naranja que decía este mismo
   * número con letras, dos centímetros más arriba y ocupando una fila entera.
   */
  urge: boolean;
  /** "Terminados" sin nada: se encoge para devolverle el ancho a las que sí se operan. */
  colapsada: boolean;
}) {
  // Colapsada solo en `lg`: en estrecho las columnas son pestañas y la elegida ocupa todo.
  if (colapsada) {
    return (
      <section
        className={`${oculta ? "hidden lg:flex" : "flex"} min-h-0 flex-col lg:w-10 lg:items-center lg:justify-start lg:rounded-md lg:border lg:border-dashed lg:border-crema-oscura lg:py-3`}
      >
        <h2 className="flex shrink-0 items-baseline gap-2 lg:hidden">
          <span className="font-titulo text-sm font-bold text-cafe">{titulo}</span>
          <span className="font-cuerpo text-xs text-cafe-tenue">0</span>
        </h2>
        <p className="hidden font-cuerpo text-xs text-cafe-tenue lg:block lg:[writing-mode:vertical-rl]">
          {titulo} · 0
        </p>
      </section>
    );
  }

  return (
    <section className={`${oculta ? "hidden lg:flex" : "flex"} min-h-0 flex-col gap-2`}>
      {/* Ya no hace falta `sticky`: el que baja es la lista de abajo, así que el encabezado no
          se va a ninguna parte. */}
      <h2 className="flex shrink-0 items-center gap-2">
        {urge && (
          <span
            aria-hidden
            className="size-2 shrink-0 animate-pulse rounded-full bg-error"
          />
        )}
        <span className="font-titulo text-sm font-bold text-cafe">{titulo}</span>
        {/* La cifra de lo que urge se lee desde el otro lado del mostrador: misma talla que el
            título y en naranja, no el gris de 12 px con el que se contaba lo ya despachado.
            Quien manda es `urge` —la prop que ya distingue esa columna— y no el rótulo: un
            `titulo === "Sin aceptar"` se rompería en silencio al renombrar la columna. */}
        <span
          className={`font-cuerpo text-sm font-bold ${urge ? "text-naranja-osc" : "text-cafe-tenue"}`}
        >
          {pedidos.length}
        </span>
      </h2>

      {pedidos.length === 0 ? (
        <p className="shrink-0 rounded-md border border-dashed border-crema-oscura px-3 py-3 text-center font-cuerpo text-xs text-cafe-tenue">
          {vacio}
        </p>
      ) : (
        /*
          El único scroll del tablero.

          **`scrollbar-gutter: stable` reserva el hueco de la barra en las CUATRO columnas, tengan
          scroll o no, y eso arregla un bug real**: con 5 pedidos a "En preparación" le salía barra,
          esa barra se comía ~15 px de la lista y la dejaba por debajo del umbral de la rejilla, así
          que partía en una sola columna mientras "En camino" —con 3 pedidos y sin barra— partía en
          dos. Dos columnas del mismo ancho maquetando distinto según cuántos pedidos tuvieran, y
          las tarjetas saltando cada vez que una ganaba o perdía la barra.

          `pr-1` se queda igualmente: en Android las barras son *overlay*, ahí el gutter no reserva
          nada —lo cual está bien, la tablet conserva su ancho— y sin ese padding la barra pasaría
          por encima del borde de la tarjeta al bajar.

          **Y la rejilla que reparte el ancho sobrante en MÁS tarjetas, no en tarjetas más gordas.**
          La tarjeta está dibujada para los ~239 px de la columna en la tablet; en un monitor, con
          "Terminados" colapsada, las columnas vivas pasan de 470 y una tarjeta sola ahí es aire.
          Estirarla para llenarla es el mismo error que tenía el botón naranja.

          Ojo al medir esto sobre una captura: en Windows con el escalado al 125% la imagen sale en
          píxeles físicos y las columnas parecen 579 donde el CSS ve 473. Lo que cuenta aquí es
          `window.innerWidth`, no el ancho del PNG.

          `auto-fill` responde al ancho de esta lista y no al de la ventana, así que no hay ningún
          breakpoint que adivinar ni que volver a tocar si algún día cambia el número de columnas:
          mete tantas pistas de ≥13,5 rem como quepan. Dos piden 440 px, así que en un monitor salen
          dos tarjetas y en la tablet sigue saliendo una sola.

          **13,5 rem no es un número a ojo: el suelo lo fija la fila de acciones.** Esa fila mide
          40 + 6 + 40 + 6 + 96 = 188 px en su caso de todos los días —imprimir, asignar y el
          naranja—, y la tarjeta le quita 24 de `p-3`. Por debajo de **212 px de tarjeta** la fila
          empieza a partirse en la operación normal, no en el caso raro. 13,5 rem son 216: 192 de
          contenido, 4 de margen, y ese mínimo solo se toca si una columna cae justo en los 440 — a
          las anchuras reales las tarjetas salen a ~225. **No bajarlo más.**

          Empezó en 16 rem con el argumento equivocado —holgura sobre los 239 de la tablet—, que
          pedía 520 px de lista y no entraba nunca. 14 rem pedía 456 y entraba por 2 px, o sea que
          la barra de scroll lo tumbaba: de ahí el gutter de arriba y estos 440.

          `min(13.5rem,100%)` es lo que impide que reviente en la tablet: con `minmax(13.5rem,1fr)`
          a secas, una columna más angosta que 216 px pediría una pista de 216 y la lista
          desbordaría.

          `content-start` no es decorativo: este `<ul>` es `flex-1`, o sea más alto que su contenido
          cuando la columna lleva dos pedidos. Sin él, grid repartiría ese alto sobrante entre las
          filas y separaría las tarjetas por toda la columna. Y `items-start` para que cada una mida
          lo suyo en vez de estirarse hasta la más alta de su fila, que sería devolver por dentro el
          aire que se acaba de quitar por fuera.
        */
        <ul className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(min(13.5rem,100%),1fr))] content-start items-start gap-2 overflow-y-auto [scrollbar-gutter:stable] pr-1">
          {pedidos.map((pedido) => (
            <li key={pedido.id}>
              <TarjetaPedido
                pedido={pedido}
                domiciliarios={domiciliarios}
                alCambiar={alCambiar}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
