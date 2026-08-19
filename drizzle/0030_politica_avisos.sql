-- Qué versión de la política aceptó, y si quiere que le escribamos.
--
-- `politica_version` es nullable: los pedidos anteriores aceptaron un documento que no estaba
-- versionado, y ponerles la versión de hoy diría que aceptaron un texto que nadie les mostró.
-- Va al lado de `politica_aceptada_en` porque juntas son la evidencia completa — cuándo y qué.
--
-- `acepta_avisos` entra NOT NULL con DEFAULT true, y ese default es lo que hace que la migración
-- sea segura sobre los pedidos que ya existen: avisar del estado es finalidad necesaria del
-- servicio, así que "no dijo nada" y "sí" son lo mismo aquí. Un default false apagaría en
-- silencio los avisos de todos los pedidos vivos en el momento del despliegue.
ALTER TABLE "order" ADD COLUMN "politica_version" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "acepta_avisos" boolean DEFAULT true NOT NULL;
