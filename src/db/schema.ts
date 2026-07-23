import { pgTable, unique, uuid, text, boolean, timestamp, foreignKey, check, smallint, time, date, integer, index, bigint, serial, jsonb, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const estadoPedido = pgEnum("estado_pedido", ['nuevo', 'aceptado', 'preparando', 'en_camino', 'listo', 'entregado', 'cancelado'])
export const metodoPago = pgEnum("metodo_pago", ['efectivo', 'nequi', 'transferencia', 'datafono'])
export const modoGrupo = pgEnum("modo_grupo", ['incluido', 'adicional'])
export const rolUsuario = pgEnum("rol_usuario", ['admin', 'empleado'])
export const tipoGrupo = pgEnum("tipo_grupo", ['seleccion', 'upsell'])
export const tipoPedido = pgEnum("tipo_pedido", ['domicilio', 'recoger'])


export const store = pgTable("store", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	slug: text().notNull(),
	nombre: text().notNull(),
	telefono: text(),
	direccion: text(),
	timezone: text().default('America/Bogota').notNull(),
	aceptaPedidos: boolean("acepta_pedidos").default(true).notNull(),
	mensajeCerrado: text("mensaje_cerrado"),
	nequiTitular: text("nequi_titular"),
	nequiNumero: text("nequi_numero"),
	creadoEn: timestamp("creado_en", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("store_slug_key").on(table.slug),
]);

export const storeHours = pgTable("store_hours", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeId: uuid("store_id").notNull(),
	diaSemana: smallint("dia_semana").notNull(),
	abre: time().notNull(),
	cierra: time().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.storeId],
			foreignColumns: [store.id],
			name: "store_hours_store_id_fkey"
		}).onDelete("cascade"),
	check("store_hours_check", sql`cierra > abre`),
	check("store_hours_dia_semana_check", sql`(dia_semana >= 0) AND (dia_semana <= 6)`),
]);

export const storeClosure = pgTable("store_closure", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeId: uuid("store_id").notNull(),
	fecha: date().notNull(),
	cerrado: boolean().default(true).notNull(),
	abre: time(),
	cierra: time(),
	motivo: text(),
}, (table) => [
	foreignKey({
			columns: [table.storeId],
			foreignColumns: [store.id],
			name: "store_closure_store_id_fkey"
		}).onDelete("cascade"),
	unique("store_closure_store_id_fecha_key").on(table.storeId, table.fecha),
]);

export const appUser = pgTable("app_user", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeId: uuid("store_id").notNull(),
	email: text().notNull(),
	nombre: text().notNull(),
	passwordHash: text("password_hash").notNull(),
	rol: rolUsuario().default('empleado').notNull(),
	activo: boolean().default(true).notNull(),
	creadoEn: timestamp("creado_en", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.storeId],
			foreignColumns: [store.id],
			name: "app_user_store_id_fkey"
		}).onDelete("cascade"),
	unique("app_user_email_key").on(table.email),
]);

export const category = pgTable("category", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeId: uuid("store_id").notNull(),
	nombre: text().notNull(),
	slug: text().notNull(),
	bannerUrl: text("banner_url"),
	orden: integer().default(0).notNull(),
	activa: boolean().default(true).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.storeId],
			foreignColumns: [store.id],
			name: "category_store_id_fkey"
		}).onDelete("cascade"),
	unique("category_store_id_slug_key").on(table.storeId, table.slug),
]);

export const product = pgTable("product", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeId: uuid("store_id").notNull(),
	categoryId: uuid("category_id").notNull(),
	nombre: text().notNull(),
	slug: text().notNull(),
	descripcion: text(),
	precioBase: integer("precio_base").notNull(),
	imagenes: text().array().default([""]).notNull(),
	recomendado: boolean().default(false).notNull(),
	activo: boolean().default(true).notNull(),
	disponible: boolean().default(true).notNull(),
	disponibleDelivery: boolean("disponible_delivery").default(true).notNull(),
	disponiblePickup: boolean("disponible_pickup").default(true).notNull(),
	orden: integer().default(0).notNull(),
}, (table) => [
	index("idx_product_cat").using("btree", table.storeId.asc().nullsLast().op("int4_ops"), table.categoryId.asc().nullsLast().op("uuid_ops"), table.orden.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [category.id],
			name: "product_category_id_fkey"
		}),
	foreignKey({
			columns: [table.storeId],
			foreignColumns: [store.id],
			name: "product_store_id_fkey"
		}).onDelete("cascade"),
	unique("product_store_id_slug_key").on(table.storeId, table.slug),
	check("product_precio_base_check", sql`precio_base >= 0`),
]);

export const modifierGroup = pgTable("modifier_group", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeId: uuid("store_id").notNull(),
	nombre: text().notNull(),
	tipo: tipoGrupo().default('seleccion').notNull(),
	permiteCantidad: boolean("permite_cantidad").default(false).notNull(),
	maxPorOpcion: integer("max_por_opcion"),
}, (table) => [
	foreignKey({
			columns: [table.storeId],
			foreignColumns: [store.id],
			name: "modifier_group_store_id_fkey"
		}).onDelete("cascade"),
]);

export const modifierOption = pgTable("modifier_option", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	groupId: uuid("group_id").notNull(),
	nombre: text().notNull(),
	precioDelta: integer("precio_delta").default(0).notNull(),
	imagenUrl: text("imagen_url"),
	productoRef: uuid("producto_ref"),
	recomendado: boolean().default(false).notNull(),
	disponible: boolean().default(true).notNull(),
	orden: integer().default(0).notNull(),
}, (table) => [
	index("idx_option_group").using("btree", table.groupId.asc().nullsLast().op("int4_ops"), table.orden.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.groupId],
			foreignColumns: [modifierGroup.id],
			name: "modifier_option_group_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.productoRef],
			foreignColumns: [product.id],
			name: "modifier_option_producto_ref_fkey"
		}),
]);

export const productModifierGroup = pgTable("product_modifier_group", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	productId: uuid("product_id").notNull(),
	groupId: uuid("group_id").notNull(),
	modo: modoGrupo().default('incluido').notNull(),
	etiqueta: text(),
	minSelect: integer("min_select").default(0).notNull(),
	maxSelect: integer("max_select").default(1).notNull(),
	precioUnitario: integer("precio_unitario"),
	avisarIncompleto: boolean("avisar_incompleto").default(false).notNull(),
	colapsado: boolean().default(false).notNull(),
	orden: integer().default(0).notNull(),
}, (table) => [
	index("idx_pmg_product").using("btree", table.productId.asc().nullsLast().op("int4_ops"), table.orden.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.groupId],
			foreignColumns: [modifierGroup.id],
			name: "product_modifier_group_group_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [product.id],
			name: "product_modifier_group_product_id_fkey"
		}).onDelete("cascade"),
	unique("product_modifier_group_product_id_group_id_modo_key").on(table.productId, table.groupId, table.modo),
	check("product_modifier_group_check", sql`max_select >= min_select`),
]);

export const deliveryZone = pgTable("delivery_zone", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeId: uuid("store_id").notNull(),
	barrio: text().notNull(),
	precio: integer().notNull(),
	activa: boolean().default(true).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.storeId],
			foreignColumns: [store.id],
			name: "delivery_zone_store_id_fkey"
		}).onDelete("cascade"),
	unique("delivery_zone_store_id_barrio_key").on(table.storeId, table.barrio),
	check("delivery_zone_precio_check", sql`precio >= 0`),
]);

export const customer = pgTable("customer", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeId: uuid("store_id").notNull(),
	telefono: text().notNull(),
	nombre: text(),
	totalPedidos: integer("total_pedidos").default(0).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalGastado: bigint("total_gastado", { mode: "number" }).default(0).notNull(),
	ultimoPedido: timestamp("ultimo_pedido", { withTimezone: true, mode: 'string' }),
	creadoEn: timestamp("creado_en", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_customer_tel").using("btree", table.storeId.asc().nullsLast().op("text_ops"), table.telefono.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.storeId],
			foreignColumns: [store.id],
			name: "customer_store_id_fkey"
		}).onDelete("cascade"),
	unique("customer_store_id_telefono_key").on(table.storeId, table.telefono),
]);

export const order = pgTable("order", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeId: uuid("store_id").notNull(),
	numero: serial().notNull(),
	tokenPublico: text("token_publico").default(sql`encode(gen_random_bytes(16), 'hex'::text)`).notNull(),
	tipo: tipoPedido().notNull(),
	estado: estadoPedido().default('nuevo').notNull(),
	customerId: uuid("customer_id"),
	clienteNombre: text("cliente_nombre").notNull(),
	clienteTelefono: text("cliente_telefono").notNull(),
	zonaId: uuid("zona_id"),
	barrioTexto: text("barrio_texto"),
	direccion: text(),
	indicaciones: text(),
	domicilioPorConfirmar: boolean("domicilio_por_confirmar").default(false).notNull(),
	notas: text(),
	metodoPago: metodoPago("metodo_pago").notNull(),
	comprobanteUrl: text("comprobante_url"),
	pagaCon: integer("paga_con"),
	subtotal: integer().notNull(),
	costoDomicilio: integer("costo_domicilio").default(0).notNull(),
	descuento: integer().default(0).notNull(),
	total: integer().notNull(),
	creadoEn: timestamp("creado_en", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_order_estado").using("btree", table.storeId.asc().nullsLast().op("timestamptz_ops"), table.estado.asc().nullsLast().op("uuid_ops"), table.creadoEn.desc().nullsFirst().op("enum_ops")),
	index("idx_order_fecha").using("btree", table.storeId.asc().nullsLast().op("uuid_ops"), table.creadoEn.desc().nullsFirst().op("uuid_ops")),
	foreignKey({
			columns: [table.customerId],
			foreignColumns: [customer.id],
			name: "order_customer_id_fkey"
		}),
	foreignKey({
			columns: [table.storeId],
			foreignColumns: [store.id],
			name: "order_store_id_fkey"
		}),
	foreignKey({
			columns: [table.zonaId],
			foreignColumns: [deliveryZone.id],
			name: "order_zona_id_fkey"
		}),
	unique("order_token_publico_key").on(table.tokenPublico),
	check("order_check", sql`(tipo = 'recoger'::tipo_pedido) OR (direccion IS NOT NULL)`),
]);

export const orderItem = pgTable("order_item", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orderId: uuid("order_id").notNull(),
	productId: uuid("product_id"),
	cantidad: integer().notNull(),
	precioUnitario: integer("precio_unitario").notNull(),
	subtotal: integer().notNull(),
	snapshot: jsonb().notNull(),
	orden: integer().default(0).notNull(),
}, (table) => [
	index("idx_order_item_order").using("btree", table.orderId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [order.id],
			name: "order_item_order_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [product.id],
			name: "order_item_product_id_fkey"
		}),
	check("order_item_cantidad_check", sql`cantidad > 0`),
]);

export const orderStatusEvent = pgTable("order_status_event", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orderId: uuid("order_id").notNull(),
	estado: estadoPedido().notNull(),
	userId: uuid("user_id"),
	notificadoEn: timestamp("notificado_en", { withTimezone: true, mode: 'string' }),
	creadoEn: timestamp("creado_en", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [order.id],
			name: "order_status_event_order_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [appUser.id],
			name: "order_status_event_user_id_fkey"
		}),
]);
