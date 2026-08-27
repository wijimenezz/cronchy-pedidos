-- Ofrecer Mini Churros y Churros Loop desde los cuatro churros con helado, y apagar la
-- categoría "Adicionales", que se queda sin razón de ser.
--
-- Los cuatro productos de esa categoría se reparten así:
--
--   Mini Churros      -> pasa a ofrecerse desde la ficha (esta migración)
--   Churros Loop      -> pasa a ofrecerse desde la ficha (esta migración)
--   Salsa Adicional   -> ya se maneja dentro de cada churro, con los grupos en modo `adicional`
--   Churro Adicional  -> ya se maneja con "agrandar la orden, +5 churros"
--
-- Es la misma mecánica de la 0023 (helado) y la 0003 (bebidas): una lista de tipo `upsell` cuyas
-- opciones apuntan a un producto real con `producto_ref`, de modo que lo elegido entra al pedido
-- como su propio `order_item` y no como un modificador del churro (regla 8).
--
-- **La novedad es `permite_cantidad`**: las dos listas upsell que existían lo llevan en `false`.
-- Aquí el cliente puede llevarse varias porciones, así que la ficha pinta un stepper en vez de un
-- botón (`FilaUpsell`). El motor ya lo valida de forma genérica; hay tests que fijan el cruce en
-- `precios.test.ts`.
--
-- **La categoría se APAGA, no se borra**, y no es una preferencia: `product.category_id` no lleva
-- `ON DELETE`, así que Postgres rechaza borrar una categoría con productos dentro. Y los productos
-- tampoco se pueden borrar — Mini Churros y Churros Loop tienen que seguir existiendo porque son
-- el destino de `producto_ref`, y los otros dos son historial de ventas. Es la regla 9: apagar.
-- Sigue viéndose y editándose en /admin/productos, que no filtra por `activa`.
--
-- Los cuatro bloques son idempotentes (NOT EXISTS / ON CONFLICT) y derivan `store_id` del
-- producto: nunca se hardcodea la tienda (regla 5).

-- 1. La lista. **La pregunta va en el `nombre` del grupo y no en la `etiqueta` del enganche**,
--    aunque la ficha lea `etiqueta ?? nombre`: el panel puede encender este upsell en otro
--    producto (Carta → Modificadores → Upsell) y el enganche que crea nace con `etiqueta` NULL,
--    así que con el texto en la etiqueta ese producto mostraría otro título.
--
--    `max_por_opcion = 5`: cinco porciones del mismo producto es de sobra para una mesa, y pone
--    un techo al stepper. Quien quiera más las pide como producto suelto... salvo que aquí ya no
--    lo son, así que si alguien se queja, este es el número que hay que subir.
INSERT INTO "modifier_group" ("store_id", "nombre", "tipo", "permite_cantidad", "max_por_opcion")
SELECT DISTINCT p."store_id", '¿Deseas agregar más churros?', 'upsell'::tipo_grupo, true, 5
  FROM "product" p
 WHERE p."slug" = 'mini-churros'
   AND NOT EXISTS (SELECT 1 FROM "modifier_group" g
                    WHERE g."store_id" = p."store_id"
                      AND g."nombre" = '¿Deseas agregar más churros?');--> statement-breakpoint

-- 2. Las dos opciones, cada una apuntando a su producto real.
--
--    `nombre` se copia del producto con el JOIN y no se escribe a mano: `calcularItem` usa
--    `opcion.nombre` para nombrar el upsell, y dejarlo desincronizado haría que el carrito dijera
--    una cosa y el checkout otra — el mismo acople que ya arregló la 0003 con las aguas.
--
--    `precio_delta = 0` porque aquí no se cobra nada: cada porción se cobra como item propio por
--    el `precio_base` de su producto (regla 8). Una cifra fija aquí sería una segunda fuente de
--    verdad que envejecería sola en cuanto alguien cambiara el precio desde el panel.
--
--    El `orden` mantiene Mini Churros antes que Churros Loop, que es como están hoy en la carta.
INSERT INTO "modifier_option" ("store_id", "group_id", "nombre", "precio_delta", "producto_ref", "orden")
SELECT g."store_id", g."id", p."nombre", 0, p."id", d."orden"
  FROM "modifier_group" g
  JOIN (VALUES ('mini-churros', 0), ('churros-loop', 1)) AS d(slug, orden) ON true
  JOIN "product" p ON p."store_id" = g."store_id" AND p."slug" = d.slug
 WHERE g."nombre" = '¿Deseas agregar más churros?'
   AND NOT EXISTS (SELECT 1 FROM "modifier_option" o
                    WHERE o."group_id" = g."id" AND o."producto_ref" = p."id");--> statement-breakpoint

-- 3. Los cuatro churros con helado que lo ofrecen. `porcion-de-helado` y `cronchy-cono` quedan
--    fuera a propósito: el primero es el upsell de otra lista y el segundo está oculto.
--
--    `min_select = 0` es la **invariante de los grupos upsell** y no un número suelto: la ficha no
--    pinta los grupos de tipo upsell de un producto sugerido, así que un mínimo mayor que cero
--    volvería imposible de añadir el producto — el cliente vería el botón bloqueado sin nada que
--    tocar.
--
--    `max_select = 10` topa la SUMA de las cantidades del grupo (ver `cantidadEnGrupo`), no cada
--    opción: es lo que impide que 5 + 5 se cuele estando las dos dentro de `max_por_opcion`.
--
--    `precio_unitario` en NULL: en un upsell nadie lee ese precio, y un número aquí solo podría
--    contradecir al producto.
--
--    orden 11, justo detrás del helado (10) y las bebidas (9). Da igual para la pantalla —la ficha
--    pinta todos los upsell al final— pero mantiene el orden entre ellos, que sí se nota, y
--    sobrevive a un guardado del panel.
INSERT INTO "product_modifier_group"
  ("store_id", "product_id", "group_id", "modo", "etiqueta",
   "min_select", "max_select", "precio_unitario", "avisar_incompleto", "colapsado", "orden")
SELECT p."store_id", p."id", g."id", 'adicional'::modo_grupo, NULL,
       0, 10, NULL, false, false, 11
  FROM "product" p
  JOIN "modifier_group" g
    ON g."store_id" = p."store_id" AND g."nombre" = '¿Deseas agregar más churros?'
 WHERE p."slug" IN ('cronchy-mega', 'cronchy-frutilla', 'chiqui-cronchy', 'cronchy-clasico')
ON CONFLICT ("product_id", "group_id", "modo") DO NOTHING;--> statement-breakpoint

-- 4. Apagar la categoría. **Va aquí y no antes**: si se apagara primero, quedaría una ventana en
--    la que Mini Churros y Churros Loop no están en la carta y todavía no se ofrecen desde ningún
--    churro, o sea imposibles de comprar por ningún camino. Dentro de la migración las dos cosas
--    ocurren en la misma transacción y esa ventana no existe.
--
--    Los productos NO se tocan: siguen `activo = true`, que es lo que los mantiene válidos como
--    `producto_ref`. La consulta que resuelve un upsell no filtra por categoría ni por
--    visibilidad, así que apagar la categoría no rompe nada.
UPDATE "category" SET "activa" = false WHERE "slug" = 'adicionales';--> statement-breakpoint

-- 5. La red de seguridad. Un JOIN por slug que no casa no falla: simplemente no engancha nada, y
--    la migración se daría por buena habiendo dejado la carta igual que estaba. Aquí se comprueban
--    las cuatro cosas que pueden salir mal —que falte alguno de los dos productos, que una opción
--    quedara sin `producto_ref` (una fila así rompe la ficha con `upsell_sin_producto`), que algún
--    churro no quedara enganchado, y que la categoría no se apagara— y se revienta con los slugs
--    concretos, que es lo que hace falta para arreglarlo.
DO $$
DECLARE
  ofrecidos text[] := ARRAY['mini-churros', 'churros-loop'];
  ofrecen   text[] := ARRAY['cronchy-mega', 'cronchy-frutilla', 'chiqui-cronchy', 'cronchy-clasico'];
  faltan text;
BEGIN
  SELECT string_agg(s, ', ') INTO faltan
    FROM unnest(ofrecidos) AS s
   WHERE NOT EXISTS (SELECT 1 FROM "product" p WHERE p."slug" = s);

  IF faltan IS NOT NULL THEN
    RAISE EXCEPTION 'Upsell de churros: no hay ningún producto con el slug %. Revisa la carta antes de reintentar.', faltan;
  END IF;

  SELECT string_agg(s, ', ') INTO faltan
    FROM unnest(ofrecidos) AS s
   WHERE NOT EXISTS (
     SELECT 1
       FROM "modifier_option" o
       JOIN "modifier_group" g ON g."id" = o."group_id"
       JOIN "product" p ON p."id" = o."producto_ref"
      WHERE g."nombre" = '¿Deseas agregar más churros?'
        AND g."tipo" = 'upsell'
        AND p."slug" = s
   );

  IF faltan IS NOT NULL THEN
    RAISE EXCEPTION 'Upsell de churros: la lista quedó sin una opción que apunte a %.', faltan;
  END IF;

  SELECT string_agg(s, ', ') INTO faltan
    FROM unnest(ofrecen) AS s
   WHERE NOT EXISTS (SELECT 1 FROM "product" p WHERE p."slug" = s);

  IF faltan IS NOT NULL THEN
    RAISE EXCEPTION 'Upsell de churros: no hay ningún producto con el slug %. Revisa la carta antes de reintentar.', faltan;
  END IF;

  SELECT string_agg(p."slug", ', ') INTO faltan
    FROM "product" p
   WHERE p."slug" = ANY(ofrecen)
     AND NOT EXISTS (
       SELECT 1
         FROM "product_modifier_group" pmg
         JOIN "modifier_group" g ON g."id" = pmg."group_id"
        WHERE pmg."product_id" = p."id"
          AND pmg."modo" = 'adicional'
          AND g."nombre" = '¿Deseas agregar más churros?'
     );

  IF faltan IS NOT NULL THEN
    RAISE EXCEPTION 'Upsell de churros: estos productos se quedaron sin ofrecerlo: %.', faltan;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "category" WHERE "slug" = 'adicionales' AND "activa" = false) THEN
    RAISE EXCEPTION 'Upsell de churros: la categoría adicionales no quedó apagada. ¿Cambió su slug?';
  END IF;
END $$;
