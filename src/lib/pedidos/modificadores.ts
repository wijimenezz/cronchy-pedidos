/**
 * Cómo se leen los modificadores de un pedido ya hecho.
 *
 * El snapshot los guarda como una lista plana donde cada entrada repite su grupo, así que
 * cuatro salsas incluidas son cuatro renglones que empiezan igual. Esto los agrupa para que
 * cada grupo ocupe una fila, y separa lo que se cobró aparte.
 *
 * **Lo cobrado se distingue por `precio > 0` y no por el nombre del grupo.** El snapshot no
 * guarda el `modo` del enganche —`itemCalculadoASnapshot` lo descarta—, así que "incluido vs
 * adicional" no es recuperable con exactitud: `precio === 0` puede ser un incluido o un
 * adicional gratis. Da igual, porque lo que hay que separar en pantalla es cobrado vs no
 * cobrado, y a eso el precio responde exacto: llamarle "extra cobrado" a algo que costó $0
 * sería falso de todos modos.
 *
 * Puro, sin base de datos: solo lee el snapshot, igual que `estados.ts` o `franjas.ts`.
 */

import type { ItemSnapshot, ModificadorSnapshot } from "@/lib/notificaciones/plantillas";

export type GrupoModificadores = {
  /** Ya acortada: "Toppings", no "Toppings incluidos". */
  etiqueta: string;
  /** "M&M", "Mango ×2". Se pintan unidos por `·`. */
  valores: string[];
};

export type ExtraCobrado = {
  nombre: string;
  cantidad: number;
  /** `precio × cantidad`. El del snapshot es UNITARIO. */
  total: number;
};

const SUFIJO_INCLUIDO = /\s+incluid[oa]s?$/i;
const PREFIJO_RUIDO = /^(sabor de|nivel de|agregar más)\s+/i;

/**
 * "Sabor de helado" → "Helado". "Toppings incluidos" → "Toppings".
 *
 * Es una regla y no un diccionario a propósito: los nombres reales viven en la base —el
 * catálogo se pobló por fuera de las migraciones— y un grupo nuevo no debería obligar a tocar
 * código. Lo que no encaje sale intacto, que es el fallo correcto: se ve largo, no se ve mal.
 */
export function etiquetaCorta(grupo: string): string {
  const limpio = grupo.replace(SUFIJO_INCLUIDO, "").replace(PREFIJO_RUIDO, "").trim();
  if (!limpio) return grupo.trim();

  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

/**
 * Parte los modificadores de un ítem en la rejilla de lo que trae y las píldoras de lo que se
 * cobró aparte.
 *
 * Los incluidos se agrupan con un `Map`, que **respeta el orden de llegada** —el mismo del
 * enganche, que es el que eligió el admin— igual que hace la plantilla de WhatsApp. Los extras
 * no se agrupan: cada uno lleva su precio y se lee de a uno.
 *
 * Un mismo grupo puede llegar dos veces, porque el esquema permite engancharlo en `incluido` y
 * en `adicional` con la misma etiqueta. El reparto por precio lo resuelve solo.
 */
export function agruparModificadores(mods: ModificadorSnapshot[]): {
  incluidos: GrupoModificadores[];
  extras: ExtraCobrado[];
} {
  const porGrupo = new Map<string, string[]>();
  const extras: ExtraCobrado[] = [];

  for (const m of mods) {
    if (m.precio > 0) {
      extras.push({ nombre: m.nombre, cantidad: m.cantidad, total: m.precio * m.cantidad });
      continue;
    }

    const etiqueta = etiquetaCorta(m.grupo);
    const valor = m.cantidad > 1 ? `${m.nombre} ×${m.cantidad}` : m.nombre;
    porGrupo.set(etiqueta, [...(porGrupo.get(etiqueta) ?? []), valor]);
  }

  return {
    incluidos: [...porGrupo].map(([etiqueta, valores]) => ({ etiqueta, valores })),
    extras,
  };
}

/**
 * El subtítulo de "Qué preparar": cuántas cosas salen y cuántas se cobraron aparte.
 *
 * Cuenta **unidades y no renglones**: dos Cronchy Cono son "2 ítems", que es lo que hay que
 * preparar, no "1".
 */
export function contarPreparacion(items: ItemSnapshot[]): { unidades: number; extras: number } {
  let unidades = 0;
  let extras = 0;

  for (const item of items) {
    unidades += item.cantidad;
    for (const m of item.modificadores) {
      if (m.precio > 0) extras += m.cantidad;
    }
  }

  return { unidades, extras };
}
