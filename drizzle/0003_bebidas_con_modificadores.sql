-- Las bebidas pasan a tener opciones propias y obligatorias, y el upsell del churro
-- queda con solo tres: Agua 600ml, Frappe y Latte Frio.
--
--   Agua 600ml (antes "Agua Grande")   -> Gas: Con gas / Sin gas
--   Agua 300ml (antes "Agua Pequena")  -> Gas (fuera del upsell, sigue en la carta)
--   Frappe                             -> Sabor: Cafe / Oreo / Fresa
--                                      -> Nivel de dulce: Dulce / Bajo en dulce / Sin dulce
--   Latte Frio                         -> Nivel de dulce
--
-- Todos los bloques son idempotentes (NOT EXISTS / ON CONFLICT) y derivan `store_id` del
-- producto: nunca se hardcodea la tienda (regla 5).

-- 1. Renombrar los dos productos de agua. El NOT EXISTS protege el UNIQUE (store_id, slug)
--    y permite re-ejecutar la migración sin romper nada.
UPDATE "product" AS p SET "nombre" = 'Agua 600ml', "slug" = 'agua-600ml'
 WHERE p."nombre" = 'Agua Grande'
   AND NOT EXISTS (SELECT 1 FROM "product" x
                    WHERE x."store_id" = p."store_id" AND x."slug" = 'agua-600ml');--> statement-breakpoint

UPDATE "product" AS p SET "nombre" = 'Agua 300ml', "slug" = 'agua-300ml'
 WHERE p."nombre" = 'Agua Pequena'
   AND NOT EXISTS (SELECT 1 FROM "product" x
                    WHERE x."store_id" = p."store_id" AND x."slug" = 'agua-300ml');--> statement-breakpoint

-- 2. La opción del upsell hereda el nombre del producto real. `calcularItem` usa
--    `opcion.nombre` como nombre del upsell; dejarlo desincronizado haría que el carrito
--    dijera "Agua Grande" y el checkout "Agua 600ml".
UPDATE "modifier_option" AS o SET "nombre" = p."nombre"
  FROM "product" AS p
 WHERE o."producto_ref" = p."id" AND o."nombre" <> p."nombre";--> statement-breakpoint

-- 3. Los tres grupos nuevos. "Sabor del frappe" y no "Sabor" a secas para no confundirlo
--    con "Sabor de helado" en el panel; al cliente se le muestra la etiqueta del enganche.
INSERT INTO "modifier_group" ("store_id", "nombre", "tipo", "permite_cantidad")
SELECT DISTINCT p."store_id", v."nombre", 'seleccion'::tipo_grupo, false
  FROM "product" p
 CROSS JOIN (VALUES ('Gas'), ('Sabor del frappe'), ('Nivel de dulce')) AS v("nombre")
 WHERE p."nombre" = 'Agua 600ml'
   AND NOT EXISTS (SELECT 1 FROM "modifier_group" g
                    WHERE g."store_id" = p."store_id" AND g."nombre" = v."nombre");--> statement-breakpoint

-- 4. Sus opciones. precio_delta 0: son variantes, no recargos.
INSERT INTO "modifier_option" ("store_id", "group_id", "nombre", "precio_delta", "orden")
SELECT g."store_id", g."id", v."nombre", 0, v."orden"
  FROM "modifier_group" g
 CROSS JOIN (VALUES ('Con gas', 0), ('Sin gas', 1)) AS v("nombre", "orden")
 WHERE g."nombre" = 'Gas'
   AND NOT EXISTS (SELECT 1 FROM "modifier_option" o
                    WHERE o."group_id" = g."id" AND o."nombre" = v."nombre");--> statement-breakpoint

INSERT INTO "modifier_option" ("store_id", "group_id", "nombre", "precio_delta", "orden")
SELECT g."store_id", g."id", v."nombre", 0, v."orden"
  FROM "modifier_group" g
 CROSS JOIN (VALUES ('Cafe', 0), ('Oreo', 1), ('Fresa', 2)) AS v("nombre", "orden")
 WHERE g."nombre" = 'Sabor del frappe'
   AND NOT EXISTS (SELECT 1 FROM "modifier_option" o
                    WHERE o."group_id" = g."id" AND o."nombre" = v."nombre");--> statement-breakpoint

INSERT INTO "modifier_option" ("store_id", "group_id", "nombre", "precio_delta", "orden")
SELECT g."store_id", g."id", v."nombre", 0, v."orden"
  FROM "modifier_group" g
 CROSS JOIN (VALUES ('Dulce', 0), ('Bajo en dulce', 1), ('Sin dulce', 2)) AS v("nombre", "orden")
 WHERE g."nombre" = 'Nivel de dulce'
   AND NOT EXISTS (SELECT 1 FROM "modifier_option" o
                    WHERE o."group_id" = g."id" AND o."nombre" = v."nombre");--> statement-breakpoint

-- 5. Enganchar cada bebida con su grupo. modo 'incluido' => la opción no suma al precio
--    (regla 3); min_select = max_select = 1 con avisar_incompleto=false => obligatorio y
--    bloqueante (regla 4).
INSERT INTO "product_modifier_group"
  ("store_id", "product_id", "group_id", "modo", "etiqueta",
   "min_select", "max_select", "precio_unitario", "avisar_incompleto", "colapsado", "orden")
SELECT p."store_id", p."id", g."id", 'incluido'::modo_grupo, v."etiqueta",
       1, 1, NULL, false, false, v."orden"
  FROM (VALUES
    ('Agua 600ml', 'Gas',              NULL,    0),
    ('Agua 300ml', 'Gas',              NULL,    0),
    ('Frappe',     'Sabor del frappe', 'Sabor', 0),
    ('Frappe',     'Nivel de dulce',   NULL,    1),
    ('Latte Frio', 'Nivel de dulce',   NULL,    0)
  ) AS v("producto", "grupo", "etiqueta", "orden")
  JOIN "product" p ON p."nombre" = v."producto"
  JOIN "modifier_group" g ON g."store_id" = p."store_id" AND g."nombre" = v."grupo"
ON CONFLICT ("product_id", "group_id", "modo") DO NOTHING;--> statement-breakpoint

-- 6. Sacar Malteada y Agua 300ml del upsell. Se apagan, NO se borran (regla 9): la fila
--    sigue ahí y se reactiva con un switch. La UI del upsell oculta lo no disponible; el
--    producto sigue a la venta en la carta porque `product.activo` no se toca.
UPDATE "modifier_option" AS o SET "disponible" = false
  FROM "modifier_group" g, "product" p
 WHERE o."group_id" = g."id" AND g."tipo" = 'upsell'
   AND o."producto_ref" = p."id"
   AND p."nombre" IN ('Malteada', 'Agua 300ml');
