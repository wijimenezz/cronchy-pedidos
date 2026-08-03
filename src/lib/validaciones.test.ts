import { describe, expect, it } from "vitest";
import { crearPedidoSchema, idSchema, REQUERIDO } from "./validaciones";

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

/**
 * Los ids que las migraciones de seed escribieron a mano, copiados de la base tal cual.
 *
 * NO cumplen RFC 4122 —llevan un 0 donde iría la versión y otro donde iría la variante—
 * porque se eligieron para que las migraciones se puedan leer: 2222 son categorías, 3333
 * grupos de modificadores. Postgres los guarda sin rechistar; el `z.uuid()` de Zod 4 no, y
 * eso tumbó el guardado de productos, el CRUD de categorías y el editor de adiciones.
 */
const CATEGORIA_CHURROS = "22222222-0000-0000-0000-000000000001";
const GRUPO_SALSAS = "33333333-0000-0000-0000-000000000003";

describe("idSchema", () => {
  it("acepta los ids sembrados a mano, que no cumplen RFC 4122", () => {
    // Si alguien vuelve a poner `z.uuid()` en su lugar, este test se pone rojo. Es su
    // única razón de existir.
    expect(idSchema.safeParse(CATEGORIA_CHURROS).success).toBe(true);
    expect(idSchema.safeParse(GRUPO_SALSAS).success).toBe(true);
  });

  it("acepta un uuid v4 normal, de los que genera la base", () => {
    expect(idSchema.safeParse("9b157f9b-0756-4a5f-a072-0ab6751fd121").success).toBe(true);
  });

  it("sigue rechazando lo que no tiene forma de uuid", () => {
    for (const malo of [
      "",
      "no-es-uuid",
      "22222222-0000-0000-0000-00000000000", // un dígito de menos
      "22222222-0000-0000-0000-0000000000011", // uno de más
      "gggggggg-0000-0000-0000-000000000001", // no es hexadecimal
    ]) {
      expect(idSchema.safeParse(malo).success, `debería rechazar "${malo}"`).toBe(false);
    }
  });

  it("responde en español cuando rechaza", () => {
    const r = idSchema.safeParse("no-es-uuid");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Identificador inválido");
  });
});

describe("crearPedidoSchema", () => {
  it("acepta un pedido cuyo producto tenga un id sembrado a mano", () => {
    // El checkout es el camino que cobra: si un seed futuro le pone un id "bonito" a un
    // producto o a una salsa, el pedido tiene que seguir pasando.
    const r = crearPedidoSchema.safeParse(
      payloadBase({
        items: [
          {
            productId: CATEGORIA_CHURROS,
            cantidad: 1,
            seleccion: [
              {
                productModifierGroupId: GRUPO_SALSAS,
                opciones: [{ modifierOptionId: GRUPO_SALSAS, cantidad: 1 }],
              },
            ],
          },
        ],
      }),
    );
    expect(r.success).toBe(true);
  });

  it("acepta un pedido para recoger, pago en efectivo", () => {
    const r = crearPedidoSchema.safeParse(payloadBase());
    expect(r.success).toBe(true);
  });

  it("acepta un pedido a domicilio con dirección, barrio, pin y pago nequi con comprobante", () => {
    const r = crearPedidoSchema.safeParse(
      payloadBase({
        tipo: "domicilio",
        direccion: "Calle 10 # 5-20",
        barrio: "El Caney",
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

  // El barrio es referencia para el domiciliario, igual que la dirección, y por eso se exige
  // igual. No se confunde con la zona de cobertura, que el cliente ni manda ni podría (regla 1).
  it("rechaza domicilio sin barrio", () => {
    const r = crearPedidoSchema.safeParse(
      payloadBase({ tipo: "domicilio", direccion: "Calle 10 # 5-20", punto: PIN }),
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("barrio"))).toBe(true);
    }
  });

  // Un campo en blanco llega como "" y no como undefined: tiene que contar como ausente, o
  // un espacio en el input pasaría por barrio.
  it("un barrio en blanco cuenta como ausente", () => {
    const r = crearPedidoSchema.safeParse(
      payloadBase({ tipo: "domicilio", direccion: "Calle 10 # 5-20", punto: PIN, barrio: "   " }),
    );
    expect(r.success).toBe(false);
  });

  // Regla 14: sin pin no hay domicilio, porque es el pin el que fija el precio. Antes se
  // aceptaba un barrio escrito a mano *en lugar* del pin (US11); eso se retiró con el mapa, y
  // el barrio que volvió no cotiza nada: solo dice dónde tocar el timbre.
  it("rechaza domicilio sin pin", () => {
    const r = crearPedidoSchema.safeParse(
      payloadBase({ tipo: "domicilio", direccion: "Calle 10 # 5-20", barrio: "El Caney" }),
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("punto"))).toBe(true);
    }
  });

  it("recoger no necesita pin ni barrio", () => {
    const r = crearPedidoSchema.safeParse(payloadBase({ tipo: "recoger" }));
    expect(r.success).toBe(true);
  });

  it.each([
    ["latitud fuera de rango", { lat: 91, lng: -74.362 }],
    ["longitud fuera de rango", { lat: 4.337, lng: -181 }],
  ])("rechaza un pin con %s", (_caso, punto) => {
    // El payload va completo salvo el pin, para que lo que falle sea el pin y no otra cosa:
    // un `success: false` no dice por qué.
    const r = crearPedidoSchema.safeParse(
      payloadBase({ tipo: "domicilio", direccion: "Calle 10 # 5-20", barrio: "El Caney", punto }),
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("punto"))).toBe(true);
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
