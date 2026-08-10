import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Bike,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  ShoppingBag,
} from "lucide-react";
import { getStore } from "@/db/queries/store";
import { obtenerPedidoPorNumero } from "@/db/queries/panel";
import { historialDelCliente, type HistorialCliente } from "@/db/queries/customers";
import { listarDomiciliarios } from "@/db/queries/domiciliarios";
import { exigirRol } from "@/lib/autorizacion";
import { cuandoCorto, pesos, type ItemSnapshot } from "@/lib/notificaciones/plantillas";
import { normalizarTelefono } from "@/lib/notificaciones/transporte";
import { puedeAvisarse } from "@/lib/notificaciones/avisos";
import { ETIQUETA_ESTADO, siguienteEstado, toneDeEstado } from "@/lib/pedidos/estados";
import { agruparModificadores, contarPreparacion } from "@/lib/pedidos/modificadores";
import { urlMapa } from "@/lib/zonas";
import { MapaPedido } from "@/components/pedido/MapaPedido";
import { AccionesPedido } from "./AccionesPedido";
import { AsignarDomiciliario } from "./AsignarDomiciliario";

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
    <div className="flex flex-col gap-4">
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
        {pedido.metodoPago === "nequi" && !pedido.comprobanteUrl && (
          <span className="rounded-full bg-error/12 px-3 py-1 font-cuerpo text-sm font-bold text-error">
            Pago pendiente
          </span>
        )}
        <span className="font-cuerpo text-[13px] text-cafe-tenue">
          {fechaHora(pedido.creadoEn)}
        </span>
      </header>

      {/* Dos columnas en la tablet del mostrador y en escritorio; apiladas por debajo. La
          izquierda es qué preparar, la derecha a quién entregárselo y qué cobrar. */}
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
          </Seccion>

          <Seccion titulo="Historial">
            <ol className="flex flex-col gap-2">
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
          </Seccion>
        </div>

        <div className="flex flex-col gap-4">
          <Seccion titulo={esDomicilio ? "Entrega" : "Recoge"}>
            {/* Lo primero: es lo que cambia cuándo hay que empezar a freír. */}
            <Dato
              etiqueta={esDomicilio ? "Entregar" : "Recoge"}
              valor={
                pedido.programadoPara
                  ? cuandoCorto(pedido.programadoPara)
                  : "lo más pronto posible"
              }
            />

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
                    <div className="my-2">
                      <MapaPedido punto={pedido.punto} />
                    </div>
                    {/* El pin que fijó el precio: la dirección escrita es referencia, esto
                        es la coordenada exacta que el domiciliario abre (regla 14). */}
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

            {/* Solo en domicilios: un pedido para recoger no tiene a quién asignar. Y solo
                mientras el pedido siga vivo — mandarle un domicilio a alguien por un pedido ya
                entregado o cancelado no es un caso, es un error. */}
            {esDomicilio && pedido.estado !== "entregado" && pedido.estado !== "cancelado" && (
              <div className="mt-3">
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
          </Seccion>

          <Seccion titulo="Cobro">
            <dl>
              <Total etiqueta="Subtotal" valor={pesos(pedido.subtotal)} />
              {esDomicilio && (
                <Total etiqueta="Domicilio" valor={pesos(pedido.costoDomicilio)} />
              )}
              {pedido.descuento > 0 && (
                <Total etiqueta="Descuento" valor={`− ${pesos(pedido.descuento)}`} />
              )}
              <Total etiqueta="Total" valor={pesos(pedido.total)} destacado />
            </dl>

            <div className="mt-3 border-t border-crema-oscura pt-3">
              <Dato
                etiqueta="Método"
                valor={pedido.metodoPago === "nequi" ? "Nequi" : "Efectivo"}
              />
              {/* Lo que el domiciliario necesita saber antes de salir. La devuelta se calcula
                  contra el total real y solo si da positivo: si el cliente escribió menos de
                  lo que cuesta, se enseña lo que puso y ya, sin inventarle una cuenta. */}
              {pedido.pagaCon !== null && (
                <Dato
                  etiqueta="Paga con"
                  valor={
                    <>
                      {pesos(pedido.pagaCon)}
                      {pedido.pagaCon > pedido.total && (
                        <span className="font-bold text-cafe">
                          {" "}
                          · devuelta {pesos(pedido.pagaCon - pedido.total)}
                        </span>
                      )}
                    </>
                  }
                />
              )}
              {pedido.metodoPago === "nequi" &&
                (pedido.comprobanteUrl ? (
                  // El bucket es privado: el link solo abre para quien tenga la service key,
                  // así que se sirve por nuestro endpoint, ya con la sesión validada.
                  <Dato
                    etiqueta="Comprobante"
                    valor={
                      <a
                        href={`/api/admin/comprobante/${pedido.numero}`}
                        target="_blank"
                        rel="noopener"
                        className="font-bold text-naranja-osc underline-offset-2 hover:underline"
                      >
                        Ver comprobante
                      </a>
                    }
                  />
                ) : (
                  <p className="font-cuerpo text-[13px] font-bold text-error">
                    Sin comprobante: este pedido no puede aceptarse todavía.
                  </p>
                ))}
            </div>
          </Seccion>

          <AccionesPedido
            pedidoId={pedido.id}
            numero={pedido.numero}
            estado={pedido.estado}
            siguiente={siguiente}
            avisoPendiente={avisoPendiente}
          />
        </div>
      </div>
    </div>
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

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-crema-oscura bg-tarjeta p-4">
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
