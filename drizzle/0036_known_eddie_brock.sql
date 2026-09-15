CREATE TABLE "banner" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"imagen_url" text NOT NULL,
	"activo" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "banner" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "banner" ADD CONSTRAINT "banner_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_banner_activo_unico" ON "banner" USING btree ("store_id") WHERE activo;