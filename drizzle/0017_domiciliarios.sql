-- Asignar domiciliario y confirmar entrega.
--
-- `courier` es una agenda, no una nómina: el domicilio lo ejecuta un courier externo (regla 13).
-- Se archiva con `activo` y no se borra (regla 9).
--
-- `order.token_entrega` es la llave del DOMICILIARIO y es distinta de `token_publico` a propósito:
-- aquella solo permite LEER el seguimiento del cliente, esta permite ESCRIBIR el estado. Reusar la
-- del cliente le daría poder para marcar su propio pedido como entregado.
--
-- Ojo al añadir la columna: `gen_random_bytes()` es VOLATILE, así que Postgres reescribe la tabla y
-- evalúa el default fila a fila. Si no lo hiciera, el UNIQUE de abajo fallaría en voz alta en vez
-- de dejar todos los pedidos con el mismo token.
CREATE TABLE "courier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"telefono" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courier_store_id_telefono_key" UNIQUE("store_id","telefono")
);
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "token_entrega" text DEFAULT encode(gen_random_bytes(16), 'hex'::text) NOT NULL;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "courier_id" uuid;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "domiciliario_nombre" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "domiciliario_telefono" text;--> statement-breakpoint
ALTER TABLE "courier" ADD CONSTRAINT "courier_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_courier_id_fkey" FOREIGN KEY ("courier_id") REFERENCES "public"."courier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_token_entrega_key" UNIQUE("token_entrega");