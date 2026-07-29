-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TYPE "public"."estado_pedido" AS ENUM('nuevo', 'aceptado', 'preparando', 'en_camino', 'listo', 'entregado', 'cancelado');
CREATE TYPE "public"."metodo_pago" AS ENUM('efectivo', 'nequi', 'transferencia', 'datafono');
CREATE TYPE "public"."modo_grupo" AS ENUM('incluido', 'adicional');
CREATE TYPE "public"."rol_usuario" AS ENUM('admin', 'empleado');
CREATE TYPE "public"."tipo_grupo" AS ENUM('seleccion', 'upsell');
CREATE TYPE "public"."tipo_pedido" AS ENUM('domicilio', 'recoger');
CREATE TABLE "store" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"nombre" text NOT NULL,
	"telefono" text,
	"direccion" text,
	"timezone" text DEFAULT 'America/Bogota' NOT NULL,
	"acepta_pedidos" boolean DEFAULT true NOT NULL,
	"mensaje_cerrado" text,
	"nequi_titular" text,
	"nequi_numero" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_slug_key" UNIQUE("slug")
);
CREATE TABLE "store_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"dia_semana" smallint NOT NULL,
	"abre" time NOT NULL,
	"cierra" time NOT NULL,
	CONSTRAINT "store_hours_check" CHECK (cierra > abre),
	CONSTRAINT "store_hours_dia_semana_check" CHECK ((dia_semana >= 0) AND (dia_semana <= 6))
);
CREATE TABLE "store_closure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"cerrado" boolean DEFAULT true NOT NULL,
	"abre" time,
	"cierra" time,
	"motivo" text,
	CONSTRAINT "store_closure_store_id_fecha_key" UNIQUE("store_id","fecha")
);
CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"email" text NOT NULL,
	"nombre" text NOT NULL,
	"password_hash" text NOT NULL,
	"rol" "rol_usuario" DEFAULT 'empleado' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_email_key" UNIQUE("email")
);
CREATE TABLE "category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"slug" text NOT NULL,
	"banner_url" text,
	"orden" integer DEFAULT 0 NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	CONSTRAINT "category_store_id_slug_key" UNIQUE("store_id","slug")
);
CREATE TABLE "product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"slug" text NOT NULL,
	"descripcion" text,
	"precio_base" integer NOT NULL,
	"imagenes" text[] DEFAULT '{""}' NOT NULL,
	"recomendado" boolean DEFAULT false NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"disponible" boolean DEFAULT true NOT NULL,
	"disponible_delivery" boolean DEFAULT true NOT NULL,
	"disponible_pickup" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_store_id_slug_key" UNIQUE("store_id","slug"),
	CONSTRAINT "product_precio_base_check" CHECK (precio_base >= 0)
);
CREATE TABLE "modifier_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"tipo" "tipo_grupo" DEFAULT 'seleccion' NOT NULL,
	"permite_cantidad" boolean DEFAULT false NOT NULL,
	"max_por_opcion" integer
);
CREATE TABLE "modifier_option" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"precio_delta" integer DEFAULT 0 NOT NULL,
	"imagen_url" text,
	"producto_ref" uuid,
	"recomendado" boolean DEFAULT false NOT NULL,
	"disponible" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL
);
CREATE TABLE "product_modifier_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"modo" "modo_grupo" DEFAULT 'incluido' NOT NULL,
	"etiqueta" text,
	"min_select" integer DEFAULT 0 NOT NULL,
	"max_select" integer DEFAULT 1 NOT NULL,
	"precio_unitario" integer,
	"avisar_incompleto" boolean DEFAULT false NOT NULL,
	"colapsado" boolean DEFAULT false NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_modifier_group_product_id_group_id_modo_key" UNIQUE("product_id","group_id","modo"),
	CONSTRAINT "product_modifier_group_check" CHECK (max_select >= min_select)
);
CREATE TABLE "delivery_zone" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"barrio" text NOT NULL,
	"precio" integer NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	CONSTRAINT "delivery_zone_store_id_barrio_key" UNIQUE("store_id","barrio"),
	CONSTRAINT "delivery_zone_precio_check" CHECK (precio >= 0)
);
CREATE TABLE "customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"telefono" text NOT NULL,
	"nombre" text,
	"total_pedidos" integer DEFAULT 0 NOT NULL,
	"total_gastado" bigint DEFAULT 0 NOT NULL,
	"ultimo_pedido" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_store_id_telefono_key" UNIQUE("store_id","telefono")
);
CREATE TABLE "order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"numero" serial NOT NULL,
	"token_publico" text DEFAULT encode(gen_random_bytes(16), 'hex'::text) NOT NULL,
	"tipo" "tipo_pedido" NOT NULL,
	"estado" "estado_pedido" DEFAULT 'nuevo' NOT NULL,
	"customer_id" uuid,
	"cliente_nombre" text NOT NULL,
	"cliente_telefono" text NOT NULL,
	"zona_id" uuid,
	"barrio_texto" text,
	"direccion" text,
	"indicaciones" text,
	"domicilio_por_confirmar" boolean DEFAULT false NOT NULL,
	"notas" text,
	"metodo_pago" "metodo_pago" NOT NULL,
	"comprobante_url" text,
	"paga_con" integer,
	"subtotal" integer NOT NULL,
	"costo_domicilio" integer DEFAULT 0 NOT NULL,
	"descuento" integer DEFAULT 0 NOT NULL,
	"total" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_token_publico_key" UNIQUE("token_publico"),
	CONSTRAINT "order_check" CHECK ((tipo = 'recoger'::tipo_pedido) OR (direccion IS NOT NULL))
);
CREATE TABLE "order_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"cantidad" integer NOT NULL,
	"precio_unitario" integer NOT NULL,
	"subtotal" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "order_item_cantidad_check" CHECK (cantidad > 0)
);
CREATE TABLE "order_status_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"estado" "estado_pedido" NOT NULL,
	"user_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "store_hours" ADD CONSTRAINT "store_hours_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "store_closure" ADD CONSTRAINT "store_closure_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "category" ADD CONSTRAINT "category_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "product" ADD CONSTRAINT "product_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "product" ADD CONSTRAINT "product_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "modifier_group" ADD CONSTRAINT "modifier_group_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "modifier_option" ADD CONSTRAINT "modifier_option_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."modifier_group"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "modifier_option" ADD CONSTRAINT "modifier_option_producto_ref_fkey" FOREIGN KEY ("producto_ref") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "product_modifier_group" ADD CONSTRAINT "product_modifier_group_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."modifier_group"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "product_modifier_group" ADD CONSTRAINT "product_modifier_group_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "delivery_zone" ADD CONSTRAINT "delivery_zone_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "customer" ADD CONSTRAINT "customer_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "order" ADD CONSTRAINT "order_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "order" ADD CONSTRAINT "order_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "order" ADD CONSTRAINT "order_zona_id_fkey" FOREIGN KEY ("zona_id") REFERENCES "public"."delivery_zone"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "order_status_event" ADD CONSTRAINT "order_status_event_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "order_status_event" ADD CONSTRAINT "order_status_event_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "idx_product_cat" ON "product" USING btree ("store_id" int4_ops,"category_id" uuid_ops,"orden" uuid_ops);
CREATE INDEX "idx_option_group" ON "modifier_option" USING btree ("group_id" int4_ops,"orden" int4_ops);
CREATE INDEX "idx_pmg_product" ON "product_modifier_group" USING btree ("product_id" int4_ops,"orden" uuid_ops);
CREATE INDEX "idx_customer_tel" ON "customer" USING btree ("store_id" text_ops,"telefono" text_ops);
CREATE INDEX "idx_order_estado" ON "order" USING btree ("store_id" timestamptz_ops,"estado" uuid_ops,"creado_en" enum_ops);
CREATE INDEX "idx_order_fecha" ON "order" USING btree ("store_id" uuid_ops,"creado_en" uuid_ops);
CREATE INDEX "idx_order_item_order" ON "order_item" USING btree ("order_id" uuid_ops);
*/

-- El bloque de arriba quedó comentado porque este archivo salió de un introspect: las
-- tablas ya existían en Supabase antes de que hubiera migraciones. Aplicarlo volvería a
-- crearlas y fallaría.
--
-- Pero un archivo enteramente comentado es una query VACÍA, y `drizzle-kit migrate` no
-- puede enviarla: aborta y nunca llega a la 0001. Este SELECT lo convierte en un no-op
-- válido, para que la 0000 se registre en el journal y las migraciones siguientes corran
-- por la vía estándar (`pnpm db:migrate`), también en CI y en Vercel.
SELECT 1;