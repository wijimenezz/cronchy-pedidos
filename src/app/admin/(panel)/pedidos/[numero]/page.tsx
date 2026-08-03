import Link from "next/link";
import { notFound } from "next/navigation";
import { getStore } from "@/db/queries/store";
import { obtenerPedidoPorNumero } from "@/db/queries/panel";
import { exigirRol } from "@/lib/autorizacion";
import { cuandoCorto, pesos } from "@/lib/notificaciones/plantillas";
import { ETIQUETA_ESTADO, METODO_PAGO_ETIQUETA, toneDeEstado } from "@/lib/pedidos/estados";
import { urlMapa } from "@/lib/zonas";

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

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          href="/admin/pedidos"
          className="font-cuerpo text-sm font-bold text-cafe-suave underline-offset-2 hover:underline"
        >
          ← Pedidos
        </Link>
      </div>

      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-titulo text-2xl font-bold text-cafe">#{pedido.numero}</h1>
          <p className="font-cuerpo text-[13px] text-cafe-tenue">{fechaHora(pedido.creadoEn)}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 font-cuerpo text-sm font-bold ${TONO_BADGE[toneDeEstado(pedido.estado)]}`}
        >
          {ETIQUETA_ESTADO[pedido.estado]}
        </span>
      </header>

      <Seccion titulo={pedido.tipo === "domicilio" ? "Entrega" : "Recoge en tienda"}>
        {/* Lo primero de la sección: es lo que cambia cuándo hay que empezar a freír. */}
        <Dato
          etiqueta={pedido.tipo === "domicilio" ? "Entregar" : "Recoge"}
          valor={
            pedido.programadoPara
              ? cuandoCorto(pedido.programadoPara)
              : "lo más pronto posible"
          }
        />
        <Dato etiqueta="Cliente" valor={pedido.clienteNombre} />
        {/* `tel:` y no un wa.me: cuando el domiciliario no encuentra la dirección, se
            llama. Los mensajes con plantilla salen por el botón de avisar, que es quien
            respeta la idempotencia. */}
        <Dato
          etiqueta="Teléfono"
          valor={
            <a
              href={`tel:${pedido.clienteTelefono}`}
              className="font-bold text-naranja-osc underline-offset-2 hover:underline"
            >
              {pedido.clienteTelefono}
            </a>
          }
        />
        {pedido.recibeNombre && (
          <Dato
            etiqueta="Recibe"
            valor={`${pedido.recibeNombre} · ${pedido.recibeTelefono ?? ""}`}
          />
        )}
        {pedido.tipo === "domicilio" && (
          <>
            <Dato etiqueta="Dirección" valor={pedido.direccion ?? "—"} />
            {pedido.barrio && <Dato etiqueta="Barrio" valor={pedido.barrio} />}
            {pedido.indicaciones && <Dato etiqueta="Indicaciones" valor={pedido.indicaciones} />}
            {/* La zona va aparte y con su nombre real, no disfrazada de barrio: no es una
                dirección, es la respuesta a por qué el domicilio costó lo que costó. */}
            {pedido.zonaNombre && (
              <Dato etiqueta="Zona de cobertura" valor={pedido.zonaNombre} />
            )}
            {/* El pin que fijó el precio. Es lo que el domiciliario abre para llegar: la
                dirección escrita es referencia, esto es la coordenada exacta (regla 14). */}
            {pedido.punto && (
              <Dato
                etiqueta="Ubicación"
                valor={
                  <a
                    href={urlMapa(pedido.punto)}
                    target="_blank"
                    rel="noopener"
                    className="font-bold text-naranja-osc underline-offset-2 hover:underline"
                  >
                    Abrir en Google Maps
                  </a>
                }
              />
            )}
          </>
        )}
        {pedido.notas && <Dato etiqueta="Notas" valor={pedido.notas} />}
      </Seccion>

      <Seccion titulo="Pedido">
        <ul className="flex flex-col gap-3">
          {pedido.items.map((item, i) => (
            <li key={i} className="flex justify-between gap-3">
              <div>
                <p className="font-cuerpo text-[15px] font-bold text-cafe">
                  {item.cantidad}× {item.nombre}
                </p>
                {item.modificadores.length > 0 && (
                  <ul className="mt-0.5">
                    {item.modificadores.map((mod, j) => (
                      <li key={j} className="font-cuerpo text-[13px] text-cafe-suave">
                        {mod.grupo}: {mod.nombre}
                        {mod.cantidad > 1 && ` ×${mod.cantidad}`}
                        {mod.precio > 0 && ` (${pesos(mod.precio)})`}
                      </li>
                    ))}
                  </ul>
                )}
                {item.notas && (
                  <p className="mt-0.5 font-cuerpo text-[13px] font-bold text-alerta">
                    Nota: {item.notas}
                  </p>
                )}
              </div>
              <span className="shrink-0 font-cuerpo text-[15px] text-cafe">
                {pesos(item.subtotal)}
              </span>
            </li>
          ))}
        </ul>

        <dl className="mt-4 border-t border-crema-oscura pt-3">
          <Total etiqueta="Subtotal" valor={pesos(pedido.subtotal)} />
          {pedido.tipo === "domicilio" && (
            <Total etiqueta="Domicilio" valor={pesos(pedido.costoDomicilio)} />
          )}
          {pedido.descuento > 0 && (
            <Total etiqueta="Descuento" valor={`− ${pesos(pedido.descuento)}`} />
          )}
          <Total etiqueta="Total" valor={pesos(pedido.total)} destacado />
        </dl>
      </Seccion>

      <Seccion titulo="Pago">
        <Dato
          etiqueta="Método"
          valor={METODO_PAGO_ETIQUETA[pedido.metodoPago] ?? pedido.metodoPago}
        />
        {pedido.metodoPago === "nequi" &&
          (pedido.comprobanteUrl ? (
            // El bucket es privado: el link solo abre para quien tenga la service key, así
            // que se sirve por nuestro propio endpoint, ya con la sesión validada.
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
    <div className={`flex justify-between font-cuerpo ${destacado ? "mt-1 text-[17px] font-bold text-cafe" : "text-[15px] text-cafe-suave"}`}>
      <dt>{etiqueta}</dt>
      <dd>{valor}</dd>
    </div>
  );
}
