import { afterEach, describe, expect, it } from "vitest";
import {
  avisoCambioEstado,
  avisoNuevoPedido,
  pedidoParaMensaje,
  tiendaParaMensaje,
} from "./avisos";
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
    cuponCodigo: null,
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

  /**
   * Un comprobante cargado es la única prueba de pago que maneja este negocio: en efectivo nunca
   * hay comprobante, así que el mensaje dirá "Pendiente" — que es justo lo correcto.
   *
   * Es el mismo criterio con el que el domiciliario decide si cobra, y por eso se prueba aquí:
   * el día que discrepen, uno de los dos le estará mintiendo al cliente.
   */
  it("el pago se da por hecho solo si hay comprobante", () => {
    expect(pedidoParaMensaje(pedidoPublico()).pagado).toBe(false);
    expect(pedidoParaMensaje(pedidoPublico({ tieneComprobante: true })).pagado).toBe(true);
  });

  it("el descuento viaja tal cual al mensaje", () => {
    expect(pedidoParaMensaje(pedidoPublico({ descuento: 2000 })).descuento).toBe(2000);
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

/**
 * El corte de fondo del consentimiento de avisos.
 *
 * El panel además apaga el botón, pero eso es la UI y la UI se olvida: esto es lo que garantiza
 * que no se arme ningún texto ni se resuelva ningún `wa.me` para quien dijo que no. Si alguien
 * "limpia" ese `if`, estos dos tests se ponen rojos.
 *
 * Los casos van con un pedido a domicilio a propósito: en `recoger` la función va a buscar el pin
 * del local a la base, y aquí no hay base.
 */
describe("avisoCambioEstado y el consentimiento", () => {
  const TIENDA = {
    id: "11111111-1111-4111-8111-111111111111",
    nombre: "Cronchy",
    direccion: "Calle 17 #7-44",
    minutosEstimadoMin: 30,
    minutosEstimadoMax: 45,
  };

  it("no arma nada si el cliente no quiso avisos", async () => {
    const r = await avisoCambioEstado(
      "preparando",
      { ...pedidoPublico(), aceptaAvisos: false },
      TIENDA,
    );

    expect(r).toBeNull();
  });

  it("con el consentimiento dado, el aviso sale como siempre", async () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://cronchy.co";
    const r = await avisoCambioEstado(
      "preparando",
      { ...pedidoPublico(), aceptaAvisos: true },
      TIENDA,
    );

    expect(r?.modo).toBe("link");
    if (r?.modo === "link") {
      // Al cliente, no al negocio: es el único mensaje del proyecto que va en esta dirección.
      expect(r.url).toContain("wa.me/573001234567");
      expect(r.texto).toContain("en preparación");
    }
  });

  // El aviso de aceptación lleva el detalle del pedido, así que crece con el carrito, y el
  // transporte de hoy mete el texto entero dentro de una URL. Un carrito grande llegó a armar
  // links de 3.652 caracteres, muy por encima de los 1.800 que el proyecto se fijó.
  it("un pedido grande no arma un link imposible: se cae el detalle, no el link", async () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://cronchy.co";

    const muchos = Array.from({ length: 10 }, (_, i) => ({
      nombre: `Cronchy Familiar con todos los toppings ${i + 1}`,
      cantidad: 1,
      subtotal: 35000,
      modificadores: [
        { grupo: "Salsas incluidas", nombre: "Chocolate blanco belga", cantidad: 1, precio: 0 },
        { grupo: "Agregar más salsas", nombre: "Nutella", cantidad: 2, precio: 2000 },
      ],
    }));

    const r = await avisoCambioEstado(
      "preparando",
      { ...pedidoPublico({ items: muchos, subtotal: 350000, total: 353000 }), aceptaAvisos: true },
      TIENDA,
    );

    expect(r?.modo).toBe("link");
    if (r?.modo === "link") {
      expect(r.url.length).toBeLessThanOrEqual(1800);
      // Lo que se va es el detalle. Las cifras y el link de seguimiento se quedan: ahí es donde
      // el cliente ve el pedido completo.
      expect(r.texto).not.toContain("*Tu pedido:*");
      expect(r.texto).toContain("*Total:*");
      expect(r.texto).toContain("/pedido/");
    }
  });

  it("un pedido normal conserva el detalle", async () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://cronchy.co";

    const r = await avisoCambioEstado(
      "preparando",
      { ...pedidoPublico(), aceptaAvisos: true },
      TIENDA,
    );

    if (r?.modo === "link") expect(r.texto).toContain("*Tu pedido:*");
  });

  // El consentimiento no resucita un estado que nunca tuvo mensaje. Son dos preguntas distintas
  // y se responden por separado: si se colapsaran, `entregado` empezaría a avisar.
  it("un estado sin mensaje sigue sin avisar aunque el cliente sí quiera", async () => {
    const r = await avisoCambioEstado(
      "entregado",
      { ...pedidoPublico(), aceptaAvisos: true },
      TIENDA,
    );

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
