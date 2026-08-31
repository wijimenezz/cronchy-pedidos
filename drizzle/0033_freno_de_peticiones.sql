CREATE TABLE "rate_limit" (
	"clave" text NOT NULL,
	"ventana" timestamp with time zone NOT NULL,
	"conteo" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "rate_limit_pkey" PRIMARY KEY("clave","ventana")
);
--> statement-breakpoint
ALTER TABLE "rate_limit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "idx_rate_limit_ventana" ON "rate_limit" USING btree ("ventana");--> statement-breakpoint

-- ------------------------------------------------------------
-- La purga del contador
-- ------------------------------------------------------------
--
-- Sin esto la tabla crece sin fin: cada IP y cada ventana dejan una fila, y las ventanas viejas
-- no se vuelven a leer nunca. Se borra con margen —una hora cubre de sobra la ventana más larga,
-- que son los 5 minutos del login— porque una fila de más no hace daño y borrar una viva
-- reiniciaría el cupo de alguien a media ráfaga.
--
-- Va con `pg_cron`, que ya está instalado desde la migración 0012 (la purga de comprobantes):
-- corre dentro de la base y no depende del hosting.
CREATE OR REPLACE FUNCTION public.purgar_rate_limit()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  borrados integer;
BEGIN
  DELETE FROM public.rate_limit
   WHERE ventana < now() - interval '1 hour';

  GET DIAGNOSTICS borrados = ROW_COUNT;

  RETURN borrados;
END;
$$;--> statement-breakpoint

-- Postgres concede EXECUTE a PUBLIC en toda función nueva, así que hay que revocárselo a PUBLIC
-- y no a un rol concreto: revocar por rol es un no-op. Mismo tropiezo que arregló la 0028.
REVOKE ALL ON FUNCTION public.purgar_rate_limit() FROM PUBLIC;--> statement-breakpoint

-- Cada hora en punto. `cron.schedule` reemplaza el job si ya existe uno con ese nombre, de modo
-- que reejecutar esta migración no crea duplicados.
SELECT cron.schedule(
  'purgar-rate-limit',
  '0 * * * *',
  $$SELECT public.purgar_rate_limit()$$
);
