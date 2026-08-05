import { pgTable, unique, uuid, text, boolean, timestamp, foreignKey, check, smallint, time, date, integer, index, bigint, serial, jsonb, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { geometria } from "./tipos-geo"

export const estadoPedido = pgEnum("estado_pedido", ['nuevo', 'aceptado', 'preparando', 'en_camino', 'listo', 'entregado', 'cancelado'])
export const metodoPago = pgEnum("metodo_pago", ['efectivo', 'nequi', 'transferencia', 'datafono'])
export const modoGrupo = pgEnum("modo_grupo", ['incluido', 'adicional'])
export const rolUsuario = pgEnum("rol_usuario", ['admin', 'colaborador'])
export const tipoGrupo = pgEnum("tipo_grupo", ['seleccion', 'upsell'])
export const tipoPedido = pgEnum("tipo_pedido", ['domicilio', 'recoger'])


export const store = pgTable("store", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	slug: text().notNull(),
	nombre: text().notNull(),
	telefono: text(),
	direccion: text(),
	timezone: text().default('America/Bogota').notNull(),
	// Dónde queda el local. Centra el mapa de zonas en el panel y, sobre todo, el del
	// checkout cuando el cliente niega el permiso de ubicación (regla 14).
	ubicacion: geometria("ubicacion", { tipo: "Point" }),
	aceptaPedidos: boolean("acepta_pedidos").default(true).notNull(),
	mensajeCerrado: text("mensaje_cerrado"),
	// El rango que se le promete al cliente en "lo más pronto posible" ("Llega en 30–45 min").
	// Se edita desde el panel: el día que la cocina va lenta se sube sin desplegar. El máximo
	// es además la anticipación mínima de una hora programada — nadie programa para dentro de
	// cinco minutos.
	minutosEstimadoMin: integer("minutos_estimado_min").default(30).notNull(),
	minutosEstimadoMax: integer("minutos_estimado_max").default(45).notNull(),
	nequiTitular: text("nequi_titular"),
	nequiNumero: text("nequi_numero"),
	nequiLlave: text("nequi_llave"),
	nequiLlaveTitular: text("nequi_llave_titular"),
	whatsappUrl: text("whatsapp_url"),
	instagramUrl: text("instagram_url"),
	tiktokUrl: text("tiktok_url"),
	googleResenasUrl: text("google_resenas_url"),
	creadoEn: timestamp("creado_en", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("store_slug_key").on(table.slug),
	check(
		"store_estimado_check",
		sql`minutos_estimado_min > 0 AND minutos_estimado_max >= minutos_estimado_min`,
	),
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
	rol: rolUsuario().default('colaborador').notNull(),
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
	// Default `{}` y no `{""}`: un producto sin fotos tiene CERO fotos, no una foto vacía.
	// El CHECK es el tope de 3 de CLAUDE.md, aplicado también en el servidor.
	imagenes: text().array().default([]).notNull(),
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
	check("product_imagenes_check", sql`cardinality(imagenes) <= 3`),
]);

export const modifierGroup = pgTable("modifier_group", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeId: uuid("store_id").notNull(),
	nombre: text().notNull(),
	tipo: tipoGrupo().default('seleccion').notNull(),
	permiteCantidad: boolean("permite_cantidad").default(false).notNull(),
	maxPorOpcion: integer("max_por_opcion"),
	// Archivar y no borrar (regla 9): una lista con `activo = false` no se puede enganchar a
	// productos nuevos y desaparece de "Qué hay hoy", pero NO toca la carta pública ni los
	// productos que ya la usan. Quitarle las salsas a un churro que exige elegir una lo
	// dejaría imposible de añadir al carrito (regla 4).
	activo: boolean().default(true).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.storeId],
			foreignColumns: [store.id],
			name: "modifier_group_store_id_fkey"
		}).onDelete("cascade"),
]);

export const modifierOption = pgTable("modifier_option", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeId: uuid("store_id").notNull(),
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
			columns: [table.storeId],
			foreignColumns: [store.id],
			name: "modifier_option_store_id_fkey"
		}).onDelete("cascade"),
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
	storeId: uuid("store_id").notNull(),
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
			columns: [table.storeId],
			foreignColumns: [store.id],
			name: "product_modifier_group_store_id_fkey"
		}).onDelete("cascade"),
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
	nombre: text().notNull(),
	precio: integer().notNull(),
	// Nullable: una zona recién creada todavía no está dibujada, y las que venían del
	// modelo por barrio esperan a que el admin les trace el contorno. `zonas.ts` ignora
	// las que no tienen polígono: sin geometría no pueden cubrir ningún punto.
	poligono: geometria("poligono", { tipo: "Polygon" }),
	prioridad: integer().default(0).notNull(),
	color: text(),
	activa: boolean().default(true).notNull(),
}, (table) => [
	// GiST es el índice que sabe responder ST_Covers. Se declara como expresión cruda a
	// propósito: con `table.poligono.asc()` Drizzle emitiría `ASC NULLS LAST`, que gist rechaza.
	index("idx_delivery_zone_poligono").using("gist", sql`${table.poligono}`),
	index("idx_delivery_zone_prioridad").using("btree", table.storeId.asc().nullsLast().op("uuid_ops"), table.prioridad.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.storeId],
			foreignColumns: [store.id],
			name: "delivery_zone_store_id_fkey"
		}).onDelete("cascade"),
	unique("delivery_zone_store_id_nombre_key").on(table.storeId, table.nombre),
	// Regla 13: no existe zona a $0. El domicilio lo ejecuta un courier externo y siempre se cobra.
	check("delivery_zone_precio_check", sql`precio > 0`),
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
	clienteEmail: text("cliente_email"),
	clienteCumple: date("cliente_cumple"),
	recibeNombre: text("recibe_nombre"),
	recibeTelefono: text("recibe_telefono"),
	zonaId: uuid("zona_id"),
	// Snapshot de la zona (regla 2 aplicada al domicilio, regla 13): editar o eliminar una
	// zona jamás debe alterar un pedido ya creado. `zona_id` se queda solo para reportes
	// agregados, igual que `order_item.product_id`.
	zonaNombre: text("zona_nombre"),
	// El pin que el cliente confirmó (regla 14). Es lo que determinó el costo del domicilio;
	// la dirección escrita es referencia para el domiciliario y no participa en el cálculo.
	punto: geometria("punto", { tipo: "Point" }),
	direccion: text(),
	// El barrio que el cliente dejó escrito. NO es `zona_nombre` y confundirlos fue el bug:
	// la zona parte el mapa para cobrar, el barrio lo lee el domiciliario. Se sugiere desde el
	// pin (OSM) pero manda lo escrito, porque lo que sirve es el nombre que la gente usa.
	barrio: text(),
	indicaciones: text(),
	notas: text(),
	metodoPago: metodoPago("metodo_pago").notNull(),
	// Con cuánto billete va a pagar, para que el domiciliario lleve la devuelta. Solo aplica
	// a efectivo y es opcional: NULL significa "no lo dijo", no "paga justo".
	pagaCon: integer("paga_con"),
	comprobanteUrl: text("comprobante_url"),
	subtotal: integer().notNull(),
	costoDomicilio: integer("costo_domicilio").default(0).notNull(),
	descuento: integer().default(0).notNull(),
	total: integer().notNull(),
	// La hora que el cliente eligió, o NULL si pidió "lo más pronto posible". El nullable ES
	// el modelo: un booleano al lado admitiría "programado sin hora" y la base no podría
	// impedirlo. Es un instante absoluto, no un "19:00": la conversión desde la hora de Bogotá
	// se hace una sola vez, en el servidor (regla 6).
	programadoPara: timestamp("programado_para", { withTimezone: true, mode: 'string' }),
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
	// Un domicilio sin pin ya no es posible: el pin es lo que determinó el precio (regla 14),
	// y sin él no se puede reconstruir por qué se cobró lo que se cobró.
	check(
		"order_check",
		sql`(tipo = 'recoger'::tipo_pedido) OR (direccion IS NOT NULL AND punto IS NOT NULL)`,
	),
]);

export const orderItem = pgTable("order_item", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeId: uuid("store_id").notNull(),
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
			columns: [table.storeId],
			foreignColumns: [store.id],
			name: "order_item_store_id_fkey"
		}),
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
	storeId: uuid("store_id").notNull(),
	orderId: uuid("order_id").notNull(),
	estado: estadoPedido().notNull(),
	userId: uuid("user_id"),
	notificadoEn: timestamp("notificado_en", { withTimezone: true, mode: 'string' }),
	creadoEn: timestamp("creado_en", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.storeId],
			foreignColumns: [store.id],
			name: "order_status_event_store_id_fkey"
		}),
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
