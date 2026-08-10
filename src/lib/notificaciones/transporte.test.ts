import { describe, expect, it } from "vitest";
import {
  esTelefonoValido,
  linkContactoWhatsapp,
  normalizarTelefono,
  prepararConfirmacion,
  transporteWaLink,
} from "./transporte";
import type { ItemSnapshot, PedidoParaMensaje, Tienda } from "./plantillas";

const TIENDA: Tienda = { nombre: "Cronchy", baseUrl: "https://cronchy.co" };

function pedido(overrides: Partial<PedidoParaMensaje> = {}): PedidoParaMensaje {
  return {
    numero: 42,
    tokenPublico: "abc123",
    tipo: "recoger",
    clienteNombre: "Ana",
    clienteTelefono: "3001234567",
    items: [{ nombre: "Churro clásico", cantidad: 1, subtotal: 5000, modificadores: [] }],
    subtotal: 5000,
    costoDomicilio: 0,
    total: 5000,
    metodoPago: "efectivo",
    ...overrides,
  };
}

describe("normalizarTelefono", () => {
  it("agrega el indicativo 57 a un celular de 10 dígitos", () => {
    expect(normalizarTelefono("3001234567")).toBe("573001234567");
    expect(normalizarTelefono("300 123 4567")).toBe("573001234567");
  });

  it("respeta un número que ya trae indicativo", () => {
    expect(normalizarTelefono("+57 300 1234567")).toBe("573001234567");
  });

  it("trata un fijo de 7 dígitos como local de Fusagasugá", () => {
    expect(normalizarTelefono("8712345")).toBe("5718712345");
  });

  it("descarta todo lo que no sea dígito", () => {
    expect(normalizarTelefono("(300) 123-45-67")).toBe("573001234567");
  });
});

describe("esTelefonoValido", () => {
  it("acepta celulares colombianos", () => {
    expect(esTelefonoValido("3001234567")).toBe(true);
    expect(esTelefonoValido("+57 300 1234567")).toBe(true);
  });

  it("rechaza basura y números cortos", () => {
    expect(esTelefonoValido("123")).toBe(false);
    expect(esTelefonoValido("")).toBe(false);
    expect(esTelefonoValido("no soy un teléfono")).toBe(false);
  });

  it("acepta el celular con la separación que use el cliente", () => {
    expect(esTelefonoValido("311 643 5036")).toBe(true);
    expect(esTelefonoValido("(311) 643-50-36")).toBe(true);
  });

  it("exige exactamente 10 dígitos", () => {
    expect(esTelefonoValido("311643503")).toBe(false); // 9
    expect(esTelefonoValido("31164350361")).toBe(false); // 11
  });

  // La regla vieja (`empieza por 57` + 12 dígitos o más) dejaba pasar esto.
  it("rechaza un número largo que solo empieza por 57", () => {
    expect(esTelefonoValido("5799999999999999")).toBe(false);
  });

  // Un fijo no sirve: los avisos del pedido salen por WhatsApp.
  it("rechaza un fijo de 7 dígitos", () => {
    expect(esTelefonoValido("8712345")).toBe(false);
  });
});

describe("linkContactoWhatsapp", () => {
  // El link corto de WhatsApp Business ya trae su propio mensaje configurado y no
  // admite `?text=`: se usa tal cual, sin tocarlo.
  it("usa el link corto de la tienda si está cargado", () => {
    const r = linkContactoWhatsapp(
      { whatsappUrl: "https://wa.me/message/ABC123", telefono: "3001234567" },
      "Hola",
    );
    expect(r).toBe("https://wa.me/message/ABC123");
  });

  it("cae al teléfono cuando no hay link corto", () => {
    const r = linkContactoWhatsapp({ whatsappUrl: null, telefono: "300 123 4567" }, "Hola");
    expect(r).toBe("https://wa.me/573001234567?text=Hola");
  });

  it("devuelve null si la tienda no tiene ni link ni teléfono", () => {
    expect(linkContactoWhatsapp({ whatsappUrl: null, telefono: null }, "Hola")).toBeNull();
  });
});

describe("transporteWaLink", () => {
  it("arma un wa.me con el número normalizado y el texto codificado", async () => {
    const r = await transporteWaLink.preparar("300 123 4567", "Hola, ¿todo bien?");
    expect(r.modo).toBe("link");
    if (r.modo === "link") {
      expect(r.url.startsWith("https://wa.me/573001234567?text=")).toBe(true);
      // Los caracteres especiales no pueden romper la URL.
      expect(r.url).not.toContain(" ");
      expect(r.url).toContain("%C2%BF"); // "¿"
      expect(r.texto).toBe("Hola, ¿todo bien?");
    }
  });
});

describe("prepararConfirmacion", () => {
  it("incluye el link de seguimiento con el token del pedido", async () => {
    const r = await prepararConfirmacion(pedido(), TIENDA);
    expect(r.modo).toBe("link");
    if (r.modo === "link") {
      expect(r.texto).toContain("https://cronchy.co/pedido/abc123");
    }
  });

  // Un pedido grande genera un texto que no cabe en una URL: debe caer al mensaje corto
  // en vez de producir un link que WhatsApp trunca.
  it("cae al mensaje corto cuando el pedido es demasiado largo", async () => {
    const muchos: ItemSnapshot[] = Array.from({ length: 30 }, (_, i) => ({
      nombre: `Producto con nombre largo número ${i}`,
      cantidad: 2,
      subtotal: 12000,
      modificadores: [
        { grupo: "Salsas incluidas", nombre: "Arequipe", cantidad: 1, precio: 0 },
        { grupo: "Agregar más salsas", nombre: "Chocolate", cantidad: 2, precio: 2000 },
      ],
    }));

    const largo = await prepararConfirmacion(pedido(), TIENDA);
    const corto = await prepararConfirmacion(pedido({ items: muchos, total: 360000 }), TIENDA);

    expect(corto.modo).toBe("link");
    if (corto.modo === "link" && largo.modo === "link") {
      // El mensaje corto no lista los productos, pero sí conserva el seguimiento.
      expect(corto.texto).toContain("https://cronchy.co/pedido/abc123");
      expect(corto.texto).not.toContain("Producto con nombre largo número 29");
      expect(corto.texto.length).toBeLessThan(largo.texto.length + 500);
    }
  });
});
