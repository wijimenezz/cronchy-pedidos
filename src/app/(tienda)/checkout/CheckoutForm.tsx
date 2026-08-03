"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, MapPin, Phone, Store } from "lucide-react";
import { useCarrito } from "@/lib/carrito";
import { useTipoPedido, elegirTipoPedido, type TipoPedido } from "@/lib/tienda/tipo-pedido";
import { carritoAItems } from "@/lib/checkout/mapeo";
import { useDatosCliente, useDatosClienteHidratados } from "@/lib/checkout/datos-cliente";
import { crearPedidoSchema, REQUERIDO } from "@/lib/validaciones";
import { fueraDeCobertura, pesos } from "@/lib/notificaciones/plantillas";
import { Campo, claseControl } from "@/components/checkout/Campo";
import { DatoCopiable } from "@/components/checkout/DatoCopiable";
import { SelectorFecha } from "@/components/checkout/SelectorFecha";
import { SubidaComprobante } from "@/components/checkout/SubidaComprobante";
import { SelectorUbicacion, type Cobertura } from "@/components/checkout/SelectorUbicacion";
import {
  SelectorCuando,
  cuandoInicial,
  type Cuando,
} from "@/components/checkout/SelectorCuando";
import type { OpcionesEntrega } from "@/lib/pedidos/entrega";
import type { Punto } from "@/components/checkout/MapaUbicacion";

type Errores = Record<string, string>;

type Paso = 1 | 2 | 3;

/** "3124914660" -> "312 491 4660". Solo para mostrar: lo que se copia son los dígitos. */
function conEspacios(numero: string): string {
  return numero.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1 $2 $3");
}

/**
 * Qué campos del esquema se revisan antes de dejar pasar al siguiente paso. El envío
 * final valida el payload completo igual que hoy; esto solo decide dónde se detiene
 * al cliente, para que no descubra en el paso 3 que le faltó el teléfono.
 */
const CAMPOS_POR_PASO: Record<Paso, string[]> = {
  1: ["clienteNombre", "clienteTelefono", "clienteEmail", "clienteCumple"],
  2: ["punto", "direccion", "indicaciones", "recibeNombre", "recibeTelefono"],
  3: ["metodoPago", "comprobanteUrl", "notas", "items", "programadoPara"],
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
    whatsappUrl: string | null;
    nequiTitular: string | null;
    nequiNumero: string | null;
    nequiLlave: string | null;
    nequiLlaveTitular: string | null;
  };
}) {
  const router = useRouter();
  const items = useCarrito((s) => s.items);
  const notas = useCarrito((s) => s.notas);
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

  // Estos campos NO son estado local: viven en un store persistido, así el cliente no
  // tiene que volver a escribirlos en su próximo pedido (ni si recarga a mitad del
  // formulario). Al leerlos directo del store no hace falta ningún efecto que los
  // copie: aparecen solos en cuanto termina la hidratación.
  const datos = useDatosCliente();
  const setDatos = useDatosCliente((s) => s.set);
  const { nombre, telefono, email, cumple, punto, direccion, indicaciones } = datos;
  const { recibeOtro, recibeNombre, recibeTelefono } = datos;

  const [aceptaPolitica, setAceptaPolitica] = useState(false);
  // Cuándo lo quiere. NO va al carrito persistido, por lo mismo que las notas: una hora
  // elegida hace tres horas ya no vale, y rescatarla de localStorage sería prometer una franja
  // que el servidor va a rechazar.
  const [cuando, setCuando] = useState<Cuando>(() => cuandoInicial(entrega.pronto));
  // Qué dijo el servidor del pin actual. Es lo que pinta el costo en vivo y lo que bloquea
  // el envío si el cliente quedó fuera de cobertura (regla 14).
  const [cobertura, setCobertura] = useState<Cobertura>({ estado: "sin_pin" });

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

  const total = items.reduce((t, i) => t + i.precioUnitarioEstimado * i.cantidad, 0);
  const esDomicilio = tipoPedido === "domicilio";
  // Lo que se muestra mientras el cliente arrastra el pin. El precio que se cobra lo
  // recalcula el servidor al confirmar (regla 1); esto es solo información.
  const costoDomicilio =
    esDomicilio && cobertura.estado === "cubierto" ? cobertura.precio : 0;
  const sinCobertura = esDomicilio && cobertura.estado === "fuera";
  // Si el negocio no cargó su Nequi, ofrecerlo sería mandar al cliente a un callejón sin salida.
  const nequiDisponible = Boolean(tienda.nequiNumero);

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
        <h2 className="font-titulo text-lg font-semibold text-cafe">Tu carrito está vacío</h2>
        <p className="font-cuerpo text-sm text-cafe-suave">Agrega algo rico antes de confirmar.</p>
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
        <h2 className="font-titulo text-lg font-semibold text-cafe">¿Cómo quieres tu pedido?</h2>
        <div className="flex gap-3">
          {(["domicilio", "recoger"] as TipoPedido[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => elegirTipoPedido(t)}
              className="min-h-11 flex-1 rounded-full bg-naranja px-4 py-3 font-cuerpo text-sm font-bold text-crema"
            >
              {t === "domicilio" ? "Domicilio" : "Recoger"}
            </button>
          ))}
        </div>
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
      clienteEmail: email || undefined,
      clienteCumple: cumple || undefined,
      recibeNombre: esDomicilio && recibeOtro ? recibeNombre : undefined,
      recibeTelefono: esDomicilio && recibeOtro ? recibeTelefono : undefined,
      // Viaja el pin, no la zona ni el precio: el servidor resuelve la cobertura de nuevo
      // al recibirlo (regla 1).
      punto: esDomicilio && punto ? punto : undefined,
      direccion: esDomicilio ? direccion : undefined,
      indicaciones: indicaciones || undefined,
      // Ausente = lo más pronto posible. El servidor comprueba que esta hora sea una de las
      // que él mismo ofrece; aquí solo se transmite cuál eligió el cliente.
      programadoPara: cuando.modo === "programar" ? cuando.franja?.instante : undefined,
      metodoPago,
      comprobanteUrl: comprobanteUrl ?? undefined,
      notas: notas || undefined,
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

  function avanzar() {
    const delPaso = CAMPOS_POR_PASO[paso];
    // Tocar "Continuar" revela de una vez todo lo que falta en el paso.
    setTocados((t) => ({ ...t, ...Object.fromEntries(delPaso.map((c) => [c, true])) }));

    if (delPaso.some(hayFallo)) {
      setErrorGeneral("Revisa los datos marcados.");
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
  function mensajeDe422(detalle: { tipo: string; itemIndex?: number }): string {
    const { lineIdPorIndice } = carritoAItems(items);
    const linea =
      detalle.itemIndex !== undefined ? items[detalle.itemIndex]?.nombre : undefined;

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
        setErrores((e) => ({ ...e, punto: "Confirma tu ubicación en el mapa." }));
        setPaso(2);
        return "Falta confirmar tu ubicación.";
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

    // `fallosUI` no lo ve el esquema. Sin esta guardia, quien tocó "Programar" y no eligió
    // hora mandaría un pedido "lo antes posible" sin enterarse: el payload es válido, solo
    // que dice algo distinto de lo que él quiso.
    const pendientes = Object.keys(fallosUI);
    if (pendientes.length > 0) {
      setTocados((t) => ({ ...t, ...Object.fromEntries(pendientes.map((c) => [c, true])) }));
      setErrorGeneral("Revisa los datos marcados.");
      return;
    }

    // `parsed` ya salió del mismo esquema que usa el servidor: los mensajes coinciden
    // y no hay dos verdades.
    if (!parsed.success) {
      setTocados(
        Object.fromEntries(Object.values(CAMPOS_POR_PASO).flat().map((c) => [c, true])),
      );
      setErrorGeneral("Revisa los datos marcados.");
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
          setErrorGeneral(json?.error ?? "Esa hora ya no está disponible. Elige otra.");
          // La página es `force-dynamic`: esto vuelve a pedir las franjas ya sin la caducada.
          router.refresh();
          return;
        }

        // Cerró entre que cargó la página y le dio a confirmar.
        setCerrado(json?.error ?? "Estamos cerrados en este momento.");
        return;
      }

      if (r.status === 400 && json?.detalles?.fieldErrors) {
        const fieldErrors = json.detalles.fieldErrors as Record<string, string[]>;
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
        setErrorGeneral(mensajeDe422(json.detalle));
        return;
      }

      setErrorGeneral("No pudimos enviar tu pedido. Intenta de nuevo.");
    } catch {
      setErrorGeneral("No pudimos enviar tu pedido. Revisa tu conexión e intenta de nuevo.");
    } finally {
      enVuelo.current = false;
      setEnviando(false);
    }
  }

  if (cerrado) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md bg-tarjeta p-6 text-center shadow-tarjeta">
        <h2 className="font-titulo text-lg font-semibold text-cafe">Estamos cerrados</h2>
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

  const barrioEntrega = cobertura.estado === "cubierto" ? cobertura.zona : undefined;

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
          <div className="flex items-center justify-between">
            <span className="font-cuerpo text-sm font-bold text-cafe">
              {esDomicilio ? "Domicilio" : "Recoger en tienda"}
            </span>
            <button
              type="button"
              onClick={() => elegirTipoPedido(esDomicilio ? "recoger" : "domicilio")}
              className="font-cuerpo text-[13px] font-bold text-naranja underline underline-offset-2"
            >
              Cambiar
            </button>
          </div>

          <Campo etiqueta="Nombre y apellido" requerido error={errorDe("clienteNombre")}>
            {(props) => (
              <input
                {...props}
                type="text"
                autoComplete="name"
                value={nombre}
                onChange={(e) => setDatos({ nombre: e.target.value })}
                onBlur={() => alSalirDe("clienteNombre")}
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
                  onChange={(e) => setDatos({ telefono: e.target.value })}
                  onBlur={() => alSalirDe("clienteTelefono")}
                  placeholder="311 643 5036"
                  className={claseControl(errorDe("clienteTelefono"))}
                />
              </div>
            )}
          </Campo>

          <Campo etiqueta="Correo" ayuda="Opcional." error={errorDe("clienteEmail")}>
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
        </section>
      )}

      {paso === 2 && (
        <>
          <section className="flex flex-col gap-3 rounded-md bg-tarjeta p-4 shadow-tarjeta">
            <h2 className="font-titulo text-base font-semibold text-cafe">¿Dónde te lo llevamos?</h2>

            {/* El pin manda (regla 14): de aquí sale el costo, no de la dirección escrita. */}
            <SelectorUbicacion
              centroTienda={centroTienda}
              pin={punto}
              onPin={(p) => {
                setDatos({ punto: p });
                alSalirDe("punto");
              }}
              cobertura={cobertura}
              onCobertura={setCobertura}
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

            <Campo etiqueta="Indicaciones" error={errorDe("indicaciones")} ayuda="Opcional.">
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
            <h2 className="font-titulo text-base font-semibold text-cafe">¿Quién recibe?</h2>
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
                <Campo etiqueta="Nombre de quien recibe" requerido error={errorDe("recibeNombre")}>
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      value={recibeNombre}
                      onChange={(e) => setDatos({ recibeNombre: e.target.value })}
                      onBlur={() => alSalirDe("recibeNombre")}
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
                        onChange={(e) => setDatos({ recibeTelefono: e.target.value })}
                        onBlur={() => alSalirDe("recibeTelefono")}
                        placeholder="311 643 5036"
                        className={claseControl(errorDe("recibeTelefono"))}
                      />
                    </div>
                  )}
                </Campo>
              </>
            )}
          </section>
        </>
      )}

      {paso === 3 && (
        <>
          <h2 className="font-titulo text-xl font-semibold text-cafe">Terminar y pagar</h2>

          <section className="flex flex-col gap-2 rounded-md bg-tarjeta p-4 shadow-tarjeta">
            <h3 className="font-titulo text-base font-semibold text-cafe">Información de la sede</h3>
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
                  <p className="font-cuerpo text-[13px] text-cafe-suave">{indicaciones}</p>
                )}
                <p className="font-cuerpo text-[13px] text-cafe-suave">
                  Entregar a {recibeOtro && recibeNombre ? recibeNombre : nombre}
                </p>
              </>
            ) : (
              <p className="font-cuerpo text-sm text-cafe-suave">
                Te avisamos cuando esté listo para recoger.
              </p>
            )}
          </section>

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

          <section className="flex flex-col gap-3 rounded-md bg-tarjeta p-4 shadow-tarjeta">
            <h3 className="font-titulo text-base font-semibold text-cafe">Resumen de tu pedido</h3>
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

            {notas && (
              <p className="rounded-sm bg-crema px-3 py-2 font-cuerpo text-[13px] text-cafe-suave">
                <span className="font-bold text-cafe">Nota: </span>
                {notas}
              </p>
            )}

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
              <div className="flex justify-between text-base font-bold text-cafe">
                <dt>Total a pagar</dt>
                <dd>{pesos(total + costoDomicilio)}</dd>
              </div>
            </dl>
          </section>

          <section className="flex flex-col gap-3 rounded-md bg-tarjeta p-4 shadow-tarjeta">
            <h3 className="font-titulo text-base font-semibold text-cafe">Métodos de pago</h3>
            <div className="flex flex-col gap-2">
              {(["efectivo", "nequi"] as const)
                .filter((m) => m === "efectivo" || nequiDisponible)
                .map((m) => (
                  <label
                    key={m}
                    className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-sm border px-3 py-2 font-cuerpo text-[15px] ${
                      metodoPago === m ? "border-naranja bg-naranja/8 text-cafe" : "border-crema-oscura text-cafe-suave"
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
                    <span className="font-semibold">{m === "efectivo" ? "Efectivo" : "Nequi"}</span>
                  </label>
                ))}
            </div>

            {metodoPago === "nequi" && (
              <div className="flex flex-col gap-4 rounded-sm bg-crema p-3">
                <DatoCopiable
                  etiqueta="Transfiere este valor"
                  valor={pesos(total + costoDomicilio)}
                  aCopiar={String(total + costoDomicilio)}
                />

                {tienda.nequiNumero && (
                  <DatoCopiable
                    etiqueta="Puedes pagar por Nequi a este número"
                    valor={conEspacios(tienda.nequiNumero)}
                    aCopiar={tienda.nequiNumero}
                    titular={tienda.nequiTitular}
                  />
                )}

                {tienda.nequiLlave && (
                  <DatoCopiable
                    etiqueta="O con esta llave"
                    valor={tienda.nequiLlave}
                    aCopiar={tienda.nequiLlave}
                    titular={tienda.nequiLlaveTitular}
                  />
                )}

                {/* Se dice el recorrido completo ANTES de que se vaya a Nequi: si no,
                    paga y cierra la pestaña sin saber que faltaba volver a adjuntar. */}
                <p className="font-cuerpo text-[13px] text-cafe-suave">
                  Paga desde tu app de Nequi, toma la captura del comprobante y vuelve aquí para
                  adjuntarla.
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

          <label className="flex cursor-pointer items-start gap-3 rounded-md bg-tarjeta p-4 font-cuerpo text-[13px] text-cafe-suave shadow-tarjeta">
            <input
              type="checkbox"
              checked={aceptaPolitica}
              onChange={(e) => setAceptaPolitica(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--naranja)]"
            />
            <span>
              Al continuar, aceptas nuestra política de tratamiento de datos personales.
            </span>
          </label>
        </>
      )}

      {errorGeneral && (
        <p role="alert" className="rounded-sm bg-error/10 px-3 py-2 font-cuerpo text-sm font-semibold text-error">
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
            `Realizar pedido · ${pesos(total + costoDomicilio)}`
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
