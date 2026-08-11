import { afterEach, describe, expect, it } from "vitest";
import { avisoNuevoPedido, pedidoParaMensaje, tiendaParaMensaje } from "./avisos";
import { resolverBaseUrl } from "@/lib/url";
import type { PedidoPublico } from "@/db/queries/pedidos";

const ENV_ORIGINAL = { ...process.env };
afterEach(() => {
  process.env = { ...ENV_ORIGINAL };
});

function pedidoPublico(overrides: Partial<PedidoPublico> = {}): PedidoPublico {
  return {
    numero: 7,
    tokenPublico: "f".repeat(32),
    tipo: "domicilio",
    estado: "nuevo",
    creadoEn: new Date("2026-07-27T20:00:00Z"),
    programadoPara: null,
    clienteNombre: "Ana",
    clienteTelefono: "3001234567",
    direccion: "Calle 10 # 5-20",
    indicaciones: "Casa de reja verde",
    // El barrio que escribió el cliente. Ojo: NO es el nombre de la zona de cobertura, que
    // ni siquiera llega hasta aquí — el mensaje lo lee el domiciliario.
    barrio: "El Caney",
    punto: { lat: 4.3372, lng: -74.3653 },
    metodoPago: "efectivo",
    tieneComprobante: false,
    notas: null,
    items: [{ nombre: "Churro clásico", cantidad: 2, subtotal: 10000, modificadores: [] }],
    subtotal: 10000,
    costoDomicilio: 3000,
    descuento: 0,
    total: 13000,
    ...overrides,
  };
}

describe("resolverBaseUrl", () => {
  it("prefiere la variable explícita", () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://cronchy.co";
    process.env.VERCEL_URL = "preview.vercel.app";
    expect(resolverBaseUrl()).toBe("https://cronchy.co");
  });

  it("quita la barra final", () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://cronchy.co/";
    expect(resolverBaseUrl()).toBe("https://cronchy.co");
  });

  it("usa el dominio de producción de Vercel si no hay variable explícita", () => {
    delete process.env.NEXT_PUBLIC_BASE_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "cronchy.vercel.app";
    expect(resolverBaseUrl()).toBe("https://cronchy.vercel.app");
  });

  it("cae a localhost en desarrollo", () => {
    delete process.env.NEXT_PUBLIC_BASE_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
    expect(resolverBaseUrl()).toBe("http://localhost:3000");
  });

  // Pasó de verdad: la variable quedó copiada del ejemplo en Vercel y los clientes recibieron
  // `http://localhost:3000/pedido/…` en su WhatsApp. Estando desplegado, el despliegue gana.
  it("ignora un localhost explícito si estamos desplegados", () => {
    process.env.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "cronchy-pedidos.vercel.app";
    delete process.env.VERCEL_URL;
    expect(resolverBaseUrl()).toBe("https://cronchy-pedidos.vercel.app");
  });

  it("reconoce las otras formas de decir localhost", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "cronchy-pedidos.vercel.app";

    for (const local of ["http://127.0.0.1:3000", "http://localhost", "https://localhost:3000/"]) {
      process.env.NEXT_PUBLIC_BASE_URL = local;
      expect(resolverBaseUrl()).toBe("https://cronchy-pedidos.vercel.app");
    }
  });

  // La guarda no puede tragarse un dominio legítimo que empiece parecido.
  it("no confunde un dominio real con localhost", () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://localhost.cronchy.co";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "cronchy-pedidos.vercel.app";
    expect(resolverBaseUrl()).toBe("https://localhost.cronchy.co");
  });

  it("fuera de Vercel respeta el localhost explícito, que es lo único que hay", () => {
    process.env.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
    expect(resolverBaseUrl()).toBe("http://localhost:3000");
  });
});

describe("pedidoParaMensaje", () => {
  it("traslada los datos del pedido al formato de las plantillas", () => {
    const m = pedidoParaMensaje(pedidoPublico());
    expect(m.numero).toBe(7);
    expect(m.barrio).toBe("El Caney");
    expect(m.total).toBe(13000);
    expect(m.items).toHaveLength(1);
  });

  // El barrio viaja tal como lo dejó el cliente, aunque no se parezca a ninguna zona de
  // cobertura. Son cosas distintas: la zona parte el mapa para cobrar (regla 13) y el barrio
  // es lo que el domiciliario va a leer para encontrar la casa.
  it("respeta el barrio escrito aunque no coincida con ninguna zona", () => {
    const m = pedidoParaMensaje(pedidoPublico({ barrio: "Vereda La Aguadita" }));
    expect(m.barrio).toBe("Vereda La Aguadita");
  });

  it("un pedido sin barrio no inventa ninguno", () => {
    expect(pedidoParaMensaje(pedidoPublico({ barrio: null })).barrio).toBeNull();
  });
});

describe("avisoNuevoPedido", () => {
  it("apunta el wa.me al teléfono del NEGOCIO, no al del cliente", async () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://cronchy.co";
    const r = await avisoNuevoPedido(pedidoPublico(), {
      nombre: "Cronchy",
      telefono: "3009998877",
    });

    expect(r?.modo).toBe("link");
    if (r?.modo === "link") {
      expect(r.url).toContain("wa.me/573009998877");
      expect(r.url).not.toContain("573001234567");
      expect(r.texto).toContain("NUEVO PEDIDO #7");
      expect(r.texto).toContain("Ana");
    }
  });

  it("devuelve null si la tienda no tiene teléfono, para poder ocultar el botón", async () => {
    const r = await avisoNuevoPedido(pedidoPublico(), { nombre: "Cronchy", telefono: null });
    expect(r).toBeNull();
  });
});

describe("tiendaParaMensaje", () => {
  it("arma el destino con la base url resuelta", () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://cronchy.co";
    expect(tiendaParaMensaje({ nombre: "Cronchy" })).toEqual({
      nombre: "Cronchy",
      baseUrl: "https://cronchy.co",
    });
  });
});
