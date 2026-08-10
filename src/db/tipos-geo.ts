import { customType } from "drizzle-orm/pg-core";

/**
 * Columna PostGIS. Drizzle solo trae `geometry()` nativo para puntos, así que el polígono
 * de las zonas de cobertura (regla 13) necesita un tipo propio.
 *
 * Vive fuera de `schema.ts` a propósito: ese archivo lo regenera `drizzle-kit introspect`
 * y se llevaría la definición por delante.
 *
 * Sirve únicamente para el DDL — que drizzle-kit conozca la columna y no la quiera dropear
 * en cada `generate`. Leer y escribir geometría pasa SIEMPRE por SQL explícito
 * (`ST_AsGeoJSON` / `ST_GeomFromGeoJSON`), porque en un select normal el driver devuelve
 * WKB en hexadecimal, que no le sirve a nadie. Por eso `data: string`: lo que circula por
 * el código es GeoJSON, no el valor crudo de la columna.
 */
export const geometria = customType<{
	data: string;
	driverData: string;
	config: { tipo: "Polygon" | "Point"; srid?: number };
	configRequired: true;
}>({
	dataType: (config) => `geometry(${config.tipo},${config.srid ?? 4326})`,
});
