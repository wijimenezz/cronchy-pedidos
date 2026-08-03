import { describe, expect, it } from "vitest";
import { barrioDeRespuesta } from "./barrio";

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
