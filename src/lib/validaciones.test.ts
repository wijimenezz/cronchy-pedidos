import { describe, expect, it } from "vitest";
import { crearPedidoSchema } from "./validaciones";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";

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
        comprobanteUrl: "https://storage.example.com/comprobante.jpg",
      }),
    );
    expect(r.success).toBe(true);
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

  it("rechaza domicilio sin zonaId", () => {
    const r = crearPedidoSchema.safeParse(payloadBase({ tipo: "domicilio", direccion: "Calle 10 # 5-20" }));
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("zonaId"))).toBe(true);
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
