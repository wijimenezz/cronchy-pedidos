import { cache } from "react";
import { eq } from "drizzle-orm";
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
