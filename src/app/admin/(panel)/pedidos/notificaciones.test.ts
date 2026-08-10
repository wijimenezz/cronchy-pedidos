import { describe, expect, it } from "vitest";
import { textoAviso } from "./notificaciones";

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
