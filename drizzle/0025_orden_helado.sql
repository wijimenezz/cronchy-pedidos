-- El helado se ofrece antes que las bebidas.
--
-- Lo que se puede mover y lo que no, porque no se deduce mirando la ficha:
--
--   * **Todo lo que se elige va antes que todo lo que se ofrece.** La ficha pinta primero los
--     grupos de tipo `seleccion` y después los de tipo `upsell`, en dos recorridos separados, así
--     que ningún `orden` puede meter el helado por encima de "Azúcar y canela" — ya está debajo, y
--     seguirá estándolo.
--   * **Entre los upsell manda `product_modifier_group.orden`**, y eso es lo único que hay que
--     tocar aquí: el helado pasa de 10 a 8 y queda por delante de las bebidas, que están en 9.
--
-- No hay forma de hacerlo desde el panel: la sección "Ofrecer también" solo enciende y apaga.
-- El orden sí sobrevive a un guardado, porque `planificarEngancles` renumera los upsell
-- (100, 101…) respetando el orden en que los encuentra.

UPDATE "product_modifier_group" AS pmg
   SET "orden" = 8
  FROM "modifier_group" g
 WHERE g."id" = pmg."group_id"
   AND g."nombre" = '¿Deseas agregar helado?';--> statement-breakpoint

-- La red de seguridad: en todo producto que ofrezca las dos cosas, el helado tiene que quedar
-- primero. Un UPDATE que no encuentra su fila no falla —se queda en cero filas y la migración se
-- da por buena—, y aquí eso significaría no haber movido nada.
DO $$
DECLARE
  desordenados text;
BEGIN
  SELECT string_agg(p."slug", ', ') INTO desordenados
    FROM "product" p
    JOIN "product_modifier_group" ph ON ph."product_id" = p."id"
    JOIN "modifier_group" gh ON gh."id" = ph."group_id" AND gh."nombre" = '¿Deseas agregar helado?'
    JOIN "product_modifier_group" pb ON pb."product_id" = p."id"
    JOIN "modifier_group" gb ON gb."id" = pb."group_id" AND gb."nombre" = '¿Deseas agregar una bebida?'
   WHERE ph."orden" >= pb."orden";

  IF desordenados IS NOT NULL THEN
    RAISE EXCEPTION 'Orden del helado: en % sigue quedando detrás de las bebidas.', desordenados;
  END IF;
END $$;
