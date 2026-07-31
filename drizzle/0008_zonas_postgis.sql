-- Reglas 13 y 14 de CLAUDE.md: el domicilio deja de cobrarse por un desplegable de
-- barrios y pasa a calcularse con PostGIS, sobre el pin que el cliente confirma en el
-- mapa, contra polígonos que el admin dibuja en /admin/zonas.
--
-- Esta migración es SOLO de datos: no toca ninguna pantalla. `order.barrio_texto` y
-- `order.domicilio_por_confirmar` siguen en pie a propósito, para que el checkout actual
-- funcione igual mientras se construye el mapa; se retiran en la migración del corte.
--
-- Se hace ahora porque `order` y `app_user` están vacías: sin historial de pedidos
-- encima, renombrar una columna de zonas y un valor de enum sale gratis.
--
-- Tres cosas van escritas a mano porque drizzle-kit no las sabe emitir: la extensión, el
-- RENAME de la columna (drizzle proponía DROP + ADD, que se llevaría las 4 zonas ya
-- cargadas) y el RENAME del valor del enum (drizzle proponía DROP TYPE, que falla con una
-- columna usándolo).

-- 1. PostGIS. `WITH SCHEMA extensions` es lo que recomienda Supabase: en `public` metería
--    ~1.000 funciones que drizzle-kit vería como objetos ajenos en cada introspect. El
--    search_path de la base ya incluye `extensions`, pero se fija explícitamente para que
--    la migración no dependa de la configuración de la sesión.
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;--> statement-breakpoint
SET search_path TO public, extensions;--> statement-breakpoint

-- 2. 'empleado' -> 'colaborador'. RENAME VALUE y no DROP TYPE: el tipo conserva su OID,
--    así que el DEFAULT de app_user.rol se re-renderiza solo y no hay que recrearlo.
ALTER TYPE "public"."rol_usuario" RENAME VALUE 'empleado' TO 'colaborador';--> statement-breakpoint

-- 3. `barrio` -> `nombre`: una zona ya no es un barrio, es un polígono con nombre propio.
--    RENAME conserva las 4 filas cargadas con su precio real.
ALTER TABLE "delivery_zone" DROP CONSTRAINT "delivery_zone_store_id_barrio_key";--> statement-breakpoint
ALTER TABLE "delivery_zone" RENAME COLUMN "barrio" TO "nombre";--> statement-breakpoint
ALTER TABLE "delivery_zone" ADD CONSTRAINT "delivery_zone_store_id_nombre_key" UNIQUE("store_id","nombre");--> statement-breakpoint

-- 4. El polígono queda NULLABLE: las zonas que venían del modelo por barrio todavía no
--    están dibujadas y el admin les trazará el contorno. `zonas.ts` ignora las que no
--    tienen geometría — sin polígono no pueden cubrir ningún punto, así que ninguna zona
--    a medio configurar cobra de más.
ALTER TABLE "delivery_zone" ADD COLUMN "poligono" geometry(Polygon,4326);--> statement-breakpoint
ALTER TABLE "delivery_zone" ADD COLUMN "prioridad" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_zone" ADD COLUMN "color" text;--> statement-breakpoint

-- 5. Prioridad determinista desde el arranque. Con todas en 0, dos zonas solapadas se
--    resolverían por el orden que devuelva Postgres, que no es orden ninguno.
UPDATE "delivery_zone" AS z SET "prioridad" = s."fila" - 1
  FROM (SELECT "id", row_number() OVER (PARTITION BY "store_id" ORDER BY "nombre") AS "fila"
          FROM "delivery_zone") AS s
 WHERE s."id" = z."id";--> statement-breakpoint

-- 6. Regla 13: no existe envío gratis ni zona a $0 — el domicilio lo ejecuta un courier
--    externo y siempre se cobra. Las 4 zonas actuales (3000..5000) ya cumplen.
ALTER TABLE "delivery_zone" DROP CONSTRAINT "delivery_zone_precio_check";--> statement-breakpoint
ALTER TABLE "delivery_zone" ADD CONSTRAINT "delivery_zone_precio_check" CHECK (precio > 0);--> statement-breakpoint

-- 7. GiST es el índice que sabe responder ST_Covers; el btree ordena la evaluación por
--    prioridad dentro de cada tienda (regla 5).
CREATE INDEX "idx_delivery_zone_poligono" ON "delivery_zone" USING gist ("poligono");--> statement-breakpoint
CREATE INDEX "idx_delivery_zone_prioridad" ON "delivery_zone" USING btree ("store_id" uuid_ops,"prioridad" int4_ops);--> statement-breakpoint

-- 8. Snapshot del domicilio en el pedido. `zona_nombre` congela el nombre de la zona
--    (regla 2 aplicada al domicilio): editar o borrar una zona jamás debe reescribir un
--    pedido viejo. `zona_id` se queda solo para reportes agregados, igual que
--    `order_item.product_id`.
--
--    `punto` es el pin que el cliente confirmó, lo único que determina el costo (regla
--    14). Nullable: `recoger` no tiene pin, y un pedido manual desde el panel (v1.1)
--    tampoco. No se agrega CHECK exigiéndolo en domicilio porque el checkout actual
--    todavía no lo manda; eso entra con el mapa.
ALTER TABLE "order" ADD COLUMN "zona_nombre" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "punto" geometry(Point,4326);
