-- Las medidas de la imagen del banner. Con ellas el modal se dibuja con la proporción del arte,
-- así que la imagen llega a los cuatro bordes sin marco y sin recortar.
--
-- En tres pasos y no con un `ADD COLUMN ... NOT NULL` directo: cuando llegó esta columna la tabla
-- ya tenía un banner subido desde el panel, y Postgres rechaza añadir una columna obligatoria sin
-- valor a una tabla con filas.
ALTER TABLE "banner" ADD COLUMN "ancho" integer;--> statement-breakpoint
ALTER TABLE "banner" ADD COLUMN "alto" integer;--> statement-breakpoint

-- El relleno NO es un valor inventado: son las medidas **leídas de la cabecera del propio archivo**
-- del único banner que existía ("latte frio", 960x1280). Ponerle a una imagen unas medidas de
-- adorno sería justo lo que estas columnas existen para evitar — la caja saldría con la proporción
-- equivocada y volvería el borde.
--
-- Si algún día esto corre sobre otra base con banners previos, esas filas quedarían con la
-- proporción de aquella imagen. Hoy hay una sola tienda y una sola base; el día que no, lo correcto
-- es volver a subir esos banners desde el panel, que es quien mide de verdad.
UPDATE "banner" SET "ancho" = 960, "alto" = 1280 WHERE "ancho" IS NULL;--> statement-breakpoint

ALTER TABLE "banner" ALTER COLUMN "ancho" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "banner" ALTER COLUMN "alto" SET NOT NULL;
