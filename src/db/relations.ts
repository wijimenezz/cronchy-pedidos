import { relations } from "drizzle-orm/relations";
import { store, storeHours, storeClosure, appUser, category, product, modifierGroup, modifierOption, productModifierGroup, deliveryZone, customer, courier, order, orderItem, orderStatusEvent } from "./schema";

export const storeHoursRelations = relations(storeHours, ({one}) => ({
	store: one(store, {
		fields: [storeHours.storeId],
		references: [store.id]
	}),
}));

export const storeRelations = relations(store, ({many}) => ({
	storeHours: many(storeHours),
	storeClosures: many(storeClosure),
	appUsers: many(appUser),
	categories: many(category),
	products: many(product),
	modifierGroups: many(modifierGroup),
	modifierOptions: many(modifierOption),
	productModifierGroups: many(productModifierGroup),
	deliveryZones: many(deliveryZone),
	customers: many(customer),
	orders: many(order),
	orderItems: many(orderItem),
	orderStatusEvents: many(orderStatusEvent),
}));

export const storeClosureRelations = relations(storeClosure, ({one}) => ({
	store: one(store, {
		fields: [storeClosure.storeId],
		references: [store.id]
	}),
}));

export const appUserRelations = relations(appUser, ({one, many}) => ({
	store: one(store, {
		fields: [appUser.storeId],
		references: [store.id]
	}),
	orderStatusEvents: many(orderStatusEvent),
}));

export const categoryRelations = relations(category, ({one, many}) => ({
	store: one(store, {
		fields: [category.storeId],
		references: [store.id]
	}),
	products: many(product),
}));

export const productRelations = relations(product, ({one, many}) => ({
	category: one(category, {
		fields: [product.categoryId],
		references: [category.id]
	}),
	store: one(store, {
		fields: [product.storeId],
		references: [store.id]
	}),
	modifierOptions: many(modifierOption),
	productModifierGroups: many(productModifierGroup),
	orderItems: many(orderItem),
}));

export const modifierGroupRelations = relations(modifierGroup, ({one, many}) => ({
	store: one(store, {
		fields: [modifierGroup.storeId],
		references: [store.id]
	}),
	modifierOptions: many(modifierOption),
	productModifierGroups: many(productModifierGroup),
}));

export const modifierOptionRelations = relations(modifierOption, ({one}) => ({
	store: one(store, {
		fields: [modifierOption.storeId],
		references: [store.id]
	}),
	modifierGroup: one(modifierGroup, {
		fields: [modifierOption.groupId],
		references: [modifierGroup.id]
	}),
	product: one(product, {
		fields: [modifierOption.productoRef],
		references: [product.id]
	}),
}));

export const productModifierGroupRelations = relations(productModifierGroup, ({one}) => ({
	store: one(store, {
		fields: [productModifierGroup.storeId],
		references: [store.id]
	}),
	modifierGroup: one(modifierGroup, {
		fields: [productModifierGroup.groupId],
		references: [modifierGroup.id]
	}),
	product: one(product, {
		fields: [productModifierGroup.productId],
		references: [product.id]
	}),
}));

export const deliveryZoneRelations = relations(deliveryZone, ({one, many}) => ({
	store: one(store, {
		fields: [deliveryZone.storeId],
		references: [store.id]
	}),
	orders: many(order),
}));

export const customerRelations = relations(customer, ({one, many}) => ({
	store: one(store, {
		fields: [customer.storeId],
		references: [store.id]
	}),
	orders: many(order),
}));

export const courierRelations = relations(courier, ({one, many}) => ({
	store: one(store, {
		fields: [courier.storeId],
		references: [store.id]
	}),
	orders: many(order),
}));

export const orderRelations = relations(order, ({one, many}) => ({
	customer: one(customer, {
		fields: [order.customerId],
		references: [customer.id]
	}),
	store: one(store, {
		fields: [order.storeId],
		references: [store.id]
	}),
	deliveryZone: one(deliveryZone, {
		fields: [order.zonaId],
		references: [deliveryZone.id]
	}),
	courier: one(courier, {
		fields: [order.courierId],
		references: [courier.id]
	}),
	orderItems: many(orderItem),
	orderStatusEvents: many(orderStatusEvent),
}));

export const orderItemRelations = relations(orderItem, ({one}) => ({
	store: one(store, {
		fields: [orderItem.storeId],
		references: [store.id]
	}),
	order: one(order, {
		fields: [orderItem.orderId],
		references: [order.id]
	}),
	product: one(product, {
		fields: [orderItem.productId],
		references: [product.id]
	}),
}));

export const orderStatusEventRelations = relations(orderStatusEvent, ({one}) => ({
	store: one(store, {
		fields: [orderStatusEvent.storeId],
		references: [store.id]
	}),
	order: one(order, {
		fields: [orderStatusEvent.orderId],
		references: [order.id]
	}),
	appUser: one(appUser, {
		fields: [orderStatusEvent.userId],
		references: [appUser.id]
	}),
}));