import { listarBarrios } from "@/db/queries/barrios";
import { getStore } from "@/db/queries/store";
import { SinPermisoError, exigirRol } from "@/lib/autorizacion";
import { Barrios } from "./Barrios";
import { PagoNequi } from "./PagoNequi";

export const dynamic = "force-dynamic";

/**
 * Los datos de la tienda que no son operación del turno: con qué se paga y cómo se llaman los
 * barrios que devuelve el mapa.
 *
 * Es una pantalla aparte y no un bloque en `/admin/pedidos` —donde sí vive el tiempo
 * estimado— porque el momento de cambiarlos es otro. El estimado se sube viendo la cola de
 * pedidos; la llave de pago se toca una vez al año, y meterla entre las tarjetas del tablero
 * sería ruido permanente a cambio de un ahorro de un clic.
 */
export default async function AjustesPage() {
  // Solo admin, ni siquiera lectura: aquí se decide a qué cuenta llega la plata.
  try {
    await exigirRol("admin");
  } catch (error) {
    // Se explica en vez de reventar en un 500. Tampoco se manda al login: quien llega aquí
    // ya tiene sesión, y redirigirlo lo dejaría dando vueltas.
    if (error instanceof SinPermisoError) return <SinPermiso />;
    throw error;
  }

  const tienda = await getStore();
  const barrios = await listarBarrios(tienda.id);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-titulo text-xl font-bold text-cafe">Ajustes</h1>
      <PagoNequi
        llave={tienda.nequiLlave}
        titular={tienda.nequiLlaveTitular}
        qrUrl={tienda.nequiQrUrl}
      />
      <Barrios barrios={barrios} />
    </div>
  );
}

function SinPermiso() {
  return (
    <div className="rounded-md border border-crema-oscura bg-tarjeta p-6">
      <h1 className="font-titulo text-xl font-bold text-cafe">Ajustes</h1>
      <p className="mt-2 font-cuerpo text-[15px] text-cafe-suave">
        Solo los dueños pueden cambiar los datos de pago.
      </p>
    </div>
  );
}
