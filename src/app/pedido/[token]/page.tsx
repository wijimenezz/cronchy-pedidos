import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  Bike,
  CookingPot,
  Flag,
  Home,
  MapPin,
  MessageCircle,
  Phone,
  ReceiptText,
  ShoppingBag,
  UtensilsCrossed,
  User,
  Wallet,
} from "lucide-react";
import { getStore } from "@/db/queries/store";
import { obtenerPedidoPorToken, type PedidoPublico } from "@/db/queries/pedidos";
import { linkContactoWhatsapp, normalizarTelefono } from "@/lib/notificaciones/transporte";
import { cuandoCorto, horaCorta, pesos } from "@/lib/notificaciones/plantillas";
import {
  DETALLE_ESTADO,
  ETIQUETA_ESTADO,
  hitosDelPedido,
  indiceDeHito,
  METODO_PAGO_ETIQUETA,
  toneDeEstado,
  type Hito,
} from "@/lib/pedidos/estados";
import { SeguirEstado } from "@/components/pedido/SeguirEstado";
import { MapaPedido } from "@/components/pedido/MapaPedido";

// Los datos salen de Drizzle, no de `fetch`, así que Next no detecta que la página es
// dinámica: sin esto la prerenderizaría en build y mostraría siempre el mismo estado.
export const dynamic = "force-dynamic";

// Es un link privado que viaja por WhatsApp. No debe terminar en un buscador.
export const metadata: Metadata = {
  title: "Tu pedido — Cronchy",
  robots: { index: false, follow: false },
};

/** El token lo genera Postgres con encode(gen_random_bytes(16),'hex'). */
const FORMA_TOKEN = /^[0-9a-f]{32}$/;

const ICONO_HITO: Record<Hito, typeof ReceiptText> = {
  recibido: ReceiptText,
  preparando: CookingPot,
  saliendo: Bike,
  entregado: Flag,
};

/** "Wilson Jiménez" -> "Wilson". El saludo es de vecindario, no de banco. */
function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? nombre;
}

/**
 * Cuándo llega, en una línea.
 *
 * Si el cliente eligió hora, esa manda. Si pidió "lo antes posible", se arma el rango con el
 * estimado de la tienda **desde que se hizo el pedido** y no desde ahora: lo que se prometió
 * al confirmar no puede irse corriendo solo porque la página se recargue.
 */
function rangoDeEntrega(
  pedido: Pick<PedidoPublico, "programadoPara" | "creadoEn">,
  tienda: { minutosEstimadoMin: number; minutosEstimadoMax: number },
): string {
  if (pedido.programadoPara) return cuandoCorto(pedido.programadoPara);

  const desde = new Date(pedido.creadoEn.getTime() + tienda.minutosEstimadoMin * 60_000);
  const hasta = new Date(pedido.creadoEn.getTime() + tienda.minutosEstimadoMax * 60_000);

  return `${horaCorta(desde)} – ${horaCorta(hasta)}`;
}

export default async function SeguimientoPedido({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!FORMA_TOKEN.test(token)) notFound();

  const tienda = await getStore();
  const pedido = await obtenerPedidoPorToken(tienda.id, token);
  // Un token que no existe y uno de otra tienda dan lo mismo: 404, sin pistas.
  if (!pedido) notFound();

  const esDomicilio = pedido.tipo === "domicilio";
  const hitos = hitosDelPedido(pedido.tipo);
  const actual = indiceDeHito(pedido.estado, pedido.tipo);
  const cancelado = pedido.estado === "cancelado";

  const whatsapp = linkContactoWhatsapp(
    tienda,
    `Hola, escribo por mi pedido #${pedido.numero}.`,
  );

  return (
    <main className="mx-auto flex w-full max-w-[520px] flex-col gap-4 px-4 py-6">
      {/* Sin esto la pantalla solo cuenta la verdad del instante en que se cargó. */}
      <SeguirEstado token={pedido.tokenPublico} estado={pedido.estado} />

      <header className="flex flex-col gap-1">
        <h1 className="font-titulo text-2xl font-semibold text-cafe">
          {pedido.estado === "nuevo"
            ? `¡Recibimos tu pedido, ${primerNombre(pedido.clienteNombre)}!`
            : ETIQUETA_ESTADO[pedido.estado]}
        </h1>
        <p className="font-cuerpo text-sm text-cafe-suave">{DETALLE_ESTADO[pedido.estado]}</p>
        {!cancelado && (
          <p className="font-cuerpo text-sm text-cafe-suave">
            {esDomicilio ? "Tu rango de entrega:" : "Listo para recoger:"}{" "}
            <span className="font-bold text-cafe">{rangoDeEntrega(pedido, tienda)}</span>
          </p>
        )}
      </header>

      {/* La barra. Un pedido cancelado no está "a medio camino": no hay recorrido que pintar. */}
      {!cancelado && (
        <section
          className="rounded-md bg-tarjeta p-4 shadow-tarjeta"
          aria-label={`Estado: ${ETIQUETA_ESTADO[pedido.estado]}`}
        >
          <ol className="flex items-start">
            {hitos.map((h, i) => {
              const Icono = ICONO_HITO[h.hito];
              const alcanzado = i <= actual;

              return (
                <li key={h.hito} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex w-full items-center">
                    {/* Los tramos de línea van dentro de cada hito, medio a cada lado, para
                        que queden centrados en los iconos sin medir nada en JS. */}
                    <span
                      aria-hidden
                      className={`h-0.5 flex-1 ${i === 0 ? "bg-transparent" : alcanzado ? "bg-naranja" : "bg-crema-oscura"}`}
                    />
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
                        alcanzado ? "bg-naranja text-crema" : "bg-crema-oscura text-cafe-tenue"
                      }`}
                    >
                      <Icono className="size-[18px]" />
                    </span>
                    <span
                      aria-hidden
                      className={`h-0.5 flex-1 ${
                        i === hitos.length - 1
                          ? "bg-transparent"
                          : i < actual
                            ? "bg-naranja"
                            : "bg-crema-oscura"
                      }`}
                    />
                  </div>
                  <span
                    className={`text-center font-cuerpo text-[11px] leading-tight ${
                      i === actual ? "font-bold text-cafe" : "text-cafe-tenue"
                    }`}
                  >
                    {h.etiqueta}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-md bg-tarjeta p-4 shadow-tarjeta">
        <h2 className="font-titulo text-base font-semibold text-cafe">
          {esDomicilio ? "Datos de entrega" : "Recoges en tienda"}
        </h2>

        {esDomicilio && pedido.punto && <MapaPedido punto={pedido.punto} />}

        <dl className="flex flex-col gap-2.5">
          {esDomicilio ? (
            <>
              <Dato icono={MapPin} etiqueta="Dirección">
                {pedido.direccion ?? "—"}
                {pedido.barrio && `, ${pedido.barrio}`}
              </Dato>
              {pedido.indicaciones && (
                <Dato icono={Home} etiqueta="Indicaciones">
                  {pedido.indicaciones}
                </Dato>
              )}
            </>
          ) : (
            tienda.direccion && (
              <Dato icono={MapPin} etiqueta="Dirección de la tienda">
                {tienda.direccion}
              </Dato>
            )
          )}

          <Dato icono={User} etiqueta="A nombre de">
            {pedido.clienteNombre} · +{normalizarTelefono(pedido.clienteTelefono)}
          </Dato>

          <Dato icono={Wallet} etiqueta="Pago">
            <span className="font-bold text-cafe">{pesos(pedido.total)}</span>
            <span className="ml-2 rounded-full bg-naranja/12 px-2 py-0.5 text-[12px] font-bold text-naranja-osc">
              {METODO_PAGO_ETIQUETA[pedido.metodoPago] ?? pedido.metodoPago}
            </span>
            {pedido.metodoPago === "nequi" && pedido.tieneComprobante && (
              <span className="ml-2 text-[12px] text-cafe-tenue">comprobante recibido</span>
            )}
          </Dato>
        </dl>
      </section>

      {/* Los tres atajos del diseño. "Chat" abre una conversación normal con el negocio, no
          un mensaje con el pedido dentro: el pedido ya está en el panel y el cliente lo que
          quiere es preguntar algo. */}
      <nav className="grid grid-cols-3 gap-2">
        <Atajo href="/" icono={UtensilsCrossed} etiqueta="Ver menú" />
        {whatsapp && <Atajo href={whatsapp} icono={MessageCircle} etiqueta="Chat" externo />}
        {tienda.telefono && (
          <Atajo href={`tel:${tienda.telefono}`} icono={Phone} etiqueta="Llamar" />
        )}
      </nav>

      <section className="rounded-md bg-tarjeta p-4 shadow-tarjeta">
        <h2 className="font-titulo text-base font-semibold text-cafe">Tu pedido</h2>
        <ul className="mt-3 flex flex-col gap-3">
          {pedido.items.map((item, i) => (
            <li key={i} className="flex gap-3">
              {/* Los pedidos anteriores a que la foto se congelara en el snapshot no la
                  tienen, y no se va a buscar al producto actual: reconstruir un pedido viejo
                  contra el catálogo de hoy es justo lo que prohíbe la regla 2. */}
              <div className="relative size-14 shrink-0 overflow-hidden rounded-sm bg-crema-oscura">
                {item.imagen ? (
                  <Image src={item.imagen} alt="" fill sizes="56px" className="object-cover" />
                ) : (
                  <span className="flex h-full items-center justify-center text-cafe-tenue">
                    <ShoppingBag className="size-5" />
                  </span>
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col">
                <span className="font-cuerpo text-sm font-bold text-cafe">
                  {item.cantidad > 1 && `${item.cantidad}x `}
                  {item.nombre}
                </span>
                {item.modificadores.length > 0 && (
                  <span className="font-cuerpo text-[12px] text-cafe-suave">
                    {item.modificadores
                      .map((m) => (m.cantidad > 1 ? `${m.cantidad}x ${m.nombre}` : m.nombre))
                      .join(", ")}
                  </span>
                )}
                {item.notas && (
                  <span className="font-cuerpo text-[12px] italic text-cafe-tenue">
                    {item.notas}
                  </span>
                )}
              </div>

              <span className="shrink-0 font-cuerpo text-sm font-bold text-cafe">
                {pesos(item.subtotal)}
              </span>
            </li>
          ))}
        </ul>

        <dl className="mt-4 flex flex-col gap-1 border-t border-crema-oscura pt-3 font-cuerpo text-sm text-cafe-suave">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{pesos(pedido.subtotal)}</dd>
          </div>
          {esDomicilio && (
            <div className="flex justify-between">
              <dt>Domicilio</dt>
              <dd>{pesos(pedido.costoDomicilio)}</dd>
            </div>
          )}
          {pedido.descuento > 0 && (
            <div className="flex justify-between">
              <dt>Descuento</dt>
              <dd>−{pesos(pedido.descuento)}</dd>
            </div>
          )}
          <div className="mt-1 flex justify-between text-base font-bold text-cafe">
            <dt>Total</dt>
            <dd>{pesos(pedido.total)}</dd>
          </div>
        </dl>

        {pedido.notas && (
          <p className="mt-3 rounded-sm bg-crema px-3 py-2 font-cuerpo text-[13px] text-cafe-suave">
            <span className="font-bold text-cafe">Nota: </span>
            {pedido.notas}
          </p>
        )}
      </section>

      <p className="text-center font-cuerpo text-[13px] text-cafe-tenue">
        Pedido #{pedido.numero} · {tone(pedido.estado)}
      </p>
    </main>
  );
}

/** El estado en letra pequeña al pie, para quien baje hasta abajo buscando confirmación. */
function tone(estado: PedidoPublico["estado"]): string {
  return toneDeEstado(estado) === "cancelado" ? "cancelado" : ETIQUETA_ESTADO[estado];
}

function Dato({
  icono: Icono,
  etiqueta,
  children,
}: {
  icono: typeof MapPin;
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icono className="mt-0.5 size-4 shrink-0 text-cafe-tenue" aria-hidden />
      <div className="min-w-0 flex-1 font-cuerpo text-sm text-cafe-suave">
        <dt className="sr-only">{etiqueta}</dt>
        <dd>{children}</dd>
      </div>
    </div>
  );
}

function Atajo({
  href,
  icono: Icono,
  etiqueta,
  externo,
}: {
  href: string;
  icono: typeof MapPin;
  etiqueta: string;
  externo?: boolean;
}) {
  const clases =
    "flex min-h-11 flex-col items-center justify-center gap-1 rounded-md bg-tarjeta py-3 font-cuerpo text-[13px] font-bold text-cafe shadow-tarjeta transition-colors hover:bg-crema";

  if (externo) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={clases}>
        <Icono className="size-5 text-naranja" />
        {etiqueta}
      </a>
    );
  }

  return (
    <Link href={href} className={clases}>
      <Icono className="size-5 text-naranja" />
      {etiqueta}
    </Link>
  );
}
