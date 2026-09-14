import type { TipoPedido } from "@/lib/tienda/tipo-pedido";

/**
 * QUÉ SE SABE DEL DOMICILIO DE ESTE PEDIDO, y —sobre todo— cuándo todavía no se sabe.
 *
 * Nace de un cobro mal enseñado. El checkout resolvía el costo así:
 *
 * ```ts
 * const costoDomicilio =
 *   esDomicilio && cobertura.estado === "cubierto" ? cobertura.precio : 0;
 * ```
 *
 * `Cobertura` tiene cinco estados y **cuatro colapsaban a `0`**, o sea que «todavía no sé cuánto
 * cuesta» se leía como «cuesta cero». Ese cero salía en el resumen, en el total, en el botón y
 * —lo caro— en el «Transfiere este valor» de Nequi: varios clientes transfirieron solo el valor
 * de los productos mientras el panel registraba el total correcto, porque el servidor sí resuelve
 * la zona al confirmar (regla 1).
 *
 * Por eso el costo aquí es `number | null` y no `number`: **`null` es un estado del dominio**, no
 * un hueco que se rellene con un valor por defecto. Es el mismo criterio que `programado_para`
 * (regla 16) o `politica_aceptada_en` (regla 21), donde el nullable *es* el modelo.
 *
 * Puro y probado como `precios.ts`, `cupones.ts` o `franjas.ts`: si necesitas saber cuánto cuesta
 * el domicilio en pantalla, importa de aquí y no vuelvas a escribir la ternaria.
 */

/**
 * Lo que contestó `/api/zonas/cotizar` sobre el pin actual.
 *
 * Vive aquí y no en `SelectorUbicacion` —que es donde estaba— porque es dominio y no pintura: lo
 * consume el formulario para decidir si hay un total que enseñar, y el mapa solo lo dibuja.
 */
export type Cobertura =
  | { estado: "sin_pin" }
  | { estado: "consultando" }
  | { estado: "cubierto"; zona: string; precio: number }
  | { estado: "fuera" }
  | { estado: "error" };

/**
 * El domicilio de este pedido. Seis casos, uno por cada combinación real de tipo y cobertura.
 *
 * `sin_ubicacion` y `calculando` no se funden en un «pendiente» a propósito: al cliente hay que
 * decirle una cosa distinta en cada uno —poner el pin, o esperar— y fundirlos obligaría a volver
 * a mirar la `Cobertura` para saber cuál de las dos frases toca.
 */
export type Domicilio =
  /** Recoger: no hay domicilio que cobrar, así que el total es firme y vale 0. */
  | { estado: "no_aplica" }
  /** El servidor cotizó: esto es lo que cuesta. */
  | { estado: "conocido"; costo: number }
  /** Todavía no hay pin que cotizar. */
  | { estado: "sin_ubicacion" }
  /** Hay una cotización en vuelo. */
  | { estado: "calculando" }
  /** La cotización falló: red caída, 429, timeout. */
  | { estado: "fallido" }
  /** El pin cae fuera de toda zona activa (regla 14). */
  | { estado: "fuera" };

/** Un punto del mapa, con la forma que guarda `datos-cliente`. */
export type PuntoCotizado = { lat: number; lng: number };

/**
 * ¿Son el mismo pin?
 *
 * Se compara por coordenadas y no por identidad de objeto: el pin sale de un store persistido y
 * vuelve a leerse en cada render, así que dos objetos distintos pueden ser la misma casa. Es lo
 * que permite saber si la respuesta guardada corresponde al pin de ahora o si hay una consulta en
 * vuelo, sin necesidad de un estado aparte que lo diga.
 */
export function mismoPunto(a: PuntoCotizado | null, b: PuntoCotizado | null): boolean {
  if (!a || !b) return false;

  return a.lat === b.lat && a.lng === b.lng;
}

/**
 * Traduce tipo + cobertura al domicilio. **Única puerta**: el `switch` exhaustivo es lo que hace
 * que añadir un estado a `Cobertura` sin decidir qué significa para el dinero no compile.
 */
export function domicilioDe(tipo: TipoPedido | null, cobertura: Cobertura): Domicilio {
  // `null` es el estado momentáneo mientras caduca la elección (`leerGuardado` en
  // `tienda/tipo-pedido.ts`). Ahí tampoco hay domicilio: el checkout ni siquiera se pinta.
  if (tipo !== "domicilio") return { estado: "no_aplica" };

  switch (cobertura.estado) {
    case "cubierto":
      return { estado: "conocido", costo: cobertura.precio };
    case "sin_pin":
      return { estado: "sin_ubicacion" };
    case "consultando":
      return { estado: "calculando" };
    case "fuera":
      return { estado: "fuera" };
    case "error":
      return { estado: "fallido" };
  }
}

/**
 * Cuánto se le suma al total, o `null` si **no se sabe**.
 *
 * El único cero legítimo es `no_aplica`: en recoger no hay domicilio, y eso sí es saber que no
 * cuesta nada. Todo lo demás sin resolver devuelve `null`, y quien lo reciba tiene prohibido
 * tratarlo como `0` — ese fue el bug.
 */
export function costoDeDomicilio(domicilio: Domicilio): number | null {
  switch (domicilio.estado) {
    case "no_aplica":
      return 0;
    case "conocido":
      return domicilio.costo;
    case "sin_ubicacion":
    case "calculando":
    case "fallido":
    case "fuera":
      return null;
  }
}

/**
 * ¿Se puede enseñar un total y aceptar el pedido?
 *
 * Es el predicado que gobierna las cuatro pantallas del dinero —el resumen, el valor a transferir
 * por Nequi, el botón de confirmar y la devuelta del efectivo— y el candado del envío.
 */
export function totalEsFirme(domicilio: Domicilio): boolean {
  return costoDeDomicilio(domicilio) !== null;
}

/**
 * Qué se le dice al cliente cuando el domicilio todavía no es un número. `null` cuando no hay
 * nada que avisar porque el costo ya se sabe.
 *
 * El texto vive aquí y no en el JSX por el mismo criterio de la regla 10 que sigue `ubicacion.ts`:
 * quien redacta lo que lee un cliente no debería tener que abrir un componente para encontrarlo.
 * Y hace falta en dos sitios a la vez —el aviso junto al total y el `fallosUI.punto` que frena el
 * envío—, así que escribirlo dos veces sería tener dos verdades.
 */
export function avisoDeDomicilio(domicilio: Domicilio): string | null {
  switch (domicilio.estado) {
    case "no_aplica":
    case "conocido":
      return null;
    case "sin_ubicacion":
      return "Marca tu ubicación en el mapa para calcular el domicilio.";
    case "calculando":
      return "Estamos calculando el costo del domicilio.";
    case "fallido":
      return "No pudimos calcular el domicilio. Revisa tu conexión y vuelve a intentarlo.";
    // El mismo texto que ya usaba el checkout para este caso, y el mismo que pinta el mapa.
    case "fuera":
      return "Todavía no llegamos hasta ahí.";
  }
}

/**
 * ¿Ofrecerle un «Reintentar»?
 *
 * Solo tras un fallo. Con el pin sin poner lo que hay que hacer es ir al mapa, mientras se calcula
 * ya hay una consulta en vuelo, y fuera de cobertura reintentar daría lo mismo mil veces: ahí la
 * salida es el WhatsApp que ofrece el formulario (regla 14).
 */
export function sePuedeReintentar(domicilio: Domicilio): boolean {
  return domicilio.estado === "fallido";
}

/**
 * Por qué habría que pedirle a la tienda que cotice a mano. `null` = no hay nada que ofrecer.
 *
 * Son los **dos callejones sin salida** del checkout, y por eso comparten puerta: con el pedido
 * bloqueado, lo único que le queda al cliente es que un humano le ponga precio al domicilio y el
 * pedido siga por chat (regla 14).
 *
 * Existía solo para `fuera` y **solo en el paso 2**, así que una cotización que fallaba dejaba al
 * cliente con un botón de reintentar y nada más — y un `fuera` que llegara estando en el resumen
 * tampoco tenía a dónde mandarlo. Quién decide vive aquí, y no en el JSX, precisamente porque lo
 * que se olvidó la vez pasada fue uno de los dos sitios donde había que pintarlo.
 *
 * `calculando` y `sin_ubicacion` devuelven `null` a propósito: todavía pueden resolverse solos, y
 * mandar a WhatsApp a quien iba a poder pedir en dos segundos es perder el pedido.
 */
export function motivoDeCotizacionManual(
  domicilio: Domicilio,
): "fuera_de_cobertura" | "sin_cotizacion" | null {
  switch (domicilio.estado) {
    case "fuera":
      return "fuera_de_cobertura";
    case "fallido":
      return "sin_cotizacion";
    case "no_aplica":
    case "conocido":
    case "sin_ubicacion":
    case "calculando":
      return null;
  }
}
