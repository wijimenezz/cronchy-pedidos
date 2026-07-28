import type { ItemSnapshot } from "@/lib/notificaciones/plantillas";

// ------------------------------------------------------------
// Capa pura de cálculo de precios — sin DB, importable desde cliente y
// servidor. `src/lib/precios.ts` re-exporta todo esto y le agrega las
// funciones que sí necesitan la base de datos (regla 1 de CLAUDE.md: todo el
// cálculo vive en `lib/precios*`, nunca se replica en otro lado).
// ------------------------------------------------------------

// ------------------------------------------------------------
// Entrada
// ------------------------------------------------------------

export type SeleccionEnganche = {
  /** id de product_modifier_group: identifica el enganche exacto (incluido vs adicional). */
  productModifierGroupId: string;
  opciones: { modifierOptionId: string; cantidad: number }[]; // cantidad=1 salvo permiteCantidad
};

export type ItemSolicitado = {
  productId: string;
  cantidad: number;
  seleccion: SeleccionEnganche[];
  notas?: string | null;
};

// ------------------------------------------------------------
// Datos resueltos de DB (entrada de la capa pura)
// ------------------------------------------------------------

export type OpcionParaPrecio = {
  id: string;
  nombre: string;
  precioDelta: number;
  disponible: boolean;
  /** Solo relevante en grupos tipo "upsell": producto real que representa esta opción (regla 8). */
  productoRef: string | null;
};

export type EngancheParaPrecio = {
  id: string;
  modo: "incluido" | "adicional";
  /** "upsell" = las opciones elegidas se convierten en su propio order_item (regla 8), no en un modificador. */
  tipo: "seleccion" | "upsell";
  nombreGrupo: string;
  minSelect: number;
  maxSelect: number;
  precioUnitario: number | null;
  avisarIncompleto: boolean;
  permiteCantidad: boolean;
  maxPorOpcion: number | null;
  opciones: OpcionParaPrecio[]; // todas, incluidas disponible=false, para distinguir el error
};

export type ProductoParaPrecio = {
  id: string;
  nombre: string;
  precioBase: number;
  activo: boolean;
  disponible: boolean;
  disponibleDelivery: boolean;
  disponiblePickup: boolean;
  engancles: EngancheParaPrecio[];
};

// ------------------------------------------------------------
// Errores y resultado
// ------------------------------------------------------------

export type ErrorPrecio =
  | { tipo: "producto_no_encontrado"; productId: string }
  | { tipo: "producto_no_disponible"; productId: string }
  | { tipo: "cantidad_invalida"; motivo: "item" | "opcion_sin_permitir_cantidad" | "excede_max_por_opcion" }
  | { tipo: "enganche_no_encontrado"; productModifierGroupId: string }
  | { tipo: "opcion_invalida"; modifierOptionId: string; motivo: "no_pertenece_al_grupo" | "no_disponible" }
  | { tipo: "seleccion_incompleta"; productModifierGroupId: string; minSelect: number; recibidas: number }
  | { tipo: "seleccion_excedida"; productModifierGroupId: string; maxSelect: number; recibidas: number }
  | { tipo: "upsell_sin_producto"; modifierOptionId: string };

export type ResultadoPrecio<T> = { ok: true; valor: T } | { ok: false; error: ErrorPrecio };

// ------------------------------------------------------------
// Salida
// ------------------------------------------------------------

export type ModificadorCalculado = {
  modifierOptionId: string;
  grupo: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
};

export type AvisoIncompleto = {
  productModifierGroupId: string;
  nombreGrupo: string;
  minSelect: number;
  recibidas: number;
};

export type ItemCalculado = {
  productId: string;
  nombreProducto: string;
  cantidad: number;
  precioUnitario: number; // precioBase + modificadores, por unidad
  subtotal: number; // precioUnitario * cantidad
  modificadores: ModificadorCalculado[];
  avisos: AvisoIncompleto[]; // no bloquean, solo informan
  notas?: string | null;
};

export type ResultadoItemCalculado = {
  base: ItemCalculado;
  /** Regla 8: cada bebida/upsell elegida es su propio item, nunca un modificador del producto base. */
  upsells: ItemCalculado[];
};

export function itemCalculadoASnapshot(item: ItemCalculado): ItemSnapshot {
  return {
    nombre: item.nombreProducto,
    cantidad: item.cantidad,
    subtotal: item.subtotal,
    modificadores: item.modificadores.map((m) => ({
      grupo: m.grupo,
      nombre: m.nombre,
      cantidad: m.cantidad,
      precio: m.precioUnitario,
    })),
    notas: item.notas,
  };
}

// ------------------------------------------------------------
// Cálculo de un item — capa pura, sin DB (regla 1: todo el cálculo vive aquí)
// ------------------------------------------------------------

export function calcularItem(
  producto: ProductoParaPrecio,
  item: ItemSolicitado,
  tipoPedido?: "domicilio" | "recoger",
): ResultadoPrecio<ResultadoItemCalculado> {
  if (item.cantidad <= 0) {
    return { ok: false, error: { tipo: "cantidad_invalida", motivo: "item" } };
  }

  if (!producto.activo || !producto.disponible) {
    return { ok: false, error: { tipo: "producto_no_disponible", productId: producto.id } };
  }
  if (tipoPedido === "domicilio" && !producto.disponibleDelivery) {
    return { ok: false, error: { tipo: "producto_no_disponible", productId: producto.id } };
  }
  if (tipoPedido === "recoger" && !producto.disponiblePickup) {
    return { ok: false, error: { tipo: "producto_no_disponible", productId: producto.id } };
  }

  // El cliente nunca debe poder colar una referencia a un enganche que no existe en el producto.
  for (const s of item.seleccion) {
    if (!producto.engancles.some((e) => e.id === s.productModifierGroupId)) {
      return {
        ok: false,
        error: { tipo: "enganche_no_encontrado", productModifierGroupId: s.productModifierGroupId },
      };
    }
  }

  const seleccionPorEnganche = new Map(item.seleccion.map((s) => [s.productModifierGroupId, s]));

  const modificadores: ModificadorCalculado[] = [];
  const avisos: AvisoIncompleto[] = [];
  const upsells: ItemCalculado[] = [];
  let extraPorUnidad = 0;

  // Se itera sobre los enganches del producto (fuente de verdad), no sobre la selección
  // del cliente, para detectar enganches con minSelect que el cliente omitió por completo.
  for (const enganche of producto.engancles) {
    const opcionesSeleccionadas = seleccionPorEnganche.get(enganche.id)?.opciones ?? [];
    const opcionesPorId = new Map(enganche.opciones.map((o) => [o.id, o]));

    for (const sel of opcionesSeleccionadas) {
      const opcion = opcionesPorId.get(sel.modifierOptionId);
      if (!opcion) {
        return {
          ok: false,
          error: {
            tipo: "opcion_invalida",
            modifierOptionId: sel.modifierOptionId,
            motivo: "no_pertenece_al_grupo",
          },
        };
      }
      if (!opcion.disponible) {
        return {
          ok: false,
          error: { tipo: "opcion_invalida", modifierOptionId: sel.modifierOptionId, motivo: "no_disponible" },
        };
      }
      if (!enganche.permiteCantidad && sel.cantidad !== 1) {
        return { ok: false, error: { tipo: "cantidad_invalida", motivo: "opcion_sin_permitir_cantidad" } };
      }
      if (enganche.maxPorOpcion !== null && sel.cantidad > enganche.maxPorOpcion) {
        return { ok: false, error: { tipo: "cantidad_invalida", motivo: "excede_max_por_opcion" } };
      }
    }

    const recibidas = opcionesSeleccionadas.reduce((n, o) => n + o.cantidad, 0);

    if (recibidas > enganche.maxSelect) {
      return {
        ok: false,
        error: {
          tipo: "seleccion_excedida",
          productModifierGroupId: enganche.id,
          maxSelect: enganche.maxSelect,
          recibidas,
        },
      };
    }

    // Regla 4: bloquear (minSelect) y avisar (avisarIncompleto) son cosas distintas.
    // Un enganche con avisarIncompleto nunca bloquea por mínimo, solo avisa cuando
    // el cliente no eligió absolutamente nada.
    if (enganche.avisarIncompleto) {
      if (recibidas === 0) {
        avisos.push({
          productModifierGroupId: enganche.id,
          nombreGrupo: enganche.nombreGrupo,
          minSelect: enganche.minSelect,
          recibidas: 0,
        });
      }
    } else if (recibidas < enganche.minSelect) {
      return {
        ok: false,
        error: {
          tipo: "seleccion_incompleta",
          productModifierGroupId: enganche.id,
          minSelect: enganche.minSelect,
          recibidas,
        },
      };
    }

    for (const sel of opcionesSeleccionadas) {
      const opcion = opcionesPorId.get(sel.modifierOptionId)!;
      // Regla 3: incluido siempre es 0, sin importar precioDelta. Adicional usa el
      // override del enganche si existe, si no el precioDelta de la opción.
      const precioUnitarioOpcion =
        enganche.modo === "incluido" ? 0 : enganche.precioUnitario ?? opcion.precioDelta;

      if (enganche.tipo === "upsell") {
        // Regla 8: un upsell es su propio order_item, nunca un modificador del producto base.
        if (!opcion.productoRef) {
          return { ok: false, error: { tipo: "upsell_sin_producto", modifierOptionId: opcion.id } };
        }
        upsells.push({
          productId: opcion.productoRef,
          nombreProducto: opcion.nombre,
          cantidad: sel.cantidad,
          precioUnitario: precioUnitarioOpcion,
          subtotal: precioUnitarioOpcion * sel.cantidad,
          modificadores: [],
          avisos: [],
          notas: null,
        });
      } else {
        modificadores.push({
          modifierOptionId: opcion.id,
          grupo: enganche.nombreGrupo,
          nombre: opcion.nombre,
          cantidad: sel.cantidad,
          precioUnitario: precioUnitarioOpcion,
        });
        extraPorUnidad += precioUnitarioOpcion * sel.cantidad;
      }
    }
  }

  const precioUnitario = producto.precioBase + extraPorUnidad;

  return {
    ok: true,
    valor: {
      base: {
        productId: producto.id,
        nombreProducto: producto.nombre,
        cantidad: item.cantidad,
        precioUnitario,
        subtotal: precioUnitario * item.cantidad,
        modificadores,
        avisos,
        notas: item.notas,
      },
      upsells,
    },
  };
}
