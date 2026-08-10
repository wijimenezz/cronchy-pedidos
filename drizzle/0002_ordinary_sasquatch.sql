-- Cambio de regla de negocio: lo que un producto INCLUYE deja de ser opcional.
--
-- Antes, los grupos de Salsas y Toppings incluidos usaban `avisar_incompleto`: mostraban
-- un aviso suave ("te falta elegir tu salsa") pero dejaban añadir al carrito igual. Ahora
-- son obligatorios — si el Familiar trae 4 salsas, el cliente elige las 4 o no puede
-- continuar. Es la misma mecánica que ya usaba "Sabor de helado".
--
-- `min_select = max_select` resuelve de una vez las cantidades reales de cada producto,
-- porque los max ya estaban bien configurados:
--   Clásico / Chiqui / Frutilla / Ring  ->  1 salsa + 1 topping
--   Cronchy Mega                        ->  1 salsa + 2 toppings
--   Cronchy Amigos                      ->  2 salsas
--   Cronchy Familiar                    ->  4 salsas
--   Cronchy Churros                     ->  1 salsa
--
-- El filtro por `avisar_incompleto = true` deja fuera "Sabor de helado" (que ya bloqueaba)
-- y hace la migración idempotente: al terminar no queda ninguna fila que cumpla el WHERE.
-- Los grupos en modo 'adicional' (las salsas de pago) no se tocan: siguen siendo opcionales.

UPDATE "product_modifier_group"
   SET "min_select" = "max_select",
       "avisar_incompleto" = false
 WHERE "modo" = 'incluido'
   AND "avisar_incompleto" = true;
