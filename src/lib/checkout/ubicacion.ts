/**
 * Por qué falló "Usar mi ubicación actual", y qué se le dice al cliente.
 *
 * Nace de un fallo silencioso en un iPhone: el cliente tocó el botón, **no pasó nada** —el mapa
 * quieto, ningún aviso— y acabó saliendo a los Ajustes del teléfono a darle permiso a Safari por
 * su cuenta. El teléfono tenía la Localización apagada para el navegador, así que iOS ni llegó a
 * mostrar el diálogo: contestó `PERMISSION_DENIED` de inmediato. El componente recibía el error,
 * lo tiraba, y pintaba una frase gris debajo de un mapa de 256 px que en un teléfono queda fuera
 * de pantalla.
 *
 * **Lo que no se puede hacer, para que no se vuelva a intentar:**
 *
 * - No hay forma de reabrir el diálogo de permiso desde JavaScript. Una vez denegado —por sitio
 *   o por sistema— solo queda explicarle al cliente dónde está el interruptor.
 * - No se puede enlazar a los Ajustes de iOS: los esquemas `App-Prefs:` están bloqueados en
 *   Safari. Las instrucciones son texto que el cliente sigue a mano.
 * - No se puede consultar el permiso antes de pedirlo: WebKit no implementa
 *   `navigator.permissions.query({ name: "geolocation" })`. La **única** señal disponible es el
 *   `code` del callback de error, que es justo lo que aquí se traduce.
 *
 * Todo el módulo es puro y recibe el user agent por parámetro, igual que `leerGuardado` en
 * `tienda/tipo-pedido.ts`: los tests corren en `environment: "node"` y ahí no hay `navigator`.
 *
 * El texto vive aquí y no en el componente por el mismo criterio de la regla 10: quien redacta
 * lo que lee un cliente no debería tener que abrir un archivo de JSX para encontrarlo.
 */

/** Qué salió mal, en el idioma del negocio y no en el de la API. */
export type FalloUbicacion = "sin_soporte" | "permiso" | "no_disponible" | "tardo";

/**
 * Qué navegador es. Importa **solo** para saber a qué pantalla de Ajustes mandar: en iOS todos
 * son WebKit por obligación de Apple, así que el fallo es idéntico en los tres, pero cada uno
 * tiene su propia entrada en la lista de Localización.
 */
export type Navegador = "safari" | "chrome" | "otro";

export type ContextoNavegador = { ios: boolean; navegador: Navegador };

export type TextoFallo = {
  titulo: string;
  /** Los pasos a seguir. Vacío cuando no hay ninguno que dar (ver `sin_soporte`). */
  pasos: string[];
  /** El pin a mano, que siempre vale lo mismo (regla 14). Nunca vacío. */
  alternativa: string;
};

/**
 * Del `code` de `GeolocationPositionError` a nuestro fallo. `null` = no había API que llamar.
 *
 * Un código desconocido cae en `no_disponible` a propósito: es un fallo real de causa que no
 * sabemos, y ese es el único texto que nombra los dos interruptores sin prometer cuál falló.
 */
export function diagnosticar(codigo: number | null): FalloUbicacion {
  if (codigo === null) return "sin_soporte";

  switch (codigo) {
    case 1:
      return "permiso";
    case 3:
      return "tardo";
    default:
      return "no_disponible";
  }
}

/**
 * Los clientes de esta tienda entran desde un teléfono. El iPad de iPadOS 13+ se anuncia como
 * Macintosh y aquí daría `false`; se acepta, porque lo que se pierde es una instrucción más
 * precisa en un dispositivo que aquí casi no aparece, y el texto genérico sigue sirviendo.
 */
export function esIOS(ua: string): boolean {
  return /iPhone|iPad|iPod/.test(ua);
}

/**
 * **El orden es la función.** Todos los user agents de iOS terminan en `Safari/…`, también el de
 * Chrome, y el de Chrome de escritorio igual. Buscar "Safari" primero devolvería `safari` para
 * medio mundo y mandaría a esa gente a una pantalla de Ajustes que no es la suya.
 */
export function navegadorDeUA(ua: string): Navegador {
  // Firefox y Edge de iOS llevan "Safari" detrás, y el de Edge además contiene "Edg".
  if (/FxiOS|EdgiOS|Edg\//.test(ua)) return "otro";
  if (/CriOS|Chrome/.test(ua)) return "chrome";
  if (/Safari/.test(ua)) return "safari";

  return "otro";
}

export function contextoDelNavegador(ua: string): ContextoNavegador {
  return { ios: esIOS(ua), navegador: navegadorDeUA(ua) };
}

/** Cómo se llama el navegador en la lista de Localización de iOS. */
function enLaListaDeAjustes(navegador: Navegador): string {
  switch (navegador) {
    case "safari":
      return "«Sitios web de Safari»";
    case "chrome":
      return "«Chrome»";
    case "otro":
      return "tu navegador";
  }
}

/** Cómo nombrarlo en una frase, sin inventarle marca al que no reconocemos. */
function comoSeLlama(navegador: Navegador): string {
  switch (navegador) {
    case "safari":
      return "Safari";
    case "chrome":
      return "Chrome";
    case "otro":
      return "este navegador";
  }
}

/**
 * El único paso que la gente se salta y sin el cual nada de esto funciona: iOS no reevalúa un
 * permiso recién concedido hasta que la página se recarga. Y se puede prometer sin miedo que no
 * se pierde nada, porque el paso, el carrito y los datos viven en `localStorage`.
 */
const VOLVER_Y_RECARGAR =
  "Vuelve aquí y recarga la página. Tu pedido queda tal como lo dejaste.";

const TOCA_EL_MAPA =
  "O toca el mapa donde queda tu casa y arrastra el pin: vale exactamente igual, y el domicilio cuesta lo mismo.";

/**
 * Qué se le muestra al cliente. `Record` exhaustivo por `FalloUbicacion`: añadir un fallo sin
 * escribirle texto no compila.
 */
export function textoDelFallo(fallo: FalloUbicacion, contexto: ContextoNavegador): TextoFallo {
  const { ios, navegador } = contexto;

  const textos: Record<FalloUbicacion, Omit<TextoFallo, "alternativa">> = {
    // No hay nada que activar ni que reintentar, así que tampoco hay pasos: una lista de
    // instrucciones inventadas sería peor que la alternativa a secas.
    sin_soporte: {
      titulo: "Este navegador no puede darnos tu ubicación.",
      pasos: [],
    },

    // El código 1 llega por DOS caminos que se arreglan distinto: que el teléfono tenga la
    // Localización apagada para el navegador —y entonces no hubo diálogo ninguno— o que el
    // cliente haya tocado "No permitir" en el diálogo. El ajuste de fábrica de iOS es
    // "Preguntar", así que el segundo caso va a ser el común. Afirmar el primero mandaría a
    // media clientela a una pantalla de Ajustes donde no van a encontrar nada raro, así que
    // el texto pregunta en vez de asegurar. La acción sí sirve para los dos: recargar hace
    // que Safari vuelva a preguntar.
    permiso: ios
      ? {
          titulo: "No pudimos ver tu ubicación: falta el permiso.",
          pasos: [
            `¿No te preguntó nada? Tu iPhone tiene la Localización apagada para ${comoSeLlama(navegador)}: sal a Ajustes › Privacidad y seguridad › Localización y entra a ${enLaListaDeAjustes(navegador)} › «Al usar la app».`,
            "¿Te preguntó y tocaste «No permitir»? Entonces no tienes que ir a ningún lado.",
            "En los dos casos: recarga con el botón de aquí abajo y elige «Permitir» cuando te pregunte. Tu pedido queda tal como lo dejaste.",
          ],
        }
      : {
          titulo: "No pudimos ver tu ubicación: falta el permiso.",
          pasos: [
            "Toca el candado o el icono de ubicación que está junto a la dirección de esta página.",
            "Permite la ubicación para este sitio.",
            VOLVER_Y_RECARGAR,
          ],
        },

    // El código 2 llega tanto cuando el GPS no engancha como cuando la Localización está
    // apagada de raíz, y iOS reparte los dos casos entre el 1 y el 2 sin criterio fijo. Por
    // eso este texto habla de los dos y no apuesta por la falta de señal.
    no_disponible: ios
      ? {
          titulo: "Tu teléfono no pudo darnos la ubicación.",
          pasos: [
            "Revisa que la Localización esté encendida: Ajustes › Privacidad y seguridad › Localización.",
            `Comprueba ahí mismo que ${comoSeLlama(navegador)} la tenga permitida.`,
            "Si estás bajo techo, acércate a una ventana e intenta de nuevo.",
          ],
        }
      : {
          titulo: "No pudimos leer tu ubicación.",
          pasos: [
            "Revisa que la Localización esté encendida en tu dispositivo.",
            "Comprueba que este sitio tenga permiso para usarla.",
            "Intenta de nuevo.",
          ],
        },

    tardo: {
      titulo: "Tu ubicación se demoró más de la cuenta.",
      pasos: [
        "Si estás bajo techo, acércate a una ventana o sal un momento.",
        "Intenta de nuevo: a veces el GPS tarda unos segundos en enganchar.",
      ],
    },
  };

  return { ...textos[fallo], alternativa: TOCA_EL_MAPA };
}

/**
 * Qué botón ofrecerle al cliente después del fallo.
 *
 * Que el permiso lleve a **recargar** y no a reintentar no es un detalle de estilo: iOS no
 * reevalúa el permiso recién concedido en la misma carga de página, así que un "reintentar"
 * volvería a fallar y el cliente concluiría que activarlo no sirvió de nada.
 */
export function accionDelFallo(fallo: FalloUbicacion): "recargar" | "reintentar" | "ninguna" {
  switch (fallo) {
    case "permiso":
      return "recargar";
    case "no_disponible":
    case "tardo":
      return "reintentar";
    case "sin_soporte":
      return "ninguna";
  }
}
