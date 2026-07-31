-- Dónde queda el local, como punto.
--
-- Lo pide la regla 14: cuando el cliente niega el permiso de ubicación, el mapa del
-- checkout tiene que abrirse "centrado en la tienda". También centra el mapa de zonas del
-- panel cuando todavía no hay ningún polígono dibujado.
--
-- Va en `store` y no en una constante del código por la regla 5: la tienda se resuelve en
-- un solo lugar, y el día que haya una segunda cada una tendrá la suya.

ALTER TABLE "store" ADD COLUMN "ubicacion" geometry(Point,4326);--> statement-breakpoint

-- Semilla: el parque principal de Fusagasugá. Es una aproximación deliberada — el admin
-- arrastra el pin a la puerta del local desde /admin/zonas. Sin esto el primer mapa se
-- abriría sobre el golfo de Guinea, que es donde cae el punto (0,0).
UPDATE "store"
   SET "ubicacion" = ST_SetSRID(ST_MakePoint(-74.3653, 4.3372), 4326)
 WHERE "ubicacion" IS NULL;
