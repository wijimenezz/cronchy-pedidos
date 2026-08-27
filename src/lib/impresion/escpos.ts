/**
 * ESC/POS — los bytes que entiende la impresora térmica.
 *
 * Puro y sin dependencias, igual que `precios.ts` o `franjas.ts`: recibe texto y devuelve bytes.
 * No sabe qué es un pedido; eso lo saben `comanda.ts` y `recibo.ts`.
 *
 * Es el espejo en TypeScript del `EscPosHelper.java` de la app de impresión, con una diferencia
 * que no es de estilo: **aquí el texto no sale en UTF-8**. Ver `codificar`.
 */

/** 80 mm de papel. El rollo de 58 serían 32. */
export const ANCHO = 48;

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

// ------------------------------------------------------------
// Codificación
// ------------------------------------------------------------

/**
 * Las posiciones que CP437 y CP850 comparten byte por byte.
 *
 * Una térmica no habla UTF-8: habla *páginas de códigos*, y cuál trae de fábrica depende del
 * fabricante. Estas dos son las candidatas en la práctica, y en este rango coinciden — así que
 * un ticket escrito solo con esto sale bien en las dos sin tener que adivinar.
 *
 * Á, Í, Ó y Ú **no están aquí a propósito**: solo existen en CP850. En una impresora que
 * arranque en 437, su byte pinta un símbolo de dibujo de cajas.
 */
const COMUNES: Record<string, number> = {
  "Ç": 0x80, "ü": 0x81, "é": 0x82, "â": 0x83, "ä": 0x84, "à": 0x85, "å": 0x86, "ç": 0x87,
  "ê": 0x88, "ë": 0x89, "è": 0x8a, "ï": 0x8b, "î": 0x8c, "ì": 0x8d, "Ä": 0x8e, "Å": 0x8f,
  "É": 0x90, "æ": 0x91, "Æ": 0x92, "ô": 0x93, "ö": 0x94, "ò": 0x95, "û": 0x96, "ù": 0x97,
  "ÿ": 0x98, "Ö": 0x99, "Ü": 0x9a, "£": 0x9c, "ƒ": 0x9f,
  "á": 0xa0, "í": 0xa1, "ó": 0xa2, "ú": 0xa3, "ñ": 0xa4, "Ñ": 0xa5, "ª": 0xa6, "º": 0xa7,
  "¿": 0xa8, "¬": 0xaa, "½": 0xab, "¼": 0xac, "¡": 0xad, "«": 0xae, "»": 0xaf,
  "°": 0xf8,
};

/**
 * Signos de pantalla que no tienen sitio seguro en el papel.
 *
 * El `×` es el de `resumirItems` y el `·` el de los separadores del panel. Ojo con `×`: CP850 lo
 * tiene en 0x9E, pero ese byte en CP437 es el símbolo de la peseta.
 */
const TRANSLITERA: Record<string, string> = {
  "×": "x",
  "·": "-",
  "—": "-",
  "–": "-",
  "…": "...",
  "€": "EUR",
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  " ": " ",
  " ": " ",
};

/** Quita las tildes de lo que no está en `COMUNES`: "Á" -> "A". */
function sinTilde(caracter: string): string {
  return caracter.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

const INTERROGACION = 0x3f;

/**
 * Texto -> bytes de la impresora.
 *
 * Lo que hace mal el Java equivalente y aquí no: `text.getBytes("UTF-8")` manda dos bytes por
 * vocal acentuada (0xC3 0xA1 para "á") y la impresora, que lee de a un byte, pinta "Ã¡". En los
 * datos de AppSheet no se nota porque vienen sin tildes; aquí el catálogo dice "Cronchy Clásico".
 *
 * El orden de la búsqueda es el de la confianza: lo que la página de códigos representa exacto,
 * lo que se puede sustituir por un signo equivalente, lo que se puede escribir sin tilde, y en
 * último lugar una interrogación — que se ve mal pero no descuadra la columna.
 */
export function codificar(texto: string): Uint8Array {
  const salida: number[] = [];

  for (const caracter of texto) {
    const codigo = caracter.codePointAt(0) ?? 0;

    if (codigo === LF || (codigo >= 0x20 && codigo < 0x7f)) {
      salida.push(codigo);
      continue;
    }

    const comun = COMUNES[caracter];
    if (comun !== undefined) {
      salida.push(comun);
      continue;
    }

    const equivalente = TRANSLITERA[caracter] ?? sinTilde(caracter);
    if (equivalente && equivalente !== caracter) {
      salida.push(...codificar(equivalente));
      continue;
    }

    salida.push(INTERROGACION);
  }

  return Uint8Array.from(salida);
}

// ------------------------------------------------------------
// Maquetación
// ------------------------------------------------------------

/**
 * Cuántas columnas del papel ocupa este texto.
 *
 * **Es la única respuesta correcta**, y no `texto.length`. Quien decide lo que sale es
 * `codificar`, y no conserva la longitud: `…` y `€` se transliteran a tres caracteres, y un
 * emoji son dos unidades de UTF-16 que acaban en un solo byte de interrogación.
 *
 * Medir en caracteres rompía las dos garantías de este módulo: una nota de 48 caracteres con un
 * `…` dentro emitía 50 bytes y la impresora partía la línea, y un emoji dejaba la columna corta
 * y descuadraba las cifras de la tabla del recibo.
 */
export function anchoImpreso(texto: string): number {
  return codificar(texto).length;
}

/** El trozo más largo del texto que cabe en `columnas` impresas. */
function recortar(texto: string, columnas: number): string {
  let salida = "";
  let usado = 0;

  for (const caracter of texto) {
    const coste = anchoImpreso(caracter);
    if (usado + coste > columnas) break;
    salida += caracter;
    usado += coste;
  }

  return salida;
}

/**
 * El texto en exactamente `ancho` caracteres: rellenado con espacios, o cortado.
 *
 * El corte deja un punto final en vez de acabar en seco, que es lo que distingue "Cronchy
 * Familiar" recortado de un producto que de verdad se llama "Cronchy Famili".
 */
export function ajustar(texto: string, ancho: number): string {
  if (ancho <= 0) return "";

  const mide = anchoImpreso(texto);
  if (mide <= ancho) return texto + " ".repeat(ancho - mide);

  // Se vuelve a medir el recorte: al cortar puede caerse un carácter que valía tres columnas,
  // y una columna corta corre todas las de su derecha.
  const cortado = `${recortar(texto, ancho - 1)}.`;

  return cortado + " ".repeat(Math.max(0, ancho - anchoImpreso(cortado)));
}

/**
 * El texto pegado al borde derecho de su columna. Es la alineación de las cifras.
 *
 * Lo que **no** hace es recortar: una cifra a la que se le come un dígito sigue pareciendo una
 * cifra, y nadie nota que "$1.234.567" salió como "234.567". Que invada la columna vecina se ve
 * de inmediato, que es exactamente lo que se quiere de un fallo con dinero de por medio.
 */
export function derecha(texto: string, ancho: number): string {
  return " ".repeat(Math.max(0, ancho - anchoImpreso(texto))) + texto;
}

/** El texto centrado. Con sobrante impar, el espacio de más va a la derecha. */
export function centrar(texto: string, ancho: number): string {
  const mide = anchoImpreso(texto);
  if (mide >= ancho) return recortar(texto, ancho);

  const sobra = ancho - mide;
  const izquierda = Math.floor(sobra / 2);

  return " ".repeat(izquierda) + texto + " ".repeat(sobra - izquierda);
}

/**
 * Una etiqueta a la izquierda y su valor pegado al borde derecho: `TOTAL:        $59.500`.
 *
 * **Nunca desborda**, a diferencia del `printRow` del Java: si las dos partes no caben, la que
 * cede es la izquierda. Una fila más larga que el papel no se lee como una fila larga — la
 * impresora la parte, y la cifra aparece sola en la línea siguiente como si fuera otro dato.
 */
export function fila(izquierda: string, derecha: string, ancho: number = ANCHO): string {
  const disponible = Math.max(0, ancho - anchoImpreso(derecha) - 1);

  return `${ajustar(izquierda, disponible)} ${derecha}`;
}

/**
 * Corta el texto en líneas de `ancho`, por palabras.
 *
 * Una palabra más larga que la columna se parte, que es lo que el `wrapText` del Java no hace:
 * allí se queda entera y desborda, arrastrando el resto de la línea.
 */
export function envolver(texto: string, ancho: number): string[] {
  const limpio = texto.trim();
  if (!limpio || ancho <= 0) return [];

  const lineas: string[] = [];
  let actual = "";

  const cerrar = () => {
    if (actual) lineas.push(actual);
    actual = "";
  };

  for (const palabra of limpio.split(/\s+/)) {
    let resto = palabra;

    // Una palabra que no cabe ni sola en una línea vacía se parte a lo bruto.
    while (anchoImpreso(resto) > ancho) {
      cerrar();

      const trozo = recortar(resto, ancho);

      // Ni un carácter cabe: pasa solo con anchos absurdos (una `…` vale tres columnas). Sale
      // desbordado, que se ve, en vez de comerse el carácter en silencio o girar para siempre.
      const [primero] = [...resto];
      const cabe = trozo || primero;

      lineas.push(cabe);
      resto = resto.slice(cabe.length);
    }

    if (!resto) continue;

    if (!actual) actual = resto;
    else if (anchoImpreso(actual) + 1 + anchoImpreso(resto) <= ancho) actual += ` ${resto}`;
    else {
      cerrar();
      actual = resto;
    }
  }

  cerrar();

  return lineas;
}

/** La línea de guiones (o de lo que se pida) que separa los bloques del ticket. */
export function separador(caracter = "-", ancho: number = ANCHO): string {
  return caracter.repeat(ancho);
}

// ------------------------------------------------------------
// El ticket
// ------------------------------------------------------------

const RESET: number[] = [ESC, 0x40];

/**
 * Fija la página de códigos en PC437.
 *
 * `ESC @` solo resetea; sin esto la impresora se queda en la que trajera de fábrica, y ahí es
 * donde 0xA0 deja de ser "á". Es el otro lado de la moneda de `codificar`: de nada sirve mandar
 * el byte correcto si no se dice en qué tabla leerlo.
 */
const PAGINA_437: number[] = [ESC, 0x74, 0x00];

/**
 * Negrita: énfasis (`ESC E`) **y** doble golpe (`ESC G`), siempre los dos.
 *
 * No es redundancia. Una térmica barata suele implementar bien uno de los dos y hacer poco o nada
 * con el otro, y cuál sea depende del fabricante — el mismo problema que resuelve `PAGINA_437`, y
 * la misma respuesta: no adivinar. Con `ESC E` solo, la comanda salía con el nombre del producto
 * indistinguible del resto del papel, que es justo lo que la cocina tiene que leer de un vistazo.
 *
 * Doble golpe es literalmente eso: la impresora pasa el cabezal dos veces por la línea. Sale más
 * lento, y en un ticket de veinte líneas eso no se nota.
 */
const NEGRITA: Record<"on" | "off", number[]> = {
  on: [ESC, 0x45, 0x01, ESC, 0x47, 0x01],
  off: [ESC, 0x45, 0x00, ESC, 0x47, 0x00],
};

const ALINEAR: Record<"izquierda" | "centro", number[]> = {
  izquierda: [ESC, 0x61, 0x00],
  centro: [ESC, 0x61, 0x01],
};

const TAMANO: Record<TamanoTexto, number[]> = {
  normal: [GS, 0x21, 0x00],
  /** Alto y ancho. Es el del número de pedido. */
  doble: [GS, 0x21, 0x11],
  /** Solo ancho, para un titular que no puede gastar dos líneas de alto. */
  ancho: [GS, 0x21, 0x10],
};

export type TamanoTexto = "normal" | "doble" | "ancho";

/**
 * Cuántas columnas del papel gasta UN carácter en cada tamaño.
 *
 * A doble ancho la línea son 24 columnas y no 48, y eso no es un detalle: el encabezado del
 * recibo lleva el nombre del negocio a doble tamaño, y "Cronchy - Churros y Helados" son 27
 * caracteres que en el papel miden 54. La impresora los partía a media palabra.
 *
 * La altura no entra: doble alto gasta dos líneas, no dos columnas.
 */
const COLUMNAS_POR_CARACTER: Record<TamanoTexto, number> = {
  normal: 1,
  doble: 2,
  ancho: 2,
};

export type EstiloLinea = {
  negrita?: boolean;
  tamano?: TamanoTexto;
  centrado?: boolean;
};

export type OpcionesEnvuelto = EstiloLinea & {
  /** El ancho TOTAL de la línea, sangría incluida. */
  ancho?: number;
  sangria?: number;
};

export type Ticket = {
  /** Una línea de texto. Sin argumentos, una línea en blanco. */
  linea(texto?: string, estilo?: EstiloLinea): Ticket;
  /** Etiqueta a la izquierda, valor pegado al borde derecho. */
  fila(izquierda: string, derecha: string, ancho?: number, estilo?: EstiloLinea): Ticket;
  /**
   * Un dato con su etiqueta, que baja de línea si el valor no cabe.
   *
   * Es lo que `fila` no puede ser: aquella recorta la IZQUIERDA para salvar la derecha, que es
   * lo correcto con una cifra —nunca se recorta dinero— y desastroso con un nombre de cliente
   * de cincuenta caracteres, que se llevaría la etiqueta por delante y desbordaría igual.
   */
  dato(etiqueta: string, valor: string, ancho?: number, estilo?: EstiloLinea): Ticket;
  separador(caracter?: string, ancho?: number): Ticket;
  /** Un texto largo repartido en varias líneas, opcionalmente sangrado. */
  envuelto(texto: string, opciones?: OpcionesEnvuelto): Ticket;
  /** Avanza el papel y corta. Va al final de todo ticket. */
  cortar(): Ticket;
  bytes(): Uint8Array;
};

/**
 * Un ticket que se va escribiendo por encadenamiento.
 *
 * **El estilo se cierra en la misma línea que lo abrió**, y esa es la diferencia con el
 * `EscPosHelper` del que viene: allí hay que acordarse de mandar `BOLD_OFF`, y lo que pasa
 * cuando alguien se olvida es que el resto del ticket sale en negrita. Aquí no hay estado que
 * quede abierto, así que ninguna plantilla puede ensuciar a la siguiente.
 */
export function crearTicket(): Ticket {
  const salida: number[] = [...RESET, ...PAGINA_437];

  const escribir = (texto: string, estilo: EstiloLinea = {}): void => {
    if (estilo.centrado) salida.push(...ALINEAR.centro);
    if (estilo.negrita) salida.push(...NEGRITA.on);
    if (estilo.tamano && estilo.tamano !== "normal") salida.push(...TAMANO[estilo.tamano]);

    salida.push(...codificar(texto), LF);

    if (estilo.tamano && estilo.tamano !== "normal") salida.push(...TAMANO.normal);
    if (estilo.negrita) salida.push(...NEGRITA.off);
    if (estilo.centrado) salida.push(...ALINEAR.izquierda);
  };

  const ticket: Ticket = {
    linea(texto = "", estilo) {
      escribir(texto, estilo);
      return ticket;
    },

    fila(izquierda, derecha, ancho = ANCHO, estilo) {
      escribir(fila(izquierda, derecha, ancho), estilo);
      return ticket;
    },

    dato(etiqueta, valor, ancho = ANCHO, estilo) {
      if (etiqueta.length + 1 + valor.length <= ancho) {
        return ticket.fila(etiqueta, valor, ancho, estilo);
      }

      escribir(etiqueta, estilo);
      return ticket.envuelto(valor, { ...estilo, ancho, sangria: 2 });
    },

    separador(caracter, ancho) {
      escribir(separador(caracter, ancho));
      return ticket;
    },

    envuelto(texto, opciones = {}) {
      const { ancho = ANCHO, sangria = 0, ...estilo } = opciones;
      const margen = " ".repeat(sangria);

      // Dos descuentos sobre el ancho del papel, y ninguno es opcional:
      //
      // - El TAMAÑO. A doble ancho caben la mitad de caracteres, y la sangría también se
      //   imprime grande, así que se divide antes de restarla.
      // - La SANGRÍA come del ancho en vez de sumarse: una nota maquetada a 48 y luego
      //   empujada dos espacios saldría desbordada de todos modos.
      const porCaracter = COLUMNAS_POR_CARACTER[estilo.tamano ?? "normal"];
      const util = Math.floor(ancho / porCaracter) - sangria;

      for (const trozo of envolver(texto, util)) {
        escribir(margen + trozo, estilo);
      }

      return ticket;
    },

    cortar() {
      // El papel avanza ANTES de la cuchilla porque el cabezal está unos milímetros por
      // encima de ella: sin esto, el corte se lleva las últimas líneas.
      salida.push(ESC, 0x64, 0x04, GS, 0x56, 0x42, 0x00);
      return ticket;
    },

    bytes() {
      return Uint8Array.from(salida);
    },
  };

  return ticket;
}
