"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PedidoEnLista } from "@/db/queries/panel";
import { TarjetaPedido } from "./TarjetaPedido";

const CADA_MS = 5000;

/**
 * La pantalla de operación. Se refresca sola cada 5 s (CLAUDE.md: polling, nada de
 * WebSockets) porque el negocio la deja abierta en el mostrador y un pedido nuevo tiene
 * que aparecer sin que nadie recargue.
 */
export function ListaPedidos({ iniciales }: { iniciales: PedidoEnLista[] }) {
  const router = useRouter();
  const [pedidos, setPedidos] = useState(iniciales);
  const [terminados, setTerminados] = useState(false);
  const [sinConexion, setSinConexion] = useState(false);

  const refrescar = useCallback(async (incluirTerminados: boolean) => {
    try {
      const url = `/api/admin/pedidos${incluirTerminados ? "?terminados=1" : ""}`;
      const respuesta = await fetch(url, { cache: "no-store" });

      // La sesión se venció mientras la pantalla estaba abierta: al login, no a una lista
      // congelada que aparenta estar viva.
      if (respuesta.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!respuesta.ok) throw new Error(String(respuesta.status));

      const datos = (await respuesta.json()) as { pedidos: PedidoEnLista[] };
      setPedidos(datos.pedidos);
      setSinConexion(false);
    } catch {
      // Se avisa pero no se borra lo que ya está en pantalla: en el local el wifi se cae
      // y una lista vieja sirve más que una vacía.
      setSinConexion(true);
    }
  }, [router]);

  useEffect(() => {
    const id = setInterval(() => void refrescar(terminados), CADA_MS);
    return () => clearInterval(id);
  }, [refrescar, terminados]);

  // El filtro se refresca desde el propio checkbox y no desde un efecto: pedirlo aquí
  // encadenaría un render extra en cada cambio de estado del componente.
  function cambiarFiltro(valor: boolean) {
    setTerminados(valor);
    void refrescar(valor);
  }

  // Los programados van aparte y ordenados por su hora, no por cuándo entraron. La consulta
  // sigue devolviendo lo más reciente primero, que es lo correcto para lo inmediato; pero un
  // pedido para las 9 de la noche encabezando la lista a las 3 de la tarde es una distracción
  // en plena operación. Se separa aquí, en el cliente, sin tocar la query ni sus índices.
  const paraAhora = pedidos.filter((p) => !p.programadoPara);
  const programados = pedidos
    .filter((p) => p.programadoPara)
    .sort((a, b) => +new Date(a.programadoPara!) - +new Date(b.programadoPara!));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-titulo text-xl font-bold text-cafe">
          Pedidos
          {pedidos.length > 0 && (
            <span className="ml-2 font-cuerpo text-sm font-normal text-cafe-tenue">
              {pedidos.length}
            </span>
          )}
        </h1>

        <label className="flex min-h-11 items-center gap-2 font-cuerpo text-sm text-cafe-suave">
          <input
            type="checkbox"
            checked={terminados}
            onChange={(e) => cambiarFiltro(e.target.checked)}
            className="size-4 accent-naranja"
          />
          Ver terminados
        </label>
      </div>

      {sinConexion && (
        <p role="status" className="rounded-sm bg-alerta/15 px-3 py-2 font-cuerpo text-[13px] font-semibold text-cafe">
          Sin conexión. Reintentando…
        </p>
      )}

      {pedidos.length === 0 ? (
        <p className="rounded-md border border-crema-oscura bg-tarjeta px-4 py-8 text-center font-cuerpo text-[15px] text-cafe-suave">
          {terminados ? "No hay pedidos." : "No hay pedidos pendientes."}
        </p>
      ) : (
        <>
          <Grupo
            pedidos={paraAhora}
            alCambiar={() => refrescar(terminados)}
            titulo={programados.length > 0 ? "Para ahora" : null}
          />
          <Grupo
            pedidos={programados}
            alCambiar={() => refrescar(terminados)}
            titulo="Programados"
          />
        </>
      )}
    </div>
  );
}

function Grupo({
  pedidos,
  titulo,
  alCambiar,
}: {
  pedidos: PedidoEnLista[];
  /** `null` cuando no hay con qué contrastar y el encabezado sobraría. */
  titulo: string | null;
  alCambiar: () => void;
}) {
  if (pedidos.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      {titulo && (
        <h2 className="font-titulo text-base font-bold text-cafe-suave">
          {titulo}
          <span className="ml-2 font-cuerpo text-sm font-normal text-cafe-tenue">
            {pedidos.length}
          </span>
        </h2>
      )}
      <ul className="flex flex-col gap-3">
        {pedidos.map((pedido) => (
          <li key={pedido.id}>
            <TarjetaPedido pedido={pedido} alCambiar={alCambiar} />
          </li>
        ))}
      </ul>
    </section>
  );
}
