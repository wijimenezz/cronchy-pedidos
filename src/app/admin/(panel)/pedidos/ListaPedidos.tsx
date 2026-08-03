"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PedidoEnLista } from "@/db/queries/panel";
import { COLUMNAS_TABLERO, columnaDeTablero } from "@/lib/pedidos/estados";
import { TarjetaPedido } from "./TarjetaPedido";

const CADA_MS = 5000;

/**
 * El tablero de operación. Se refresca solo cada 5 s (CLAUDE.md: polling, nada de
 * WebSockets) porque el negocio lo deja abierto en el mostrador y un pedido nuevo tiene
 * que aparecer sin que nadie recargue.
 *
 * Cuatro columnas y no una lista: en una lista plana, los cuatro pedidos sin aceptar y los
 * tres que ya van en camino se ven igual. Lo que se opera aquí es un flujo, y verlo por fases
 * es la diferencia entre saber cómo va la cocina y tener que leer pedido por pedido.
 *
 * Se pensó para la tablet de 12" del mostrador y para escritorio: a partir de 1024 px caben
 * las cuatro columnas (~239 px cada una en vertical, ~324 en horizontal). Por debajo —un
 * teléfono de urgencia— pasan a pestañas, porque cuatro columnas ahí no se leen.
 */
export function ListaPedidos({ iniciales }: { iniciales: PedidoEnLista[] }) {
  const router = useRouter();
  const [pedidos, setPedidos] = useState(iniciales);
  const [sinConexion, setSinConexion] = useState(false);
  /** Solo manda en pantalla estrecha, donde las columnas son pestañas. */
  const [columnaVisible, setColumnaVisible] = useState(0);

  const refrescar = useCallback(async () => {
    try {
      const respuesta = await fetch("/api/admin/pedidos", { cache: "no-store" });

      // La sesión se venció mientras la pantalla estaba abierta: al login, no a un tablero
      // congelado que aparenta estar vivo.
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
      // y un tablero viejo sirve más que uno vacío.
      setSinConexion(true);
    }
  }, [router]);

  useEffect(() => {
    const id = setInterval(() => void refrescar(), CADA_MS);
    return () => clearInterval(id);
  }, [refrescar]);

  /**
   * Cada pedido en su columna, y dentro de cada una los programados **al final y por su
   * hora**: uno para las nueve de la noche encabezando la columna a las tres de la tarde es
   * una distracción. Lo inmediato manda, y entre lo inmediato manda lo más reciente, que es
   * como llega de la consulta.
   */
  const porColumna = COLUMNAS_TABLERO.map((_, i) =>
    pedidos
      .filter((p) => columnaDeTablero(p.estado, p.tipo) === i)
      .sort((a, b) => {
        if (Boolean(a.programadoPara) !== Boolean(b.programadoPara)) {
          return a.programadoPara ? 1 : -1;
        }
        if (a.programadoPara && b.programadoPara) {
          return +new Date(a.programadoPara) - +new Date(b.programadoPara);
        }
        return 0;
      }),
  );

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

        {sinConexion && (
          <p
            role="status"
            className="rounded-sm bg-alerta/15 px-3 py-1.5 font-cuerpo text-[13px] font-semibold text-cafe"
          >
            Sin conexión. Reintentando…
          </p>
        )}
      </div>

      {/* Las pestañas solo existen en pantalla estrecha; a partir de `lg` mandan las columnas
          y estos botones sobran. */}
      <div className="flex gap-2 overflow-x-auto lg:hidden" role="tablist">
        {COLUMNAS_TABLERO.map((columna, i) => (
          <button
            key={columna.titulo}
            type="button"
            role="tab"
            aria-selected={i === columnaVisible}
            onClick={() => setColumnaVisible(i)}
            className={`min-h-11 shrink-0 rounded-full border px-4 font-cuerpo text-sm font-bold transition-colors ${
              i === columnaVisible
                ? "border-naranja bg-naranja text-crema"
                : "border-crema-oscura text-cafe-suave hover:bg-crema"
            }`}
          >
            {columna.titulo}
            <span className="ml-1.5 font-normal opacity-75">{porColumna[i].length}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-4 lg:items-start">
        {COLUMNAS_TABLERO.map((columna, i) => (
          <Columna
            key={columna.titulo}
            titulo={columna.titulo}
            vacio={columna.vacio}
            pedidos={porColumna[i]}
            alCambiar={refrescar}
            oculta={i !== columnaVisible}
          />
        ))}
      </div>
    </div>
  );
}

function Columna({
  titulo,
  vacio,
  pedidos,
  alCambiar,
  oculta,
}: {
  titulo: string;
  vacio: string;
  pedidos: PedidoEnLista[];
  alCambiar: () => void;
  /** En pantalla estrecha solo se ve la pestaña elegida; en `lg` se ven todas. */
  oculta: boolean;
}) {
  return (
    <section className={`${oculta ? "hidden lg:flex" : "flex"} flex-col gap-2`}>
      {/* El encabezado se queda arriba al bajar por una columna larga: sin esto, a mitad de
          scroll ya no se sabe qué columna se está leyendo. */}
      <h2 className="sticky top-0 z-10 flex items-baseline gap-2 rounded-sm bg-crema/95 py-1.5 backdrop-blur">
        <span className="font-titulo text-base font-bold text-cafe">{titulo}</span>
        <span className="font-cuerpo text-sm text-cafe-tenue">{pedidos.length}</span>
      </h2>

      {pedidos.length === 0 ? (
        <p className="rounded-md border border-dashed border-crema-oscura px-3 py-6 text-center font-cuerpo text-[13px] text-cafe-tenue">
          {vacio}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {pedidos.map((pedido) => (
            <li key={pedido.id}>
              <TarjetaPedido pedido={pedido} alCambiar={alCambiar} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
