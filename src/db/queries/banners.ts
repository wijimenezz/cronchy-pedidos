import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { banner } from "@/db/schema";

/**
 * Los banners de anuncio, desde la base.
 *
 * Quién decide si un banner se le enseña a un cliente concreto NO está aquí: eso es
 * `debeMostrarBanner` en `lib/tienda/banner-visto.ts`, que es puro y depende de lo que ese
 * dispositivo recuerde. Este archivo solo dice cuál está publicado.
 */

/**
 * Lo que necesita la carta para pintar el anuncio.
 *
 * Las medidas viajan con la imagen porque son lo que le da forma al modal: sin ellas habría que
 * fijarle un alto a la caja y volvería el marco crema.
 */
export type BannerPublicado = { id: string; imagenUrl: string; ancho: number; alto: number };

/**
 * El banner que se está anunciando, si hay alguno.
 *
 * El índice único parcial garantiza que no haya dos activos, así que el `limit(1)` no está
 * eligiendo entre candidatos — solo cerrando la consulta.
 */
export async function bannerActivo(storeId: string): Promise<BannerPublicado | null> {
  const [fila] = await db
    .select({ id: banner.id, imagenUrl: banner.imagenUrl, ancho: banner.ancho, alto: banner.alto })
    .from(banner)
    .where(and(eq(banner.storeId, storeId), eq(banner.activo, true)))
    .limit(1);

  return fila ?? null;
}

// ------------------------------------------------------------
// El panel
// ------------------------------------------------------------

export type BannerDelPanel = {
  id: string;
  nombre: string;
  imagenUrl: string;
  activo: boolean;
  creadoEn: string;
};

/** La biblioteca entera, del más nuevo al más viejo: lo que se acaba de subir se busca arriba. */
export async function listarBanners(storeId: string): Promise<BannerDelPanel[]> {
  return db
    .select({
      id: banner.id,
      nombre: banner.nombre,
      imagenUrl: banner.imagenUrl,
      activo: banner.activo,
      creadoEn: banner.creadoEn,
    })
    .from(banner)
    .where(eq(banner.storeId, storeId))
    .orderBy(desc(banner.creadoEn));
}

export async function crearBanner(
  storeId: string,
  datos: { nombre: string; imagenUrl: string; ancho: number; alto: number },
): Promise<void> {
  // Nace apagado (el default de la columna): subir no es publicar.
  await db.insert(banner).values({ storeId, ...datos });
}

export async function renombrarBanner(
  storeId: string,
  id: string,
  nombre: string,
): Promise<void> {
  await db
    .update(banner)
    .set({ nombre })
    .where(and(eq(banner.storeId, storeId), eq(banner.id, id)));
}

/**
 * Enciende uno y apaga el resto, **en una transacción**.
 *
 * El orden importa y por eso no son dos llamadas sueltas: hay un índice único parcial sobre
 * `(store_id) WHERE activo`, así que encender antes de apagar choca con el que ya estaba. Se apaga
 * todo lo demás primero y se enciende después.
 *
 * Y ese índice es justo lo que hace que esto no pueda dejar la tienda con dos anuncios: si la
 * transacción se cae a medias, no se aplica nada.
 */
export async function publicarBanner(storeId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(banner)
      .set({ activo: false })
      .where(and(eq(banner.storeId, storeId), ne(banner.id, id)));

    await tx
      .update(banner)
      .set({ activo: true })
      .where(and(eq(banner.storeId, storeId), eq(banner.id, id)));
  });
}

/** Deja la carta sin anuncio, sin borrar nada: el banner sigue en la biblioteca. */
export async function despublicarBanners(storeId: string): Promise<void> {
  await db.update(banner).set({ activo: false }).where(eq(banner.storeId, storeId));
}

/**
 * Borra la fila y devuelve la URL de su imagen, para que quien llama borre también el objeto de
 * Storage. Se devuelve en vez de borrarlo aquí porque este archivo habla con Postgres y nada más
 * —`storage.ts` es otra cosa, con sus propias cabeceras y sus propios fallos.
 */
export async function eliminarBanner(storeId: string, id: string): Promise<string | null> {
  const [fila] = await db
    .delete(banner)
    .where(and(eq(banner.storeId, storeId), eq(banner.id, id)))
    .returning({ imagenUrl: banner.imagenUrl });

  return fila?.imagenUrl ?? null;
}
