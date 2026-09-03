import { cache } from "react";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { store } from "@/db/schema";

export class StoreNoConfiguradaError extends Error {}

/** Único lugar del proyecto que resuelve qué tienda es "la tienda" (regla 5 de CLAUDE.md). */
export const getStore = cache(async () => {
  const slug = process.env.STORE_SLUG;
  if (!slug) throw new StoreNoConfiguradaError("STORE_SLUG no está definida");

  const tienda = await db.query.store.findFirst({ where: eq(store.slug, slug) });
  if (!tienda) throw new StoreNoConfiguradaError(`No existe tienda con slug "${slug}"`);

  return tienda;
});

/**
 * El rango que se le promete al cliente en "lo más pronto posible".
 *
 * Se sube el día que la cocina va lenta, así que se cambia en caliente desde la pantalla de
 * pedidos. El CHECK de la base (`min > 0`, `max >= min`) es la última palabra; la acción
 * valida antes para que el admin lea un mensaje en español y no un error de Postgres.
 */
export async function actualizarTiempoEstimado(
  storeId: string,
  min: number,
  max: number,
): Promise<boolean> {
  const filas = await db
    .update(store)
    .set({ minutosEstimadoMin: min, minutosEstimadoMax: max })
    .where(eq(store.id, storeId))
    .returning({ id: store.id });

  return filas.length > 0;
}

/**
 * Dónde queda el local y a qué número se le llama: lo que el cliente necesita para encontrarte.
 *
 * Se edita desde `/admin/ajustes` porque un traslado no puede depender de un despliegue. **El pin
 * del mapa no está aquí**: vive en la misma columna `ubicacion` de siempre y se mueve en
 * `/admin/zonas`, sobre el mapa donde ya se dibujan las zonas.
 *
 * Los dos son nullable y borrarlos tiene consecuencias que la pantalla anuncia: sin dirección, el
 * checkout y el seguimiento se quedan sin decirle a nadie dónde recoger; sin teléfono desaparece el
 * botón de "escríbenos y te cotizamos" de fuera de cobertura (regla 14).
 */
export async function actualizarDatosLocal(
  storeId: string,
  direccion: string | null,
  telefono: string | null,
): Promise<boolean> {
  const filas = await db
    .update(store)
    .set({ direccion, telefono })
    .where(eq(store.id, storeId))
    .returning({ id: store.id });

  return filas.length > 0;
}

/**
 * El punto de la tienda, en GeoJSON.
 *
 * Vive aquí y no en `zonas.ts` —de donde vino— porque es un dato de la tienda: lo piden el mapa de
 * zonas, el checkout, el seguimiento del cliente y los avisos de WhatsApp, y solo uno de esos cuatro
 * tiene algo que ver con la cobertura.
 *
 * Se pide aparte de `getStore()` y no se puede evitar: un select normal sobre una columna
 * `geometry` devuelve WKB en hexadecimal, que no le sirve a nadie.
 */
export async function obtenerUbicacionTienda(storeId: string): Promise<string | null> {
  const [fila] = await db.execute<{ ubicacion: string | null }>(sql`
    SELECT ST_AsGeoJSON(ubicacion) AS ubicacion FROM store WHERE id = ${storeId}
  `);

  return fila?.ubicacion ?? null;
}

/**
 * La llave con la que el cliente paga (Nequi, Bre-B, la que sea) y a nombre de quién sale.
 *
 * El titular se guarda porque el cliente lo ve antes de transferir: una llave suelta, sin un
 * nombre que reconozca, es una cuenta desconocida a la que le está mandando plata.
 */
export async function actualizarLlaveNequi(
  storeId: string,
  llave: string | null,
  titular: string | null,
): Promise<boolean> {
  const filas = await db
    .update(store)
    .set({ nequiLlave: llave, nequiLlaveTitular: titular })
    .where(eq(store.id, storeId))
    .returning({ id: store.id });

  return filas.length > 0;
}

/**
 * El QR de pago. Devuelve el ANTERIOR, igual que `guardarBannerCategoria`: sin él no se
 * puede borrar el objeto viejo del bucket y cada cambio dejaría uno colgando.
 *
 * La lectura y la escritura van en una transacción para que dos guardados a la vez no
 * devuelvan ambos el mismo "previo" y uno de los dos borre el QR que acaba de quedar vivo.
 */
export async function guardarQrPago(
  storeId: string,
  url: string | null,
): Promise<{ previo: string | null } | null> {
  return db.transaction(async (tx) => {
    const [antes] = await tx
      .select({ nequiQrUrl: store.nequiQrUrl })
      .from(store)
      .where(eq(store.id, storeId))
      .for("update");

    if (!antes) return null;

    await tx.update(store).set({ nequiQrUrl: url }).where(eq(store.id, storeId));

    return { previo: antes.nequiQrUrl };
  });
}

/**
 * El interruptor de pánico (regla 6): apaga la tienda al instante.
 *
 * Gana sobre el horario y sobre las franjas programadas —`opcionesDeEntrega` corta antes de
 * mirar nada más—, así que apagarlo no deja pasar ni un pedido para mañana. Es lo que se quiere:
 * un botón de pánico que deja entrar pedidos no es un botón de pánico.
 *
 * Existe desde la primera migración y hasta ahora solo se movía con SQL a mano.
 */
export async function actualizarAceptaPedidos(
  storeId: string,
  acepta: boolean,
): Promise<boolean> {
  const filas = await db
    .update(store)
    .set({ aceptaPedidos: acepta })
    .where(eq(store.id, storeId))
    .returning({ id: store.id });

  return filas.length > 0;
}

/**
 * Lo que lee el cliente cuando no se le puede vender.
 *
 * Es el respaldo de TODOS los motivos de cierre (`calcularDisponibilidad`), no solo del
 * interruptor: fuera de horario, sin horario del día y cierre excepcional sin motivo caen aquí.
 * Por eso conviene que sea genérico —"Volvemos mañana a las 12"— y no hable de una causa
 * concreta. El motivo de un día suelto se escribe en su excepción.
 */
export async function actualizarMensajeCerrado(
  storeId: string,
  mensaje: string | null,
): Promise<boolean> {
  const filas = await db
    .update(store)
    .set({ mensajeCerrado: mensaje })
    .where(eq(store.id, storeId))
    .returning({ id: store.id });

  return filas.length > 0;
}
