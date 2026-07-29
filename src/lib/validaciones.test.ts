import { describe, expect, it } from "vitest";
import { crearPedidoSchema } from "./validaciones";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const COMPROBANTE_URL =
  "https://koipbxrmkylpucbsgmqd.supabase.co/storage/v1/object/comprobantes/2026/07/11111111-1111-4111-8111-111111111111.jpg";

function payloadBase(overrides: Record<string, unknown> = {}) {
  return {
    tipo: "recoger" as const,
    clienteNombre: "Ana",
    clienteTelefono: "3001234567",
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

  it("acepta un pedido a domicilio con dirección, zona y pago nequi con comprobante", () => {
    const r = crearPedidoSchema.safeParse(
      payloadBase({
        tipo: "domicilio",
        direccion: "Calle 10 # 5-20",
        zonaId: "22222222-2222-4222-8222-222222222222",
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
      payloadBase({ tipo: "domicilio", zonaId: "22222222-2222-4222-8222-222222222222" }),
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("direccion"))).toBe(true);
    }
  });

  it("rechaza domicilio sin zonaId ni barrioTexto", () => {
    const r = crearPedidoSchema.safeParse(payloadBase({ tipo: "domicilio", direccion: "Calle 10 # 5-20" }));
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("zonaId"))).toBe(true);
    }
  });

  // US11 — el cliente escribe su barrio porque no está en la lista.
  it("acepta domicilio con barrioTexto en vez de zonaId", () => {
    const r = crearPedidoSchema.safeParse(
      payloadBase({ tipo: "domicilio", direccion: "Calle 10 # 5-20", barrioTexto: "Vereda La Aguadita" }),
    );
    expect(r.success).toBe(true);
  });

  it("un barrioTexto en blanco no cuenta como barrio escrito", () => {
    const r = crearPedidoSchema.safeParse(
      payloadBase({ tipo: "domicilio", direccion: "Calle 10 # 5-20", barrioTexto: "   " }),
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("zonaId"))).toBe(true);
    }
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

  it("rechaza un pedido sin items", () => {
    const r = crearPedidoSchema.safeParse(payloadBase({ items: [] }));
    expect(r.success).toBe(false);
  });
});
