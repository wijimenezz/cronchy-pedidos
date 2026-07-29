"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useCarrito } from "@/lib/carrito";
import { useTipoPedido, elegirTipoPedido, type TipoPedido } from "@/lib/tienda/tipo-pedido";
import { carritoAItems } from "@/lib/checkout/mapeo";
import { crearPedidoSchema } from "@/lib/validaciones";
import { pesos } from "@/lib/notificaciones/plantillas";
import type { ZonaDomicilio } from "@/db/queries/deliveryZones";
import { Campo, claseControl } from "@/components/checkout/Campo";
import { SubidaComprobante } from "@/components/checkout/SubidaComprobante";

/** Valor del <select> que revela el campo de barrio libre (US11). */
const BARRIO_OTRO = "__otro__";

type Errores = Record<string, string>;

export function CheckoutForm({
  zonas,
  tienda,
}: {
  zonas: ZonaDomicilio[];
  tienda: { nombre: string; nequiTitular: string | null; nequiNumero: string | null };
}) {
  const router = useRouter();
  const items = useCarrito((s) => s.items);
  const vaciar = useCarrito((s) => s.vaciar);
  const tipoPedido = useTipoPedido();

  // `persist` de Zustand rehidrata desde localStorage: hasta que termine, `items` es []
  // aunque el carrito tenga cosas. Sin esta guardia, el "carrito vacío" echaría a todo
  // el mundo apenas entra.
  //
  // Se lee con useSyncExternalStore —igual que `useTipoPedido`— porque el snapshot del
  // servidor es siempre false: React concilia la diferencia sin error de hidratación.
  const hidratado = useSyncExternalStore(
    (cb) => useCarrito.persist.onFinishHydration(cb),
    () => useCarrito.persist.hasHydrated(),
    () => false,
  );

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [barrioSel, setBarrioSel] = useState(zonas.length > 0 ? "" : BARRIO_OTRO);
  const [barrioTexto, setBarrioTexto] = useState("");
  const [direccion, setDireccion] = useState("");
  const [indicaciones, setIndicaciones] = useState("");
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "nequi">("efectivo");
  const [comprobanteUrl, setComprobanteUrl] = useState<string | null>(null);
  const [notas, setNotas] = useState("");

  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [lineasConProblema, setLineasConProblema] = useState<string[]>([]);
  const [cerrado, setCerrado] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const enVuelo = useRef(false);

  const total = items.reduce((t, i) => t + i.precioUnitarioEstimado * i.cantidad, 0);
  const zonaElegida = zonas.find((z) => z.id === barrioSel);
  const porConfirmar = barrioSel === BARRIO_OTRO;
  const costoDomicilio = tipoPedido === "domicilio" ? (zonaElegida?.precio ?? 0) : 0;
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

  function construirPayload() {
    const { items: itemsPedido } = carritoAItems(items);
    return {
      tipo: tipoPedido as TipoPedido,
      clienteNombre: nombre,
      clienteTelefono: telefono,
      zonaId: porConfirmar ? undefined : barrioSel || undefined,
      barrioTexto: porConfirmar ? barrioTexto : undefined,
      direccion: tipoPedido === "domicilio" ? direccion : undefined,
      indicaciones: indicaciones || undefined,
      metodoPago,
      comprobanteUrl: comprobanteUrl ?? undefined,
      notas: notas || undefined,
      items: itemsPedido,
    };
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
      case "zona_no_encontrada":
      case "zona_inactiva":
        setErrores((e) => ({ ...e, zonaId: "Esa zona ya no está disponible." }));
        router.refresh();
        return "El barrio que elegiste ya no está disponible. Elige otro.";
      case "zona_o_barrio_requerido":
        setErrores((e) => ({ ...e, zonaId: "Selecciona tu barrio o escríbelo." }));
        return "Falta indicar tu barrio.";
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

    // Mismo esquema que usa el servidor: los mensajes coinciden y no hay dos verdades.
    const parsed = crearPedidoSchema.safeParse(construirPayload());
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setErrores(
        Object.fromEntries(
          Object.entries(fieldErrors)
            .filter(([, v]) => v?.length)
            .map(([k, v]) => [k, v![0]]),
        ),
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

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
      <section className="flex flex-col gap-3 rounded-md bg-tarjeta p-4 shadow-tarjeta">
        <div className="flex items-center justify-between">
          <span className="font-cuerpo text-sm font-bold text-cafe">
            {tipoPedido === "domicilio" ? "Domicilio" : "Recoger en tienda"}
          </span>
          <button
            type="button"
            onClick={() => elegirTipoPedido(tipoPedido === "domicilio" ? "recoger" : "domicilio")}
            className="font-cuerpo text-[13px] font-bold text-naranja underline underline-offset-2"
          >
            Cambiar
          </button>
        </div>

        <Campo etiqueta="Tu nombre" requerido error={errores.clienteNombre}>
          {(props) => (
            <input
              {...props}
              type="text"
              autoComplete="name"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ana Gómez"
              className={claseControl(errores.clienteNombre)}
            />
          )}
        </Campo>

        <Campo
          etiqueta="Tu teléfono"
          requerido
          error={errores.clienteTelefono}
          ayuda="Para avisarte cuando esté listo."
        >
          {(props) => (
            <input
              {...props}
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="300 123 4567"
              className={claseControl(errores.clienteTelefono)}
            />
          )}
        </Campo>
      </section>

      {tipoPedido === "domicilio" && (
        <section className="flex flex-col gap-3 rounded-md bg-tarjeta p-4 shadow-tarjeta">
          <h2 className="font-titulo text-base font-semibold text-cafe">¿Dónde te lo llevamos?</h2>

          {zonas.length > 0 && (
            <Campo etiqueta="Barrio" requerido error={errores.zonaId}>
              {(props) => (
                <select
                  {...props}
                  value={barrioSel}
                  onChange={(e) => setBarrioSel(e.target.value)}
                  className={claseControl(errores.zonaId)}
                >
                  <option value="">Elige tu barrio…</option>
                  {zonas.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.barrio} — {pesos(z.precio)}
                    </option>
                  ))}
                  <option value={BARRIO_OTRO}>Mi barrio no aparece</option>
                </select>
              )}
            </Campo>
          )}

          {porConfirmar && (
            <>
              <Campo etiqueta="Escribe tu barrio" requerido error={errores.barrioTexto}>
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    value={barrioTexto}
                    onChange={(e) => setBarrioTexto(e.target.value)}
                    placeholder="Vereda La Aguadita"
                    className={claseControl(errores.barrioTexto)}
                  />
                )}
              </Campo>
              <p className="rounded-sm bg-alerta/12 px-3 py-2 font-cuerpo text-[13px] text-alerta">
                Como tu barrio no está en la lista, el negocio te confirma el valor del domicilio
                antes de salir.
              </p>
            </>
          )}

          <Campo etiqueta="Dirección" requerido error={errores.direccion}>
            {(props) => (
              <input
                {...props}
                type="text"
                autoComplete="street-address"
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                placeholder="Calle 10 # 5-20, apto 301"
                className={claseControl(errores.direccion)}
              />
            )}
          </Campo>

          <Campo etiqueta="Indicaciones" error={errores.indicaciones} ayuda="Opcional.">
            {(props) => (
              <textarea
                {...props}
                rows={2}
                value={indicaciones}
                onChange={(e) => setIndicaciones(e.target.value)}
                placeholder="Al frente del Farmatodo, casa de reja verde"
                className={claseControl(errores.indicaciones)}
              />
            )}
          </Campo>
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-md bg-tarjeta p-4 shadow-tarjeta">
        <h2 className="font-titulo text-base font-semibold text-cafe">¿Cómo vas a pagar?</h2>
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
                  onChange={() => setMetodoPago(m)}
                  className="size-4 accent-[var(--naranja)]"
                />
                <span className="font-semibold">{m === "efectivo" ? "Efectivo" : "Nequi"}</span>
              </label>
            ))}
        </div>

        {metodoPago === "nequi" && (
          <div className="flex flex-col gap-3 rounded-sm bg-crema p-3">
            <div className="font-cuerpo text-sm text-cafe">
              <p>
                Transfiere <strong>{pesos(total + costoDomicilio)}</strong> a:
              </p>
              <p className="mt-1 text-lg font-bold text-naranja">{tienda.nequiNumero}</p>
              {tienda.nequiTitular && (
                <p className="text-[13px] text-cafe-suave">A nombre de {tienda.nequiTitular}</p>
              )}
              {porConfirmar && (
                <p className="mt-1 text-[13px] text-alerta">
                  El domicilio va aparte: el negocio te lo confirma.
                </p>
              )}
            </div>
            <SubidaComprobante
              url={comprobanteUrl}
              onSubido={setComprobanteUrl}
              error={errores.comprobanteUrl}
            />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-md bg-tarjeta p-4 shadow-tarjeta">
        <h2 className="font-titulo text-base font-semibold text-cafe">Tu pedido</h2>
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

        <dl className="flex flex-col gap-1 border-t border-crema-oscura pt-2 font-cuerpo text-sm text-cafe-suave">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{pesos(total)}</dd>
          </div>
          {tipoPedido === "domicilio" && (
            <div className="flex justify-between">
              <dt>Domicilio</dt>
              <dd>{porConfirmar ? "Por confirmar" : pesos(costoDomicilio)}</dd>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-cafe">
            <dt>Total</dt>
            <dd>{pesos(total + costoDomicilio)}</dd>
          </div>
        </dl>

        <Campo etiqueta="Notas para el pedido" error={errores.notas} ayuda="Opcional.">
          {(props) => (
            <textarea
              {...props}
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Sin canela, por favor"
              className={claseControl(errores.notas)}
            />
          )}
        </Campo>
      </section>

      {errorGeneral && (
        <p role="alert" className="rounded-sm bg-error/10 px-3 py-2 font-cuerpo text-sm font-semibold text-error">
          {errorGeneral}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-naranja px-6 py-3 font-cuerpo text-base font-bold text-crema disabled:opacity-40"
      >
        {enviando ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Enviando…
          </>
        ) : (
          `Confirmar pedido · ${pesos(total + costoDomicilio)}`
        )}
      </button>

      <p className="pb-4 text-center font-cuerpo text-[13px] text-cafe-tenue">
        El total final lo confirma {tienda.nombre} al recibir el pedido.
      </p>
    </form>
  );
}
