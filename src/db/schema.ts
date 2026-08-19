import { pgTable, unique, uniqueIndex, primaryKey, uuid, text, boolean, timestamp, foreignKey, check, smallint, time, date, integer, index, bigint, serial, jsonb, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { geometria } from "./tipos-geo"

/**
 * TODAS las tablas llevan `.enableRLS()`, y ninguna lleva políticas. Es a propósito.
 *
 * Una tabla con RLS y cero políticas **deniega todo** a cualquier rol que no salte RLS, que es
 * exactamente el contrato de este proyecto: a la base se entra por `DATABASE_URL` —el rol
 * `postgres`, que tiene `bypassrls` y es dueño de estas tablas— y por ningún otro sitio. La app no
 * usa PostgREST, ni `supabase-js`, ni la llave `anon`.
 *
 * Antes no estaba activado y la consecuencia era real, no teórica: con la llave `anon` —un secreto
 * que vive en un dashboard, no en el código— se podían leer y escribir las 20 tablas, incluidos el
 * teléfono y la dirección de cada cliente y el hash de la clave del panel. Supabase lo reporta como
 * `rls_disabled_in_public`.
 *
 * **Una tabla nueva nace SIN RLS**: hay que acordarse del `.enableRLS()`. Si se olvida, lo vuelve a
 * cazar el linter de Supabase.
 *
 * **Lo que NO se debe hacer nunca aquí: `FORCE ROW LEVEL SECURITY`.** Con eso el dueño dejaría de
 * saltar RLS y, sin políticas, la aplicación entera se quedaría sin poder leer nada.
 */

export const alcanceCupon = pgEnum("alcance_cupon", ['todo', 'seleccion'])
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
	// `nequi_titular` y `nequi_numero` ya NO se muestran en el checkout: el pago se pide por
	// llave y QR. Se conservan escritas por si hubiera que volver atrás, pero hoy no las lee
	// nadie — no las uses como fuente de nada.
	nequiTitular: text("nequi_titular"),
	nequiNumero: text("nequi_numero"),
	nequiLlave: text("nequi_llave"),
	nequiLlaveTitular: text("nequi_llave_titular"),
	// El QR interoperable de Bre-B, en el bucket público. Es una URL y no un archivo del repo
	// para poder cambiarlo desde el panel: rotarlo no puede depender de un despliegue.
	nequiQrUrl: text("nequi_qr_url"),
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
]).enableRLS();

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
]).enableRLS();

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
]).enableRLS();

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
]).enableRLS();

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
]).enableRLS();

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
]).enableRLS();

export const modifierGroup = pgTable("modifier_group", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeId: uuid("store_id").notNull(),
	nombre: text().notNull(),
	tipo: tipoGrupo().default('seleccion').notNull(),
	// Lo que hay que explicarle al cliente sobre esta sección, editable desde /admin/opciones.
	// NULL = no hace falta explicar nada, que es el caso de casi todas: una lista de salsas se
	// entiende sola. "Azúcar y canela" no, porque sus opciones QUITAN algo que el churro ya
	// trae, y sin decirlo nadie sabe qué pasa si no toca nada.
	ayuda: text(),
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
]).enableRLS();

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
]).enableRLS();

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
]).enableRLS();

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
]).enableRLS();

/**
 * Diccionario para traducir lo que OpenStreetMap llama barrio a lo que se llama aquí.
 *
 * NO es una capa geográfica y no se parece a `delivery_zone`: no tiene polígono, no cubre
 * puntos y no decide ni un peso. Es una tabla de nombres, y existe porque OSM tiene los 90
 * barrios de Fusagasugá como nodos sueltos —ninguno con área—, así que Nominatim responde por
 * proximidad y a veces devuelve un nombre que aquí no existe ("Managua" donde es Balmoral).
 *
 * El barrio del pedido sigue siendo lo que el cliente confirma en el campo (regla 14): esto
 * solo mejora lo que se le propone.
 */
export const barrio = pgTable("barrio", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeId: uuid("store_id").notNull(),
	/** Exactamente como lo escribe OSM. Es la llave de búsqueda, por eso no se edita. */
	nombreOsm: text("nombre_osm").notNull(),
	/**
	 * Lo que se escribe en el campo del cliente. NULL = no sugerir nada y que lo escriba él.
	 *
	 * Nullable en vez de una columna `activo` aparte: descartar un nombre es no tener nada que
	 * poner, y con las dos columnas habría dos maneras de decir lo mismo (y una fila que dijera
	 * las dos cosas a la vez).
	 */
	nombre: text(),
}, (table) => [
	foreignKey({
			columns: [table.storeId],
			foreignColumns: [store.id],
			name: "barrio_store_id_fkey"
		}).onDelete("cascade"),
	unique("barrio_store_id_nombre_osm_key").on(table.storeId, table.nombreOsm),
]).enableRLS();

/**
 * Un cupón de descuento por porcentaje. `CHURRO10` → 10 % sobre lo que cubra.
 *
 * El monto que descuentó cada pedido NO se recalcula nunca desde aquí: se congela en
 * `order.descuento` y `order.cupon_codigo` (regla 2). Cambiarle el porcentaje a un cupón o
 * borrarlo jamás debe reescribir lo que un cliente ya pagó.
 */
export const cupon = pgTable("cupon", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeId: uuid("store_id").notNull(),
	/** Siempre normalizado a mayúsculas sin espacios (`normalizarCodigo`), o no se encontraría. */
	codigo: text().notNull(),
	porcentaje: integer().notNull(),
	/**
	 * `todo` = toda la carta. `seleccion` = lo que digan `cupon_categoria` y `cupon_producto`.
	 *
	 * Existe aunque el alcance ya se lea de esas dos tablas, y no es redundante: sin esta columna,
	 * "toda la carta" y "elegí acotar pero todavía no marqué nada" son las dos cero filas, y la
	 * segunda descontaría sobre todo el pedido — exactamente lo contrario de lo que se pidió.
	 */
	alcance: alcanceCupon().default('todo').notNull(),
	/**
	 * El último día en que sirve, en el calendario de Bogotá. NULL = no vence.
	 *
	 * `date` y no `timestamptz` a propósito: "vence el 30 de septiembre" es un día, no un instante,
	 * y con un timestamp habría que inventarle una hora que a nadie le importa. Peor: comparado
	 * contra `now()` a secas, un cupón así vencería a las 7 pm del día anterior (UTC). Se compara
	 * como cadena contra `diaDeBogota()`, así que vale durante todo su último día.
	 */
	venceEl: date("vence_el"),
	/**
	 * El aviso que sale en la carta. NULL = no se anuncia.
	 *
	 * Cuelga del cupón y no de `store` para que **el aviso muera con el cupón**: un texto suelto en
	 * la tienda seguiría anunciando un cupón vencido hasta que alguien se acordara de borrarlo.
	 */
	anuncio: text(),
	/** Apagar, no borrar (regla 9): un pedido viejo tiene que poder decir con qué cupón se pagó. */
	activo: boolean().default(true).notNull(),
	creadoEn: timestamp("creado_en", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.storeId],
			foreignColumns: [store.id],
			name: "cupon_store_id_fkey"
		}).onDelete("cascade"),
	unique("cupon_store_id_codigo_key").on(table.storeId, table.codigo),
	// La carta tiene un solo sitio para el aviso, así que solo un cupón puede ocuparlo. Índice
	// parcial y no un `activo`-como-radio: lo que hace único al anunciado es tener texto.
	uniqueIndex("idx_cupon_anuncio_unico")
		.on(table.storeId)
		.where(sql`anuncio IS NOT NULL`),
	check("cupon_porcentaje_check", sql`porcentaje >= 1 AND porcentaje <= 50`),
]).enableRLS();

/**
 * Las categorías que cubre un cupón acotado.
 *
 * El alcance se expande a ids de producto **en cada lectura** (`db/queries/cupones.ts`), no al
 * guardar: así un producto que entre mañana a una categoría cubierta queda cubierto solo.
 */
export const cuponCategoria = pgTable("cupon_categoria", {
	cuponId: uuid("cupon_id").notNull(),
	categoryId: uuid("category_id").notNull(),
}, (table) => [
	primaryKey({ columns: [table.cuponId, table.categoryId], name: "cupon_categoria_pkey" }),
	foreignKey({
			columns: [table.cuponId],
			foreignColumns: [cupon.id],
			name: "cupon_categoria_cupon_id_fkey"
		}).onDelete("cascade"),
	// CASCADE porque esto es configuración del cupón, no historial: si la categoría desaparece,
	// deja de haber nada que cubrir. Lo que un pedido pagó vive en `order.descuento` (regla 2).
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [category.id],
			name: "cupon_categoria_category_id_fkey"
		}).onDelete("cascade"),
]).enableRLS();

/** Los productos sueltos que cubre un cupón acotado. Mismo trato que `cupon_categoria`. */
export const cuponProducto = pgTable("cupon_producto", {
	cuponId: uuid("cupon_id").notNull(),
	productId: uuid("product_id").notNull(),
}, (table) => [
	primaryKey({ columns: [table.cuponId, table.productId], name: "cupon_producto_pkey" }),
	foreignKey({
			columns: [table.cuponId],
			foreignColumns: [cupon.id],
			name: "cupon_producto_cupon_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [product.id],
			name: "cupon_producto_product_id_fkey"
		}).onDelete("cascade"),
]).enableRLS();

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
]).enableRLS();

// Los domiciliarios de la tienda: una agenda, no empleados. El domicilio lo ejecuta un courier
// externo (regla 13), así que esto es la lista de a quién se le puede pasar un pedido.
//
// El teléfono identifica a la persona, igual que en `customer`, y se guarda normalizado.
// Se archiva con `activo`, nunca se borra (regla 9): un pedido viejo tiene que poder decir quién
// lo llevó, y el snapshot en `order` solo cubre a los que ya salieron.
export const courier = pgTable("courier", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeId: uuid("store_id").notNull(),
	nombre: text().notNull(),
	telefono: text().notNull(),
	activo: boolean().default(true).notNull(),
	creadoEn: timestamp("creado_en", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.storeId],
			foreignColumns: [store.id],
			name: "courier_store_id_fkey"
		}).onDelete("cascade"),
	unique("courier_store_id_telefono_key").on(table.storeId, table.telefono),
]).enableRLS();

export const order = pgTable("order", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeId: uuid("store_id").notNull(),
	numero: serial().notNull(),
	tokenPublico: text("token_publico").default(sql`encode(gen_random_bytes(16), 'hex'::text)`).notNull(),
	// La llave del DOMICILIARIO, y es otra que la del cliente a propósito.
	//
	// `token_publico` solo sirve para *leer* el seguimiento; este permite *escribir* el estado.
	// Reusar aquel significaría que el cliente puede marcar su propio pedido como entregado. Dos
	// permisos distintos, dos llaves distintas, y no se mezclan.
	//
	// Se genera en todas las filas —no hay estado nulo que manejar— y no sirve de nada hasta que
	// el pedido está `en_camino`: lo que de verdad protege el endpoint es `validarCambioEstado`.
	tokenEntrega: text("token_entrega").default(sql`encode(gen_random_bytes(16), 'hex'::text)`).notNull(),
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
	courierId: uuid("courier_id"),
	// Snapshot del domiciliario (regla 2), mismo trato que `zona_nombre`: renombrar o archivar a
	// alguien de la agenda jamás debe cambiar lo que dice un pedido ya despachado. `courier_id`
	// se queda para reportes agregados.
	domiciliarioNombre: text("domiciliario_nombre"),
	domiciliarioTelefono: text("domiciliario_telefono"),
	metodoPago: metodoPago("metodo_pago").notNull(),
	// Con cuánto billete va a pagar, para que el domiciliario lleve la devuelta. Solo aplica
	// a efectivo y es opcional: NULL significa "no lo dijo", no "paga justo".
	pagaCon: integer("paga_con"),
	comprobanteUrl: text("comprobante_url"),
	subtotal: integer().notNull(),
	costoDomicilio: integer("costo_domicilio").default(0).notNull(),
	descuento: integer().default(0).notNull(),
	cuponId: uuid("cupon_id"),
	// Snapshot del cupón (regla 2), misma pareja que `zona_id`/`zona_nombre` y el domiciliario: el
	// id sirve para reportes agregados y este texto es lo que se muestra y lo que va al XLSX.
	// Renombrar o borrar un cupón jamás debe cambiar lo que dice un pedido ya cobrado. Cuánto
	// descontó está al lado, en `descuento`.
	cuponCodigo: text("cupon_codigo"),
	total: integer().notNull(),
	// La hora que el cliente eligió, o NULL si pidió "lo más pronto posible". El nullable ES
	// el modelo: un booleano al lado admitiría "programado sin hora" y la base no podría
	// impedirlo. Es un instante absoluto, no un "19:00": la conversión desde la hora de Bogotá
	// se hace una sola vez, en el servidor (regla 6).
	programadoPara: timestamp("programado_para", { withTimezone: true, mode: 'string' }),
	// Cuándo aceptó el cliente el tratamiento de datos. NULL = no hay consentimiento registrado,
	// y eso incluye todo lo que se cobró antes de que existiera esta columna: no se rellena hacia
	// atrás, porque inventar una fecha de consentimiento es justo lo que un registro de
	// consentimiento no puede hacer.
	//
	// El nullable ES el modelo, igual que `programado_para` (regla 16): un booleano al lado
	// admitiría la fila imposible "aceptó sin hora", que es la que no sirve de evidencia.
	//
	// La hora la pone el SERVIDOR (regla 1 aplicada al consentimiento): del navegador llega el sí,
	// nunca el cuándo. Un sello de tiempo que el propio interesado elige no prueba nada.
	politicaAceptadaEn: timestamp("politica_aceptada_en", { withTimezone: true, mode: 'string' }),
	// QUÉ versión aceptó, no solo cuándo. Lo exige la propia política ("conserva registro de la
	// fecha, la hora, la versión de la política aceptada y el medio"), y sin esto el registro dice
	// que alguien aceptó sin poder mostrar qué decía el documento ese día. Sale de
	// `VERSION_POLITICA` en `lib/legal/politica-datos.ts`.
	//
	// El MEDIO no lleva columna: hoy solo hay un camino de aceptación —el checkout web— y una
	// columna con un único valor posible no es un dato, es una constante.
	politicaVersion: text("politica_version"),
	// Si el cliente quiere los avisos por WhatsApp del estado de su pedido. `true` por defecto
	// porque es finalidad necesaria del servicio, no publicidad: quien pide quiere saber cuándo
	// sale su comida. Marketing sería otra columna y otra casilla, desmarcada.
	//
	// No es decorativo: `avisoCambioEstado` devuelve null si está en false, y el panel deja de
	// ofrecer el botón "Avisar". Un consentimiento que se registra y luego se ignora es peor que
	// no preguntarlo.
	aceptaAvisos: boolean("acepta_avisos").default(true).notNull(),
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
	foreignKey({
			columns: [table.courierId],
			foreignColumns: [courier.id],
			name: "order_courier_id_fkey"
		}),
	// Sin `onDelete`: es historial, igual que `order_item.product_id`. Postgres impide borrar un
	// cupón que ya se usó, y la salida es apagarlo (regla 9).
	foreignKey({
			columns: [table.cuponId],
			foreignColumns: [cupon.id],
			name: "order_cupon_id_fkey"
		}),
	unique("order_token_publico_key").on(table.tokenPublico),
	unique("order_token_entrega_key").on(table.tokenEntrega),
	// Un domicilio sin pin ya no es posible: el pin es lo que determinó el precio (regla 14),
	// y sin él no se puede reconstruir por qué se cobró lo que se cobró.
	check(
		"order_check",
		sql`(tipo = 'recoger'::tipo_pedido) OR (direccion IS NOT NULL AND punto IS NOT NULL)`,
	),
]).enableRLS();

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
]).enableRLS();

// A qué dispositivos empujar el aviso de pedido nuevo.
//
// El `endpoint` lo asigna el servicio de push del navegador y ya identifica por sí solo a ese
// navegador en ese dispositivo: es la llave natural, y por eso el UNIQUE va ahí y no sobre
// (usuario, dispositivo), que no sabríamos construir.
//
// `userId` existe para poder soltar la suscripción al cerrar sesión: el celular de quien ya no
// trabaja aquí no debería seguir sonando cada vez que entra un pedido.
//
// No hay columna de "última vez usada": las suscripciones muertas no se detectan por antigüedad
// sino porque el servicio de push responde 404 o 410, y ahí se borran. Una columna que nadie lee
// se leería como un dato perdido.
export const pushSubscription = pgTable("push_subscription", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeId: uuid("store_id").notNull(),
	userId: uuid("user_id").notNull(),
	endpoint: text().notNull(),
	p256dh: text().notNull(),
	auth: text().notNull(),
	creadoEn: timestamp("creado_en", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.storeId],
			foreignColumns: [store.id],
			name: "push_subscription_store_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [appUser.id],
			name: "push_subscription_user_id_fkey"
		}).onDelete("cascade"),
	unique("push_subscription_endpoint_key").on(table.endpoint),
]).enableRLS();

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
]).enableRLS();
