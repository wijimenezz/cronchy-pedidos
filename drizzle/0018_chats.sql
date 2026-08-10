-- Chats: WhatsApp bidireccional desde el panel.
--
-- Hasta aquí la mensajería era saliente y manual: se armaba un texto y se abría un link wa.me que
-- un empleado tocaba desde su teléfono. Lo que el cliente contestaba se quedaba en ese teléfono y
-- el panel no se enteraba. Estas dos tablas son el otro lado.
--
-- LA IDENTIDAD ES EL TELÉFONO NORMALIZADO, igual que en `customer` y en `courier`. Lo normaliza
-- `normalizarTelefono()` (src/lib/notificaciones/transporte.ts), la misma función que ya usa
-- `upsertCustomer`, así que lo que llega del webhook casa con lo que hay guardado.
--
-- `conversation.customer_id` es NULLABLE a propósito: cualquiera puede escribirle al WhatsApp del
-- negocio sin haber pedido nunca, y esa conversación también hay que atenderla.
--
-- El UNIQUE de `message.wa_message_id` ES el candado de idempotencia. Evolution reentrega sus
-- eventos cuando el webhook tarda o falla, y un ON CONFLICT DO NOTHING contra esa restricción es
-- toda la protección que hace falta — mismo espíritu que el `notificado_en IS NULL` de
-- `marcarEstadoNotificado`: decide la base, no la aplicación.
--
-- `message` NO lleva columna de estado de envío: Evolution reporta entregado/leído en otro evento
-- que todavía no se escucha, y una columna que nadie llena se lee como un dato perdido.
CREATE TYPE "public"."direccion_mensaje" AS ENUM('entrante', 'saliente');--> statement-breakpoint
CREATE TYPE "public"."tipo_mensaje" AS ENUM('texto', 'imagen', 'audio', 'otro');--> statement-breakpoint
CREATE TABLE "conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"telefono" text NOT NULL,
	"customer_id" uuid,
	"nombre_wa" text,
	"ultimo_mensaje_en" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_texto" text,
	"sin_leer" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_store_id_telefono_key" UNIQUE("store_id","telefono")
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direccion" "direccion_mensaje" NOT NULL,
	"tipo" "tipo_mensaje" DEFAULT 'texto' NOT NULL,
	"texto" text,
	"wa_message_id" text NOT NULL,
	"user_id" uuid,
	"order_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_store_id_wa_message_id_key" UNIQUE("store_id","wa_message_id")
);
--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_conversation_reciente" ON "conversation" USING btree ("store_id" uuid_ops,"ultimo_mensaje_en" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_message_hilo" ON "message" USING btree ("conversation_id" uuid_ops,"creado_en");