ALTER TABLE "app_user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "barrio" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "category" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "courier" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cupon" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cupon_categoria" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cupon_producto" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "customer" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "delivery_zone" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "modifier_group" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "modifier_option" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "order" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "order_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "order_status_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_modifier_group" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "push_subscription" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "store" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "store_closure" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "store_hours" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Escrito a mano: Drizzle modela el esquema, no los permisos.
--
-- RLS protege TABLAS, no FUNCIONES. `purgar_comprobantes` quedó ejecutable por `anon` y
-- `authenticated` —por los default privileges de Supabase, no por la migración 0012— así que con la
-- llave anon se podía invocar por RPC: POST /rest/v1/rpc/purgar_comprobantes. Es SECURITY INVOKER,
-- así que con RLS ya haría poco daño, pero es una puerta que no tiene por qué existir.
--
-- El cron NO se ve afectado: el job #1 corre como `postgres` (cron.job.username), que además es el
-- dueño de la función. Aquí solo se nombran los dos roles de PostgREST.
REVOKE EXECUTE ON FUNCTION public.purgar_comprobantes(integer) FROM anon, authenticated;