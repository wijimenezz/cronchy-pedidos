import { NextResponse } from "next/server";
import { listarHorarioSemanal, obtenerContextoHorario } from "@/db/queries/horario";
import { getStore } from "@/db/queries/store";
import { ahoraEnBogota } from "@/lib/horario";
import { exigirCupo } from "@/lib/limites";
import { opcionesDeEntrega } from "@/lib/pedidos/entrega";
import {
  calcularEstadoTienda,
  motivoDelCierre,
  type DiaDeHorario,
  type RespuestaEstado,
} from "@/lib/tienda/estado";

export const dynamic = "force-dynamic";

/**
 * ¿Está abierta la tienda ahora mismo, y cuál es el horario de la semana?
 *
 * **Existe por la caché, no por gusto.** La carta se sirve con ISR (`revalidate = 60`) y encima
 * están el Router Cache y la pestaña ya abierta, así que un estado renderizado con la página se
 * quedaría congelado: el HTML de las once de la noche seguiría diciendo "cerrado" a las tres de
 * la tarde. Esto se pide aparte, en vivo, y por eso es `force-dynamic` y `no-store`.
 *
 * Es de lectura y anónimo, como el resto del storefront: lo único que revela es el horario, que
 * es justo lo que se quiere que la gente vea.
 */

/** Toda la semana: es lo que hace que `proximaApertura` sirva aunque cierre tres días. */
const DIAS_HORIZONTE = 7;

export async function GET(request: Request) {
  const frenado = await exigirCupo(request, "estado");
  if (frenado) return frenado;

  const tienda = await getStore();
  const ahora = new Date();

  // Hoy y los seis siguientes, avanzando sobre el instante y volviendo a preguntar la fecha en
  // Bogotá: así el salto de mes y el de año salen solos, igual que en `entrega.ts`.
  const fechas = Array.from({ length: DIAS_HORIZONTE }, (_, i) =>
    ahoraEnBogota(new Date(ahora.getTime() + i * 24 * 60 * 60 * 1000)),
  ).map(({ fecha, diaSemana }) => ({ fecha, diaSemana }));

  const [contextos, semana, opciones] = await Promise.all([
    obtenerContextoHorario(tienda.id, fechas),
    listarHorarioSemanal(tienda.id),
    // La regla 16: `opcionesDeEntrega` es la ÚNICA fuente de qué se puede ofrecer. Deducir por
    // nuestra cuenta si se puede programar sería la segunda, y se separarían el día que cambie
    // cualquier regla. Cuesta dos lecturas repetidas y baratas.
    opcionesDeEntrega(ahora),
  ]);

  const dias: DiaDeHorario[] = fechas.map((d) => {
    const ctx = contextos.get(d.fecha) ?? { cierreHoy: null, horariosHoy: [] };

    return {
      fecha: d.fecha,
      diaSemana: d.diaSemana,
      cierre: ctx.cierreHoy,
      horarios: ctx.horariosHoy,
    };
  });

  const estado = calcularEstadoTienda(
    { aceptaPedidos: tienda.aceptaPedidos, mensajeCerrado: tienda.mensajeCerrado, dias },
    ahora,
  );

  const respuesta: RespuestaEstado = {
    ...estado,
    hoy: { fecha: dias[0].fecha, diaSemana: dias[0].diaSemana },
    /** El horario semanal tal cual, sin excepciones: es lo que se pinta en la tabla. */
    semana: semanaCompleta(semana),
    /** Solo el de HOY, que es el que explica por qué la tienda no abre como siempre. */
    cierreDeHoy: cierreDeHoy(dias[0]),
    /**
     * Si el cliente puede dejar el pedido programado. **No se asume**: con el interruptor de
     * pánico apagado no se puede, y tampoco si hoy y mañana están cerrados. Prometer en la
     * carta algo que el checkout va a rechazar es peor que no decir nada.
     */
    sePuedeProgramar: opciones.dias.length > 0,
  };

  return NextResponse.json(respuesta, { headers: { "Cache-Control": "no-store" } });
}

/** Los siete días siempre, con su lista de tramos —vacía en los que no se abre. */
function semanaCompleta(semana: { diaSemana: number; abre: string; cierra: string }[]) {
  return Array.from({ length: 7 }, (_, diaSemana) => ({
    diaSemana,
    tramos: semana
      .filter((t) => t.diaSemana === diaSemana)
      .map((t) => ({ abre: t.abre, cierra: t.cierra })),
  }));
}

/**
 * El cierre excepcional de hoy, si lo hay.
 *
 * Se manda con su motivo aunque venga vacío: la fila existe, y eso ya explica que hoy el horario
 * no sea el de siempre. El texto por defecto vive con el resto del copy, no aquí.
 *
 * **El respaldo depende de `cerrado`**, y esa distinción no es cosmética: una fila con
 * `cerrado = false` es un horario ESPECIAL, o sea una tienda que hoy sí abre. Con el respaldo de
 * "Cerrado" para las dos, la hoja anunciaba "Hoy: Cerrado · 2:00 pm a 6:00 pm" mientras el badge
 * decía Abierto. Como `store_closure` todavía se escribe a mano —no tiene pantalla en el panel—,
 * el `motivo` vacío no es el caso raro.
 */
function cierreDeHoy(hoy: DiaDeHorario) {
  if (!hoy.cierre) return null;

  return {
    fecha: hoy.fecha,
    cerrado: hoy.cierre.cerrado,
    abre: hoy.cierre.abre?.slice(0, 5) ?? null,
    cierra: hoy.cierre.cierra?.slice(0, 5) ?? null,
    motivo: motivoDelCierre(hoy.cierre),
  };
}
