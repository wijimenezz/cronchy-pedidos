import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { getStore } from "@/db/queries/store";
import { obtenerUbicacionTienda } from "@/db/queries/zonas";
import { opcionesDeEntrega } from "@/lib/pedidos/entrega";
import { puntoDesdeGeoJSON } from "@/lib/zonas";
import { CheckoutForm } from "./CheckoutForm";

// El horario se lee con Drizzle, no con `fetch`: sin esto Next prerenderizaría la página en
// build y serviría un horario evaluado el día del deploy.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Confirmar pedido — Cronchy" };

/** Si nunca se fijó la tienda, el parque principal de Fusagasugá. */
const CENTRO_POR_DEFECTO = { lat: 4.3372, lng: -74.3653 };

export default async function CheckoutPage() {
  const tienda = await getStore();
  const [ubicacion, entrega] = await Promise.all([
    obtenerUbicacionTienda(tienda.id),
    opcionesDeEntrega(),
  ]);

  // Estar cerrado ya no es el fin del camino: si quedan horas que ofrecer, el formulario se
  // pinta igual y el cliente programa. Solo cuando no hay ninguna de las dos opciones —el
  // interruptor manual apagado, o ni hoy ni mañana con horario— se corta el paso.
  const sePuedePedir = Boolean(entrega.pronto) || entrega.dias.length > 0;

  // Dónde abre el mapa cuando el cliente no da permiso de ubicación (regla 14).
  const centroTienda = puntoDesdeGeoJSON(ubicacion) ?? CENTRO_POR_DEFECTO;

  return (
    <main className="mx-auto flex w-full max-w-[520px] flex-col gap-4 px-4 py-4">
      <header className="flex items-center gap-3">
        <Link
          href="/"
          aria-label="Volver al menú"
          className="flex size-11 items-center justify-center rounded-full text-cafe"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="font-titulo text-xl font-semibold text-cafe">Confirmar pedido</h1>
      </header>

      {sePuedePedir ? (
        <CheckoutForm
          centroTienda={centroTienda}
          entrega={entrega}
          tienda={{
            nombre: tienda.nombre,
            telefono: tienda.telefono,
            direccion: tienda.direccion,
            whatsappUrl: tienda.whatsappUrl,
            nequiTitular: tienda.nequiTitular,
            nequiNumero: tienda.nequiNumero,
            nequiLlave: tienda.nequiLlave,
            nequiLlaveTitular: tienda.nequiLlaveTitular,
          }}
        />
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-md bg-tarjeta p-6 text-center shadow-tarjeta">
          <h2 className="font-titulo text-lg font-semibold text-cafe">Estamos cerrados</h2>
          <p className="font-cuerpo text-sm text-cafe-suave">{entrega.mensajeCerrado}</p>
          <p className="font-cuerpo text-[13px] text-cafe-tenue">
            Tu carrito te espera: cuando abramos, vuelve y confirma.
          </p>
          <Link
            href="/"
            className="mt-1 rounded-full bg-naranja px-6 py-3 font-cuerpo text-sm font-bold text-crema"
          >
            Volver al menú
          </Link>
        </div>
      )}
    </main>
  );
}
