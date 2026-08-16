import { describe, expect, it } from "vitest";
import {
  accionDelFallo,
  contextoDelNavegador,
  diagnosticar,
  esIOS,
  navegadorDeUA,
  textoDelFallo,
  type FalloUbicacion,
} from "./ubicacion";

/** User agents reales, copiados tal cual: el orden de las marcas es justo lo que se prueba. */
const UA = {
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chromeIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1",
  edgeIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 EdgiOS/117.0.2045.47 Mobile/15E148 Safari/605.1.15",
  firefoxIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  chromeEscritorio:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
};

const TODOS: FalloUbicacion[] = ["sin_soporte", "permiso", "no_disponible", "tardo"];

describe("diagnosticar", () => {
  it("traduce los tres códigos de la API", () => {
    expect(diagnosticar(1)).toBe("permiso");
    expect(diagnosticar(2)).toBe("no_disponible");
    expect(diagnosticar(3)).toBe("tardo");
  });

  // El caso del reporte: iOS con la Localización apagada para el navegador contesta el 1 de
  // inmediato, sin llegar a mostrar el diálogo.
  it("el permiso denegado es el código 1", () => {
    expect(diagnosticar(1)).toBe("permiso");
  });

  it("sin API de geolocalización no hay código", () => {
    expect(diagnosticar(null)).toBe("sin_soporte");
  });

  // Un código que no conocemos es un fallo real de causa desconocida, y el texto de
  // `no_disponible` es el único que nombra los dos interruptores sin prometer cuál falló.
  it("un código desconocido cae en no_disponible", () => {
    expect(diagnosticar(0)).toBe("no_disponible");
    expect(diagnosticar(42)).toBe("no_disponible");
    expect(diagnosticar(-1)).toBe("no_disponible");
  });
});

describe("esIOS", () => {
  it("reconoce el iPhone en cualquier navegador", () => {
    expect(esIOS(UA.safariIphone)).toBe(true);
    expect(esIOS(UA.chromeIphone)).toBe(true);
    expect(esIOS(UA.edgeIphone)).toBe(true);
  });

  it("no confunde a Android ni al escritorio", () => {
    expect(esIOS(UA.chromeAndroid)).toBe(false);
    expect(esIOS(UA.chromeEscritorio)).toBe(false);
    expect(esIOS(UA.safariMac)).toBe(false);
    expect(esIOS("")).toBe(false);
  });
});

describe("navegadorDeUA", () => {
  // Todos los UA de iOS terminan en "Safari/…", incluido el de Chrome: el orden en que se
  // buscan las marcas es lo único que separa un caso del otro.
  it("Chrome de iPhone se anuncia como CriOS y arrastra 'Safari' detrás", () => {
    expect(navegadorDeUA(UA.chromeIphone)).toBe("chrome");
  });

  it("Safari es Safari", () => {
    expect(navegadorDeUA(UA.safariIphone)).toBe("safari");
    expect(navegadorDeUA(UA.safariMac)).toBe("safari");
  });

  it("Chrome de escritorio y de Android también dicen 'Safari'", () => {
    expect(navegadorDeUA(UA.chromeEscritorio)).toBe("chrome");
    expect(navegadorDeUA(UA.chromeAndroid)).toBe("chrome");
  });

  // Edge y Firefox en iOS llevan "Safari" y, el primero, una marca que contiene "Edg".
  // No se les manda a la pantalla de Safari ni a la de Chrome: tienen la suya.
  it("Edge y Firefox de iPhone no son ni Safari ni Chrome", () => {
    expect(navegadorDeUA(UA.edgeIphone)).toBe("otro");
    expect(navegadorDeUA(UA.firefoxIphone)).toBe("otro");
  });

  it("lo que no se reconoce es 'otro'", () => {
    expect(navegadorDeUA("")).toBe("otro");
    expect(navegadorDeUA("curl/8.4.0")).toBe("otro");
  });
});

describe("contextoDelNavegador", () => {
  it("junta las dos lecturas", () => {
    expect(contextoDelNavegador(UA.safariIphone)).toEqual({ ios: true, navegador: "safari" });
    expect(contextoDelNavegador(UA.chromeEscritorio)).toEqual({
      ios: false,
      navegador: "chrome",
    });
  });
});

describe("textoDelFallo", () => {
  const iphoneSafari = { ios: true, navegador: "safari" } as const;
  const iphoneChrome = { ios: true, navegador: "chrome" } as const;
  const iphoneOtro = { ios: true, navegador: "otro" } as const;
  const escritorio = { ios: false, navegador: "chrome" } as const;

  it("en iPhone con Safari manda a Ajustes y nombra Safari", () => {
    const { titulo, pasos } = textoDelFallo("permiso", iphoneSafari);
    const todo = [titulo, ...pasos].join(" ");

    expect(todo).toContain("Ajustes");
    expect(todo).toContain("Safari");
  });

  // La regresión que se quiere fijar: mandar a un usuario de Chrome a "Ajustes › Safari" es
  // mandarlo a una pantalla donde no está su navegador.
  it("en iPhone con Chrome nombra Chrome y NUNCA Safari", () => {
    const { titulo, pasos } = textoDelFallo("permiso", iphoneChrome);
    const todo = [titulo, ...pasos].join(" ");

    expect(todo).toContain("Chrome");
    expect(todo).not.toContain("Safari");
  });

  it("en iPhone con otro navegador no nombra ninguno de los dos", () => {
    const { titulo, pasos } = textoDelFallo("permiso", iphoneOtro);
    const todo = [titulo, ...pasos].join(" ");

    expect(todo).not.toContain("Safari");
    expect(todo).not.toContain("Chrome");
    expect(todo).toContain("Ajustes");
  });

  // Fuera de iOS no existen los "Ajustes" del teléfono: el permiso se cambia en la barra
  // de direcciones.
  it("fuera de iOS no manda a los Ajustes del teléfono", () => {
    const { titulo, pasos } = textoDelFallo("permiso", escritorio);
    expect([titulo, ...pasos].join(" ")).not.toContain("Ajustes");
  });

  // iOS devuelve 1 con la localización apagada por sistema y a veces 2, así que el texto del
  // 2 tiene que hablar del permiso igual, en vez de apostar a que fue falta de señal.
  it("no_disponible también menciona el permiso, no solo la señal", () => {
    const { titulo, pasos } = textoDelFallo("no_disponible", iphoneSafari);
    expect([titulo, ...pasos].join(" ")).toContain("Localización");
  });

  it("todo fallo tiene título y alternativa", () => {
    for (const fallo of TODOS) {
      const texto = textoDelFallo(fallo, iphoneSafari);
      expect(texto.titulo.length, fallo).toBeGreaterThan(0);
      expect(texto.alternativa.length, fallo).toBeGreaterThan(0);
    }
  });

  // Todos menos uno: contra un navegador sin la API no hay ningún paso que darle al cliente,
  // y una lista de instrucciones inventadas sería peor que la alternativa a secas.
  it("todo fallo accionable trae pasos, y el que no lo es no los inventa", () => {
    for (const fallo of TODOS.filter((f) => f !== "sin_soporte")) {
      expect(textoDelFallo(fallo, iphoneSafari).pasos.length, fallo).toBeGreaterThan(0);
    }

    expect(textoDelFallo("sin_soporte", iphoneSafari).pasos).toEqual([]);
  });

  it("la alternativa del mapa está en todos los textos (regla 14)", () => {
    for (const fallo of TODOS) {
      expect(textoDelFallo(fallo, iphoneSafari).alternativa, fallo).toContain("mapa");
    }
  });
});

describe("accionDelFallo", () => {
  // iOS no reevalúa un permiso recién concedido sin recargar, así que reintentar sin más
  // volvería a fallar y el cliente concluiría que activarlo no sirvió de nada.
  it("tras el permiso denegado se recarga, no se reintenta", () => {
    expect(accionDelFallo("permiso")).toBe("recargar");
  });

  it("una falta de señal o una demora sí se reintentan en el sitio", () => {
    expect(accionDelFallo("no_disponible")).toBe("reintentar");
    expect(accionDelFallo("tardo")).toBe("reintentar");
  });

  it("sin API no hay nada que reintentar", () => {
    expect(accionDelFallo("sin_soporte")).toBe("ninguna");
  });
});
