-- Qué explicarle al cliente sobre una lista de opciones.
--
-- NULL es el caso normal: una lista de salsas se entiende sola y no necesita texto. Lo que sí
-- lo necesita es "Azúcar y canela", porque sus opciones QUITAN algo que el churro ya trae
-- (ver 0019): sin decirlo, el cliente no sabe si tiene que elegir, ni qué le llega si no toca
-- nada, ni que lo de dentro son excepciones.
--
-- Va en `modifier_group` y no en `product_modifier_group` porque la explicación es de la lista,
-- no de cómo la engancha cada producto. `etiqueta` del enganche ya está ocupada: es el título
-- que sobrescribe al del grupo.
ALTER TABLE "modifier_group" ADD COLUMN "ayuda" text;--> statement-breakpoint

-- El texto inicial. `ayuda IS NULL` hace dos cosas a la vez: vuelve la migración idempotente y
-- —lo que importa— impide que reejecutarla pise lo que alguien haya escrito desde el panel.
--
-- Buscar por nombre está bien AQUÍ y no en el código: esto es una migración de datos que corre
-- una vez, sobre el nombre que la lista tiene hoy. La regla de no deducir nada del nombre del
-- grupo es para el comportamiento en caliente, que sí sobrevive a un renombrado.
UPDATE "modifier_group"
   SET "ayuda" = 'Tus churros van con azúcar y canela. Marca aquí solo si quieres quitar algo.'
 WHERE "nombre" = 'Azúcar y canela'
   AND "ayuda" IS NULL;
