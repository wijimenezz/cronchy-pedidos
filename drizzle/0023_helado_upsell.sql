-- Ofrecer la porción de helado desde los churros para compartir y desde las dos bebidas frías.
--
-- Es la misma mecánica que ya usa "¿Deseas agregar una bebida?": una lista de tipo `upsell`
-- cuyas opciones apuntan a un producto real con `producto_ref`, de modo que lo elegido entra al
-- pedido como su propio `order_item` y no como un modificador del churro (regla 8). El cliente
-- elige el sabor y el tamaño sin salir de la ficha, porque la ficha pinta los grupos del
-- producto referenciado.
--
-- **La porción de helado vale $0 de base**: su precio entero vive en cada opción de "Tamaño
-- Helado" (Pequeño $4.000, Mediano $8.000). Eso no le afecta a esta migración —el servidor la
-- cobra recalculando el producto, como a cualquier item— pero sí explica el `precio_delta = 0`
-- del bloque 2.
--
-- Los tres bloques son idempotentes (NOT EXISTS / ON CONFLICT) y derivan `store_id` del
-- producto: nunca se hardcodea la tienda (regla 5).

-- 1. La lista. **La pregunta va en el `nombre` del grupo y no en la `etiqueta` del enganche**,
--    aunque la ficha lea `etiqueta ?? nombre`: el panel puede encender este upsell en otro
--    producto (Carta → Modificadores → Upsell) y el enganche que crea nace con `etiqueta` NULL,
--    así que con el texto en la etiqueta ese producto mostraría otro título. Se llama como su
--    hermana, "¿Deseas agregar una bebida?", porque las dos se leen seguidas en la misma ficha.
INSERT INTO "modifier_group" ("store_id", "nombre", "tipo", "permite_cantidad")
SELECT DISTINCT p."store_id", '¿Deseas agregar helado?', 'upsell'::tipo_grupo, false
  FROM "product" p
 WHERE p."slug" = 'porcion-de-helado'
   AND NOT EXISTS (SELECT 1 FROM "modifier_group" g
                    WHERE g."store_id" = p."store_id"
                      AND g."nombre" = '¿Deseas agregar helado?');--> statement-breakpoint

-- 2. La única opción, apuntando al producto real.
--
--    `nombre` se copia del producto y no se escribe a mano: `calcularItem` usa `opcion.nombre`
--    para nombrar el upsell, y dejarlo desincronizado haría que el carrito dijera una cosa y el
--    checkout otra — es el mismo acople que ya arregló la 0003 con las aguas.
--
--    `precio_delta = 0` porque aquí no se cobra nada: el helado se cobra como item propio con
--    su base más el tamaño elegido (regla 8). Cualquier cifra fija sería falsa para al menos uno
--    de los dos tamaños. Lo que la ficha muestra en esta fila es el mínimo real del producto
--    ("desde $4.000"), no este número.
INSERT INTO "modifier_option" ("store_id", "group_id", "nombre", "precio_delta", "producto_ref", "orden")
SELECT g."store_id", g."id", p."nombre", 0, p."id", 0
  FROM "modifier_group" g
  JOIN "product" p ON p."store_id" = g."store_id" AND p."slug" = 'porcion-de-helado'
 WHERE g."nombre" = '¿Deseas agregar helado?'
   AND NOT EXISTS (SELECT 1 FROM "modifier_option" o
                    WHERE o."group_id" = g."id" AND o."producto_ref" = p."id");--> statement-breakpoint

-- 3. Los cinco productos que lo ofrecen: los tres churros para compartir y las dos bebidas
--    frías. El resto de la categoría "Churros con Helado" queda fuera a propósito: ya lleva
--    helado dentro.
--
--    `min_select = 0` es la **invariante de los grupos upsell** y no un número suelto: la ficha
--    no pinta los grupos de tipo upsell de un producto sugerido, así que un mínimo mayor que
--    cero volvería imposible de añadir al Latte Frío pedido desde un churro — el cliente vería
--    el botón bloqueado sin nada que tocar. `max_select = 1` con `permite_cantidad = false`
--    deja un solo helado por churro; quien quiera dos los agrega desde la carta.
--
--    `precio_unitario` en NULL: en un upsell nadie lee ese precio, y un número aquí solo podría
--    contradecir al producto.
--
--    orden 10, justo detrás de las bebidas (9). Da igual para la pantalla —la ficha pinta todos
--    los upsell al final, después de lo que se elige— pero mantiene el orden entre ellos, que sí
--    se nota, y sobrevive a un guardado del panel (`planificarEngancles` renumera a 100, 101
--    respetando el orden que encuentra).
INSERT INTO "product_modifier_group"
  ("store_id", "product_id", "group_id", "modo", "etiqueta",
   "min_select", "max_select", "precio_unitario", "avisar_incompleto", "colapsado", "orden")
SELECT p."store_id", p."id", g."id", 'adicional'::modo_grupo, NULL,
       0, 1, NULL, false, false, 10
  FROM "product" p
  JOIN "modifier_group" g
    ON g."store_id" = p."store_id" AND g."nombre" = '¿Deseas agregar helado?'
 WHERE p."slug" IN (
    'cronchy-churros', 'cronchy-amigos', 'cronchy-familiar', 'latte-frio', 'frappe'
 )
ON CONFLICT ("product_id", "group_id", "modo") DO NOTHING;--> statement-breakpoint

-- 4. La red de seguridad. Un JOIN por slug que no casa no falla: simplemente no engancha nada, y
--    la migración se daría por buena habiendo dejado la carta igual que estaba. Aquí se
--    comprueban las tres cosas que pueden salir mal —que falte el helado, que la opción quedara
--    sin `producto_ref` (una fila así rompe la ficha con `upsell_sin_producto`) y que algún
--    producto no quedara enganchado— y se revienta con los slugs concretos, que es lo que hace
--    falta para arreglarlo.
DO $$
DECLARE
  ofrecen text[] := ARRAY[
    'cronchy-churros', 'cronchy-amigos', 'cronchy-familiar', 'latte-frio', 'frappe'
  ];
  sin_producto text;
  sin_enganche text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "product" WHERE "slug" = 'porcion-de-helado') THEN
    RAISE EXCEPTION 'Upsell de helado: no hay ningún producto con el slug porcion-de-helado. Revisa la carta antes de reintentar.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM "modifier_option" o
      JOIN "modifier_group" g ON g."id" = o."group_id"
      JOIN "product" p ON p."id" = o."producto_ref"
     WHERE g."nombre" = '¿Deseas agregar helado?'
       AND g."tipo" = 'upsell'
       AND p."slug" = 'porcion-de-helado'
  ) THEN
    RAISE EXCEPTION 'Upsell de helado: la lista quedó sin una opción que apunte a porcion-de-helado.';
  END IF;

  SELECT string_agg(s, ', ') INTO sin_producto
    FROM unnest(ofrecen) AS s
   WHERE NOT EXISTS (SELECT 1 FROM "product" p WHERE p."slug" = s);

  IF sin_producto IS NOT NULL THEN
    RAISE EXCEPTION 'Upsell de helado: no hay ningún producto con el slug %. Revisa la carta antes de reintentar.', sin_producto;
  END IF;

  SELECT string_agg(p."slug", ', ') INTO sin_enganche
    FROM "product" p
   WHERE p."slug" = ANY(ofrecen)
     AND NOT EXISTS (
       SELECT 1
         FROM "product_modifier_group" pmg
         JOIN "modifier_group" g ON g."id" = pmg."group_id"
        WHERE pmg."product_id" = p."id"
          AND pmg."modo" = 'adicional'
          AND g."nombre" = '¿Deseas agregar helado?'
     );

  IF sin_enganche IS NOT NULL THEN
    RAISE EXCEPTION 'Upsell de helado: estos productos se quedaron sin ofrecerlo: %.', sin_enganche;
  END IF;
END $$;
