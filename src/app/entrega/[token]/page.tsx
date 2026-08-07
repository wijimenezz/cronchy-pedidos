import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CheckCircle2, MapPin, PackageX } from "lucide-react";
import { pedidoPorTokenEntrega } from "@/db/queries/domiciliarios";
import { ConfirmarEntrega } from "./ConfirmarEntrega";

// Los datos salen de Drizzle y no de `fetch`, así que Next no ve que la página es dinámica: sin
// esto la prerenderizaría en build y el domiciliario vería siempre el mismo estado.
export const dynamic = "force-dynamic";

// Un link privado que viaja por WhatsApp. No debe terminar en un buscador.
export const metadata: Metadata = {
  title: "Entrega — Cronchy",
  robots: { index: false, follow: false },
};

/** El token lo genera Postgres con encode(gen_random_bytes(16),'hex'). */
const FORMA_TOKEN = /^[0-9a-f]{32}$/;

/**
 * La pantalla del domiciliario: **un interruptor, no una consulta**.
 *
 * Muestra lo justo para reconocer el pedido —número, cliente y calle— y nada más. Ni teléfono, ni
 * total, ni items: todo eso ya se lo mandamos por WhatsApp, así que repetirlo aquí solo serviría
 * para que un link reenviado por error enseñe la ficha de un cliente.
 *
 * El token es una llave distinta de la del cliente (`order.token_entrega`), y lo que de verdad
 * decide qué se puede hacer con ella es `validarCambioEstado`: solo `en_camino → entregado`.
 */
export default async function EntregaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!FORMA_TOKEN.test(token)) notFound();

  const pedido = await pedidoPorTokenEntrega(token);
  if (!pedido) notFound();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-5 py-10">
      <div className="rounded-lg border border-crema-oscura bg-tarjeta p-5 shadow-tarjeta">
        <p className="font-cuerpo text-sm text-cafe-suave">Pedido</p>
        <p className="font-titulo text-3xl font-bold text-cafe">#{pedido.numero}</p>

        <p className="mt-3 font-cuerpo text-lg text-cafe">{pedido.clienteNombre}</p>

        {pedido.direccion && (
          <p className="mt-1 flex items-start gap-1.5 font-cuerpo text-[15px] text-cafe-suave">
            <MapPin className="mt-0.5 size-4 shrink-0" />
            <span>
              {pedido.direccion}
              {pedido.barrio && ` · ${pedido.barrio}`}
            </span>
          </p>
        )}
      </div>

      {/* Tres estados, tres mensajes distintos. Que el link se pulse dos veces es lo normal, no un
          error: la segunda vez se responde con calma, no en rojo. */}
      {pedido.estado === "en_camino" ? (
        <ConfirmarEntrega token={token} />
      ) : pedido.estado === "entregado" ? (
        <Aviso
          icono={<CheckCircle2 className="size-6 text-exito" />}
          titulo="Entrega confirmada"
          detalle="Ya nos avisaste de este pedido. ¡Gracias!"
        />
      ) : pedido.estado === "cancelado" ? (
        <Aviso
          icono={<PackageX className="size-6 text-error" />}
          titulo="Pedido cancelado"
          detalle="Este pedido se canceló. Habla con la tienda antes de entregarlo."
        />
      ) : (
        <Aviso
          icono={<PackageX className="size-6 text-cafe-suave" />}
          titulo="Todavía no ha salido"
          detalle="Este pedido aún se está preparando. Cuando lo recojas, vuelve a abrir este link."
        />
      )}
    </main>
  );
}

function Aviso({
  icono,
  titulo,
  detalle,
}: {
  icono: React.ReactNode;
  titulo: string;
  detalle: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-crema-oscura px-5 py-8 text-center">
      {icono}
      <p className="font-titulo text-lg font-bold text-cafe">{titulo}</p>
      <p className="font-cuerpo text-sm text-cafe-suave">{detalle}</p>
    </div>
  );
}
