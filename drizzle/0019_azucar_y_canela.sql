-- Azúcar y canela: dejar pedir el churro sin canela o sin azúcar.
--
-- Casi todo el mundo lo quiere con las dos cosas, así que NO se pregunta: quien no toca
-- nada se lleva el churro como siempre. Lo que se añade es la excepción, en una sección
-- plegada que solo abre quien la necesita.
--
-- Por eso el enganche es modo 'adicional' con precio 0 y no 'incluido':
--
--   * 'incluido' obligaría a elegir para poder añadir al carrito (regla 4), un paso más
--     para todos a cambio de servir a unos pocos;
--   * 'adicional' es el único modo opcional (min_select = 0) y plegable, y con
--     `precio_unitario = 0` no cobra nada — `precioEfectivoOpcion` devuelve 0 y la carta
--     no le pinta píldora de precio. Es el mismo caso que ya contempla la regla 2 y el
--     que la ficha reconoce con `engancheCobra` para no rotularlo como "adicionales".
--
-- `max_select = 2` a propósito: marcar las dos opciones es "sin azúcar ni canela", la
-- tercera variante posible, sin gastar una fila más ni obligar a nadie a leerla.
--
-- Los tres bloques son idempotentes (NOT EXISTS / ON CONFLICT) y derivan `store_id` del
-- producto: nunca se hardcodea la tienda (regla 5).

-- 1. La lista. Se llama como lo que el cliente lee en el ticket ("Azúcar y canela: Sin
--    canela"), porque ese nombre viaja al WhatsApp de cocina y al XLSX.
INSERT INTO "modifier_group" ("store_id", "nombre", "tipo", "permite_cantidad")
SELECT DISTINCT p."store_id", 'Azúcar y canela', 'seleccion'::tipo_grupo, false
  FROM "product" p
 WHERE p."slug" = 'cronchy-churros'
   AND NOT EXISTS (SELECT 1 FROM "modifier_group" g
                    WHERE g."store_id" = p."store_id" AND g."nombre" = 'Azúcar y canela');--> statement-breakpoint

-- 2. Las dos excepciones. precio_delta 0: quitar algo no cuesta ni descuenta.
INSERT INTO "modifier_option" ("store_id", "group_id", "nombre", "precio_delta", "orden")
SELECT g."store_id", g."id", v."nombre", 0, v."orden"
  FROM "modifier_group" g
 CROSS JOIN (VALUES ('Sin canela', 0), ('Sin azúcar', 1)) AS v("nombre", "orden")
 WHERE g."nombre" = 'Azúcar y canela'
   AND NOT EXISTS (SELECT 1 FROM "modifier_option" o
                    WHERE o."group_id" = g."id" AND o."nombre" = v."nombre");--> statement-breakpoint

-- 3. Los nueve platos que llevan churro: la categoría Churros entera y Churros con Helado
--    entera. Los churros sueltos de la categoría Adicionales (Churro Adicional, Mini
--    Churros, Churros Loop) quedan fuera a propósito: acompañan a un plato que ya
--    respondió la pregunta.
--
--    Se engancha por `slug` y no por `nombre`: el slug es UNIQUE (store_id, slug) y no se
--    mueve si mañana alguien corrige "Cronchy Clasico" y le pone la tilde.
--
--    orden 50: detrás de lo incluido y de las salsas de pago, delante de las bebidas del
--    upsell (que van en 100). colapsado = true para que nazca plegada.
INSERT INTO "product_modifier_group"
  ("store_id", "product_id", "group_id", "modo", "etiqueta",
   "min_select", "max_select", "precio_unitario", "avisar_incompleto", "colapsado", "orden")
SELECT p."store_id", p."id", g."id", 'adicional'::modo_grupo, NULL,
       0, 2, 0, false, true, 50
  FROM "product" p
  JOIN "modifier_group" g
    ON g."store_id" = p."store_id" AND g."nombre" = 'Azúcar y canela'
 WHERE p."slug" IN (
    'cronchy-churros', 'cronchy-amigos', 'cronchy-familiar', 'ring-churro',
    'cronchy-clasico', 'cronchy-frutilla', 'cronchy-mega', 'chiqui-cronchy', 'cronchy-cono'
 )
ON CONFLICT ("product_id", "group_id", "modo") DO NOTHING;--> statement-breakpoint

-- 4. La red de seguridad. Un JOIN por slug que no casa no falla: simplemente no engancha
--    nada, y la migración se daría por buena habiendo dejado churros sin la opción. Aquí
--    se comprueban las dos mitades —que el producto exista y que quedara enganchado— y se
--    revienta con los slugs concretos, que es lo que hace falta para arreglarlo.
DO $$
DECLARE
  churros text[] := ARRAY[
    'cronchy-churros', 'cronchy-amigos', 'cronchy-familiar', 'ring-churro',
    'cronchy-clasico', 'cronchy-frutilla', 'cronchy-mega', 'chiqui-cronchy', 'cronchy-cono'
  ];
  sin_producto text;
  sin_enganche text;
BEGIN
  SELECT string_agg(s, ', ') INTO sin_producto
    FROM unnest(churros) AS s
   WHERE NOT EXISTS (SELECT 1 FROM "product" p WHERE p."slug" = s);

  IF sin_producto IS NOT NULL THEN
    RAISE EXCEPTION 'Azúcar y canela: no hay ningún producto con el slug %. Revisa la carta antes de reintentar.', sin_producto;
  END IF;

  SELECT string_agg(p."slug", ', ') INTO sin_enganche
    FROM "product" p
   WHERE p."slug" = ANY(churros)
     AND NOT EXISTS (
       SELECT 1
         FROM "product_modifier_group" pmg
         JOIN "modifier_group" g ON g."id" = pmg."group_id"
        WHERE pmg."product_id" = p."id"
          AND pmg."modo" = 'adicional'
          AND g."nombre" = 'Azúcar y canela'
     );

  IF sin_enganche IS NOT NULL THEN
    RAISE EXCEPTION 'Azúcar y canela: estos productos se quedaron sin la opción: %.', sin_enganche;
  END IF;
END $$;
