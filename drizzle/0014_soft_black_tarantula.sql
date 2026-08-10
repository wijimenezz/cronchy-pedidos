-- Pedido programado. Retira el no-objetivo de PRD.md ("No hay pedidos programados ni franjas
-- horarias") y le da respaldo en la base a `horaEntregaEstimada`, que llevaba desde el primer
-- commit escrita en las plantillas de WhatsApp sin ninguna columna detrás.
--
-- `programado_para` NULL significa "lo más pronto posible", y ese nullable ES el modelo: un
-- booleano al lado de la fecha admitiría la fila imposible "programado sin hora" y ningún
-- CHECK razonable lo impediría. Es timestamptz, o sea un instante absoluto: la hora de Bogotá
-- que eligió el cliente se convierte una sola vez, en el servidor (regla 6). Guardar "19:00"
-- obligaría a reinterpretarla en cada lectura.
ALTER TABLE "order" ADD COLUMN "programado_para" timestamp with time zone;--> statement-breakpoint

-- El rango que se promete en "lo más pronto posible" ("Llega en 30–45 min"), editable desde el
-- panel para el día que la cocina va lenta. El máximo hace además de anticipación mínima de
-- una hora programada: sin él, el cliente programaría para dentro de cinco minutos y
-- "programado" no significaría nada.
ALTER TABLE "store" ADD COLUMN "minutos_estimado_min" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "store" ADD COLUMN "minutos_estimado_max" integer DEFAULT 45 NOT NULL;--> statement-breakpoint
ALTER TABLE "store" ADD CONSTRAINT "store_estimado_check" CHECK (minutos_estimado_min > 0 AND minutos_estimado_max >= minutos_estimado_min);
