ALTER TABLE "category" ADD COLUMN "subtitulo" text;--> statement-breakpoint

-- ------------------------------------------------------------
-- La frase que ya estaba en la carta
-- ------------------------------------------------------------
-- Vivía escrita a mano en `src/lib/tienda/categoria-meta.ts`, un Record por slug que este
-- cambio borra. Sin este UPDATE el hero de Churros perdería su frase al desplegar. Las demás
-- categorías nunca tuvieron, así que se quedan en NULL —el hero muestra solo el nombre—
-- hasta que alguien las escriba desde /admin/productos.
UPDATE "category" SET "subtitulo" = 'Crujientes por fuera, suaves por dentro.' WHERE "slug" = 'churros';
