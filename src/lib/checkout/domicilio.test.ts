import { describe, expect, it } from "vitest";
import {
  avisoDeDomicilio,
  costoDeDomicilio,
  domicilioDe,
  mismoPunto,
  motivoDeCotizacionManual,
  sePuedeReintentar,
  totalEsFirme,
  type Cobertura,
} from "./domicilio";

/** Los cinco estados que puede devolver la cotización, tal cual los produce el checkout. */
const COBERTURA = {
  sinPin: { estado: "sin_pin" },
  consultando: { estado: "consultando" },
  cubierto: { estado: "cubierto", zona: "Centro", precio: 6000 },
  fuera: { estado: "fuera" },
  error: { estado: "error" },
} as const satisfies Record<string, Cobertura>;

const TODAS: Cobertura[] = Object.values(COBERTURA);

describe("domicilioDe", () => {
  it("con el punto cotizado, el costo es el de la zona", () => {
    expect(domicilioDe("domicilio", COBERTURA.cubierto)).toEqual({
      estado: "conocido",
      costo: 6000,
    });
  });

  it("separa 'no hay pin' de 'todavía no contesta': no dicen lo mismo", () => {
    expect(domicilioDe("domicilio", COBERTURA.sinPin).estado).toBe("sin_ubicacion");
    expect(domicilioDe("domicilio", COBERTURA.consultando).estado).toBe("calculando");
  });

  it("fuera de cobertura es su propio caso (regla 14), no un fallo", () => {
    expect(domicilioDe("domicilio", COBERTURA.fuera).estado).toBe("fuera");
  });

  it("una cotización que falló es 'fallido'", () => {
    expect(domicilioDe("domicilio", COBERTURA.error).estado).toBe("fallido");
  });

  it("en recoger no hay domicilio, diga lo que diga la cobertura", () => {
    for (const cobertura of TODAS) {
      expect(domicilioDe("recoger", cobertura).estado).toBe("no_aplica");
    }
  });

  // `tipoPedido` es null mientras caduca la elección (`leerGuardado`), y ahí tampoco hay
  // domicilio que cobrar.
  it("sin tipo de pedido tampoco aplica", () => {
    expect(domicilioDe(null, COBERTURA.cubierto).estado).toBe("no_aplica");
  });
});

describe("costoDeDomicilio", () => {
  /**
   * **La regresión que motiva este módulo.**
   *
   * El checkout hacía `cobertura.estado === "cubierto" ? cobertura.precio : 0`, así que cuatro de
   * los cinco estados se convertían en $0: «no sé cuánto cuesta» se leía como «cuesta cero». Ese
   * cero terminaba en el «Transfiere este valor» de Nequi, y el cliente transfería solo los
   * productos.
   */
  it("NO inventa un cero cuando el costo todavía no se sabe", () => {
    expect(costoDeDomicilio(domicilioDe("domicilio", COBERTURA.sinPin))).toBeNull();
    expect(costoDeDomicilio(domicilioDe("domicilio", COBERTURA.consultando))).toBeNull();
    expect(costoDeDomicilio(domicilioDe("domicilio", COBERTURA.error))).toBeNull();
    expect(costoDeDomicilio(domicilioDe("domicilio", COBERTURA.fuera))).toBeNull();
  });

  it("el único cero legítimo es recoger, que no tiene domicilio", () => {
    expect(costoDeDomicilio(domicilioDe("recoger", COBERTURA.error))).toBe(0);
  });

  it("cubierto devuelve la tarifa de la zona", () => {
    expect(costoDeDomicilio(domicilioDe("domicilio", COBERTURA.cubierto))).toBe(6000);
  });
});

describe("totalEsFirme", () => {
  it("solo con el costo resuelto se puede enseñar un total", () => {
    expect(totalEsFirme(domicilioDe("domicilio", COBERTURA.cubierto))).toBe(true);
    expect(totalEsFirme(domicilioDe("recoger", COBERTURA.sinPin))).toBe(true);
  });

  it("ninguno de los estados sin resolver deja enseñar un total", () => {
    for (const cobertura of TODAS) {
      if (cobertura.estado === "cubierto") continue;
      expect(totalEsFirme(domicilioDe("domicilio", cobertura))).toBe(false);
    }
  });
});

describe("avisoDeDomicilio", () => {
  it("cada estado sin resolver dice qué pasa", () => {
    for (const cobertura of TODAS) {
      if (cobertura.estado === "cubierto") continue;
      expect(avisoDeDomicilio(domicilioDe("domicilio", cobertura))).toBeTruthy();
    }
  });

  it("cuando el costo se sabe no hay nada que avisar", () => {
    expect(avisoDeDomicilio(domicilioDe("domicilio", COBERTURA.cubierto))).toBeNull();
    expect(avisoDeDomicilio(domicilioDe("recoger", COBERTURA.error))).toBeNull();
  });
});

describe("sePuedeReintentar", () => {
  // Reintentar solo tiene sentido cuando hubo un intento que falló. Con el pin sin poner hay
  // que ir al mapa, y mientras se está calculando ya hay uno en vuelo.
  it("solo se ofrece tras un fallo de la cotización", () => {
    expect(sePuedeReintentar(domicilioDe("domicilio", COBERTURA.error))).toBe(true);
    expect(sePuedeReintentar(domicilioDe("domicilio", COBERTURA.sinPin))).toBe(false);
    expect(sePuedeReintentar(domicilioDe("domicilio", COBERTURA.consultando))).toBe(false);
    expect(sePuedeReintentar(domicilioDe("domicilio", COBERTURA.fuera))).toBe(false);
    expect(sePuedeReintentar(domicilioDe("domicilio", COBERTURA.cubierto))).toBe(false);
  });
});

describe("motivoDeCotizacionManual", () => {
  /**
   * Los dos estados sin salida propia. Antes solo el primero tenía a dónde mandar al cliente —y
   * únicamente desde el paso 2—, así que una cotización que fallaba lo dejaba con un botón de
   * reintentar y nada más.
   */
  it("los dos callejones sin salida dan a quién escribirle", () => {
    expect(motivoDeCotizacionManual(domicilioDe("domicilio", COBERTURA.fuera))).toBe(
      "fuera_de_cobertura",
    );
    expect(motivoDeCotizacionManual(domicilioDe("domicilio", COBERTURA.error))).toBe(
      "sin_cotizacion",
    );
  });

  // Mientras se está calculando NO se ofrece: hay una consulta en vuelo que probablemente
  // conteste, y mandar a WhatsApp a quien iba a poder pedir solo es perder el pedido.
  it("no se ofrece mientras todavía puede resolverse", () => {
    expect(motivoDeCotizacionManual(domicilioDe("domicilio", COBERTURA.consultando))).toBeNull();
    expect(motivoDeCotizacionManual(domicilioDe("domicilio", COBERTURA.sinPin))).toBeNull();
  });

  it("con el costo resuelto no hay nada que cotizar a mano", () => {
    expect(motivoDeCotizacionManual(domicilioDe("domicilio", COBERTURA.cubierto))).toBeNull();
    expect(motivoDeCotizacionManual(domicilioDe("recoger", COBERTURA.error))).toBeNull();
  });
});

describe("mismoPunto", () => {
  // Se compara por coordenadas porque el pin sale de un store persistido: dos objetos distintos
  // pueden ser la misma casa, y tratarlos como pines diferentes dispararía una cotización por
  // render.
  it("dos objetos distintos con las mismas coordenadas son el mismo pin", () => {
    expect(mismoPunto({ lat: 4.337, lng: -74.362 }, { lat: 4.337, lng: -74.362 })).toBe(true);
  });

  it("moverlo, aunque sea un decimal, lo cambia", () => {
    expect(mismoPunto({ lat: 4.337, lng: -74.362 }, { lat: 4.338, lng: -74.362 })).toBe(false);
  });

  // Sin pin no hay nada que comparar, y decir que "coincide" haría pasar por cotizado un punto
  // que no existe.
  it("sin alguno de los dos, nunca coinciden", () => {
    expect(mismoPunto(null, { lat: 4.337, lng: -74.362 })).toBe(false);
    expect(mismoPunto({ lat: 4.337, lng: -74.362 }, null)).toBe(false);
    expect(mismoPunto(null, null)).toBe(false);
  });
});
