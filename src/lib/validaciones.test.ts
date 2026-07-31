import { describe, expect, it } from "vitest";
import { crearPedidoSchema, REQUERIDO } from "./validaciones";

/** El mensaje que le llega al cliente para un campo, tal cual lo pinta el checkout. */
function mensajeDe(payload: unknown, campo: string): string | undefined {
  const r = crearPedidoSchema.safeParse(payload);
  if (r.success) return undefined;

  const porCampo: Record<string, string[] | undefined> = r.error.flatten().fieldErrors;
  return porCampo[campo]?.[0];
}

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
/** Un pin cualquiera de Fusagasugá. El esquema no mira si está cubierto: eso es del servidor. */
const PIN = { lat: 4.337, lng: -74.362 };

const COMPROBANTE_URL =
  "https://koipbxrmkylpucbsgmqd.supabase.co/storage/v1/object/comprobantes/2026/07/11111111-1111-4111-8111-111111111111.jpg";

function payloadBase(overrides: Record<string, unknown> = {}) {
  return {
    tipo: "recoger" as const,
    clienteNombre: "Ana",
    clienteTelefono: "3001234567",
    clienteEmail: "ana@gmail.com",
    clienteCumple: "1990-12-16",
    metodoPago: "efectivo" as const,
    items: [{ productId: PRODUCT_ID, cantidad: 1, seleccion: [] }],
    ...overrides,
  };
}

describe("crearPedidoSchema", () => {
  it("acepta un pedido para recoger, pago en efectivo", () => {
    const r = crearPedidoSchema.safeParse(payloadBase());
    expect(r.success).toBe(true);
  });

  it("acepta un pedido a domicilio con dirección, pin y pago nequi con comprobante", () => {
    const r = crearPedidoSchema.safeParse(
      payloadBase({
        tipo: "domicilio",
        direccion: "Calle 10 # 5-20",
        punto: PIN,
        metodoPago: "nequi",
        comprobanteUrl: COMPROBANTE_URL,
      }),
    );
    expect(r.success).toBe(true);
  });

  it("rechaza un comprobanteUrl de otro dominio", () => {
    const r = crearPedidoSchema.safeParse(
      payloadBase({ metodoPago: "nequi", comprobanteUrl: "https://evil.com/comprobante.jpg" }),
    );
    expect(r.success).toBe(false);
  });

  it("rechaza domicilio sin dirección", () => {
    const r = crearPedidoSchema.safeParse(
      payloadBase({ tipo: "domicilio", punto: PIN }),
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("direccion"))).toBe(true);
    }
  });

  // Regla 14: sin pin no hay domicilio, porque es el pin el que fija el precio. Antes se
  // aceptaba un barrio escrito a mano (US11); eso se retiró con el mapa.
  it("rechaza domicilio sin pin", () => {
    const r = crearPedidoSchema.safeParse(payloadBase({ tipo: "domicilio", direccion: "Calle 10 # 5-20" }));
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("punto"))).toBe(true);
    }
  });

  it("recoger no necesita pin", () => {
    const r = crearPedidoSchema.safeParse(payloadBase({ tipo: "recoger" }));
    expect(r.success).toBe(true);
  });

  it.each([
    ["latitud fuera de rango", { lat: 91, lng: -74.362 }],
    ["longitud fuera de rango", { lat: 4.337, lng: -181 }],
  ])("rechaza un pin con %s", (_caso, punto) => {
    const r = crearPedidoSchema.safeParse(
      payloadBase({ tipo: "domicilio", direccion: "Calle 10 # 5-20", punto }),
    );
    expect(r.success).toBe(false);
  });

  // Un <input> vacío llega como "", no como undefined: el mensaje debe ser el de
  // "falta el comprobante", no un "Invalid url" que el cliente no sabe interpretar.
  it("nequi con comprobanteUrl vacío pide el comprobante, no falla por URL inválida", () => {
    const r = crearPedidoSchema.safeParse(payloadBase({ metodoPago: "nequi", comprobanteUrl: "" }));
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("comprobanteUrl"))).toBe(true);
    }
  });

  it("normaliza los opcionales en blanco a undefined", () => {
    const r = crearPedidoSchema.safeParse(payloadBase({ notas: "  ", indicaciones: "" }));
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.notas).toBeUndefined();
      expect(r.data.indicaciones).toBeUndefined();
    }
  });

  it("rechaza nequi sin comprobanteUrl", () => {
    const r = crearPedidoSchema.safeParse(payloadBase({ metodoPago: "nequi" }));
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("comprobanteUrl"))).toBe(true);
    }
  });

  it("rechaza un teléfono inválido", () => {
    const r = crearPedidoSchema.safeParse(payloadBase({ clienteTelefono: "123" }));
    expect(r.success).toBe(false);
  });

  // El cliente escribe el celular como quiera; lo que importa son los 10 dígitos.
  it("acepta un celular escrito con espacios", () => {
    const r = crearPedidoSchema.safeParse(payloadBase({ clienteTelefono: "311 643 5036" }));
    expect(r.success).toBe(true);
  });

  // El correo y el cumpleaños son datos que se piden, no que se exigen.
  it("acepta un pedido sin correo ni cumpleaños", () => {
    const payload = payloadBase();
    delete (payload as Record<string, unknown>).clienteEmail;
    delete (payload as Record<string, unknown>).clienteCumple;

    expect(crearPedidoSchema.safeParse(payload).success).toBe(true);
    // Y con los inputs vacíos, que es como llegan de verdad desde el navegador.
    expect(
      crearPedidoSchema.safeParse(payloadBase({ clienteEmail: "", clienteCumple: "" })).success,
    ).toBe(true);
  });

  // Reportado por el usuario: "anagmailcom" pasaba como correo válido.
  it("rechaza un correo sin arroba ni dominio", () => {
    expect(mensajeDe(payloadBase({ clienteEmail: "anagmailcom" }), "clienteEmail")).toBe(
      "Correo inválido",
    );
  });

  // El formato YYYY-MM-DD no garantiza que la fecha exista: sin el refine,
  // `new Date` desbordaría el 31 de febrero al 3 de marzo en silencio.
  it("rechaza una fecha de cumpleaños que no existe", () => {
    expect(mensajeDe(payloadBase({ clienteCumple: "2026-02-31" }), "clienteCumple")).toBe(
      "Fecha inválida",
    );
  });

  it("rechaza un cumpleaños en el futuro", () => {
    expect(mensajeDe(payloadBase({ clienteCumple: "2099-01-01" }), "clienteCumple")).toBe(
      "Fecha inválida",
    );
  });

  // El cliente no es técnico: nada de "Too small: expected string to have >=1 characters".
  it("un campo obligatorio vacío responde 'Campo requerido'", () => {
    expect(mensajeDe(payloadBase({ clienteNombre: "" }), "clienteNombre")).toBe(REQUERIDO);
    expect(mensajeDe(payloadBase({ clienteTelefono: "" }), "clienteTelefono")).toBe(REQUERIDO);
    expect(
      mensajeDe(payloadBase({ tipo: "domicilio", punto: { lat: 4.337, lng: -74.362 } }), "direccion"),
    ).toBe(REQUERIDO);
  });

  // Un teléfono escrito mal no es lo mismo que uno vacío: el mensaje debe distinguirlo.
  it("distingue un teléfono mal escrito de uno vacío", () => {
    expect(mensajeDe(payloadBase({ clienteTelefono: "123" }), "clienteTelefono")).toBe(
      "Teléfono inválido",
    );
  });

  it("ningún mensaje sale en inglés", () => {
    const r = crearPedidoSchema.safeParse({ tipo: "domicilio", metodoPago: "nequi", items: [] });
    expect(r.success).toBe(false);
    if (!r.success) {
      for (const issue of r.error.issues) {
        expect(issue.message).not.toMatch(/expected|invalid input|too small|required$/i);
      }
    }
  });

  it("rechaza un pedido sin items", () => {
    const r = crearPedidoSchema.safeParse(payloadBase({ items: [] }));
    expect(r.success).toBe(false);
  });
});
