-- A qué dispositivos empujar el aviso de pedido nuevo (Web Push).
--
-- El `endpoint` lo asigna el servicio de push del navegador y ya identifica por sí solo a ese
-- navegador en ese dispositivo: es la llave natural, y por eso el UNIQUE va ahí. Reactivar los
-- avisos hace un upsert contra él en vez de duplicar la fila.
--
-- `user_id` existe para poder soltar la suscripción al cerrar sesión: el celular de quien ya no
-- trabaja aquí no debería seguir sonando cada vez que entra un pedido.
--
-- No hay columna de "última vez usada": una suscripción muerta no se detecta por antigüedad sino
-- porque el servicio de push responde 404 o 410, y ahí se borra sola.
CREATE TABLE "push_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscription_endpoint_key" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;