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
        <ul className="flex flex-col gap-3">
          {pedidos.map((pedido) => (
            <li key={pedido.id}>
              <TarjetaPedido pedido={pedido} alCambiar={() => refrescar(terminados)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
