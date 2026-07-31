-- El corte: el domicilio deja de cobrarse por barrio escrito a mano.
--
-- Hasta ahora convivían dos caminos. El viejo (US11): el cliente elegía su barrio de una
-- lista y, si no aparecía, lo escribía; el pedido entraba con `domicilio_por_confirmar` y
-- $0 de domicilio, y el negocio acordaba el valor por chat después. El nuevo (reglas 13 y
-- 14): el cliente confirma un pin en el mapa y el costo sale del polígono que lo cubre.
--
-- Se queda el nuevo. Fuera de cobertura el checkout ya no deja confirmar: ofrece un
-- WhatsApp con el carrito y el link al pin para que la tienda cotice. Un pedido con
-- "domicilio por confirmar" es un total que el cliente ve y no es el que va a pagar, y eso
-- es justo lo que este proyecto vino a quitar.
--
-- Se hace ahora que `order` está vacía: sin historial no hay backfill ni pedidos viejos que
-- queden sin poder mostrar su barrio.

ALTER TABLE "order" DROP COLUMN "barrio_texto";--> statement-breakpoint
ALTER TABLE "order" DROP COLUMN "domicilio_por_confirmar";--> statement-breakpoint

-- El CHECK pasa a exigir también el pin en los domicilios: es lo que determinó el precio, y
-- sin él no se puede reconstruir por qué se cobró lo que se cobró. `recoger` sigue sin
-- necesitar ni dirección ni punto.
ALTER TABLE "order" DROP CONSTRAINT "order_check";--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_check"
  CHECK ((tipo = 'recoger'::tipo_pedido) OR (direccion IS NOT NULL AND punto IS NOT NULL));
