import { describe, expect, it } from "vitest";
import { barrioDeRespuesta, decidirBarrio, resolverNombreBarrio } from "./barrio";

/**
 * Respuestas reales de Nominatim para puntos de Fusagasugá, copiadas tal cual. Los fixtures
 * son de verdad a propósito: lo que importa aquí no es que la función lea una propiedad, sino
 * qué propiedad es la correcta en un país donde `suburb` trae la comuna.
 */
function respuesta(address: Record<string, unknown>) {
  return { place_id: 1, licence: "ODbL", osm_type: "way", address };
}

const EL_CANEY = respuesta({
  road: "Avenida Manuel Humberto Cárdenas",
  neighbourhood: "El Caney",
  suburb: "Comuna Occidental",
  town: "Fusagasugá ciudad",
  state: "Cundinamarca",
  country: "Colombia",
});

describe("barrioDeRespuesta", () => {
  it("saca el barrio de una respuesta real", () => {
    expect(barrioDeRespuesta(EL_CANEY)).toBe("El Caney");
  });

  // El caso que justifica todo el cambio: la comuna es una división administrativa, igual de
  // inútil para el domiciliario que la "zona 2" que veníamos mostrando. Si esto se rompe,
  // volvemos a mandar a alguien a buscar una casa en "Comuna Occidental".
  it("NO cae en la comuna cuando no hay barrio", () => {
    const sinBarrio = respuesta({
      road: "Calle 5",
      suburb: "Comuna Centro",
      town: "Fusagasugá ciudad",
    });

    expect(barrioDeRespuesta(sinBarrio)).toBeNull();
  });

  // Fuera del casco urbano OSM devuelve la vereda en `village`. Tampoco es un barrio.
  it("NO cae en la vereda", () => {
    const vereda = respuesta({ road: "Vía Fusagasuga - San Miguel", village: "La Aguadita" });

    expect(barrioDeRespuesta(vereda)).toBeNull();
  });

  it("un barrio dentro de una vereda sí se usa", () => {
    const mixto = respuesta({ neighbourhood: "Villa Armerita", village: "La Aguadita" });

    expect(barrioDeRespuesta(mixto)).toBe("Villa Armerita");
  });

  it("recorta los espacios de alrededor", () => {
    expect(barrioDeRespuesta(respuesta({ neighbourhood: "  Manila  " }))).toBe("Manila");
  });

  // Nada de esto debería llegar nunca, y por eso mismo se prueba: esta función corre sobre la
  // respuesta de un tercero en el camino del pedido, y lo único que no puede hacer es lanzar.
  it.each([
    ["sin address", { place_id: 1 }],
    ["address vacío", respuesta({})],
    ["barrio vacío", respuesta({ neighbourhood: "   " })],
    ["barrio que no es texto", respuesta({ neighbourhood: 42 })],
    ["un error de Nominatim", { error: "Unable to geocode" }],
    ["null", null],
    ["un string suelto", "vaya"],
  ])("devuelve null con %s", (_caso, entrada) => {
    expect(barrioDeRespuesta(entrada)).toBeNull();
  });

  it("descarta un nombre que no cabe en el campo", () => {
    expect(barrioDeRespuesta(respuesta({ neighbourhood: "a".repeat(121) }))).toBeNull();
    expect(barrioDeRespuesta(respuesta({ neighbourhood: "a".repeat(120) }))).toHaveLength(120);
  });
});

/**
 * Qué escribir en el campo del barrio. Cada caso es un flujo real del checkout, y el que
 * importa —"segunda visita"— es el que estaba roto: la decisión se apoyaba en un `useRef` que
 * muere al recargar mientras el campo vive en localStorage, así que a un cliente que ya había
 * pedido el mapa dejaba de cambiarle el barrio para siempre.
 */
describe("decidirBarrio", () => {
  const base = {
    actual: "",
    sugerido: "Manila" as string | null,
    ultimaSugerencia: null as string | null,
    motivo: "pin-movido" as const,
  };

  it("llena el campo vacío al mover el pin", () => {
    expect(decidirBarrio(base)).toBe("Manila");
  });

  it("llena el campo vacío también al montar", () => {
    expect(decidirBarrio({ ...base, motivo: "montaje" })).toBe("Manila");
  });

  // EL BUG. Cliente que ya pidió: el barrio del pedido pasado sigue en localStorage y la
  // memoria de sesión arranca vacía. Mover el pin tiene que cambiar el campo.
  it("segunda visita: mover el pin cambia el barrio del pedido pasado", () => {
    expect(
      decidirBarrio({
        actual: "El Caney",
        sugerido: "Manila",
        ultimaSugerencia: null,
        motivo: "pin-movido",
      }),
    ).toBe("Manila");
  });

  it("montar con el pin guardado no pisa lo que ya está escrito", () => {
    expect(
      decidirBarrio({
        actual: "Centro",
        sugerido: "El Centro",
        ultimaSugerencia: null,
        motivo: "montaje",
      }),
    ).toBeNull();
  });

  // Ajustar el pin unos metros devuelve el mismo barrio: no hay cambio de dirección que
  // seguir, y borrar la corrección del cliente sería quitarle lo que acaba de escribir.
  it("un ajuste dentro del mismo barrio respeta la corrección a mano", () => {
    expect(
      decidirBarrio({
        actual: "Centro",
        sugerido: "El Centro",
        ultimaSugerencia: "El Centro",
        motivo: "pin-movido",
      }),
    ).toBeNull();
  });

  it("pero mover el pin a otro barrio gana sobre la corrección", () => {
    expect(
      decidirBarrio({
        actual: "Centro",
        sugerido: "Manila",
        ultimaSugerencia: "El Centro",
        motivo: "pin-movido",
      }),
    ).toBe("Manila");
  });

  // El campo es obligatorio: vaciarlo porque OSM no contestó le dejaría al cliente un error
  // que no provocó.
  it.each(["montaje", "pin-movido"] as const)("sin sugerencia no toca nada (%s)", (motivo) => {
    expect(decidirBarrio({ ...base, actual: "Centro", sugerido: null, motivo })).toBeNull();
  });

  it("un campo con solo espacios cuenta como vacío", () => {
    expect(decidirBarrio({ ...base, actual: "   ", motivo: "montaje" })).toBe("Manila");
  });
});

describe("resolverNombreBarrio", () => {
  // El caso que motivó la tabla: OSM insiste en "Managua", que no existe en Fusagasugá.
  it("aplica la corrección cuando el nombre está en el diccionario", () => {
    expect(resolverNombreBarrio("Managua", { nombre: "Balmoral" })).toBe("Balmoral");
  });

  it("no sugiere nada si la fila quedó sin nombre", () => {
    // Vaciar el campo en el panel es decir "este nombre no sirve para nadie": mejor que lo
    // escriba el cliente a proponerle algo que ya se sabe que está mal.
    expect(resolverNombreBarrio("Managua", { nombre: null })).toBeNull();
  });

  it("deja pasar tal cual un barrio que no está en el diccionario", () => {
    // OSM añadió un barrio después del seed. Sin fila no hay opinión, y una sugerencia sin
    // revisar sigue siendo mejor que ninguna: el cliente la corrige si no le cuadra.
    expect(resolverNombreBarrio("Villa Nueva", undefined)).toBe("Villa Nueva");
  });

  it("un barrio corregido a sí mismo se comporta igual que no tener fila", () => {
    // Es el estado del seed: 90 filas que se traducen a sí mismas y no cambian nada.
    expect(resolverNombreBarrio("Balmoral", { nombre: "Balmoral" })).toBe("Balmoral");
  });

  it("sin nombre de OSM no hay nada que traducir", () => {
    expect(resolverNombreBarrio(null, undefined)).toBeNull();
    expect(resolverNombreBarrio(null, { nombre: "Balmoral" })).toBeNull();
  });
});
