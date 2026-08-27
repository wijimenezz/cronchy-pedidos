import { describe, expect, it } from "vitest";
import { columnasDelTicket } from "./pruebas/decodificar";
import {
  ajustar,
  anchoImpreso,
  centrar,
  codificar,
  crearTicket,
  derecha,
  envolver,
  fila,
  separador,
} from "./escpos";

/** Los bytes como array, que es lo que se puede leer en un `toEqual`. */
function bytes(texto: string): number[] {
  return Array.from(codificar(texto));
}

describe("codificar", () => {
  it("el ASCII imprimible pasa tal cual", () => {
    expect(bytes("Cronchy #12")).toEqual([
      0x43, 0x72, 0x6f, 0x6e, 0x63, 0x68, 0x79, 0x20, 0x23, 0x31, 0x32,
    ]);
  });

  // El bug que esto existe para evitar: `getBytes("UTF-8")` mandaría DOS bytes por vocal
  // (0xC3 0xA1 para "á") y la impresora pintaría "Ã¡".
  it("una vocal con tilde es UN byte, no la pareja de UTF-8", () => {
    expect(bytes("á")).toEqual([0xa0]);
    expect(bytes("Clásico")).toEqual([0x43, 0x6c, 0xa0, 0x73, 0x69, 0x63, 0x6f]);
  });

  // Estas posiciones son las MISMAS en CP437 y en CP850, así que el ticket sale bien sin
  // depender de cuál de las dos trae la impresora de fábrica.
  it("las minúsculas acentuadas y la eñe caen en el hueco que las dos páginas comparten", () => {
    expect(bytes("áéíóú")).toEqual([0xa0, 0x82, 0xa1, 0xa2, 0xa3]);
    expect(bytes("ñÑ")).toEqual([0xa4, 0xa5]);
    expect(bytes("üÜ")).toEqual([0x81, 0x9a]);
    expect(bytes("¿¡")).toEqual([0xa8, 0xad]);
    expect(bytes("É")).toEqual([0x90]);
  });

  // Á, Í, Ó y Ú solo existen en CP850. Mandar su byte de 850 imprimiría un símbolo de caja
  // en una impresora que arranque en 437, así que se les quita la tilde.
  it("las mayúsculas que solo tiene CP850 pierden la tilde en vez de arriesgarse", () => {
    expect(bytes("ÁÍÓÚ")).toEqual([0x41, 0x49, 0x4f, 0x55]);
    expect(bytes("FUSAGASUGÁ")).toEqual([
      0x46, 0x55, 0x53, 0x41, 0x47, 0x41, 0x53, 0x55, 0x47, 0x41,
    ]);
  });

  // El `×` de `resumirItems` y el `·` de los separadores del panel. En CP437 el 0x9E que
  // CP850 usa para `×` es el símbolo de la peseta.
  it("los signos de la pantalla se transliteran", () => {
    expect(bytes("2×")).toEqual([0x32, 0x78]);
    expect(bytes("a·b")).toEqual([0x61, 0x2d, 0x62]);
    expect(bytes("a—b")).toEqual([0x61, 0x2d, 0x62]);
    expect(bytes("…")).toEqual([0x2e, 0x2e, 0x2e]);
  });

  it("un carácter que no se puede representar sale como interrogación", () => {
    expect(bytes("漢")).toEqual([0x3f]);
  });

  it("el salto de línea sobrevive", () => {
    expect(bytes("a\nb")).toEqual([0x61, 0x0a, 0x62]);
  });

  it("un texto vacío no produce bytes", () => {
    expect(bytes("")).toEqual([]);
  });
});

describe("ajustar", () => {
  it("rellena con espacios hasta el ancho pedido", () => {
    expect(ajustar("Oreo", 8)).toBe("Oreo    ");
  });

  it("lo que no cabe se corta con un punto que avisa del recorte", () => {
    expect(ajustar("Cronchy Familiar", 8)).toBe("Cronchy.");
  });

  it("lo que mide justo se queda igual", () => {
    expect(ajustar("Cronchy", 7)).toBe("Cronchy");
  });
});

describe("centrar", () => {
  it("reparte el sobrante a los dos lados", () => {
    expect(centrar("ab", 6)).toBe("  ab  ");
  });

  it("con sobrante impar la izquierda cede el espacio de más", () => {
    expect(centrar("ab", 7)).toBe("  ab   ");
  });
});

describe("fila", () => {
  it("empuja la derecha contra el borde", () => {
    expect(fila("TOTAL:", "$59.500", 20)).toBe("TOTAL:       $59.500");
  });

  // Una fila que desborda no se ve como una fila larga: el papel la parte y la cifra de la
  // derecha aparece sola en la línea siguiente, como si fuera otro dato.
  it("si no cabe, cede la izquierda en vez de desbordar a la línea siguiente", () => {
    const linea = fila("Cronchy Familiar con todo", "$59.500", 20);

    expect(linea).toHaveLength(20);
    expect(linea.endsWith("$59.500")).toBe(true);
  });

  it("siempre deja al menos un espacio entre las dos", () => {
    const linea = fila("izquierdaquecrece", "derecha", 24);

    // 17 + 7 son los 24 justos, así que la izquierda cede uno para que quede el espacio.
    expect(linea).toBe("izquierdaquecre. derecha");
  });
});

describe("envolver", () => {
  it("un texto que cabe es una sola línea", () => {
    expect(envolver("Sin salsa", 20)).toEqual(["Sin salsa"]);
  });

  it("parte por palabras, sin cortarlas", () => {
    expect(envolver("Timbre dañado, llamar al llegar", 16)).toEqual([
      "Timbre dañado,",
      "llamar al llegar",
    ]);
  });

  // El word wrap del Java se queda mirando una palabra que no cabe y la deja desbordar.
  it("una palabra más larga que la columna se parte", () => {
    expect(envolver("supercalifragilistico", 8)).toEqual([
      "supercal",
      "ifragili",
      "stico",
    ]);
  });

  it("un texto vacío no da ninguna línea", () => {
    expect(envolver("", 20)).toEqual([]);
    expect(envolver("   ", 20)).toEqual([]);
  });
});

describe("separador", () => {
  it("llena la línea entera", () => {
    expect(separador("=", 5)).toBe("=====");
  });

  it("por defecto es un guion a lo ancho del papel", () => {
    expect(separador()).toBe("-".repeat(48));
  });
});

describe("crearTicket", () => {
  const desdeElTexto = (t: { bytes: () => Uint8Array }) => Array.from(t.bytes()).slice(5);

  // `ESC @` solo resetea; sin `ESC t 0` la impresora se queda en la página que trajera de
  // fábrica, y ahí es donde 0xA0 deja de ser "á".
  it("arranca reseteando Y fijando la página de códigos", () => {
    expect(Array.from(crearTicket().bytes())).toEqual([0x1b, 0x40, 0x1b, 0x74, 0x00]);
  });

  it("una línea es su texto y un salto", () => {
    expect(desdeElTexto(crearTicket().linea("ab"))).toEqual([0x61, 0x62, 0x0a]);
  });

  it("sin texto es una línea en blanco", () => {
    expect(desdeElTexto(crearTicket().linea())).toEqual([0x0a]);
  });

  // El riesgo de los toggles del Java es dejar la impresora en negrita para el resto del
  // ticket. Aquí el estilo se cierra en la misma línea que lo abrió.
  it("la negrita se cierra sola al terminar la línea", () => {
    expect(desdeElTexto(crearTicket().linea("a", { negrita: true }))).toEqual([
      0x1b, 0x45, 0x01, 0x1b, 0x47, 0x01, 0x61, 0x0a, 0x1b, 0x45, 0x00, 0x1b, 0x47, 0x00,
    ]);
  });

  // Con `ESC E` solo, la comanda salía con el nombre del producto igual que el resto del papel:
  // cuál de los dos comandos obedece una térmica depende del fabricante, así que van los dos.
  it("la negrita manda énfasis Y doble golpe, y cierra los dos", () => {
    const bytes = String(desdeElTexto(crearTicket().linea("a", { negrita: true })));

    expect(bytes).toContain(String([0x1b, 0x45, 0x01, 0x1b, 0x47, 0x01]));
    expect(bytes).toContain(String([0x1b, 0x45, 0x00, 0x1b, 0x47, 0x00]));
  });

  it("el tamaño doble y el centrado también se cierran solos", () => {
    expect(desdeElTexto(crearTicket().linea("a", { tamano: "doble", centrado: true }))).toEqual([
      0x1b, 0x61, 0x01, 0x1d, 0x21, 0x11, 0x61, 0x0a, 0x1d, 0x21, 0x00, 0x1b, 0x61, 0x00,
    ]);
  });

  it("una línea sin estilo no gasta un solo byte de comando", () => {
    expect(desdeElTexto(crearTicket().linea("a"))).toEqual([0x61, 0x0a]);
  });

  it("acumula lo que se le va encadenando", () => {
    const ticket = crearTicket().linea("a").separador("=", 3).fila("b", "c", 5);

    expect(desdeElTexto(ticket)).toEqual([
      0x61, 0x0a,
      0x3d, 0x3d, 0x3d, 0x0a,
      0x62, 0x20, 0x20, 0x20, 0x63, 0x0a,
    ]);
  });

  it("el texto envuelto sale una línea por trozo, con su sangría", () => {
    const ticket = crearTicket().envuelto("uno dos tres", { ancho: 7, sangria: 2 });

    expect(String.fromCharCode(...desdeElTexto(ticket))).toBe("  uno\n  dos\n  tres\n");
  });

  it("cortar avanza el papel antes de la cuchilla", () => {
    expect(desdeElTexto(crearTicket().cortar())).toEqual([
      0x1b, 0x64, 0x04, 0x1d, 0x56, 0x42, 0x00,
    ]);
  });
});

describe("derecha", () => {
  it("pega el texto al borde derecho de su columna", () => {
    expect(derecha("$5.000", 10)).toBe("    $5.000");
  });

  // Una cifra recortada por la izquierda es otra cifra. Que se coma la columna del vecino se
  // ve; que "$1.234.567" salga como "234.567" no.
  it("una cifra que no cabe se lleva su columna entera antes que mentir", () => {
    expect(derecha("$1.234.567", 6)).toBe("$1.234.567");
  });
});

describe("dato", () => {
  const lineasDe = (t: { bytes: () => Uint8Array }) =>
    String.fromCharCode(...Array.from(t.bytes()).slice(5)).split("\n").slice(0, -1);

  it("etiqueta y valor en una línea cuando caben", () => {
    expect(lineasDe(crearTicket().dato("Cliente:", "Wilson", 20))).toEqual([
      "Cliente:      Wilson",
    ]);
  });

  // `fila` recorta la IZQUIERDA para que quepa la derecha, que es lo correcto con una cifra
  // pero no con un nombre: dejaría "C. Maria Fernanda Rodriguez de la Espriella" desbordando.
  it("un valor más largo que el papel baja de línea en vez de desbordar", () => {
    const lineas = lineasDe(crearTicket().dato("Cliente:", "Maria Fernanda Buenaventura", 20));

    expect(lineas[0]).toBe("Cliente:");
    expect(lineas.slice(1)).toEqual(["  Maria Fernanda", "  Buenaventura"]);
    expect(lineas.every((l) => l.length <= 20)).toBe(true);
  });
});

describe("anchoImpreso", () => {
  // Quien decide cuántas columnas salen es `codificar`, y no conserva la longitud del texto.
  it("cuenta lo que la impresora recibe, no los caracteres del string", () => {
    expect(anchoImpreso("Cronchy")).toBe(7);
    expect(anchoImpreso("Clásico")).toBe(7);
  });

  it("lo que se translitera a varios caracteres cuenta por varios", () => {
    expect(anchoImpreso("…")).toBe(3);
    expect(anchoImpreso("€")).toBe(3);
  });

  // Un emoji son DOS unidades de UTF-16 y UN byte de interrogación en el papel. Midiendo con
  // `String.length` la columna salía corta y descuadraba la tabla del recibo.
  it("un emoji ocupa una sola columna, aunque `length` diga dos", () => {
    expect("🙂".length).toBe(2);
    expect(anchoImpreso("🙂")).toBe(1);
  });
});

describe("medir en columnas y no en caracteres", () => {
  it("ajustar rellena hasta completar columnas impresas", () => {
    expect(anchoImpreso(ajustar("a…", 8))).toBe(8);
    expect(anchoImpreso(ajustar("a🙂b", 8))).toBe(8);
  });

  it("centrar también", () => {
    expect(anchoImpreso(centrar("a…", 9))).toBe(9);
  });

  it("fila cuadra el ancho aunque el valor se expanda al codificar", () => {
    expect(anchoImpreso(fila("Nota:", "1…", 20))).toBe(20);
  });

  // Es justo lo que `envolver` existe para evitar: una línea de 48 caracteres con un `…`
  // dentro emite 50 bytes y la impresora la parte sola.
  it("envolver corta por columnas, no por caracteres", () => {
    const conPuntos = `${"palabra ".repeat(5)}fin… ${"otra ".repeat(6)}`;

    for (const linea of envolver(conPuntos, 20)) {
      expect(anchoImpreso(linea)).toBeLessThanOrEqual(20);
    }
  });

  it("envolver no se cuelga con una palabra que ni cortada cabe", () => {
    expect(() => envolver("………………", 2)).not.toThrow();
  });
});

describe("el doble tamaño gasta el doble de papel", () => {
  const columnas = (t: { bytes: () => Uint8Array }) => columnasDelTicket(t.bytes());

  // El bug del encabezado del recibo: 27 caracteres a doble ancho son 54 columnas de 48.
  it("un texto a doble ancho se envuelve a la mitad del papel", () => {
    const ticket = crearTicket().envuelto("Cronchy - Churros y Helados", {
      tamano: "doble",
      centrado: true,
    });

    expect(Math.max(...columnas(ticket))).toBeLessThanOrEqual(48);
  });

  it("a tamaño normal el mismo texto cabe en una sola línea", () => {
    const ticket = crearTicket().envuelto("Cronchy - Churros y Helados");

    expect(columnas(ticket).filter((c) => c > 0)).toHaveLength(1);
  });
});
