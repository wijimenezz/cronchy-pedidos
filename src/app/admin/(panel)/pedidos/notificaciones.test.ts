import { describe, expect, it } from "vitest";
import { problemaDeAvisos, textoAviso } from "./notificaciones";

describe("problemaDeAvisos", () => {
  it("con los tres canales armados no dice nada", () => {
    expect(problemaDeAvisos(true, "ok")).toBeNull();
  });

  // `null` es "aún no se ha intentado": avisar de un fallo que no ocurrió sería ruido.
  it("mientras el push no se ha intentado, tampoco", () => {
    expect(problemaDeAvisos(true, null)).toBeNull();
  });

  // Sin permiso no hay NINGÚN aviso visual, así que manda sobre el estado del push.
  it("el permiso denegado manda sobre lo demás", () => {
    for (const push of ["ok", "sin-llave", "error", null] as const) {
      expect(problemaDeAvisos(false, push)).toContain("permite las notificaciones");
    }
  });

  // Es el caso que nos costó una tarde: la llave se añadió al hosting después del build.
  it("la llave que falta se nombra y dice qué hacer", () => {
    const texto = problemaDeAvisos(true, "sin-llave");

    expect(texto).toContain("llave VAPID");
    expect(texto).toContain("desplegar");
  });

  it("los demás fallos del push no fingen que todo va", () => {
    expect(problemaDeAvisos(true, "no-soportado")).toContain("navegador cerrado");
    expect(problemaDeAvisos(true, "error")).toContain("Recarga");
  });

  // Cada motivo tiene que decir algo distinto: dos ramas con el mismo texto son una rama muerta.
  it("cada motivo tiene su propia frase", () => {
    const frases = (["sin-llave", "no-soportado", "error"] as const).map((p) =>
      problemaDeAvisos(true, p),
    );

    expect(new Set(frases).size).toBe(frases.length);
  });
});

describe("textoAviso", () => {
  it("un solo pedido se dice en singular", () => {
    expect(textoAviso(1, 1)).toBe("1 pedido nuevo");
  });

  it("varios, en plural", () => {
    expect(textoAviso(3, 3)).toBe("3 pedidos nuevos");
  });

  // El total solo aporta cuando dice algo que el primer número no dice ya.
  it("añade el total solo si hay más esperando de los que acaban de entrar", () => {
    expect(textoAviso(1, 5)).toBe("1 pedido nuevo · 5 sin aceptar");
    expect(textoAviso(2, 2)).toBe("2 pedidos nuevos");
  });

  // Puede pasar: entran dos y alguien acepta uno antes de que se pinte el aviso.
  it("un total menor que lo nuevo no se muestra", () => {
    expect(textoAviso(3, 1)).toBe("3 pedidos nuevos");
  });
});
