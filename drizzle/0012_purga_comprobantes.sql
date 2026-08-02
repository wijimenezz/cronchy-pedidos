-- Purga de comprobantes de Nequi a los 60 días.
--
-- Un comprobante es la captura de pantalla del pago de un cliente: un dato personal que
-- no hay ninguna razón para conservar indefinidamente. CLAUDE.md ya decía que esto se
-- resuelve con `pg_cron` DENTRO de Supabase y no con un cron de Vercel — corre en la base
-- y no depende de dónde esté desplegada la app.
--
-- Hacen falta las dos mitades del trabajo, porque ninguna sirve sola:
--
--   1. Borrar el OBJETO del bucket. SQL puro no puede: borrar la fila de `storage.objects`
--      desengancha el archivo pero lo deja ocupando cuota del free tier (1 GB). Se llama a
--      la API de Storage con `pg_net`.
--   2. Poner a NULL `order.comprobante_url`. El pedido conserva su historia y su snapshot
--      intactos (regla 2); lo que desaparece es el puntero al dato personal.
--
-- La extensión se habilita aquí y no a mano en el dashboard, igual que PostGIS en la 0008.

CREATE EXTENSION IF NOT EXISTS pg_cron;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_net;--> statement-breakpoint

-- La URL y la llave se leen de Vault en tiempo de ejecución. NO pueden ir escritas aquí:
-- este archivo va al repositorio. Se cargan una vez con `node scripts/configurar-purga.mjs`.
CREATE OR REPLACE FUNCTION public.purgar_comprobantes(dias integer DEFAULT 60)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  base     text;
  llave    text;
  objeto   record;
  borrados integer := 0;
  corte    timestamptz := now() - make_interval(days => dias);
BEGIN
  SELECT decrypted_secret INTO base  FROM vault.decrypted_secrets WHERE name = 'supabase_url';
  SELECT decrypted_secret INTO llave FROM vault.decrypted_secrets WHERE name = 'supabase_service_key';

  -- Antes que borrar a medias, no borrar nada. Un job que falla ruidosamente se arregla;
  -- uno que deja los pedidos sin comprobante y los archivos en el bucket, no se nota.
  IF base IS NULL OR llave IS NULL THEN
    RAISE EXCEPTION 'Faltan los secretos supabase_url / supabase_service_key en Vault. Corre: node scripts/configurar-purga.mjs';
  END IF;

  FOR objeto IN
    SELECT name FROM storage.objects
     WHERE bucket_id = 'comprobantes' AND created_at < corte
  LOOP
    -- `pg_net` encola la petición y responde enseguida: no bloquea el job aunque Storage
    -- vaya lento. Las DOS cabeceras, igual que en `src/lib/storage.ts`: las llaves nuevas
    -- de Supabase (`sb_secret_…`) no son JWT y `Authorization` sola no les vale.
    PERFORM net.http_delete(
      url     := base || '/storage/v1/object/comprobantes/' || objeto.name,
      headers := jsonb_build_object(
                   'Authorization', 'Bearer ' || llave,
                   'apikey',        llave
                 )
    );
    borrados := borrados + 1;
  END LOOP;

  UPDATE "order"
     SET comprobante_url = NULL
   WHERE comprobante_url IS NOT NULL
     AND creado_en < corte;

  RETURN borrados;
END;
$$;--> statement-breakpoint

-- 07:30 UTC = 02:30 en Bogotá: la tienda cierra a las 20:30 como muy tarde, así que no
-- pisa ninguna operación. `cron.schedule` reemplaza el job si ya existe uno con ese
-- nombre, de modo que reejecutar esta migración no crea duplicados.
SELECT cron.schedule(
  'purgar-comprobantes',
  '30 7 * * *',
  $$SELECT public.purgar_comprobantes(60)$$
);
