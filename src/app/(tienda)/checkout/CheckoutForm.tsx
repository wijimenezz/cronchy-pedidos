"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Bike,
  Loader2,
  MapPin,
  Phone,
  ShoppingBag,
  Store,
} from "lucide-react";
import { useCarrito } from "@/lib/carrito";
import {
  useTipoPedido,
  cambiarTipoPedido,
  renovarTipoPedido,
  type TipoPedido,
} from "@/lib/tienda/tipo-pedido";
import { carritoAItems } from "@/lib/checkout/mapeo";
import {
  useDatosCliente,
  useDatosClienteHidratados,
} from "@/lib/checkout/datos-cliente";
import { crearPedidoSchema, MAXIMO_NOTAS, REQUERIDO } from "@/lib/validaciones";
import { capitalizarNombre } from "@/lib/checkout/nombre";

/**
 * Lo que se deja teclear en un campo de teléfono. Impedir el carácter es mejor que aceptarlo y
 * regañar después: el cliente no llega a ver un `*` en su teléfono.
 *
 * No sustituye al esquema, que lo vuelve a comprobar en el servidor (regla 1): esto es
 * comodidad, no seguridad.
 */
function telefonoTecleado(valor: string, maximo: number): string {
  const digitos = valor.replace(/\D/g, "");

  // El autocompletado de Chrome en Android entrega el número en formato internacional
  // ("+573116435036"). Sin quitarle el indicativo, el corte a diez dejaba "5731164350" —un número
  // que el cliente nunca escribió— y el campo le respondía que no parece un celular colombiano.
  // Se quita solo cuando lo de detrás ya es un celular entero, igual que en el esquema.
  const sinIndicativo = /^573\d{9}$/.test(digitos) ? digitos.slice(2) : digitos;

  return sinIndicativo.slice(0, maximo);
}

/**
 * Deja un texto sugerido en lo que el campo Barrio admite: letras, números y espacios.
 *
 * Solo se usa con lo que llega de OSM. Lo que escribe el cliente NO pasa por aquí: ahí un
 * carácter raro tiene que decirlo el mensaje de error, no desaparecer bajo el cursor.
 */
function saneado(valor: string): string {
  return valor
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
import { fueraDeCobertura, pesos } from "@/lib/notificaciones/plantillas";
import { decidirBarrio, type MotivoConsulta } from "@/lib/barrio";
import { mensajeDeRechazo, type MotivoRechazo } from "@/lib/cupones";
import { metodosDePago } from "@/lib/pedidos/pago";
import { Campo, claseControl } from "@/components/checkout/Campo";
import { CampoCupon, type EstadoCupon } from "@/components/checkout/CampoCupon";
import { DatoCopiable } from "@/components/checkout/DatoCopiable";
import { QrDePago } from "@/components/checkout/QrDePago";
import { PoliticaDatos } from "@/components/checkout/PoliticaDatos";
import { SelectorFecha } from "@/components/checkout/SelectorFecha";
import { VERSION_POLITICA } from "@/lib/legal/politica-datos";
import { SubidaComprobante } from "@/components/checkout/SubidaComprobante";
import {
  SelectorUbicacion,
  type Cobertura,
} from "@/components/checkout/SelectorUbicacion";
import {
  SelectorCuando,
  cuandoInicial,
  type Cuando,
} from "@/components/checkout/SelectorCuando";
import type { OpcionesEntrega } from "@/lib/pedidos/entrega";
import type { Punto } from "@/components/checkout/MapaUbicacion";

type Errores = Record<string, string>;

type Paso = 1 | 2 | 3;

/**
 * Domicilio o recoger, con el actual marcado.
 *
 * Vive en el **paso 1** y en ningún otro. Ahí cambiar de opinión es gratis —el paso sigue siendo
 * el 1, que existe en las dos listas, y la dirección persiste en `datos-cliente` aunque deje de
 * viajar—, mientras que en el paso 3 hay un total en pantalla y puede haber un comprobante de
 * Nequi ya transferido: mover el tipo ahí es invalidar dinero.
 *
 * Antes era una etiqueta con un enlace "Cambiar" que alternaba a ciegas: un toque por error
 * volteaba el pedido entero sin decir a qué. Los mismos iconos del modal de bienvenida, para que
 * se reconozca que es la misma pregunta.
 */
function BotonesTipoPedido({ actual }: { actual: TipoPedido | null }) {
  const [retirados, setRetirados] = useState<string[]>([]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        {(["domicilio", "recoger"] as TipoPedido[]).map((t) => {
          const elegido = actual === t;
          const Icono = t === "domicilio" ? Bike : ShoppingBag;

          return (
            <button
              key={t}
              type="button"
              onClick={() =>
                setRetirados(cambiarTipoPedido(t).map((i) => i.nombre))
              }
              aria-pressed={elegido}
              className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 font-cuerpo text-sm font-bold transition-colors ${
                elegido
                  ? "bg-naranja text-crema"
                  : "border border-crema-oscura text-cafe-suave hover:bg-crema"
              }`}
            >
              <Icono className="size-4" />
              {t === "domicilio" ? "Domicilio" : "Recoger"}
            </button>
          );
        })}
      </div>

      {/* Aquí y no en un aviso flotante: el cliente está mirando justo este bloque, y el resumen
          del pedido que tiene debajo acaba de cambiar de importe. */}
      {retirados.length > 0 && (
        <p
          role="status"
          className="rounded-sm bg-alerta/15 px-3 py-2 font-cuerpo text-[13px] text-cafe"
        >
          <span className="font-bold">Quitamos del pedido: </span>
          {retirados.join(", ")}.{" "}
          {retirados.length === 1 ? "No se vende" : "No se venden"} para{" "}
          {actual === "domicilio" ? "domicilio" : "recoger"}.
        </p>
      )}
    </div>
  );
}

/**
 * Qué dice el servidor del pin: si hay cobertura y, de paso, qué barrio hay ahí.
 *
 * No toca estado a propósito: sus dos usos lo tratan distinto —el mapa avisa que está
 * calculando, el remontaje no— y ambos tienen que descartar la respuesta si ya llegó otra
 * más nueva.
 *
 * El barrio sale aparte de `Cobertura` y no dentro: la cobertura es si llegamos y cuánto
 * cuesta, y el barrio es un texto para el domiciliario que ni siquiera depende de que
 * estemos cubriendo ese punto.
 */
async function consultarCobertura(
  punto: Punto,
): Promise<{ cobertura: Cobertura; barrio: string | null }> {
  try {
    const respuesta = await fetch("/api/zonas/cotizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(punto),
    });
    if (!respuesta.ok) return { cobertura: { estado: "error" }, barrio: null };

    const datos = (await respuesta.json()) as {
      cubierto: boolean;
      zona?: string;
      precio?: number;
      barrio?: string | null;
    };

    return {
      cobertura: datos.cubierto
        ? { estado: "cubierto", zona: datos.zona!, precio: datos.precio! }
        : { estado: "fuera" },
      barrio: datos.barrio ?? null,
    };
  } catch {
    return { cobertura: { estado: "error" }, barrio: null };
  }
}

/**
 * Qué descuenta este cupón sobre este carrito, según el servidor.
 *
 * Hermana de `consultarCobertura` y con el mismo contrato: **no es la fuente del descuento**
 * (regla 1). Al confirmar, `POST /api/pedidos` vuelve a buscar el cupón y a aplicarlo; esto solo
 * existe para que el cliente vea el número antes de pagar.
 *
 * Tampoco toca estado, por lo mismo que aquella: hay dos formas de disparar la consulta —escribir
 * el código y cambiar el carrito— y las dos tienen que poder descartar una respuesta vieja.
 */
async function consultarCupon(
  codigo: string,
  tipo: TipoPedido,
  items: unknown[],
): Promise<EstadoCupon> {
  try {
    const respuesta = await fetch("/api/cupones/validar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // El tipo viaja aunque el domicilio no se descuente (regla 13): es lo que decide si cada
      // producto se puede vender por ese canal, y valorarlo con el tipo equivocado convierte un
      // carrito válido en un "no pudimos comprobar el cupón".
      body: JSON.stringify({ codigo, tipo, items }),
    });
    if (!respuesta.ok) {
      return {
        estado: "rechazado",
        mensaje: "No pudimos comprobar el cupón. Intenta de nuevo.",
      };
    }

    const datos = (await respuesta.json()) as {
      ok: boolean;
      descuento?: number;
      motivo?: MotivoRechazo | "no_comprobable";
      aplicaA?: string[];
    };

    if (datos.ok)
      return { estado: "aplicado", descuento: datos.descuento ?? 0 };

    // "no_comprobable" es un problema del carrito, no del cupón (algo se agotó mientras escribía).
    // No se le echa la culpa al código: quien lo dirá con precisión es el 422 al confirmar.
    if (!datos.motivo || datos.motivo === "no_comprobable") {
      return {
        estado: "rechazado",
        mensaje: "No pudimos comprobar el cupón. Intenta de nuevo.",
      };
    }

    // El texto sale del módulo puro, el mismo que traduce el 422: un cupón rechazado se explica
    // igual por los dos caminos.
    return {
      estado: "rechazado",
      mensaje: mensajeDeRechazo(datos.motivo, datos.aplicaA ?? []),
    };
  } catch {
    return {
      estado: "rechazado",
      mensaje: "No pudimos comprobar el cupón. Revisa tu conexión.",
    };
  }
}

/**
 * Correo y cumpleaños del cliente: apagados. Se capturaban para una campaña de cumpleaños
 * que no existe todavía, y son datos de escritura pura —no los lee el panel, ni el XLSX, ni
 * ninguna plantilla—, así que hoy solo alargan el paso 1. No se borra nada: el campo, la
 * validación de `crearPedidoSchema`, el store y las columnas de `order` siguen en su sitio y
 * volver a pedirlos es poner esto en `true`.
 *
 * El `: boolean` es a propósito: sin él el tipo inferido es el literal `false` y las tres
 * ramas de abajo quedan marcadas como código muerto.
 */
const PIDE_CORREO_Y_CUMPLE: boolean = false;

/**
 * Qué campos del esquema se revisan antes de dejar pasar al siguiente paso. El envío
 * final valida el payload completo igual que hoy; esto solo decide dónde se detiene
 * al cliente, para que no descubra en el paso 3 que le faltó el teléfono.
 */
const CAMPOS_POR_PASO: Record<Paso, string[]> = {
  // Un campo oculto NO se revisa: su valor sigue vivo en localStorage, y uno viejo que no
  // pase el esquema detendría "Continuar" con un `Falta: Correo` que señala a un campo que
  // ya no está en pantalla — el callejón sin salida que describe `ETIQUETA_CAMPO`.
  1: [
    "clienteNombre",
    "clienteTelefono",
    ...(PIDE_CORREO_Y_CUMPLE ? ["clienteEmail", "clienteCumple"] : []),
  ],
  // `programadoPara` está en los dos pasos a propósito, y no hace falta ningún condicional:
  // en domicilio el selector se pinta en el 2 y lo valida "Continuar"; en recoger el paso 2
  // ni existe (`pasos` es [1, 3]), así que lo resuelve el 3, que es donde se pinta ahí.
  2: [
    "punto",
    "direccion",
    "barrio",
    "indicaciones",
    "recibeNombre",
    "recibeTelefono",
    "programadoPara",
  ],
  3: [
    "metodoPago",
    "pagaCon",
    "comprobanteUrl",
    "notas",
    // Tiene input (`CampoCupon`) y hasta ahora no estaba en ninguna de las dos tablas: un código
    // con forma inválida —`?cupon=ABC-123` desde un link compartido— bloqueaba el envío con un
    // "Revisa los datos marcados" que no marcaba nada ni movía de paso.
    "cupon",
    "items",
    "programadoPara",
    // El check vive aquí, y estar en la lista es lo que deja a `señalar()` traerlo hasta él.
    // `avanzar()` no lo mira: en el último paso el botón es submit, no "Continuar".
    "politicaAceptada",
  ],
};

/**
 * Cómo se llama cada campo para quien lo está llenando. El error general los nombra: en un
 * formulario por pasos, "revisa los datos marcados" es un callejón sin salida cuando lo que
 * falta quedó marcado en un paso que no está en pantalla.
 */
const ETIQUETA_CAMPO: Record<string, string> = {
  clienteNombre: "Nombre y apellido",
  clienteTelefono: "Teléfono",
  clienteEmail: "Correo",
  clienteCumple: "Fecha de cumpleaños",
  punto: "Ubicación en el mapa",
  direccion: "Dirección",
  barrio: "Barrio",
  indicaciones: "Indicaciones",
  recibeNombre: "Nombre de quien recibe",
  recibeTelefono: "Teléfono de quien recibe",
  programadoPara: "A qué hora lo quieres",
  metodoPago: "Método de pago",
  pagaCon: "Con cuánto pagas",
  comprobanteUrl: "Comprobante de Nequi",
  notas: "Notas",
  cupon: "Cupón",
  politicaAceptada: "Aceptar el tratamiento de datos",
  // `items` no está aquí a propósito: no es un campo que el cliente pueda llenar. Si falla,
  // el payload lo armamos mal nosotros, y decirle "falta tu carrito" mientras ve sus
  // productos en pantalla lo manda a arreglar lo que no está roto. Ver `señalar`.
};

export function CheckoutForm({
  centroTienda,
  entrega,
  tienda,
}: {
  /** Dónde abre el mapa mientras el cliente no haya puesto su pin. */
  centroTienda: Punto;
  /** Las horas que ofrece el servidor. Las mismas contra las que validará al confirmar. */
  entrega: OpcionesEntrega;
  tienda: {
    nombre: string;
    telefono: string | null;
    direccion: string | null;
    /** Enlace a Maps con el local, ya resuelto en el servidor. `null` = no hay a dónde mandar. */
    comoLlegar: string | null;
    whatsappUrl: string | null;
    nequiLlave: string | null;
    nequiLlaveTitular: string | null;
    nequiQrUrl: string | null;
  };
}) {
  const router = useRouter();
  const items = useCarrito((s) => s.items);
  const notas = useCarrito((s) => s.notas);
  const setNotas = useCarrito((s) => s.setNotas);
  const vaciar = useCarrito((s) => s.vaciar);
  const tipoPedido = useTipoPedido();

  // `persist` de Zustand rehidrata desde localStorage: hasta que termine, `items` es []
  // aunque el carrito tenga cosas. Sin esta guardia, el "carrito vacío" echaría a todo
  // el mundo apenas entra.
  //
  // Se lee con useSyncExternalStore —igual que `useTipoPedido`— porque el snapshot del
  // servidor es siempre false: React concilia la diferencia sin error de hidratación.
  const carritoHidratado = useSyncExternalStore(
    (cb) => useCarrito.persist.onFinishHydration(cb),
    () => useCarrito.persist.hasHydrated(),
    () => false,
  );
  // Los dos hooks se llaman siempre (nada de `a && useHook()`, que sería condicional).
  const datosHidratados = useDatosClienteHidratados();
  const hidratado = carritoHidratado && datosHidratados;

  // Paso y pago viven en el carrito persistido: si el cliente sale a la app de Nequi y
  // el navegador mata la pestaña, al volver encuentra el checkout como lo dejó.
  const pasoGuardado = useCarrito((s) => s.paso);
  const setPaso = useCarrito((s) => s.setPaso);
  const metodoPago = useCarrito((s) => s.metodoPago);
  const comprobanteUrl = useCarrito((s) => s.comprobanteUrl);
  const pagoConfirmado = useCarrito((s) => s.pagoConfirmado);
  const setPago = useCarrito((s) => s.setPago);
  // El código que se está intentando usar. Vive en el carrito para sobrevivir al viaje a la app de
  // Nequi y para que un link `?cupon=` abierto en la carta llegue vivo hasta aquí.
  const cupon = useCarrito((s) => s.cupon);
  const setCupon = useCarrito((s) => s.setCupon);

  // Estos campos NO son estado local: viven en un store persistido, así el cliente no
  // tiene que volver a escribirlos en su próximo pedido (ni si recarga a mitad del
  // formulario). Al leerlos directo del store no hace falta ningún efecto que los
  // copie: aparecen solos en cuanto termina la hidratación.
  const datos = useDatosCliente();
  const setDatos = useDatosCliente((s) => s.set);
  const {
    nombre,
    telefono,
    email,
    cumple,
    punto,
    direccion,
    barrio,
    indicaciones,
  } = datos;
  const { recibeOtro, recibeNombre, recibeTelefono } = datos;

  const [aceptaPolitica, setAceptaPolitica] = useState(false);
  // Los avisos del estado del pedido. Arranca en `true` —es lo que el negocio hace por defecto y
  // lo que el cliente espera— y, como `aceptaPolitica`, NO se persiste: es una decisión de este
  // pedido, y arrastrar un "no" de hace tres semanas sería decidir por él.
  const [aceptaAvisos, setAceptaAvisos] = useState(true);
  // Con cuánto va a pagar en efectivo. NO va al carrito persistido, a diferencia del método
  // de pago: aquel se guarda porque el cliente sale a la app de Nequi y vuelve, y aquí no hay
  // adónde salir. Un "pago con $50.000" heredado del pedido de la semana pasada sería peor
  // que un campo vacío.
  const [pagaCon, setPagaCon] = useState("");
  // Cuándo lo quiere. NO va al carrito persistido, por lo mismo que las notas: una hora
  // elegida hace tres horas ya no vale, y rescatarla de localStorage sería prometer una franja
  // que el servidor va a rechazar.
  const [cuando, setCuando] = useState<Cuando>(() =>
    cuandoInicial(entrega.pronto, entrega.dias),
  );
  // Qué dijo el servidor del pin actual. Es lo que pinta el costo en vivo y lo que bloquea
  // el envío si el cliente quedó fuera de cobertura (regla 14).
  const [cobertura, setCobertura] = useState<Cobertura>({ estado: "sin_pin" });
  /**
   * Qué dijo el servidor del cupón, **junto al código al que corresponde**.
   *
   * Guardar el par es lo que permite derivar el "comprobando" en vez de asignarlo dentro del
   * efecto: si la respuesta que hay no es de este código, es que la consulta está en vuelo. Un
   * `setState` sincrónico en el cuerpo de un efecto provoca renders en cascada, y aquí además no
   * hacía falta — el estado ya estaba implícito en los datos.
   *
   * No va al carrito persistido: es la respuesta a una consulta, y guardarla sería prometer un
   * descuento que el servidor puede recalcular distinto al confirmar.
   */
  const [respuestaCupon, setRespuestaCupon] = useState<{
    codigo: string;
    estado: EstadoCupon;
  } | null>(null);

  // Para descartar respuestas de cotizaciones viejas: si el cliente mueve el pin dos veces
  // seguidas, la primera puede llegar después y pintar el precio equivocado. El turno vive
  // aquí, con el estado, porque hay dos formas de pedir una cotización —mover el pin y volver
  // a montar el formulario— y un guardia que solo conoce una de las dos no guarda nada.
  const ultimaCotizacion = useRef(0);
  // Lo mismo para el cupón: cambiar el carrito y escribir un código son dos disparadores, y la
  // respuesta a la consulta vieja puede llegar después de la nueva.
  const ultimaComprobacion = useRef(0);

  /**
   * La última sugerencia que dio el mapa en esta sesión, **se haya escrito o no**.
   *
   * Ese "o no" es lo que arregla el bug: antes solo se recordaba cuando se escribía, así que
   * en la segunda visita —campo con el barrio del pedido pasado, memoria vacía— la
   * comparación no cuadraba nunca y el campo quedaba congelado.
   *
   * Es memoria de sesión a propósito: solo sirve para distinguir un ajuste de unos metros de
   * un salto a otro barrio, y eso solo tiene sentido dentro de la misma visita.
   */
  const ultimaSugerencia = useRef<string | null>(null);

  /**
   * Lleva la sugerencia al campo, si toca. Quién decide es `decidirBarrio`, que es puro y está
   * probado; aquí solo se le dan los datos y se guarda lo que responda.
   *
   * El campo se lee del store y no del render: esto corre dentro de una promesa y el valor
   * capturado en la clausura puede ser de hace tres pulsaciones.
   */
  const aplicarBarrio = useCallback(
    (sugerido: string | null, motivo: MotivoConsulta) => {
      const nuevo = decidirBarrio({
        actual: useDatosCliente.getState().barrio,
        sugerido,
        ultimaSugerencia: ultimaSugerencia.current,
        motivo,
      });

      // Se sanea lo que viene del mapa, no se rechaza: este texto lo escribe OSM, no el cliente,
      // y un barrio que llegue con un guion o un punto dejaría el campo en rojo por algo que él
      // no tecleó. Los 90 barrios sembrados están limpios; los que OSM añada mañana, quién sabe.
      if (nuevo !== null) setDatos({ barrio: saneado(nuevo) });
      // Fuera del `if`: se recuerda lo que el mapa dijo, no lo que se escribió.
      if (sugerido) ultimaSugerencia.current = sugerido;
    },
    [setDatos],
  );

  // Mover el pin es una acción del cliente, así que se le contesta de inmediato con el
  // "calculando…" antes de salir a la red.
  const cotizar = useCallback(
    (punto: Punto) => {
      const turno = ++ultimaCotizacion.current;
      setCobertura({ estado: "consultando" });

      void consultarCobertura(punto).then(({ cobertura, barrio }) => {
        if (turno !== ultimaCotizacion.current) return;
        setCobertura(cobertura);
        // Mover el pin es cambiar de dirección: el barrio sigue al pin.
        aplicarBarrio(barrio, "pin-movido");
      });
    },
    [aplicarBarrio],
  );

  // Llegar al checkout es la señal más fuerte de que la elección de domicilio/recoger sigue
  // siendo la buena. Sin esto podría caducar a mitad del pago, que es justo la interrupción
  // junto al dinero que la caducidad quiere evitar.
  useEffect(() => {
    renovarTipoPedido();
  }, []);

  /**
   * Comprueba el cupón cada vez que cambia el código **o el carrito**.
   *
   * Lo segundo es lo que evita el descuento fantasma: quien aplica CHURRO10 con un churro en el
   * carrito y luego lo quita tiene que ver que el descuento se cae, y verlo *aquí*, no descubrirlo
   * en el 422 al confirmar. Reejecutar con los items es todo el mecanismo.
   *
   * `items` es la referencia del store, que solo cambia cuando el carrito cambia de verdad, así
   * que esto no se dispara en cada render.
   */
  useEffect(() => {
    // Con el carrito vacío no hay nada que comprobar, y el endpoint exige al menos una línea: sin
    // esta guarda, vaciar el carrito con un cupón puesto dispararía una consulta que solo puede
    // fallar. Sin tipo tampoco, que es el estado momentáneo mientras se pregunta domicilio/recoger.
    if (!hidratado || !cupon || !tipoPedido || items.length === 0) return;

    const turno = ++ultimaComprobacion.current;
    const { items: itemsPedido } = carritoAItems(items);

    void consultarCupon(cupon, tipoPedido, itemsPedido).then((resultado) => {
      if (turno !== ultimaComprobacion.current) return;
      setRespuestaCupon({ codigo: cupon, estado: resultado });
    });
  }, [hidratado, cupon, tipoPedido, items]);

  // El pin sobrevive en localStorage; su cobertura no, porque es estado de este componente.
  // Sin esto, quien recarga estando en el paso 3 —el paso también se guarda— ve el domicilio
  // en $0: el mapa que lo recotizaba está en el paso 2 y no se está renderizando. Y un
  // domicilio en $0 no es solo un número feo, es lo que el cliente transfiere por Nequi.
  //
  // Aquí no se pinta el "calculando…": nadie tocó nada, y el resultado llega antes de que el
  // cliente termine de leer la pantalla.
  useEffect(() => {
    if (!hidratado) return;
    if (
      tipoPedido !== "domicilio" ||
      !datos.punto ||
      cobertura.estado !== "sin_pin"
    )
      return;

    const turno = ++ultimaCotizacion.current;
    void consultarCobertura(datos.punto).then(({ cobertura, barrio }) => {
      if (turno !== ultimaCotizacion.current) return;
      setCobertura(cobertura);
      // El pin guardado es la misma dirección de siempre, así que esto solo llena el hueco:
      // si hay un barrio escrito —el del pedido pasado, o una corrección— se respeta.
      aplicarBarrio(barrio, "montaje");
    });
    // Al hidratar, que es cuando aparece el pin guardado, y al cambiar de tipo: pasar de
    // recoger a domicilio en el paso 1 dejaba la cobertura en `sin_pin` y el envío en $0
    // hasta que alguien tocara el pin. Reejecutarlo es seguro porque las tres guardas de
    // arriba ya deciden si hay algo que cotizar, y `cobertura` no está en las deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidratado, tipoPedido]);

  const [errores, setErrores] = useState<Errores>({});
  // Un campo "tocado" ya se validó al menos una vez (al salir de él o al intentar
  // avanzar). Solo esos se revalidan mientras se escribe: nadie quiere que le marquen
  // el correo en rojo cuando apenas lleva "ana@".
  const [tocados, setTocados] = useState<Record<string, boolean>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [lineasConProblema, setLineasConProblema] = useState<string[]>([]);
  const [cerrado, setCerrado] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const enVuelo = useRef(false);

  const total = items.reduce(
    (t, i) => t + i.precioUnitarioEstimado * i.cantidad,
    0,
  );
  const esDomicilio = tipoPedido === "domicilio";
  // Lo que se muestra mientras el cliente arrastra el pin. El precio que se cobra lo
  // recalcula el servidor al confirmar (regla 1); esto es solo información.
  const costoDomicilio =
    esDomicilio && cobertura.estado === "cubierto" ? cobertura.precio : 0;
  const sinCobertura = esDomicilio && cobertura.estado === "fuera";
  /**
   * El estado del cupón, derivado: sin código no hay cupón, y con un código para el que todavía no
   * hay respuesta la consulta está en vuelo.
   *
   * **Al cambiar el carrito con el mismo código, se sigue mostrando la respuesta anterior mientras
   * llega la nueva.** Es a propósito: alternar a "comprobando" en cada toque del carrito haría
   * parpadear el total, y quien manda sobre el dinero es el servidor al confirmar (regla 1), así
   * que lo peor que pasa es un número que se corrige solo unos milisegundos después.
   */
  const estadoCupon: EstadoCupon = !cupon
    ? { estado: "sin_cupon" }
    : respuestaCupon?.codigo === cupon
      ? respuestaCupon.estado
      : { estado: "comprobando" };
  const descuento =
    estadoCupon.estado === "aplicado" ? estadoCupon.descuento : 0;
  /**
   * Lo que el cliente va a pagar. **Se usa en las cuatro partes donde antes iba
   * `total + costoDomicilio`**: el resumen, el valor a transferir por Nequi, el botón de confirmar
   * y la devuelta del efectivo.
   *
   * Existe como una sola constante justo por eso: repetir la resta en cuatro sitios es cómo se
   * termina enseñándole al cliente el total con descuento en el botón y pidiéndole que transfiera
   * el precio lleno. El servidor recalcula todo al confirmar (regla 1), así que un desajuste aquí
   * no cobra de más — hace algo peor, que es que el cliente transfiera de más.
   */
  const totalAPagar = Math.max(0, total + costoDomicilio - descuento);
  // Solo se muestra cuando de verdad hay algo que devolver. Si escribió menos que el total,
  // no se le corrige con un número negativo: el servidor cobra lo que cobra y el panel le
  // enseña al domiciliario lo que el cliente dijo.
  const devuelta =
    metodoPago === "efectivo" && Number(pagaCon) > totalAPagar
      ? Number(pagaCon) - totalAPagar
      : null;
  // Si el negocio no cargó su llave, ofrecerlo sería mandar al cliente a un callejón sin
  // salida. Manda la llave y no el QR: con la llave sola se puede pagar, con el QR solo no
  // —hay que guardarlo y volver a la app del banco— y además es lo que se copia de un toque.
  const nequiDisponible = Boolean(tienda.nequiLlave);
  /**
   * Los métodos que se pueden ofrecer, con la MISMA función que usa `POST /api/pedidos` para
   * aceptarlos o rechazarlos. Aquí se pinta, allá se decide: si divergieran, el cliente vería
   * una opción que el servidor le va a rechazar al confirmar.
   *
   * `tipoPedido` puede ser null mientras caduca la elección, pero este bloque no llega a
   * pintarse: más arriba hay un early return que primero pregunta domicilio o recoger.
   */
  const metodosPermitidos = metodosDePago(tipoPedido ?? "domicilio", {
    llaveDisponible: nequiDisponible,
  });
  const pagoPorAdelantado =
    !esDomicilio && !metodosPermitidos.includes("efectivo");

  /**
   * Corrige el método heredado cuando deja de estar permitido.
   *
   * Hace falta porque `metodoPago` vive en el carrito persistido y **nada lo resetea al
   * cambiar de tipo**: quien pidió a domicilio con efectivo y vuelve a elegir "Recoger"
   * llegaría al paso 3 con ningún radio marcado y el payload mandando `efectivo` igual —
   * `construirPayload` lee del store, no de qué radio está pintado. El servidor lo rechazaría
   * con un 422 correcto y un cliente perplejo.
   *
   * Va aquí y no en el `onClick` de `BotonesTipoPedido` porque también tiene que correr al
   * montar: el paso se guarda, así que se puede recargar directamente en el 3. Es el simétrico
   * del efecto de la cobertura, que existe por lo mismo al revés.
   */
  useEffect(() => {
    if (!hidratado || !tipoPedido) return;

    // Se recalcula aquí dentro en vez de depender de `metodosPermitidos`: ese array es nuevo
    // en cada render y como dependencia haría correr el efecto siempre. `metodosDePago` es
    // pura y trivial, así que llamarla dos veces no cuesta nada.
    const permitidos = metodosDePago(tipoPedido, {
      llaveDisponible: nequiDisponible,
    });
    if (permitidos.includes(metodoPago)) return;

    // Cambiar de método invalida lo del anterior: un comprobante subido para el pedido a
    // domicilio no vale como pago de este, y dejar `pagoConfirmado` en true saltaría el paso
    // de "Ya realicé mi pago" enseñando un adjunto que no se pidió.
    setPago(
      permitidos[0] === "efectivo"
        ? {
            metodoPago: "efectivo",
            comprobanteUrl: null,
            pagoConfirmado: false,
          }
        : { metodoPago: permitidos[0] },
    );
  }, [hidratado, tipoPedido, metodoPago, nequiDisponible, setPago]);

  // Nota: esta pantalla se arma en el cliente y no en el servidor, porque las dos cosas
  // que deciden qué mostrar —el carrito y el tipo de pedido— viven en localStorage. No
  // es gratis, pero al checkout se llega con la app ya cargada, así que el JS ya está en
  // el dispositivo. El esqueleto imita la forma real del formulario para que el salto no
  // se note.
  if (!hidratado) {
    return (
      <div className="flex flex-col gap-4" aria-hidden>
        <div className="h-40 animate-pulse rounded-md bg-crema-oscura/40" />
        <div className="h-52 animate-pulse rounded-md bg-crema-oscura/40" />
        <div className="h-11 animate-pulse rounded-full bg-crema-oscura/40" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md bg-tarjeta p-6 text-center shadow-tarjeta">
        <h2 className="font-titulo text-lg font-semibold text-cafe">
          Tu carrito está vacío
        </h2>
        <p className="font-cuerpo text-sm text-cafe-suave">
          Agrega algo rico antes de confirmar.
        </p>
        <Link
          href="/"
          className="mt-1 rounded-full bg-naranja px-6 py-3 font-cuerpo text-sm font-bold text-crema"
        >
          Ver el menú
        </Link>
      </div>
    );
  }

  // El tipo de pedido se elige en el modal de bienvenida; si se perdió, se pregunta aquí
  // en vez de asumir uno: cambia el precio y los campos del formulario.
  if (!tipoPedido) {
    return (
      <div className="flex flex-col gap-3 rounded-md bg-tarjeta p-6 text-center shadow-tarjeta">
        <h2 className="font-titulo text-lg font-semibold text-cafe">
          ¿Cómo quieres tu pedido?
        </h2>
        {/* Sin nada elegido no hay ninguno marcado, igual que en el modal de bienvenida. */}
        <BotonesTipoPedido actual={null} />
      </div>
    );
  }

  // En recoger no hay nada que preguntar sobre la entrega: el paso 2 se salta entero.
  const pasos: Paso[] = esDomicilio ? [1, 2, 3] : [1, 3];
  // El paso guardado puede no existir para este tipo de pedido (si venía en el 2 y
  // cambió a recoger). En ese caso se vuelve al principio en vez de quedar en la nada.
  const paso = pasos.includes(pasoGuardado) ? pasoGuardado : pasos[0];
  const indiceActual = pasos.indexOf(paso);
  const esUltimo = indiceActual === pasos.length - 1;

  function construirPayload() {
    const { items: itemsPedido } = carritoAItems(items);
    return {
      tipo: tipoPedido as TipoPedido,
      clienteNombre: nombre,
      clienteTelefono: telefono,
      // Ocultos no viajan, aunque sigan guardados: los dos persisten en `cronchy_datos_cliente`
      // entre pedidos, así que sin este corte quien escribió su correo alguna vez lo seguiría
      // mandando —y guardando en `order`— sin verlo en pantalla ni poder borrarlo.
      clienteEmail: PIDE_CORREO_Y_CUMPLE ? email || undefined : undefined,
      clienteCumple: PIDE_CORREO_Y_CUMPLE ? cumple || undefined : undefined,
      recibeNombre: esDomicilio && recibeOtro ? recibeNombre : undefined,
      recibeTelefono: esDomicilio && recibeOtro ? recibeTelefono : undefined,
      // Viaja el pin, no la zona ni el precio: el servidor resuelve la cobertura de nuevo
      // al recibirlo (regla 1).
      punto: esDomicilio && punto ? punto : undefined,
      direccion: esDomicilio ? direccion : undefined,
      // Referencia para el domiciliario, igual que la dirección: en "recoger" no significa nada.
      barrio: esDomicilio ? barrio : undefined,
      indicaciones: indicaciones || undefined,
      // Ausente = lo más pronto posible. El servidor comprueba que esta hora sea una de las
      // que él mismo ofrece; aquí solo se transmite cuál eligió el cliente.
      programadoPara:
        cuando.modo === "programar" ? cuando.franja?.instante : undefined,
      metodoPago,
      // Solo en efectivo: en Nequi no hay devuelta que llevar.
      pagaCon:
        metodoPago === "efectivo" && pagaCon ? Number(pagaCon) : undefined,
      comprobanteUrl: comprobanteUrl ?? undefined,
      // Viaja el CÓDIGO, no el descuento: cuánto vale lo recalcula el servidor al confirmar
      // (regla 1), igual que con el pin y la zona.
      cupon: cupon ?? undefined,
      notas: notas || undefined,
      // Viaja el sí, no la hora: cuándo aceptó lo sella el servidor al insertar. Igual que con el
      // pin y el cupón, el navegador manda *qué* eligió y no *cuánto vale*.
      politicaAceptada: aceptaPolitica,
      // QUÉ versión aceptó. Sin esto, el registro dice que aceptó sin poder mostrar qué decía el
      // documento ese día — que es la mitad de lo que la propia política promete conservar.
      politicaVersion: VERSION_POLITICA,
      aceptaAvisos,
      items: itemsPedido,
    };
  }

  // Se valida en cada render contra el MISMO esquema del servidor (regla: una sola
  // fuente de verdad). Es un parse puro en memoria, sin red ni DB. Derivarlo aquí en
  // vez de guardarlo en estado evita el clásico desfase de un carácter: al escribir,
  // `setState` todavía no se aplicó y una validación en el `onChange` leería el valor
  // anterior.
  const parsed = crearPedidoSchema.safeParse(construirPayload());
  const fallos: Partial<Record<string, string[]>> = parsed.success
    ? {}
    : parsed.error.flatten().fieldErrors;

  /**
   * Lo único que el esquema NO puede validar: los dos interruptores que viven solo en
   * la UI. Para el servidor un pedido sin datos de quien recibe es válido (lo recibe
   * quien lo pidió), así que no puede saber que aquí se eligió "Alguien más" y se dejó
   * en blanco. Y el esquema acepta cualquier punto del planeta: que además esté cubierto
   * lo dice el servidor, y su respuesta se refleja aquí.
   *
   * Aquí solo se exige que no queden vacíos: el formato (teléfono válido, largos
   * máximos) lo sigue validando `crearPedidoSchema`, para no tener la misma regla
   * escrita en dos lados.
   */
  const fallosUI: Record<string, string> = {};
  // El esquema no puede saberlo: para él un pedido sin `programadoPara` es "lo antes posible",
  // que es perfectamente válido. Lo que no vale es haber tocado "Programar" y no haber elegido
  // hora, y eso solo se ve desde aquí.
  if (cuando.modo === "programar" && !cuando.franja) {
    fallosUI.programadoPara = "Elige a qué hora lo quieres.";
  }
  // El esquema no puede compararlo: no conoce el total, que lo calcula el servidor desde la base
  // (regla 1). Aquí sí está a la vista, así que el aviso sale en el momento — y el servidor lo
  // vuelve a comprobar contra SU total, que es el que manda.
  if (metodoPago === "efectivo" && pagaCon && Number(pagaCon) < totalAPagar) {
    fallosUI.pagaCon = `Con ${pesos(Number(pagaCon))} no alcanza: el pedido son ${pesos(totalAPagar)}.`;
  }
  if (esDomicilio) {
    if (sinCobertura) {
      fallosUI.punto = "Todavía no llegamos hasta ahí.";
    }
    if (recibeOtro && !recibeNombre.trim()) {
      fallosUI.recibeNombre = REQUERIDO;
    }
    if (recibeOtro && !recibeTelefono.trim()) {
      fallosUI.recibeTelefono = REQUERIDO;
    }
  }

  function hayFallo(campo: string): boolean {
    return Boolean(fallosUI[campo] ?? fallos[campo]?.length);
  }

  /**
   * Qué error mostrar. Mientras el campo no se haya tocado no se le grita nada; una vez
   * tocado manda la validación en vivo, que es más actual que un error que haya llegado
   * del servidor antes de corregirlo.
   */
  function errorDe(campo: string): string | undefined {
    if (!tocados[campo]) return errores[campo];
    return fallosUI[campo] ?? fallos[campo]?.[0];
  }

  function alSalirDe(campo: string) {
    setTocados((t) => ({ ...t, [campo]: true }));
  }

  /**
   * Marca lo que falta, **lleva al cliente hasta ello** y lo nombra.
   *
   * Los campos de un paso solo existen en el DOM mientras ese paso está en pantalla, así que
   * pintar de rojo el teléfono no sirve de nada si quien lo dejó vacío está mirando el paso 3:
   * hay que devolverlo al 1. Y el mensaje dice qué falta, porque "revisa los datos marcados"
   * obliga a recorrer el formulario entero buscando el rojo.
   */
  function señalar(campos: string[]) {
    setTocados((t) => ({
      ...t,
      ...Object.fromEntries(campos.map((c) => [c, true])),
    }));

    const destino = pasos.find((p) =>
      CAMPOS_POR_PASO[p].some((c) => campos.includes(c)),
    );
    if (destino && destino !== paso) setPaso(destino);

    // Con líneas en el carrito, un fallo en `items` es un pedido que armamos mal nosotros:
    // no hay campo que llenar y pedirle que revise sería mandarlo a dar vueltas.
    if (campos.includes("items") && items.length > 0) {
      setErrorGeneral(
        "No pudimos preparar tu pedido. Vuelve a armar el carrito o escríbenos.",
      );
      return;
    }

    const nombres = campos.map((c) => ETIQUETA_CAMPO[c]).filter(Boolean);
    setErrorGeneral(
      nombres.length > 0
        ? `Falta: ${nombres.join(", ")}`
        : "Revisa los datos marcados.",
    );
  }

  function avanzar() {
    const delPaso = CAMPOS_POR_PASO[paso];
    // Tocar "Continuar" revela de una vez todo lo que falta en el paso.
    setTocados((t) => ({
      ...t,
      ...Object.fromEntries(delPaso.map((c) => [c, true])),
    }));

    const fallando = delPaso.filter(hayFallo);
    if (fallando.length > 0) {
      señalar(fallando);
      return;
    }

    setErrorGeneral(null);
    setPaso(pasos[indiceActual + 1]);
  }

  function retroceder() {
    setErrorGeneral(null);
    setPaso(pasos[indiceActual - 1]);
  }

  /** Traduce un ErrorPedido del servidor a algo que el cliente pueda accionar. */
  function mensajeDe422(
    detalle: { tipo: string; itemIndex?: number; motivo?: MotivoRechazo },
    aplicaA: string[] = [],
  ): string {
    const { lineIdPorIndice } = carritoAItems(items);
    const linea =
      detalle.itemIndex !== undefined
        ? items[detalle.itemIndex]?.nombre
        : undefined;

    if (detalle.itemIndex !== undefined && lineIdPorIndice[detalle.itemIndex]) {
      setLineasConProblema([lineIdPorIndice[detalle.itemIndex]]);
    }

    switch (detalle.tipo) {
      case "producto_no_encontrado":
      case "producto_no_disponible":
        return `«${linea ?? "Un producto"}» ya no está disponible. Quítalo del carrito para continuar.`;
      case "opcion_invalida":
        return `Se agotó una opción de «${linea ?? "un producto"}». Vuelve a configurarlo.`;
      case "seleccion_incompleta":
      case "seleccion_excedida":
      case "enganche_no_encontrado":
        return `«${linea ?? "Un producto"}» cambió. Vuelve a configurarlo en el menú.`;
      // El admin apagó la zona o le cambió el contorno entre que el cliente vio el precio
      // y confirmó. Manda el servidor (regla 1): se le devuelve al mapa.
      case "fuera_de_cobertura":
        setCobertura({ estado: "fuera" });
        setPaso(2);
        return "Ya no llegamos hasta esa dirección. Mueve el pin o escríbenos.";
      case "punto_requerido":
        setErrores((e) => ({
          ...e,
          punto: "Confirma tu ubicación en el mapa.",
        }));
        setPaso(2);
        return "Falta confirmar tu ubicación.";
      /**
       * El cupón caducó, lo apagaron o el carrito cambió entre que se comprobó y se confirmó.
       *
       * El estado se refleja en el campo para que el cliente vea el total sin descuento **antes**
       * de volver a confirmar. No se le quita el cupón solo: el cliente lo escribió, y borrárselo
       * sin decir nada le esconde justo lo que tiene que entender.
       */
      case "cupon_invalido": {
        const mensaje = detalle.motivo
          ? mensajeDeRechazo(detalle.motivo, aplicaA)
          : "Ese cupón ya no se puede usar.";
        if (cupon)
          setRespuestaCupon({
            codigo: cupon,
            estado: { estado: "rechazado", mensaje },
          });
        return mensaje;
      }
      default:
        return "No pudimos calcular tu pedido. Revísalo e intenta de nuevo.";
    }
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current) return;

    setErrores({});
    setErrorGeneral(null);
    setLineasConProblema([]);

    // Dos fuentes para lo mismo: `parsed` sale del MISMO esquema que usa el servidor —los
    // mensajes coinciden y no hay dos verdades—, y `fallosUI` cubre lo que el esquema no
    // puede ver. Sin lo segundo, quien tocó "Programar" y no eligió hora mandaría un pedido
    // "lo antes posible" sin enterarse: el payload es válido, solo que dice algo distinto de
    // lo que él quiso.
    const conFallo = [
      ...new Set([
        ...Object.keys(fallosUI),
        ...Object.keys(fallos).filter((c) => fallos[c]?.length),
      ]),
    ];

    if (conFallo.length > 0 || !parsed.success) {
      señalar(conFallo);
      return;
    }

    enVuelo.current = true;
    setEnviando(true);

    try {
      const r = await fetch("/api/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const json = await r.json().catch(() => null);

      if (r.status === 201) {
        // Solo se vacía con el pedido ya creado. En cualquier fallo el carrito queda intacto.
        vaciar();
        router.replace(`/pedido/${json.tokenPublico}`);
        return;
      }

      if (r.status === 409) {
        // La franja caducó mientras llenaba el formulario. La tienda sigue abierta y solo hay
        // que volver a elegir: cambiar el formulario por "Estamos cerrados" sería mentirle.
        if (json?.motivo === "franja_caducada") {
          setCuando({ modo: "programar", franja: null });
          setTocados((t) => ({ ...t, programadoPara: true }));
          setErrorGeneral(
            json?.error ?? "Esa hora ya no está disponible. Elige otra.",
          );
          // La página es `force-dynamic`: esto vuelve a pedir las franjas ya sin la caducada.
          router.refresh();
          return;
        }

        // Cerró entre que cargó la página y le dio a confirmar.
        setCerrado(json?.error ?? "Estamos cerrados en este momento.");
        return;
      }

      if (r.status === 400 && json?.detalles?.fieldErrors) {
        const fieldErrors = json.detalles.fieldErrors as Record<
          string,
          string[]
        >;
        setErrores(
          Object.fromEntries(
            Object.entries(fieldErrors)
              .filter(([, v]) => v?.length)
              .map(([k, v]) => [k, v[0]]),
          ),
        );
        setErrorGeneral("Revisa los datos marcados.");
        return;
      }

      if (r.status === 422 && json?.detalle) {
        setErrorGeneral(mensajeDe422(json.detalle, json.aplicaA ?? []));
        return;
      }

      // El freno de peticiones. Sin esta rama el cliente leía "intenta de nuevo" y reintentaba,
      // que es justo lo que quema el poco cupo que le queda.
      if (r.status === 429) {
        const espera = Number(r.headers.get("Retry-After"));
        setErrorGeneral(
          espera > 0
            ? `Demasiados intentos. Espera ${espera} segundo${espera === 1 ? "" : "s"} y vuelve a probar.`
            : "Demasiados intentos seguidos. Espera un momento y vuelve a probar.",
        );
        return;
      }

      // El servidor manda el motivo en `error` cuando no hay un `detalle` que traducir —el 422 de
      // "con $X no alcanza" es el caso—, y hasta ahora se descartaba por un genérico que no le
      // decía al cliente qué corregir. Es suyo y ya viene escrito para leerse.
      setErrorGeneral(
        typeof json?.error === "string" && json.error
          ? json.error
          : "No pudimos enviar tu pedido. Intenta de nuevo.",
      );
    } catch {
      setErrorGeneral(
        "No pudimos enviar tu pedido. Revisa tu conexión e intenta de nuevo.",
      );
    } finally {
      enVuelo.current = false;
      setEnviando(false);
    }
  }

  if (cerrado) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md bg-tarjeta p-6 text-center shadow-tarjeta">
        <h2 className="font-titulo text-lg font-semibold text-cafe">
          Estamos cerrados
        </h2>
        <p className="font-cuerpo text-sm text-cafe-suave">{cerrado}</p>
        <p className="font-cuerpo text-[13px] text-cafe-tenue">
          Tu carrito quedó guardado: vuelve cuando abramos.
        </p>
        <Link
          href="/"
          className="mt-1 rounded-full bg-naranja px-6 py-3 font-cuerpo text-sm font-bold text-crema"
        >
          Volver al menú
        </Link>
      </div>
    );
  }

  // El barrio del cliente, no el nombre de la zona: al repasar su pedido tiene que reconocer
  // su dirección. Que caiga en "zona 2" es cosa nuestra para cobrar el domicilio (regla 13).
  const barrioEntrega = barrio.trim() || undefined;

  /**
   * El WhatsApp de "cotízame el domicilio" (regla 14). El pedido no existe todavía —no hay
   * número ni token— así que va el carrito y el link al pin, que es lo que la tienda
   * necesita para decidir.
   */
  function linkFueraDeCobertura(): string | null {
    if (!punto || !tienda.telefono) return null;

    const texto = fueraDeCobertura(
      {
        items: items.map((i) => ({
          nombre: i.nombre,
          cantidad: i.cantidad,
          subtotal: i.precioUnitarioEstimado * i.cantidad,
          modificadores: [],
        })),
        subtotal: total,
      },
      punto,
      { nombre: tienda.nombre, baseUrl: "" },
    );

    // `wa.me` con el número del negocio: lo abre el cliente y el destinatario es la tienda.
    // El link corto de WhatsApp Business no sirve aquí porque no acepta `?text=`.
    const numero = tienda.telefono.replace(/\D/g, "").replace(/^(?!57)/, "57");
    return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
  }

  /**
   * El "¿cuándo?" va con el resto de decisiones de la entrega: en domicilio, debajo de quién
   * recibe. En recoger no existe ese paso —son el 1 y el 3—, así que ahí se queda antes del
   * resumen, que es lo más cerca que hay de lo mismo.
   */
  const bloqueCuando = (
    <section className="flex flex-col gap-2 rounded-md bg-tarjeta p-4 shadow-tarjeta">
      <SelectorCuando
        pronto={entrega.pronto}
        dias={entrega.dias}
        mensajeCerrado={entrega.mensajeCerrado}
        esDomicilio={esDomicilio}
        valor={cuando}
        onCambiar={setCuando}
        error={errorDe("programadoPara")}
      />
    </section>
  );

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
      {indiceActual > 0 && (
        <button
          type="button"
          onClick={retroceder}
          className="flex min-h-11 items-center gap-2 self-start font-cuerpo text-sm font-bold text-cafe"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-crema-oscura">
            <ArrowLeft className="size-4" />
          </span>
          Ir atrás
        </button>
      )}

      {paso === 1 && (
        <section className="flex flex-col gap-3 rounded-md bg-tarjeta p-4 shadow-tarjeta">
          <div className="flex flex-col gap-2">
            <span className="font-cuerpo text-sm font-bold text-cafe">
              ¿Cómo quieres tu pedido?
            </span>
            <BotonesTipoPedido actual={tipoPedido} />
            {/* La consecuencia, no el nombre del modo: es lo que hace caer en cuenta a quien
                arrastra la elección del pedido anterior sin darse cuenta. */}
            <p className="font-cuerpo text-[13px] text-cafe-tenue">
              {esDomicilio
                ? "Te lo llevamos a tu dirección."
                : `Lo recoges en ${tienda.nombre}.`}
            </p>
          </div>

          <Campo
            etiqueta="Nombre y apellido"
            requerido
            error={errorDe("clienteNombre")}
          >
            {(props) => (
              <input
                {...props}
                type="text"
                autoComplete="name"
                value={nombre}
                onChange={(e) => setDatos({ nombre: e.target.value })}
                // Se capitaliza al salir y no al escribir: hacerlo en el `onChange` pelearía con
                // el cursor a mitad de palabra. Las partículas se respetan, ver `nombre.ts`.
                onBlur={() => {
                  setDatos({ nombre: capitalizarNombre(nombre) });
                  alSalirDe("clienteNombre");
                }}
                placeholder="Ana Gómez"
                className={claseControl(errorDe("clienteNombre"))}
              />
            )}
          </Campo>

          <Campo
            etiqueta="Teléfono"
            requerido
            error={errorDe("clienteTelefono")}
            ayuda="Para avisarte cuando esté listo."
          >
            {(props) => (
              // El +57 es fijo, no un selector de país: la tienda solo opera en Colombia.
              <div className="flex gap-2">
                <span className="flex min-h-11 shrink-0 items-center rounded-sm border border-crema-oscura bg-crema px-3 font-cuerpo text-[15px] text-cafe-suave">
                  +57
                </span>
                <input
                  {...props}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  value={telefono}
                  // Solo dígitos y tope de 10: el `*` no se puede ni teclear, que es mejor que
                  // dejarlo escribir y regañarlo después. El esquema lo vuelve a comprobar.
                  onChange={(e) =>
                    setDatos({ telefono: telefonoTecleado(e.target.value, 10) })
                  }
                  onBlur={() => alSalirDe("clienteTelefono")}
                  // 10 dígitos caben en 10 caracteres, pero "+57 311 643 5036" son 16: con el
                  // tope en 10 el navegador recortaba el texto ANTES de que `telefonoTecleado`
                  // lo viera, así que del autocompletado de Chrome solo llegaba "5731164". El
                  // recorte de verdad lo hace la función, que cuenta dígitos y no caracteres.
                  maxLength={20}
                  placeholder="311 234 5678"
                  className={claseControl(errorDe("clienteTelefono"))}
                />
              </div>
            )}
          </Campo>

          {/* Envueltos y no comentados: así el import de `SelectorFecha` y las variables
              `email` / `cumple` siguen usados, y esto se refactoriza con el resto del archivo
              en vez de envejecer aparte. Ver `PIDE_CORREO_Y_CUMPLE`. */}
          {PIDE_CORREO_Y_CUMPLE && (
            <>
              <Campo
                etiqueta="Correo"
                ayuda="Opcional."
                error={errorDe("clienteEmail")}
              >
                {(props) => (
                  <input
                    {...props}
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setDatos({ email: e.target.value })}
                    onBlur={() => alSalirDe("clienteEmail")}
                    placeholder="ana@gmail.com"
                    className={claseControl(errorDe("clienteEmail"))}
                  />
                )}
              </Campo>

              <Campo
                etiqueta="Fecha de cumpleaños"
                ayuda="Opcional."
                error={errorDe("clienteCumple")}
              >
                {(props) => (
                  <SelectorFecha
                    {...props}
                    valor={cumple}
                    onCambiar={(v) => setDatos({ cumple: v })}
                    onCerrar={() => alSalirDe("clienteCumple")}
                    error={errorDe("clienteCumple")}
                  />
                )}
              </Campo>
            </>
          )}
        </section>
      )}

      {paso === 2 && (
        <>
          <section className="flex flex-col gap-3 rounded-md bg-tarjeta p-4 shadow-tarjeta">
            <h2 className="font-titulo text-base font-semibold text-cafe">
              ¿Dónde te lo llevamos?
            </h2>

            {/* El pin manda (regla 14): de aquí sale el costo, no de la dirección escrita. */}
            <SelectorUbicacion
              centroTienda={centroTienda}
              pin={punto}
              onPin={(p) => {
                setDatos({ punto: p });
                alSalirDe("punto");
              }}
              cobertura={cobertura}
              onCotizar={cotizar}
            />

            {sinCobertura && linkFueraDeCobertura() && (
              <a
                href={linkFueraDeCobertura()!}
                target="_blank"
                rel="noopener"
                className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-naranja px-4 font-cuerpo text-sm font-bold text-crema transition-colors hover:bg-naranja-osc"
              >
                Escríbenos y te cotizamos
              </a>
            )}

            <Campo
              etiqueta="Dirección"
              requerido
              error={errorDe("direccion")}
              ayuda="Para el domiciliario. El costo lo define el pin del mapa."
            >
              {(props) => (
                <input
                  {...props}
                  type="text"
                  autoComplete="street-address"
                  value={direccion}
                  onChange={(e) => setDatos({ direccion: e.target.value })}
                  onBlur={() => alSalirDe("direccion")}
                  placeholder="Calle 10 # 5-20, apto 301"
                  className={claseControl(errorDe("direccion"))}
                />
              )}
            </Campo>

            {/* El mapa ya sabe en qué barrio cayó el pin, así que no se le pide teclearlo:
                se le pide confirmarlo. Quien manda es lo escrito, porque el domiciliario
                busca por el nombre que usa la gente y no por el que tenga mapeado OSM. */}
            <Campo
              etiqueta="Barrio"
              requerido
              error={errorDe("barrio")}
              ayuda="Lo tomamos del mapa; cámbialo si no es."
            >
              {(props) => (
                <input
                  {...props}
                  type="text"
                  value={barrio}
                  onChange={(e) => setDatos({ barrio: e.target.value })}
                  onBlur={() => alSalirDe("barrio")}
                  placeholder="El Caney"
                  className={claseControl(errorDe("barrio"))}
                />
              )}
            </Campo>

            <Campo
              etiqueta="Indicaciones"
              error={errorDe("indicaciones")}
              ayuda="Opcional."
            >
              {(props) => (
                <textarea
                  {...props}
                  rows={2}
                  value={indicaciones}
                  onChange={(e) => setDatos({ indicaciones: e.target.value })}
                  onBlur={() => alSalirDe("indicaciones")}
                  placeholder="Al frente del Farmatodo, casa de reja verde"
                  className={claseControl(errorDe("indicaciones"))}
                />
              )}
            </Campo>
          </section>

          <section className="flex flex-col gap-3 rounded-md bg-tarjeta p-4 shadow-tarjeta">
            <h2 className="font-titulo text-base font-semibold text-cafe">
              ¿Quién recibe?
            </h2>
            <div className="flex gap-2">
              {[false, true].map((otro) => (
                <button
                  key={String(otro)}
                  type="button"
                  onClick={() => setDatos({ recibeOtro: otro })}
                  className={`min-h-11 flex-1 rounded-sm border px-4 py-2 font-cuerpo text-sm font-bold ${
                    recibeOtro === otro
                      ? "border-cafe bg-crema text-cafe"
                      : "border-crema-oscura text-cafe-suave"
                  }`}
                >
                  {otro ? "Alguien más" : "Yo"}
                </button>
              ))}
            </div>

            {recibeOtro && (
              <>
                <Campo
                  etiqueta="Nombre de quien recibe"
                  requerido
                  error={errorDe("recibeNombre")}
                >
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      value={recibeNombre}
                      onChange={(e) =>
                        setDatos({ recibeNombre: e.target.value })
                      }
                      onBlur={() => {
                        setDatos({
                          recibeNombre: capitalizarNombre(recibeNombre),
                        });
                        alSalirDe("recibeNombre");
                      }}
                      placeholder="Carlos Gómez"
                      className={claseControl(errorDe("recibeNombre"))}
                    />
                  )}
                </Campo>
                <Campo
                  etiqueta="Teléfono de quien recibe"
                  requerido
                  error={errorDe("recibeTelefono")}
                >
                  {(props) => (
                    <div className="flex gap-2">
                      <span className="flex min-h-11 shrink-0 items-center rounded-sm border border-crema-oscura bg-crema px-3 font-cuerpo text-[15px] text-cafe-suave">
                        +57
                      </span>
                      <input
                        {...props}
                        type="tel"
                        inputMode="numeric"
                        value={recibeTelefono}
                        onChange={(e) =>
                          setDatos({
                            recibeTelefono: telefonoTecleado(e.target.value, 10),
                          })
                        }
                        onBlur={() => alSalirDe("recibeTelefono")}
                        maxLength={20}
                        placeholder="311 643 5036"
                        className={claseControl(errorDe("recibeTelefono"))}
                      />
                    </div>
                  )}
                </Campo>
              </>
            )}
          </section>

          {bloqueCuando}
        </>
      )}

      {paso === 3 && (
        <>
          <h2 className="font-titulo text-xl font-semibold text-cafe">
            Terminar y pagar
          </h2>

          <section className="flex flex-col gap-2 rounded-md bg-tarjeta p-4 shadow-tarjeta">
            <h3 className="font-titulo text-base font-semibold text-cafe">
              Información de la sede
            </h3>
            <p className="flex items-center gap-2 font-cuerpo text-sm text-cafe">
              <Store className="size-4 shrink-0 text-cafe-suave" />
              {tienda.nombre}
            </p>
            {tienda.telefono && (
              <p className="flex items-center gap-2 font-cuerpo text-sm text-cafe">
                <Phone className="size-4 shrink-0 text-cafe-suave" />
                {tienda.telefono}
              </p>
            )}
            {tienda.direccion && (
              <p className="flex items-center gap-2 font-cuerpo text-sm text-cafe">
                <MapPin className="size-4 shrink-0 text-cafe-suave" />
                {tienda.direccion}
              </p>
            )}
          </section>

          <section className="flex flex-col gap-2 rounded-md bg-tarjeta p-4 shadow-tarjeta">
            <h3 className="font-titulo text-base font-semibold text-cafe">
              {esDomicilio ? "Información de entrega" : "Recoges en tienda"}
            </h3>
            {esDomicilio ? (
              <>
                <p className="font-cuerpo text-sm text-cafe">
                  {direccion}
                  {barrioEntrega && `, ${barrioEntrega}`}
                </p>
                {indicaciones && (
                  <p className="font-cuerpo text-[13px] text-cafe-suave">
                    {indicaciones}
                  </p>
                )}
                <p className="font-cuerpo text-[13px] text-cafe-suave">
                  Entregar a{" "}
                  {recibeOtro && recibeNombre ? recibeNombre : nombre}
                </p>
                {/* La hora se eligió en el paso anterior y esta es la pantalla donde se
                    repasa todo antes de pagar: sin esta línea sería lo único del pedido que
                    no se puede confirmar de un vistazo. */}
                <p className="font-cuerpo text-[13px] text-cafe-suave">
                  {cuando.modo === "programar" && cuando.franja
                    ? `Llega ${cuando.franja.etiqueta}`
                    : "Llega lo antes posible"}
                </p>
              </>
            ) : (
              <>
                <p className="font-cuerpo text-sm text-cafe-suave">
                  Te avisamos cuando esté listo para recoger.
                </p>
                {/* La dirección repetida aquí, y no solo arriba en «Información de la sede», porque
                    esta es la sección que responde «¿y yo qué hago?» cuando eliges recoger. */}
                {tienda.direccion && (
                  <p className="flex items-start gap-2 font-cuerpo text-sm text-cafe">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-cafe-suave" />
                    {tienda.direccion}
                  </p>
                )}
                {tienda.comoLlegar && (
                  <a
                    href={tienda.comoLlegar}
                    target="_blank"
                    rel="noopener"
                    className="flex min-h-11 items-center justify-center gap-2 self-start rounded-full border border-crema-oscura px-5 font-cuerpo text-sm font-bold text-cafe"
                  >
                    <MapPin className="size-4" />
                    Cómo llegar
                  </a>
                )}
              </>
            )}
          </section>

          {!esDomicilio && bloqueCuando}

          <section className="flex flex-col gap-3 rounded-md bg-tarjeta p-4 shadow-tarjeta">
            <h3 className="font-titulo text-base font-semibold text-cafe">
              Resumen de tu pedido
            </h3>
            <ul className="flex flex-col gap-2">
              {items.map((item) => (
                <li
                  key={item.lineId}
                  className={`flex justify-between gap-3 font-cuerpo text-sm ${
                    lineasConProblema.includes(item.lineId)
                      ? "rounded-sm bg-error/8 px-2 py-1 text-error"
                      : "text-cafe"
                  }`}
                >
                  <span>
                    {item.cantidad > 1 && `${item.cantidad}x `}
                    {item.nombre}
                  </span>
                  <span className="shrink-0 font-bold">
                    {pesos(item.precioUnitarioEstimado * item.cantidad)}
                  </span>
                </li>
              ))}
            </ul>

            {/* Editable, y no el `<p>` de solo lectura que había aquí.

                Las notas se escriben en el carrito, así que este era el único campo del esquema
                sin ningún input en el checkout: si fallaban —bastaba un "!" cuando la lista de
                caracteres era más estrecha—, `señalar` traía al cliente hasta este paso con un
                "Falta: Notas" y no había nada que tocar. Reintentar daba lo mismo y la única
                salida era volver a la carta a borrar el signo, sin que nada se lo dijera.

                Que se puedan editar aquí lo cierra de raíz: el día que se añada otra regla a este
                campo, seguirá habiendo dónde arreglarla. */}
            <Campo
              etiqueta="Notas del pedido"
              error={errorDe("notas")}
              ayuda="Opcional. Lo lee quien lo prepara."
            >
              {(props) => (
                <textarea
                  {...props}
                  rows={2}
                  value={notas}
                  onChange={(e) => setNotas(e.target.value.slice(0, MAXIMO_NOTAS))}
                  onBlur={() => alSalirDe("notas")}
                  maxLength={MAXIMO_NOTAS}
                  placeholder="Sin canela, por favor"
                  className={claseControl(errorDe("notas"))}
                />
              )}
            </Campo>

            {/* Encima de los totales y no en un paso aparte: el cupón es dinero, y va donde el
                cliente está mirando el dinero. */}
            <div className="border-t border-crema-oscura pt-3">
              {/* `key`: si el código cambia por fuera —un link `?cupon=` o el carrito rehidratado—
                  el campo se remonta con el texto correcto. Es la alternativa de React al efecto
                  que sincronizaba el input, que provocaba renders en cascada. */}
              <CampoCupon
                key={cupon ?? "sin-cupon"}
                codigo={cupon}
                estado={estadoCupon}
                onAplicar={setCupon}
                onQuitar={() => setCupon(null)}
              />
            </div>

            <dl className="flex flex-col gap-1 border-t border-crema-oscura pt-2 font-cuerpo text-sm text-cafe-suave">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>{pesos(total)}</dd>
              </div>
              {esDomicilio && (
                <div className="flex justify-between">
                  <dt>Costo de envío</dt>
                  <dd>{pesos(costoDomicilio)}</dd>
                </div>
              )}
              {/* Con el código al lado: en una lista de importes, un "Descuento" a secas no dice
                  de dónde salió, y el cliente que aplicó un cupón quiere ver que es el suyo. */}
              {descuento > 0 && (
                <div className="flex justify-between text-exito">
                  <dt>Descuento {cupon}</dt>
                  <dd>−{pesos(descuento)}</dd>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-cafe">
                <dt>Total a pagar</dt>
                <dd>{pesos(totalAPagar)}</dd>
              </div>
            </dl>
          </section>

          <section className="flex flex-col gap-3 rounded-md bg-tarjeta p-4 shadow-tarjeta">
            <h3 className="font-titulo text-base font-semibold text-cafe">
              Métodos de pago
            </h3>

            {/* Va ENCIMA de la lista: explica por qué no está el efectivo antes de que el
                cliente lo busque, no después de que se pregunte si la app se rompió. */}
            {pagoPorAdelantado && (
              <div className="flex flex-col gap-2 rounded-sm bg-crema p-3 font-cuerpo text-[13px] text-cafe-suave">
                <p>
                  Como elegiste recoger tu pedido, el pago debe realizarse antes
                  de preparar tu pedido.
                </p>
                <p>
                  Puedes pagar fácilmente por Llave o Nequi. Una vez confirmado
                  el pago, ¡comenzaremos a preparar tu pedido! 😊
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {metodosPermitidos.map((m) => (
                <label
                  key={m}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-sm border px-3 py-2 font-cuerpo text-[15px] ${
                    metodoPago === m
                      ? "border-naranja bg-naranja/8 text-cafe"
                      : "border-crema-oscura text-cafe-suave"
                  }`}
                >
                  <input
                    type="radio"
                    name="metodoPago"
                    value={m}
                    checked={metodoPago === m}
                    onChange={() => setPago({ metodoPago: m })}
                    className="size-4 accent-[var(--naranja)]"
                  />
                  {/* "Nequi o Bre-B" y no solo "Nequi": el QR y la llave son los
                      interoperables, así que un cliente de Bancolombia o Daviplata paga
                      igual. Llamarlo solo Nequi lo estaría echando. El enum de la base
                      sigue siendo `nequi`; esto es el rótulo, no el modelo. */}
                  <span className="font-semibold">
                    {m === "efectivo" ? "Efectivo" : "Nequi o Bre-B"}
                  </span>
                </label>
              ))}
            </div>

            {/* Para que el domiciliario salga con la devuelta contada. Opcional: quien no lo
                sepa todavía sigue de largo, y el pedido se confirma igual. */}
            {metodoPago === "efectivo" && (
              <Campo
                etiqueta="¿Con cuánto pagas?"
                ayuda={
                  devuelta !== null
                    ? `Te llevamos ${pesos(devuelta)} de cambio.`
                    : "Opcional. Así llevamos tu cambio listo."
                }
                error={errorDe("pagaCon")}
              >
                {(props) => (
                  <div className="flex gap-2">
                    <span className="flex min-h-11 shrink-0 items-center rounded-sm border border-crema-oscura bg-crema px-3 font-cuerpo text-[15px] text-cafe-suave">
                      $
                    </span>
                    <input
                      {...props}
                      type="text"
                      inputMode="numeric"
                      value={pagaCon}
                      // Solo dígitos: "50.000" y "$50.000" son la misma intención, y hacer
                      // que el cliente adivine el formato es hacerle perder el pedido.
                      onChange={(e) =>
                        setPagaCon(e.target.value.replace(/\D/g, ""))
                      }
                      onBlur={() => alSalirDe("pagaCon")}
                      placeholder="50000"
                      className={claseControl(errorDe("pagaCon"))}
                    />
                  </div>
                )}
              </Campo>
            )}

            {metodoPago === "nequi" && (
              <div className="flex flex-col gap-4 rounded-sm bg-crema p-3">
                <DatoCopiable
                  etiqueta="Transfiere este valor"
                  valor={pesos(totalAPagar)}
                  aCopiar={String(totalAPagar)}
                />
                {tienda.nequiQrUrl && <QrDePago url={tienda.nequiQrUrl} />}

                {tienda.nequiLlave && (
                  <DatoCopiable
                    etiqueta=" O paga con esta llave Bre-B"
                    valor={tienda.nequiLlave}
                    aCopiar={tienda.nequiLlave}
                    titular={tienda.nequiLlaveTitular}
                  />
                )}

                {/* Se dice el recorrido completo ANTES de que se vaya a Nequi: si no,
                    paga y cierra la pestaña sin saber que faltaba volver a adjuntar. */}
                <p className="font-cuerpo text-[13px] text-cafe-suave">
                  Paga desde tu app bancaria, toma la captura del comprobante y
                  vuelve aquí para adjuntarla.
                </p>

                {!pagoConfirmado ? (
                  <>
                    {/* Sin esto el checkout es un callejón sin salida: el pedido exige
                        comprobante, pero la zona para subirlo todavía no existe. */}
                    {errorDe("comprobanteUrl") && (
                      <p className="rounded-sm bg-error/10 px-3 py-2 font-cuerpo text-[13px] font-semibold text-error">
                        Toca «Ya realicé mi pago» para adjuntar el comprobante.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => setPago({ pagoConfirmado: true })}
                      className="min-h-11 rounded-full bg-naranja px-6 py-3 font-cuerpo text-sm font-bold text-crema"
                    >
                      Ya realicé mi pago
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col gap-2 border-t border-crema-oscura pt-3">
                    <span className="font-cuerpo text-sm font-bold text-cafe">
                      Adjunta el comprobante
                    </span>
                    <span className="font-cuerpo text-[13px] text-cafe-suave">
                      Búscalo en tu galería: suele ser la captura más reciente.
                    </span>
                    <SubidaComprobante
                      url={comprobanteUrl}
                      onSubido={(url) => setPago({ comprobanteUrl: url })}
                      error={errorDe("comprobanteUrl")}
                    />
                  </div>
                )}
              </div>
            )}
          </section>

          <div className="flex flex-col gap-3 rounded-md bg-tarjeta p-4 shadow-tarjeta">
            {/* "Avisos" y no "notificaciones automáticas": el mensaje lo dispara un empleado desde
                el panel (regla 10), y prometer un envío automático que no ocurre es prometer de
                más. Marcada por defecto porque es finalidad necesaria del servicio —quien pide
                quiere saber cuándo sale su comida—, no publicidad. */}
            <label className="flex cursor-pointer items-start gap-3 font-cuerpo text-[13px] text-cafe-suave">
              <input
                type="checkbox"
                checked={aceptaAvisos}
                onChange={(e) => setAceptaAvisos(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--naranja)]"
              />
              <span>
                Recibir avisos por WhatsApp sobre el estado de tu pedido{" "}
                <span className="text-cafe-tenue">(Recomendado)</span>
              </span>
            </label>

            {!aceptaAvisos && (
              // Si dice que no, hay que decirle cómo se entera. El seguimiento existe siempre; sin
              // esta línea, rechazar los avisos se siente como quedarse a ciegas.
              <p className="rounded-sm bg-crema p-3 font-cuerpo text-[13px] text-cafe-suave">
                No te escribiremos. Podrás seguir tu pedido en el enlace que te
                mostramos al confirmarlo.
              </p>
            )}
          </div>

          {/* El input va FUERA del label, enlazado por `id`, y no envuelto como el de arriba.
              Es lo que deja meter el "Ver más" en la misma frase sin que abrir la política
              marque o desmarque la aceptación: el botón no es descendiente del label, así que
              no hay nada que burbujee. Y el nombre accesible de la casilla sigue siendo solo
              la frase, sin el "Ver más" pegado detrás. */}
          <div className="flex items-start gap-3 rounded-md bg-tarjeta p-4 shadow-tarjeta">
            <input
              type="checkbox"
              id="acepta-politica"
              checked={aceptaPolitica}
              onChange={(e) => setAceptaPolitica(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--naranja)]"
            />
            <p className="font-cuerpo text-[13px] text-cafe-suave">
              <label htmlFor="acepta-politica" className="cursor-pointer">
                Acepto la política de tratamiento de datos personales.
              </label>{" "}
              <PoliticaDatos />
            </p>
          </div>
        </>
      )}

      {errorGeneral && (
        <p
          role="alert"
          className="rounded-sm bg-error/10 px-3 py-2 font-cuerpo text-sm font-semibold text-error"
        >
          {errorGeneral}
        </p>
      )}

      {esUltimo ? (
        <button
          type="submit"
          disabled={enviando || !aceptaPolitica}
          className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-naranja px-6 py-3 font-cuerpo text-base font-bold text-crema disabled:opacity-40"
        >
          {enviando ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Enviando…
            </>
          ) : (
            `Realizar pedido · ${pesos(totalAPagar)}`
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={avanzar}
          className="flex min-h-11 items-center justify-center rounded-full bg-naranja px-6 py-3 font-cuerpo text-base font-bold text-crema"
        >
          {`Continuar (${indiceActual + 1}/${pasos.length})`}
        </button>
      )}

      <p className="pb-4 text-center font-cuerpo text-[13px] text-cafe-tenue">
        El total final lo confirma {tienda.nombre} al recibir el pedido.
      </p>
    </form>
  );
}
