-- "¿Quieres agrandar tus churros?": +5 churros en la misma caja, en Cronchy Amigos y Cronchy
-- Familiar.
--
-- No hace falta nada nuevo en el modelo: es un grupo de tipo `seleccion` enganchado en modo
-- `adicional` con `min_select = 0` y `max_select = 1`, que es exactamente el cubo "Adicionales"
-- del panel — y por eso **el precio queda editable desde la Carta**, por producto, sin volver a
-- tocar SQL. Lo único que se añadió en código es cómo se pinta: un adicional de una sola opción
-- se dibuja como una casilla abierta con check en vez de plegado tras un "+ Agregar…".
--
-- Los tres bloques son idempotentes (NOT EXISTS / ON CONFLICT) y derivan `store_id` del
-- producto: nunca se hardcodea la tienda (regla 5).

-- 1. La lista. El nombre es lo que el cliente lee de título en la ficha, y también lo que viaja
--    al ticket de cocina y al XLSX dentro del snapshot (regla 2).
--
--    `ayuda` se queda en NULL a propósito: el "+5 churros" ya va dentro del nombre de la opción,
--    y repetirlo de subtítulo sería decir lo mismo dos veces en tres centímetros.
INSERT INTO "modifier_group" ("store_id", "nombre", "tipo", "permite_cantidad")
SELECT DISTINCT p."store_id", '¿Quieres agrandar tus churros?', 'seleccion'::tipo_grupo, false
  FROM "product" p
 WHERE p."slug" = 'cronchy-amigos'
   AND NOT EXISTS (SELECT 1 FROM "modifier_group" g
                    WHERE g."store_id" = p."store_id"
                      AND g."nombre" = '¿Quieres agrandar tus churros?');--> statement-breakpoint

-- 2. La única opción. **Tiene que entenderse sola**: el detalle del pedido en el panel muestra los
--    extras cobrados con el nombre de la opción y sin el del grupo (`agruparModificadores`), así
--    que un "¡Sí, agrandar!" llegaría a cocina sin decir qué agrandar.
--
--    Su `precio_delta` es el respaldo, no el precio que se cobra: manda el `precio_unitario` del
--    enganche (regla 3). Se escribe igual, en 8.000, porque un 0 aquí volvería la opción gratis el
--    día que alguien vacíe el precio en la Carta —ese caso ya lo avisa el panel: "un precio vacío
--    significa que cada opción cobra el suyo".
INSERT INTO "modifier_option" ("store_id", "group_id", "nombre", "precio_delta", "orden")
SELECT g."store_id", g."id", 'Sí, +5 churros', 8000, 0
  FROM "modifier_group" g
 WHERE g."nombre" = '¿Quieres agrandar tus churros?'
   AND NOT EXISTS (SELECT 1 FROM "modifier_option" o
                    WHERE o."group_id" = g."id" AND o."nombre" = 'Sí, +5 churros');--> statement-breakpoint

-- 3. Los dos productos. El Cronchy Churros queda fuera a propósito: agrandar una caja de cinco
--    churros con otros cinco es pedir dos, y para eso está el stepper de cantidad.
--
--    `min_select = 0` y `max_select = 1`: se puede saltar y se marca una sola vez.
--    `precio_unitario = 8000` es el precio de arranque y el que se edita en la Carta → el
--    producto → Adicionales → "$ c/u"; cada producto puede tener el suyo.
--
--    orden 6: detrás de las salsas (incluida 4, adicionales 5) y delante de "Azúcar y canela"
--    (50). `colapsado = false` para que nazca abierta, aunque no dependa de ello: lo que hace que
--    esta sección no se pliegue es su forma —un adicional de una sola opción— y no esta columna,
--    que el panel reescribe a `true` en cada guardado.
INSERT INTO "product_modifier_group"
  ("store_id", "product_id", "group_id", "modo", "etiqueta",
   "min_select", "max_select", "precio_unitario", "avisar_incompleto", "colapsado", "orden")
SELECT p."store_id", p."id", g."id", 'adicional'::modo_grupo, NULL,
       0, 1, 8000, false, false, 6
  FROM "product" p
  JOIN "modifier_group" g
    ON g."store_id" = p."store_id" AND g."nombre" = '¿Quieres agrandar tus churros?'
 WHERE p."slug" IN ('cronchy-amigos', 'cronchy-familiar')
ON CONFLICT ("product_id", "group_id", "modo") DO NOTHING;--> statement-breakpoint

-- 4. La red de seguridad. Un JOIN por slug que no casa no falla: simplemente no engancha nada, y
--    la migración se daría por buena habiendo dejado la carta igual que estaba. Se comprueban las
--    tres cosas que pueden salir mal —que falte un producto, que la lista quedara sin su opción
--    (una sección vacía en la ficha) y que alguno no quedara enganchado— y se revienta con los
--    slugs concretos, que es lo que hace falta para arreglarlo.
DO $$
DECLARE
  agrandables text[] := ARRAY['cronchy-amigos', 'cronchy-familiar'];
  sin_producto text;
  sin_enganche text;
BEGIN
  SELECT string_agg(s, ', ') INTO sin_producto
    FROM unnest(agrandables) AS s
   WHERE NOT EXISTS (SELECT 1 FROM "product" p WHERE p."slug" = s);

  IF sin_producto IS NOT NULL THEN
    RAISE EXCEPTION 'Agrandar churros: no hay ningún producto con el slug %. Revisa la carta antes de reintentar.', sin_producto;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM "modifier_option" o
      JOIN "modifier_group" g ON g."id" = o."group_id"
     WHERE g."nombre" = '¿Quieres agrandar tus churros?'
       AND o."nombre" = 'Sí, +5 churros'
  ) THEN
    RAISE EXCEPTION 'Agrandar churros: la lista quedó sin su opción, y una sección vacía no se puede ofrecer.';
  END IF;

  SELECT string_agg(p."slug", ', ') INTO sin_enganche
    FROM "product" p
   WHERE p."slug" = ANY(agrandables)
     AND NOT EXISTS (
       SELECT 1
         FROM "product_modifier_group" pmg
         JOIN "modifier_group" g ON g."id" = pmg."group_id"
        WHERE pmg."product_id" = p."id"
          AND pmg."modo" = 'adicional'
          AND g."nombre" = '¿Quieres agrandar tus churros?'
     );

  IF sin_enganche IS NOT NULL THEN
    RAISE EXCEPTION 'Agrandar churros: estos productos se quedaron sin la casilla: %.', sin_enganche;
  END IF;
END $$;
