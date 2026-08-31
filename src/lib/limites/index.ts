import { NextResponse } from "next/server";
import { consumirCupo } from "@/db/queries/limites";
import {
  LIMITES,
  decidir,
  segundosParaReset,
  ventanaDe,
  type NombreLimite,
} from "./politica";

/**
 * Lo que llama un route handler: `const frenado = await exigirCupo(request, "cupon");`
 *
 * Compone la política (cuánto se permite) con el contador (cuántas van). Devuelve la respuesta
 * 429 lista para retornar, o `null` si la petición sigue su curso — la misma forma que ya tiene
 * `exigirRol` de decir "no pasas".
 */

export { LIMITES, type NombreLimite } from "./politica";

/**
 * Quién está pidiendo, **y el orden de estas tres cabeceras es lo que hace que el límite sirva**.
 *
 * `x-forwarded-for` es una lista a la que cada salto va añadiendo, y el cliente puede mandarla ya
 * con algo dentro: Vercel añade la IP real detrás de lo que llegue. O sea que su primer elemento
 * lo controla quien pide, y bastaría con rotarlo en cada petición para saltarse el límite entero.
 *
 * Por eso primero se miran las que pone el proveedor y el cliente no puede fabricar
 * —`x-vercel-forwarded-for` y `x-real-ip`—, y `x-forwarded-for` queda como último recurso, que es
 * lo que hay en local.
 *
 * Si no hay ninguna no se limita: usar una clave constante metería a todo el mundo en la misma
 * cubeta y el primer visitante consumiría el cupo de los demás.
 */
function ipDe(request: Request): string | null {
  const directas = ["x-vercel-forwarded-for", "x-real-ip"];

  for (const nombre of directas) {
    const valor = request.headers.get(nombre)?.trim();
    if (valor) return valor;
  }

  const lista = request.headers.get("x-forwarded-for");

  return lista?.split(",")[0]?.trim() || null;
}

/**
 * Comprueba el cupo y devuelve el 429 si se pasó.
 *
 * `identidad` sirve para contar por algo que no sea la IP. **Las dos rutas de token la usan**, y no
 * es un capricho: en Colombia los operadores móviles hacen CGNAT, así que muchos clientes salen
 * por una sola IP. Limitar el seguimiento por IP castigaría a vecinos que no se conocen; un pedido
 * tiene un poller, y esa es la unidad correcta.
 *
 * **Falla abierto.** Si la consulta revienta —la base con un hipo, el pooler lleno— la petición
 * pasa. Un limitador que cierra la tienda cuando la base tose es peor que el abuso que evita, y
 * este no es un control de acceso: el que sí lo es (`exigirRol`) falla cerrado y no ha cambiado.
 */
export async function exigirCupo(
  request: Request,
  nombre: NombreLimite,
  identidad?: string | null,
): Promise<NextResponse | null> {
  const quien = identidad ?? ipDe(request);
  if (!quien) return null;

  const cupo = LIMITES[nombre];
  const ahora = new Date();
  const ventana = ventanaDe(ahora, cupo.ventanaSegundos);

  let conteo: number;
  try {
    conteo = await consumirCupo(`${nombre}:${quien}`, ventana);
  } catch {
    return null;
  }

  const decision = decidir(conteo, cupo, ventana);
  if (decision.permitido) return null;

  const segundos = segundosParaReset(decision.resetEn, ahora);

  return NextResponse.json(
    { error: "Demasiadas peticiones. Espera un momento y vuelve a intentar." },
    {
      status: 429,
      headers: {
        // Lo que un cliente educado lee para saber cuándo reintentar.
        "Retry-After": String(segundos),
        "Cache-Control": "no-store",
      },
    },
  );
}
