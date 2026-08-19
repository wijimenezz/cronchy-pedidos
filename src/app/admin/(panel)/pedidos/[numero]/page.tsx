import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  Bike,
  CalendarClock,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  ShoppingBag,
  Smartphone,
} from "lucide-react";
import { getStore } from "@/db/queries/store";
import { obtenerPedidoPorNumero, type PedidoPanel } from "@/db/queries/panel";
import { historialDelCliente, type HistorialCliente } from "@/db/queries/customers";
import { listarDomiciliarios } from "@/db/queries/domiciliarios";
import { exigirRol } from "@/lib/autorizacion";
import { cuandoCorto, pesos, type ItemSnapshot } from "@/lib/notificaciones/plantillas";
import { normalizarTelefono } from "@/lib/notificaciones/transporte";
import { puedeAvisarse } from "@/lib/notificaciones/avisos";
import {
  ETIQUETA_ESTADO,
  METODO_PAGO_ETIQUETA,
  siguienteEstado,
  toneDeEstado,
} from "@/lib/pedidos/estados";
import { agruparModificadores, contarPreparacion } from "@/lib/pedidos/modificadores";
import { urlMapa } from "@/lib/zonas";
import { AccionesPedido } from "./AccionesPedido";
import { AsignarDomiciliario } from "./AsignarDomiciliario";
import { MapaPlegable } from "./MapaPlegable";
import { VisorComprobante } from "./VisorComprobante";

export const dynamic = "force-dynamic";

const TONO_BADGE = {
  activo: "bg-naranja/15 text-naranja-osc",
  exito: "bg-exito/15 text-exito",
  cancelado: "bg-agotado/20 text-cafe-suave",
} as const;

function fechaHora(fecha: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(fecha);
}

function fechaCorta(fecha: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeZone: "America/Bogota",
  }).format(fecha);
}

/** "3er pedido" · "12º pedido". El primero se rotula aparte, con su distintivo. */
function ordinal(n: number): string {
  if (n === 2) return "2º";
  if (n === 3) return "3er";
  return `${n}º`;
}

export default async function DetallePedidoPage({
  params,
}: {
  params: Promise<{ numero: string }>;
}) {
  await exigirRol("colaborador");

  const { numero } = await params;
  // `/admin/pedidos/abc` es un 404, no un error de Postgres al castear.
  if (!/^\d+$/.test(numero)) notFound();

  const tienda = await getStore();
  const encontrado = await obtenerPedidoPorNumero(tienda.id, Number(numero));
  if (!encontrado) notFound();

  const { pedido, historial } = encontrado;
  const cliente = await historialDelCliente(tienda.id, pedido.customerId, pedido.numero);

  const esDomicilio = pedido.tipo === "domicilio";
  // La agenda se carga aquí y viaja como props: el modal no tiene que ir a buscarla al abrirse.
  const domiciliarios = esDomicilio ? await listarDomiciliarios(tienda.id) : [];
  // Se derivan aquí y no en la consulta: son las mismas dos preguntas que responde la lista,
  // con los datos que este pedido ya trae.
  const siguiente = siguienteEstado(pedido.estado, pedido.tipo);
  const avisoPendiente =
    puedeAvisarse(pedido.estado) &&
    !historial.some((e) => e.estado === pedido.estado && e.notificadoEn);

  const telefono = normalizarTelefono(pedido.clienteTelefono);
  const cuenta = contarPreparacion(pedido.items);

  return (
    <div className="mx-auto flex w-full max-w-contenido flex-col gap-4">
      <Link
        href="/admin/pedidos"
        className="flex min-h-11 items-center gap-2 self-start font-cuerpo text-sm font-bold text-cafe-suave underline-offset-2 hover:underline"
      >
        <ArrowLeft className="size-4" />
        Pedidos
      </Link>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-titulo text-2xl font-bold text-cafe">#{pedido.numero}</h1>
        <span
          className={`rounded-full px-3 py-1 font-cuerpo text-sm font-bold ${TONO_BADGE[toneDeEstado(pedido.estado)]}`}
        >
          {ETIQUETA_ESTADO[pedido.estado]}
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-crema px-3 py-1 font-cuerpo text-sm font-bold text-cafe-suave">
          {esDomicilio ? <Bike className="size-4" /> : <ShoppingBag className="size-4" />}
          {esDomicilio ? "Domicilio" : "Recoge en tienda"}
        </span>

        <ChipPago pedido={pedido} />

        {/* El azul de la tarjeta del tablero, otra vez aquí: se entra a este detalle tocando
            una tarjeta azul y la pantalla tiene que seguir diciendo lo mismo. Va con el día y
            no solo con la hora —`cuandoCorto`, igual que la tarjeta— porque con pedidos de hoy
            y de mañana mezclados una hora suelta es una promesa ambigua. */}
        {pedido.programadoPara && (
          <span className="flex items-center gap-1.5 rounded-full bg-programado/15 px-3 py-1 font-cuerpo text-sm font-bold text-programado">
            <CalendarClock className="size-4" />
            Programado · {cuandoCorto(pedido.programadoPara)}
          </span>
        )}

        {/* El total y la hora se van al otro extremo: la izquierda es qué es este pedido, la
            derecha cuánto y cuándo. Al envolverse caen juntos a la línea siguiente. */}
        <span className="ml-auto flex items-baseline gap-3">
          <span className="font-titulo text-xl font-bold text-cafe">{pesos(pedido.total)}</span>
          <span className="font-cuerpo text-[13px] text-cafe-tenue">
            {fechaHora(pedido.creadoEn)}
          </span>
        </span>
      </header>

      {/* Los botones, antes de las columnas: son la razón por la que se abre esta pantalla y
          antes había que bajar hasta el fondo de la derecha para encontrarlos. */}
      <AccionesPedido
        pedidoId={pedido.id}
        numero={pedido.numero}
        estado={pedido.estado}
        siguiente={siguiente}
        avisoPendiente={avisoPendiente}
      />

      {/* Dos columnas en la tablet del mostrador y en escritorio; apiladas por debajo. La
          izquierda es qué preparar y cuánto suma, la derecha a quién entregárselo. */}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="flex flex-col gap-4">
          <Seccion titulo="Qué preparar">
            <p className="-mt-2 mb-3 font-cuerpo text-[13px] text-cafe-tenue">
              {cuenta.unidades} {cuenta.unidades === 1 ? "ítem" : "ítems"}
              {cuenta.extras > 0 &&
                ` · ${cuenta.extras} ${cuenta.extras === 1 ? "extra cobrado" : "extras cobrados"}`}
            </p>

            {/* Separados por línea y no por hueco: cada ítem se lee como un bloque, que es como
                se despacha. */}
            <ul className="flex flex-col divide-y divide-crema-oscura">
              {pedido.items.map((item, i) => (
                <ItemPreparar key={i} item={item} />
              ))}
            </ul>

            {pedido.notas && (
              <p className="mt-3 rounded-sm bg-alerta/10 px-3 py-2 font-cuerpo text-[13px] text-cafe">
                <span className="font-bold">Nota del pedido: </span>
                {pedido.notas}
              </p>
            )}

            {/* El desglose va al pie de los ítems y no en una tarjeta aparte: cada línea ya
                trae su precio a la derecha, así que la suma se lee en la misma columna donde
                se formó. Lo que decide —cómo paga y si el comprobante llegó— está arriba. */}
            <dl className="mt-3 border-t border-crema-oscura pt-3">
              <Total etiqueta="Subtotal" valor={pesos(pedido.subtotal)} />
              {esDomicilio && (
                <Total etiqueta="Domicilio" valor={pesos(pedido.costoDomicilio)} />
              )}
              {pedido.descuento > 0 && (
                <Total
                  // El código al lado del monto: quien cuadra la caja necesita saber por qué este
                  // pedido cobró menos, y "Descuento" a secas no lo dice.
                  etiqueta={pedido.cuponCodigo ? `Descuento ${pedido.cuponCodigo}` : "Descuento"}
                  valor={`− ${pesos(pedido.descuento)}`}
                />
              )}
              <Total etiqueta="Total" valor={pesos(pedido.total)} destacado />
            </dl>
          </Seccion>

          {/* Plegado y con `<details>` nativo: es consulta, no operación, y aquí no hay nada
              que medir —a diferencia del mapa, que sí necesita montarse para dimensionarse. */}
          <details className="rounded-md border border-crema-oscura bg-tarjeta px-4 py-1">
            <summary className="cursor-pointer py-2.5 font-titulo text-base font-bold text-cafe">
              Historial · {historial.length} {historial.length === 1 ? "cambio" : "cambios"}
            </summary>
            <ol className="flex flex-col gap-2 pb-3">
              {historial.map((evento, i) => (
                <li key={i} className="flex justify-between gap-3 font-cuerpo text-[13px]">
                  <span className="font-bold text-cafe">{ETIQUETA_ESTADO[evento.estado]}</span>
                  <span className="text-cafe-tenue">
                    {fechaHora(evento.creadoEn)}
                    {evento.notificadoEn && " · avisado"}
                  </span>
                </li>
              ))}
            </ol>
          </details>
        </div>

        <Seccion
          titulo={esDomicilio ? "Entrega" : "Recoge"}
          programado={pedido.programadoPara !== null}
        >
          {/* Lo primero: es lo que cambia cuándo hay que empezar a freír. */}
          <Dato
            etiqueta={esDomicilio ? "Entregar" : "Recoge"}
            valor={
              pedido.programadoPara
                ? cuandoCorto(pedido.programadoPara)
                : "lo más pronto posible"
            }
          />

          {/* Justo debajo de cuándo sale, y no al final de la tarjeta: se lee en el orden del
              despacho —cuándo sale, quién lo lleva, a quién y dónde—, y así deja de depender de
              cuánto midan la ficha del cliente o la dirección, que es lo que lo empujaba fuera
              de la pantalla en la tablet.

              Solo en domicilios: un pedido para recoger no tiene a quién asignar. Y solo
              mientras el pedido siga vivo — mandarle un domicilio a alguien por un pedido ya
              entregado o cancelado no es un caso, es un error. */}
          {esDomicilio && pedido.estado !== "entregado" && pedido.estado !== "cancelado" && (
            <div className="my-3">
              <AsignarDomiciliario
                pedidoId={pedido.id}
                numero={pedido.numero}
                domiciliarios={domiciliarios}
                asignado={
                  pedido.domiciliarioNombre
                    ? {
                        nombre: pedido.domiciliarioNombre,
                        telefono: pedido.domiciliarioTelefono ?? "",
                      }
                    : null
                }
              />
            </div>
          )}

          <FichaCliente nombre={pedido.clienteNombre} cliente={cliente} />

          <div className="my-2 flex gap-2">
            {/* `tel:` para cuando el domiciliario no encuentra la dirección; el WhatsApp
                es para escribir. Los avisos con plantilla salen del botón de avisar, que
                es quien respeta la idempotencia (regla 11). */}
            <a
              href={`tel:${pedido.clienteTelefono}`}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-crema-oscura font-cuerpo text-sm font-bold text-cafe transition-colors hover:bg-crema"
            >
              <Phone className="size-4" />
              Llamar
            </a>
            <a
              href={`https://wa.me/${telefono}`}
              target="_blank"
              rel="noopener"
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-crema-oscura font-cuerpo text-sm font-bold text-cafe transition-colors hover:bg-crema"
            >
              <MessageCircle className="size-4" />
              Escribir
            </a>
          </div>

          {pedido.recibeNombre && (
            <Dato
              etiqueta="Recibe"
              valor={`${pedido.recibeNombre} · ${pedido.recibeTelefono ?? ""}`}
            />
          )}

          {esDomicilio ? (
            <>
              <Dato etiqueta="Dirección" valor={pedido.direccion ?? "—"} />
              {pedido.barrio && <Dato etiqueta="Barrio" valor={pedido.barrio} />}
              {pedido.indicaciones && (
                <Dato etiqueta="Indicaciones" valor={pedido.indicaciones} />
              )}
              {/* La zona va con su nombre real y no disfrazada de barrio: no es una
                  dirección, es la respuesta a por qué el domicilio costó lo que costó. */}
              {pedido.zonaNombre && (
                <Dato etiqueta="Zona de cobertura" valor={pedido.zonaNombre} />
              )}
              {pedido.punto && (
                <>
                  <MapaPlegable punto={pedido.punto} />
                  {/* El pin que fijó el precio: la dirección escrita es referencia, esto
                      es la coordenada exacta que el domiciliario abre (regla 14). Va fuera
                      del plegable porque es lo que de verdad se pulsa. */}
                  <a
                    href={urlMapa(pedido.punto)}
                    target="_blank"
                    rel="noopener"
                    className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-crema font-cuerpo text-sm font-bold text-cafe transition-colors hover:bg-crema-oscura"
                  >
                    <MapPin className="size-4" />
                    Abrir en Google Maps
                  </a>
                </>
              )}
            </>
          ) : (
            tienda.direccion && <Dato etiqueta="En" valor={tienda.direccion} />
          )}
        </Seccion>
      </div>
    </div>
  );
}

/**
 * Cómo se paga este pedido, al lado del chip de Domicilio/Recoge.
 *
 * Junta en uno solo las tres cosas que deciden si el pedido se puede aceptar y con cuánto sale
 * el domiciliario: el método, con cuánto paga el cliente y —si es Nequi— si el comprobante
 * llegó. Vivían al final de la sección "Cobro", debajo del mapa: en la tablet del mostrador eso
 * eran unos 750 px de scroll para responder "¿es efectivo o es Nequi?", que es lo primero que
 * hay que saber, porque un Nequi sin comprobante ni siquiera puede avanzar
 * (`validarCambioEstado`, motivo `nequi_sin_comprobante`).
 *
 * La etiqueta sale de `METODO_PAGO_ETIQUETA` y no de un ternario sobre "nequi", que es lo que
 * había: el enum de la base admite además `transferencia` y `datafono`, y los dos se pintaban
 * como "Efectivo".
 */
function ChipPago({ pedido }: { pedido: PedidoPanel }) {
  const esNequi = pedido.metodoPago === "nequi";
  const faltaComprobante = esNequi && !pedido.comprobanteUrl;

  return (
    <span
      className={`flex items-center gap-2 rounded-full py-1 pl-3 font-cuerpo text-sm font-bold ${
        pedido.comprobanteUrl ? "pr-1" : "pr-3"
      } ${faltaComprobante ? "bg-error/12 text-error" : "bg-crema text-cafe-suave"}`}
    >
      {esNequi ? <Smartphone className="size-4" /> : <Banknote className="size-4" />}
      {METODO_PAGO_ETIQUETA[pedido.metodoPago] ?? pedido.metodoPago}

      {/* Lo que el domiciliario necesita saber antes de salir. La devuelta se calcula contra el
          total real y solo si da positivo: si el cliente escribió menos de lo que cuesta, se
          enseña lo que puso y ya, sin inventarle una cuenta. */}
      {pedido.pagaCon !== null && (
        <span className="font-normal">
          · paga con {pesos(pedido.pagaCon)}
          {pedido.pagaCon > pedido.total &&
            ` · devuelta ${pesos(pedido.pagaCon - pedido.total)}`}
        </span>
      )}

      {/* Reemplaza al badge suelto "Pago pendiente", que decía esto mismo con otras palabras
          y a dos badges de distancia del método al que se refería. */}
      {faltaComprobante && <span className="font-normal">· sin comprobante</span>}

      {pedido.comprobanteUrl && <VisorComprobante numero={pedido.numero} />}
    </span>
  );
}

/**
 * Quién es esta persona para el negocio. Un habitual y alguien que prueba por primera vez no
 * se atienden igual, y hasta ahora el panel no lo decía en ninguna parte.
 */
function FichaCliente({
  nombre,
  cliente,
}: {
  nombre: string;
  cliente: HistorialCliente | null;
}) {
  const esNuevo = !cliente || cliente.totalPedidos <= 1;

  return (
    <div className="flex flex-col gap-1 rounded-sm bg-crema p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-cuerpo text-[15px] font-bold text-cafe">{nombre}</span>
        {esNuevo ? (
          <span className="rounded-full bg-exito/15 px-2 py-0.5 font-cuerpo text-[12px] font-bold text-exito">
            Nuevo
          </span>
        ) : (
          <span className="rounded-full bg-naranja/12 px-2 py-0.5 font-cuerpo text-[12px] font-bold text-naranja-osc">
            {ordinal(cliente!.totalPedidos)} pedido
          </span>
        )}
      </div>

      {cliente && !esNuevo && (
        <>
          <p className="font-cuerpo text-[13px] text-cafe-suave">
            {pesos(cliente.totalGastado)} en total
          </p>
          {cliente.anteriores.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5">
              {cliente.anteriores.map((p) => (
                <li key={p.numero}>
                  <Link
                    href={`/admin/pedidos/${p.numero}`}
                    className="flex justify-between gap-2 font-cuerpo text-[13px] text-cafe-suave underline-offset-2 hover:underline"
                  >
                    <span>
                      #{p.numero} · {fechaCorta(p.creadoEn)}
                    </span>
                    <span className={p.estado === "cancelado" ? "line-through" : ""}>
                      {pesos(p.total)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Un ítem del pedido tal como se prepara.
 *
 * La etiqueta del grupo va angosta a la izquierda y en tenue, y el valor a la derecha en
 * seminegrita: quien despacha busca "qué salsa", no la palabra "Salsa". Antes pesaban igual y
 * cada opción repetía su grupo, así que cuatro salsas incluidas eran cuatro renglones que
 * empezaban con la misma palabra.
 *
 * Lo cobrado aparte sale de la rejilla y se pinta como píldora. En ámbar y no en naranja porque
 * el naranja ya es el estado activo en esta misma pantalla.
 */
function ItemPreparar({ item }: { item: ItemSnapshot }) {
  const { incluidos, extras } = agruparModificadores(item.modificadores);

  return (
    <li className="flex justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="font-cuerpo text-[15px] font-bold text-cafe">
          {item.cantidad}× {item.nombre}
        </p>

        {incluidos.length > 0 && (
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            {incluidos.map((grupo) => (
              <Fragment key={grupo.etiqueta}>
                <dt className="font-cuerpo text-[13px] text-cafe-tenue">{grupo.etiqueta}</dt>
                <dd className="font-cuerpo text-[13px] font-semibold text-cafe">
                  {grupo.valores.join(" · ")}
                </dd>
              </Fragment>
            ))}
          </dl>
        )}

        {extras.length > 0 && (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {extras.map((extra, i) => (
              <li
                key={i}
                className="flex items-center gap-1 rounded-full bg-alerta/15 px-2 py-0.5 font-cuerpo text-[12px] font-bold text-alerta"
              >
                <Plus className="size-3 shrink-0" />
                Extra: {extra.nombre}
                {extra.cantidad > 1 && ` ×${extra.cantidad}`} · {pesos(extra.total)}
              </li>
            ))}
          </ul>
        )}

        {item.notas && (
          <p className="mt-1 font-cuerpo text-[13px] font-bold text-alerta">Nota: {item.notas}</p>
        )}
      </div>

      <span className="shrink-0 font-cuerpo text-[15px] text-cafe">{pesos(item.subtotal)}</span>
    </li>
  );
}

/**
 * `programado` tiñe la sección con **las mismas dos clases que la tarjeta del tablero**, y que
 * sean literalmente las mismas es el punto: la continuidad entre las dos pantallas es lo único
 * que compra este color. Si algún día cambia una, cambian las dos.
 *
 * Solo la usa la columna de la entrega, que es donde vive la hora. Teñir también "Qué preparar"
 * dejaría la pantalla entera azul y el color perdería justo el contraste que lo hace útil.
 */
function Seccion({
  titulo,
  programado,
  children,
}: {
  titulo: string;
  programado?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-md border p-4 ${
        programado
          ? "border-programado/30 border-l-4 border-l-programado bg-programado-suave"
          : "border-crema-oscura bg-tarjeta"
      }`}
    >
      <h2 className="mb-3 font-titulo text-base font-bold text-cafe">{titulo}</h2>
      {children}
    </section>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <p className="font-cuerpo text-[15px] text-cafe">
      <span className="font-bold text-cafe-suave">{etiqueta}: </span>
      {valor}
    </p>
  );
}

function Total({
  etiqueta,
  valor,
  destacado,
}: {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
}) {
  return (
    <div
      className={`flex justify-between font-cuerpo ${destacado ? "mt-1 text-[17px] font-bold text-cafe" : "text-[15px] text-cafe-suave"}`}
    >
      <dt>{etiqueta}</dt>
      <dd>{valor}</dd>
    </div>
  );
}
