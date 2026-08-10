"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff } from "lucide-react";
import type { PedidoEnLista } from "@/db/queries/panel";
import { COLUMNAS_TABLERO, columnaDeTablero } from "@/lib/pedidos/estados";
import { TarjetaPedido } from "./TarjetaPedido";
import { idsNuevos } from "./alerta";
import {
  desbloquearSonido,
  detenerMantenerDespierto,
  guardarPreferencia,
  iniciarMantenerDespierto,
  prefiereSonido,
  reanudarAlPrimerToque,
  silenciar,
  sonarAviso,
} from "./sonido";
import {
  avisarPedidosNuevos,
  pedirPermisoNotificaciones,
  permisoDenegado,
} from "./notificaciones";
import { activarPush, desactivarPush } from "./push";

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
export function ListaPedidos({ iniciales }: { iniciales: PedidoEnLista[] }) {
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

  // Al desmontar —salir del tablero, irse a un día pasado— se corta el tono testigo. Sin esto
  // la pestaña seguiría pidiéndole al navegador que la trate como si estuviera sonando.
  useEffect(() => detenerMantenerDespierto, []);

  function alternarSonido() {
    const activar = !sonido;
    setSonido(activar);
    guardarPreferencia(activar);

    if (!activar) {
      silenciar();
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
      if (concedido) void activarPush();
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-titulo text-xl font-bold text-cafe">
          Pedidos
          {pedidos.length > 0 && (
            <span className="ml-2 font-cuerpo text-sm font-normal text-cafe-tenue">
              {pedidos.length}
            </span>
          )}
        </h1>

        <div className="flex items-center gap-3">
          {sinConexion && (
            <p
              role="status"
              className="rounded-sm bg-alerta/15 px-3 py-1.5 font-cuerpo text-[13px] font-semibold text-cafe"
            >
              Sin conexión. Reintentando…
            </p>
          )}

          {/* Se pinta llamativo cuando está apagado y hay pedidos esperando: un panel mudo sin
              que nadie lo sepa es peor que uno que no avisa. */}
          <button
            type="button"
            onClick={alternarSonido}
            aria-pressed={sonido}
            className={`flex min-h-11 items-center gap-2 rounded-full border px-4 font-cuerpo text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-naranja ${
              sonido
                ? "border-crema-oscura text-cafe-suave hover:bg-crema"
                : sinAceptar.length > 0
                  ? "border-naranja bg-naranja text-crema"
                  : "border-naranja text-naranja-osc hover:bg-naranja/10"
            }`}
          >
            {sonido ? <Bell className="size-4" /> : <BellOff className="size-4" />}
            {sonido ? "Avisos activos" : "Activar avisos"}
          </button>
        </div>
      </div>

      {/* El sonido solo sirve si alguien está delante. Sin permiso de notificaciones no hay
          aviso fuera del navegador, y quien lo denegó sin querer no tiene otra forma de saberlo. */}
      {sonido && !notificaSistema && (
        <p
          role="status"
          className="rounded-md bg-alerta/15 px-4 py-2 font-cuerpo text-[13px] text-cafe"
        >
          Solo va a sonar. Para que además te avise estando en otra aplicación, permite las
          notificaciones de este sitio en el candado de la barra de direcciones.
        </p>
      )}

      {/* El aviso que se ve. Acompaña al sonido y lo sustituye cuando está apagado. */}
      {sinAceptar.length > 0 && (
        <p
          role="status"
          className="rounded-md bg-naranja/12 px-4 py-2 font-cuerpo text-sm font-bold text-naranja-osc"
        >
          {sinAceptar.length === 1
            ? "1 pedido nuevo sin aceptar"
            : `${sinAceptar.length} pedidos nuevos sin aceptar`}
        </p>
      )}

      {/* Las pestañas solo existen en pantalla estrecha; a partir de `lg` mandan las columnas
          y estos botones sobran. */}
      <div className="flex gap-2 overflow-x-auto lg:hidden" role="tablist">
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

      <div className="grid gap-3 lg:grid-cols-4 lg:items-start">
        {COLUMNAS_TABLERO.map((columna, i) => (
          <Columna
            key={columna.titulo}
            titulo={columna.titulo}
            vacio={columna.vacio}
            pedidos={porColumna[i]}
            alCambiar={refrescar}
            oculta={i !== columnaVisible}
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
  alCambiar,
  oculta,
}: {
  titulo: string;
  vacio: string;
  pedidos: PedidoEnLista[];
  alCambiar: () => void;
  /** En pantalla estrecha solo se ve la pestaña elegida; en `lg` se ven todas. */
  oculta: boolean;
}) {
  return (
    <section className={`${oculta ? "hidden lg:flex" : "flex"} flex-col gap-2`}>
      {/* El encabezado se queda arriba al bajar por una columna larga: sin esto, a mitad de
          scroll ya no se sabe qué columna se está leyendo. */}
      <h2 className="sticky top-0 z-10 flex items-baseline gap-2 rounded-sm bg-crema/95 py-1.5 backdrop-blur">
        <span className="font-titulo text-base font-bold text-cafe">{titulo}</span>
        <span className="font-cuerpo text-sm text-cafe-tenue">{pedidos.length}</span>
      </h2>

      {pedidos.length === 0 ? (
        <p className="rounded-md border border-dashed border-crema-oscura px-3 py-6 text-center font-cuerpo text-[13px] text-cafe-tenue">
          {vacio}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {pedidos.map((pedido) => (
            <li key={pedido.id}>
              <TarjetaPedido pedido={pedido} alCambiar={alCambiar} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
