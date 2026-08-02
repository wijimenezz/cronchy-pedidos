/**
 * La traducción de la regla 15, en su parte pura: el panel habla de "Salsas incluidas: 2"
 * y aquí se convierte en filas de `product_modifier_group`. Quien usa el panel nunca lee
 * la palabra "enganche", ni min_select, ni modo.
 *
 * Está separado de la query a propósito. Es la pieza donde un bug cuesta plata real —un
 * `modo` equivocado convierte una salsa incluida en una de $2.000, o al revés— así que es
 * lo que se testea, sin necesidad de base de datos.
 *
 * ADVERTENCIA: borrar un enganche invalida los carritos que ya estaban en el `localStorage`
 * de algún cliente con ese `productModifierGroupId` dentro. Falla del lado seguro —el
 * servidor recalcula todo desde la base (regla 1) y rechaza el pedido— pero el cliente ve
 * un error al confirmar. Es el mismo comportamiento que ya tiene cambiar un precio, y por
 * eso se acepta.
 */

export type ModoEnganche = "incluido" | "adicional";

/** Un enganche tal como está hoy en la base. */
export type EngancheActual = {
  id: string;
  groupId: string;
  modo: ModoEnganche;
  minSelect: number;
  maxSelect: number;
  precioUnitario: number | null;
  colapsado: boolean;
};

/**
 * Lo que el admin dejó en la pantalla, ya en lenguaje de negocio.
 *
 * Un grupo que no aparece en ninguna lista es un grupo que el producto no lleva: no hay
 * "cantidad 0", hay ausencia. Así el plan de borrado sale solo de comparar conjuntos.
 */
export type ConfiguracionModificadores = {
  /** Lo que el producto ya trae y el cliente elige sí o sí (regla 4). */
  incluidos: { groupId: string; cantidad: number }[];
  /**
   * Lo que se cobra aparte: opcional, con tope y precio por unidad (regla 3).
   *
   * `precio` en `null` significa "cada opción cobra el suyo": el motor cae entonces al
   * `precio_delta` de cada `modifier_option`. Se admite porque hay enganches así en la base
   * y escribirles un 0 los volvería gratis sin que nadie lo hubiera pedido.
   */
  adicionales: { groupId: string; hasta: number; precio: number | null }[];
  /** Grupos de tipo `upsell` encendidos. Aquí solo hay on/off. */
  upsells: string[];
};

/** Un enganche con el tipo de su grupo, que es lo que distingue un upsell de lo demás. */
export type EngancheConTipo = EngancheActual & { tipoGrupo: "seleccion" | "upsell" };

/**
 * El camino de vuelta: de las filas de la base al lenguaje del panel. Es lo que rellena el
 * formulario al abrir un producto.
 *
 * Vive aquí y no en el componente para que se pueda probar contra `planificarEngancles` la
 * propiedad que de verdad importa: abrir un producto y guardarlo sin tocar nada no debe
 * cambiar ni una fila. Si las dos direcciones se desalinearan, el primer guardado inocente
 * reescribiría la configuración de la carta.
 *
 * Un grupo de tipo `upsell` sale como upsell aunque esté enganchado en modo 'adicional',
 * que es como está en la base: lo que lo define es el tipo del grupo, no el modo.
 */
export function configuracionDesde(engancles: EngancheConTipo[]): ConfiguracionModificadores {
  return {
    incluidos: engancles
      .filter((e) => e.modo === "incluido" && e.tipoGrupo === "seleccion")
      .map((e) => ({ groupId: e.groupId, cantidad: e.minSelect })),

    adicionales: engancles
      .filter((e) => e.modo === "adicional" && e.tipoGrupo === "seleccion")
      .map((e) => ({ groupId: e.groupId, hasta: e.maxSelect, precio: e.precioUnitario })),

    upsells: engancles.filter((e) => e.tipoGrupo === "upsell").map((e) => e.groupId),
  };
}

/** Una fila de `product_modifier_group` lista para insertar o actualizar. */
export type FilaEnganche = {
  groupId: string;
  modo: ModoEnganche;
  minSelect: number;
  maxSelect: number;
  precioUnitario: number | null;
  avisarIncompleto: boolean;
  colapsado: boolean;
  orden: number;
};

export type PlanEngancles = {
  /** Upsert por el UNIQUE (product_id, group_id, modo). */
  guardar: FilaEnganche[];
  /** Ids de `product_modifier_group` que sobran. */
  borrar: string[];
};

/** Los upsell van siempre al final de la ficha, después de todo lo que se elige. */
const ORDEN_UPSELL = 100;

/**
 * Compara lo que hay con lo que se quiere y devuelve qué escribir y qué borrar.
 *
 * Nunca borra-y-recrea para cambiar un número: bajar "incluidas" de 2 a 1 sale como un
 * update del mismo enganche. Recrearlo cambiaría su `id`, que es justo lo que viaja al
 * navegador dentro de cada selección del carrito.
 *
 * Si un grupo llega repetido dentro de la misma lista se queda el primero: es una entrada
 * imposible desde la UI, pero la función tiene que ser total.
 */
export function planificarEngancles(
  actuales: EngancheActual[],
  config: ConfiguracionModificadores,
): PlanEngancles {
  const previos = new Map(actuales.map((e) => [clave(e.groupId, e.modo), e]));
  const guardar: FilaEnganche[] = [];
  const vistos = new Set<string>();

  function agregar(fila: FilaEnganche) {
    const k = clave(fila.groupId, fila.modo);
    if (vistos.has(k)) return;
    vistos.add(k);
    guardar.push(fila);
  }

  // 1. Lo incluido. min = max (regla 4: se eligen todas o el item no entra al carrito) y
  //    `avisar_incompleto` en false, que es lo que hace que bloquee en vez de solo avisar.
  //
  //    `precio_unitario` NO significa nada en este modo: `precioEfectivoOpcion` devuelve 0
  //    para 'incluido' sin mirarlo. Por eso el plan no opina y conserva lo que hubiera —la
  //    base tiene hoy filas con 0 y filas con NULL, según qué migración las creó—, y solo
  //    pone 0 (regla 3) en las que nacen aquí. Normalizarlas sería reescribir la carta
  //    entera en el primer guardado inocente, a cambio de nada.
  config.incluidos.forEach((inc, i) => {
    const previo = previos.get(clave(inc.groupId, "incluido"));

    agregar({
      groupId: inc.groupId,
      modo: "incluido",
      minSelect: inc.cantidad,
      maxSelect: inc.cantidad,
      // `previo ? … : 0` y no `previo?.precioUnitario ?? 0`: el valor que hay que conservar
      // puede ser NULL, y `??` lo confundiría con "no había fila" escribiendo un 0.
      precioUnitario: previo ? previo.precioUnitario : 0,
      avisarIncompleto: false,
      colapsado: false,
      orden: i,
    });
  });

  // 2. Los adicionales de pago. Opcionales (min 0) y plegados por defecto: son una sección
  //    aparte que no debe estorbar a quien solo quiere su churro.
  const base = config.incluidos.length;
  config.adicionales.forEach((ad, i) => {
    agregar({
      groupId: ad.groupId,
      modo: "adicional",
      minSelect: 0,
      maxSelect: ad.hasta,
      precioUnitario: ad.precio,
      avisarIncompleto: false,
      colapsado: true,
      orden: base + i,
    });
  });

  // 3. Los upsell. El panel solo los enciende y los apaga, así que si el enganche ya
  //    existía se le respetan min, max y precio tal como estaban: la invariante
  //    `minSelect = 0` de estos grupos la fijó el seed y no hay control que la exponga.
  //    Lo único que se recalcula es el orden, para que la bebida quede al final.
  config.upsells.forEach((groupId, i) => {
    const previo = previos.get(clave(groupId, "adicional"));
    agregar({
      groupId,
      modo: "adicional",
      minSelect: previo?.minSelect ?? 0,
      maxSelect: previo?.maxSelect ?? 1,
      precioUnitario: previo ? previo.precioUnitario : null,
      avisarIncompleto: false,
      colapsado: previo?.colapsado ?? false,
      orden: ORDEN_UPSELL + i,
    });
  });

  const borrar = actuales
    .filter((e) => !vistos.has(clave(e.groupId, e.modo)))
    .map((e) => e.id);

  return { guardar, borrar };
}

function clave(groupId: string, modo: ModoEnganche): string {
  return `${groupId}:${modo}`;
}
