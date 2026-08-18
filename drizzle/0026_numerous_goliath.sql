CREATE TYPE "public"."alcance_cupon" AS ENUM('todo', 'seleccion');--> statement-breakpoint
CREATE TABLE "cupon" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"porcentaje" integer NOT NULL,
	"alcance" "alcance_cupon" DEFAULT 'todo' NOT NULL,
	"vence_el" date,
	"anuncio" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cupon_store_id_codigo_key" UNIQUE("store_id","codigo"),
	CONSTRAINT "cupon_porcentaje_check" CHECK (porcentaje >= 1 AND porcentaje <= 50)
);
--> statement-breakpoint
CREATE TABLE "cupon_categoria" (
	"cupon_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "cupon_categoria_pkey" PRIMARY KEY("cupon_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "cupon_producto" (
	"cupon_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	CONSTRAINT "cupon_producto_pkey" PRIMARY KEY("cupon_id","product_id")
);
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "cupon_id" uuid;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "cupon_codigo" text;--> statement-breakpoint
ALTER TABLE "cupon" ADD CONSTRAINT "cupon_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cupon_categoria" ADD CONSTRAINT "cupon_categoria_cupon_id_fkey" FOREIGN KEY ("cupon_id") REFERENCES "public"."cupon"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cupon_categoria" ADD CONSTRAINT "cupon_categoria_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cupon_producto" ADD CONSTRAINT "cupon_producto_cupon_id_fkey" FOREIGN KEY ("cupon_id") REFERENCES "public"."cupon"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cupon_producto" ADD CONSTRAINT "cupon_producto_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_cupon_anuncio_unico" ON "cupon" USING btree ("store_id") WHERE anuncio IS NOT NULL;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_cupon_id_fkey" FOREIGN KEY ("cupon_id") REFERENCES "public"."cupon"("id") ON DELETE no action ON UPDATE no action;