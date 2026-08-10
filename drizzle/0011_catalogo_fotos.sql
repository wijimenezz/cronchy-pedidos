ALTER TABLE "product" ALTER COLUMN "imagenes" SET DEFAULT '{}';--> statement-breakpoint

-- Saneo antes de poner el CHECK: el default anterior era '{""}', así que todo producto
-- creado sin fotos quedó con UNA foto que es la cadena vacía. La ficha se salvaba de
-- milagro (`foto ? <Image> : placeholder` por dentro), pero el CRUD que llega ahora
-- contaría ese hueco como una de las 3 fotos y mostraría un recuadro roto en el panel.
UPDATE "product" SET "imagenes" = array_remove("imagenes", '') WHERE '' = ANY("imagenes");--> statement-breakpoint

-- El tope de 3 fotos era hasta hoy una convención escrita en CLAUDE.md, no algo que la
-- base impusiera. Si el seed dejó alguna fila por encima, el ALTER de abajo fallaría en
-- mitad de la migración: se recorta primero y se conservan las 3 primeras (la 1ª es la
-- portada, que es la que de verdad importa).
UPDATE "product" SET "imagenes" = "imagenes"[1:3] WHERE cardinality("imagenes") > 3;--> statement-breakpoint

ALTER TABLE "product" ADD CONSTRAINT "product_imagenes_check" CHECK (cardinality(imagenes) <= 3);
