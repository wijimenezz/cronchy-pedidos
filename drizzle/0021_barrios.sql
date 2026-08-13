CREATE TABLE "barrio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"nombre_osm" text NOT NULL,
	"nombre" text,
	CONSTRAINT "barrio_store_id_nombre_osm_key" UNIQUE("store_id","nombre_osm")
);
--> statement-breakpoint
ALTER TABLE "barrio" ADD CONSTRAINT "barrio_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Los 90 barrios que OpenStreetMap tiene mapeados en Fusagasugá (place=neighbourhood).
--
-- Por defecto cada uno se traduce a sí mismo: la tabla no cambia nada hasta que alguien
-- corrija una fila desde /admin/ajustes. Las 6 "Comuna …" de OSM no entran porque llegan como
-- `suburb` y `barrioDeRespuesta` solo lee `neighbourhood`.
--
-- `store_id` sale de la tabla store, nunca hardcodeado (regla 5), e idempotente por el UNIQUE.
INSERT INTO "barrio" ("store_id", "nombre_osm", "nombre")
SELECT s."id", v."nombre", v."nombre"
  FROM "store" s
 CROSS JOIN (VALUES
    ('Acrópolis'),
    ('Altos de Fusa'),
    ('Altos de Pekín'),
    ('Antiguo Balmoral'),
    ('Antonio Nariño'),
    ('Balmoral'),
    ('Bonanza'),
    ('Bosque Bonnet'),
    ('Camino Real'),
    ('Carlos Lleras Restrepo'),
    ('Casona de Pekín'),
    ('Cedritos'),
    ('Coburgo'),
    ('Comuneros'),
    ('Cucharal Urbano'),
    ('Ebenezer'),
    ('El Bosque'),
    ('El Caney'),
    ('El Caribe'),
    ('El Centro'),
    ('El Comboy'),
    ('El Eden'),
    ('El Lucero'),
    ('El Mirador'),
    ('El Progreso'),
    ('El Recreo'),
    ('El Rosal'),
    ('El Tejar'),
    ('El Vergel'),
    ('Emilio Sierra'),
    ('Florida Blanca'),
    ('Fontanar'),
    ('Fusacatán'),
    ('Gaitán'),
    ('Gran Colombia'),
    ('Jaime Pardo Leal'),
    ('José Antonio Galán'),
    ('La Alejandría'),
    ('La Cabaña'),
    ('La Esmeralda'),
    ('La Esperanza'),
    ('La Florida'),
    ('La Glorieta'),
    ('La Independencia'),
    ('La Marsella'),
    ('La Primavera'),
    ('Las Américas'),
    ('Las Delicias'),
    ('Las Palmas'),
    ('Llano Largo'),
    ('Los Robles'),
    ('Luxemburgo'),
    ('Managua'),
    ('Mandalay'),
    ('Manila'),
    ('Mi Tesoro'),
    ('Monteverde'),
    ('Nueva Esperanza'),
    ('Nuevo Balmoral'),
    ('Olaya'),
    ('Paraiso de Pekín'),
    ('Pedro Pablo Bello'),
    ('Pekín'),
    ('Portal de San José'),
    ('Potosí'),
    ('Prados de Altagracia'),
    ('Prados de Bethel 2'),
    ('Quinta Balmoral'),
    ('Sabaneta'),
    ('San Antonio'),
    ('San Fernando'),
    ('San Jorge'),
    ('San Marcos'),
    ('San Mateo'),
    ('Santa Anita'),
    ('Santa Barbara'),
    ('Santa Librada'),
    ('Santa María de los Angeles'),
    ('Santa Rosa'),
    ('Santander'),
    ('Toluca'),
    ('Valencia'),
    ('Villa Aránzazu'),
    ('Villa Armerita'),
    ('Villa Celeste'),
    ('Villa Country'),
    ('Villa de los Sutagaos'),
    ('Villa Lady'),
    ('Villa Natalia'),
    ('Villa Patricia')
 ) AS v("nombre")
ON CONFLICT ("store_id", "nombre_osm") DO NOTHING;--> statement-breakpoint

-- La única corrección conocida hoy: Managua no existe como barrio en Fusagasugá, y lo que OSM
-- llama así es Balmoral. Va aparte del INSERT para que se lea qué se corrigió y por qué.
UPDATE "barrio" SET "nombre" = 'Balmoral' WHERE "nombre_osm" = 'Managua';
