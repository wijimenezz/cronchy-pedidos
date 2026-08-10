-- Regla 5 de CLAUDE.md: cada tabla lleva store_id. Estas cuatro se habían quedado
-- fuera porque heredaban la tienda del padre. Se corrige ahora que order_item y
-- order_status_event están vacías; con historial de pedidos encima sería mucho más caro.
--
-- Drizzle genera `ADD COLUMN ... NOT NULL` de una sola vez, que falla sobre las dos
-- tablas que ya tienen filas. El patrón correcto es: columna nullable -> backfill desde
-- el padre -> NOT NULL -> FK. El backfill no puede dejar huérfanos porque group_id,
-- product_id y order_id ya son NOT NULL.

ALTER TABLE "modifier_option" ADD COLUMN "store_id" uuid;--> statement-breakpoint
UPDATE "modifier_option" AS o SET "store_id" = g."store_id"
	FROM "modifier_group" AS g WHERE g."id" = o."group_id";--> statement-breakpoint
ALTER TABLE "modifier_option" ALTER COLUMN "store_id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "product_modifier_group" ADD COLUMN "store_id" uuid;--> statement-breakpoint
UPDATE "product_modifier_group" AS pmg SET "store_id" = p."store_id"
	FROM "product" AS p WHERE p."id" = pmg."product_id";--> statement-breakpoint
ALTER TABLE "product_modifier_group" ALTER COLUMN "store_id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "order_item" ADD COLUMN "store_id" uuid;--> statement-breakpoint
UPDATE "order_item" AS oi SET "store_id" = o."store_id"
	FROM "order" AS o WHERE o."id" = oi."order_id";--> statement-breakpoint
ALTER TABLE "order_item" ALTER COLUMN "store_id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "order_status_event" ADD COLUMN "store_id" uuid;--> statement-breakpoint
UPDATE "order_status_event" AS e SET "store_id" = o."store_id"
	FROM "order" AS o WHERE o."id" = e."order_id";--> statement-breakpoint
ALTER TABLE "order_status_event" ALTER COLUMN "store_id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "modifier_option" ADD CONSTRAINT "modifier_option_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_modifier_group" ADD CONSTRAINT "product_modifier_group_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_event" ADD CONSTRAINT "order_status_event_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE no action ON UPDATE no action;

-- Nota: Drizzle también emitió `ADD COLUMN "notificado_en"` en order_status_event y
-- `DROP COLUMN "paga_con"` en order. Ambas se eliminaron: verificado contra la base,
-- notificado_en YA existe y paga_con NO existe. Son ruido de un snapshot 0000
-- desincronizado (la base se modificó por fuera de las migraciones), no cambios reales.
