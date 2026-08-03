import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getStore } from "@/db/queries/store";
import { obtenerPedidoPorToken } from "@/db/queries/pedidos";
import { avisoNuevoPedido } from "@/lib/notificaciones/avisos";
import { cuandoCorto, fechaHora, pesos } from "@/lib/notificaciones/plantillas";
import {
  DETALLE_ESTADO,
  ETIQUETA_ESTADO,
  METODO_PAGO_ETIQUETA,
  pasosDelPedido,
  toneDeEstado,
} from "@/lib/pedidos/estados";

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

  const tone = toneDeEstado(pedido.estado);
  const pasos = pasosDelPedido(pedido.tipo);
  const indiceActual = pasos.indexOf(pedido.estado);

  // Mientras no exista el panel (Fase C), el negocio se entera porque el cliente toca
  // este botón. Es null si la tienda no tiene teléfono cargado.
  const aviso = await avisoNuevoPedido(pedido, tienda);

  return (
    <main className="mx-auto flex w-full max-w-[520px] flex-col gap-4 px-4 py-6">
      <header className="flex flex-col items-center gap-1 text-center">
        <p className="font-cuerpo text-sm text-cafe-suave">Pedido #{pedido.numero}</p>
        <h1 className="font-titulo text-2xl font-semibold text-cafe">
          {pedido.estado === "nuevo" ? "¡Recibimos tu pedido!" : ETIQUETA_ESTADO[pedido.estado]}
        </h1>
        <p className="font-cuerpo text-sm text-cafe-suave">{DETALLE_ESTADO[pedido.estado]}</p>
        {/* Debajo del estado y no enterrado en la lista de datos: quien programó su pedido
            abre esta pantalla precisamente para confirmar que la hora quedó bien. */}
        {pedido.programadoPara && pedido.estado !== "cancelado" && (
          <p className="font-cuerpo text-sm font-bold text-cafe">
            {pedido.tipo === "domicilio" ? "Llega" : "Lo recoges"}{" "}
            {cuandoCorto(pedido.programadoPara)}
          </p>
        )}
      </header>

      <section className="rounded-md bg-tarjeta p-4 shadow-tarjeta">
        <div className="flex items-center justify-between">
          <span
            className={`rounded-sm px-3 py-1 font-cuerpo text-sm font-bold ${
              tone === "cancelado"
                ? "bg-error/12 text-error"
                : tone === "exito"
                  ? "bg-exito/12 text-exito"
                  : "bg-naranja/12 text-naranja-osc"
            }`}
          >
            {ETIQUETA_ESTADO[pedido.estado]}
          </span>
          <span className="font-cuerpo text-[13px] text-cafe-tenue">
            {fechaHora(pedido.creadoEn)}
          </span>
        </div>

        {pedido.estado !== "cancelado" && (
          <ol className="mt-4 flex flex-col gap-2">
            {pasos.map((paso, i) => {
              const alcanzado = i <= indiceActual;
              return (
                <li key={paso} className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className={`size-2.5 shrink-0 rounded-full ${
                      alcanzado ? "bg-naranja" : "bg-crema-oscura"
                    }`}
                  />
                  <span
                    className={`font-cuerpo text-sm ${
                      i === indiceActual
                        ? "font-bold text-cafe"
                        : alcanzado
                          ? "text-cafe-suave"
                          : "text-cafe-tenue"
                    }`}
                  >
                    {ETIQUETA_ESTADO[paso]}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {aviso?.modo === "link" && pedido.estado === "nuevo" && (
        <div className="flex flex-col gap-1">
          <a
            href={aviso.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center justify-center rounded-full bg-naranja px-6 py-3 text-center font-cuerpo text-base font-bold text-crema"
          >
            Avisar al negocio por WhatsApp
          </a>
          <p className="text-center font-cuerpo text-[13px] text-cafe-tenue">
            Un toque y les llega el detalle de tu pedido.
          </p>
        </div>
      )}

      <section className="rounded-md bg-tarjeta p-4 shadow-tarjeta">
        <h2 className="font-titulo text-lg font-semibold text-cafe">Tu pedido</h2>
        <div className="mt-3 flex flex-col gap-3">
          {pedido.items.map((item, i) => (
            <div key={i} className="flex justify-between gap-3">
              <div className="flex flex-col">
                <span className="font-cuerpo text-sm font-bold text-cafe">
                  {item.cantidad > 1 && `${item.cantidad}x `}
                  {item.nombre}
                </span>
                {item.modificadores.length > 0 && (
                  <span className="text-[12px] text-cafe-suave">
                    {item.modificadores
                      .map((m) => (m.cantidad > 1 ? `${m.cantidad}x ${m.nombre}` : m.nombre))
                      .join(", ")}
                  </span>
                )}
                {item.notas && (
                  <span className="text-[12px] italic text-cafe-tenue">{item.notas}</span>
                )}
              </div>
              <span className="shrink-0 font-cuerpo text-sm font-bold text-cafe">
                {pesos(item.subtotal)}
              </span>
            </div>
          ))}
        </div>

        <dl className="mt-4 flex flex-col gap-1 border-t border-crema-oscura pt-3 font-cuerpo text-sm text-cafe-suave">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{pesos(pedido.subtotal)}</dd>
          </div>
          {pedido.tipo === "domicilio" && (
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
      </section>

      <section className="rounded-md bg-tarjeta p-4 font-cuerpo text-sm shadow-tarjeta">
        <h2 className="font-titulo text-lg font-semibold text-cafe">
          {pedido.tipo === "domicilio" ? "Entrega" : "Recoges en tienda"}
        </h2>
        <dl className="mt-2 flex flex-col gap-1 text-cafe-suave">
          <div>
            <dt className="inline font-bold text-cafe">A nombre de: </dt>
            <dd className="inline">{pedido.clienteNombre}</dd>
          </div>
          {pedido.tipo === "domicilio" && (
            <>
              {pedido.direccion && (
                <div>
                  <dt className="inline font-bold text-cafe">Dirección: </dt>
                  <dd className="inline">{pedido.direccion}</dd>
                </div>
              )}
              {pedido.barrio && (
                <div>
                  <dt className="inline font-bold text-cafe">Barrio: </dt>
                  <dd className="inline">{pedido.barrio}</dd>
                </div>
              )}
              {pedido.indicaciones && (
                <div>
                  <dt className="inline font-bold text-cafe">Indicaciones: </dt>
                  <dd className="inline">{pedido.indicaciones}</dd>
                </div>
              )}
            </>
          )}
          {pedido.tipo === "recoger" && tienda.direccion && (
            <div>
              <dt className="inline font-bold text-cafe">Dirección: </dt>
              <dd className="inline">{tienda.direccion}</dd>
            </div>
          )}
          <div>
            <dt className="inline font-bold text-cafe">Pago: </dt>
            <dd className="inline">
              {METODO_PAGO_ETIQUETA[pedido.metodoPago] ?? pedido.metodoPago}
              {pedido.metodoPago === "nequi" && pedido.tieneComprobante && " · comprobante recibido"}
            </dd>
          </div>
          {pedido.notas && (
            <div>
              <dt className="inline font-bold text-cafe">Notas: </dt>
              <dd className="inline">{pedido.notas}</dd>
            </div>
          )}
        </dl>
      </section>

      <Link
        href="/"
        className="mx-auto font-cuerpo text-sm font-bold text-naranja underline underline-offset-4"
      >
        Volver al menú
      </Link>
    </main>
  );
}
