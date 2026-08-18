import { describe, expect, it } from "vitest";
import { puntoDeRespuesta } from "./geocodificar";

/**
 * Interpretar lo que devuelve Nominatim, sin red — igual que `barrioDeRespuesta`.
 *
 * Lo que hay que fijar es que **cualquier respuesta rara acabe en `null`** en vez de en un pin. Un
 * `NaN` colado aquí se guarda como coordenada y deja el local en mitad del Atlántico, sin que nada
 * lo avise: de ese punto sale el mapa que ve el cliente cuando el GPS le falla.
 */
describe("puntoDeRespuesta", () => {
  it("toma el primer resultado y convierte las coordenadas a número", () => {
    // Nominatim las manda como texto, siempre.
    const datos = [
      { lat: "4.343243027", lon: "-74.364824295", display_name: "Calle 17, Fusagasugá" },
      { lat: "4.9", lon: "-74.9", display_name: "otra cosa" },
    ];

    expect(puntoDeRespuesta(datos)).toEqual({ lat: 4.343243027, lng: -74.364824295 });
  });

  // Una dirección que OSM no tiene mapeada. Es el caso normal en Fusagasugá, no la excepción.
  it("sin resultados devuelve null", () => {
    expect(puntoDeRespuesta([])).toBeNull();
  });

  it("una respuesta que no es un array devuelve null", () => {
    expect(puntoDeRespuesta({ error: "Unable to geocode" })).toBeNull();
    expect(puntoDeRespuesta(null)).toBeNull();
    expect(puntoDeRespuesta("vaya")).toBeNull();
  });

  it("un resultado sin coordenadas devuelve null", () => {
    expect(puntoDeRespuesta([{ display_name: "sin lat ni lon" }])).toBeNull();
  });

  // El caso que de verdad hace daño: `Number("por ahí")` es NaN, y un NaN guardado como coordenada
  // no falla en ninguna parte hasta que alguien abre el mapa.
  it("coordenadas que no son números devuelven null, nunca NaN", () => {
    expect(puntoDeRespuesta([{ lat: "por ahí", lon: "-74.36" }])).toBeNull();
  });

  // Fuera de rango solo puede ser basura: la Tierra no llega a 200 grados de latitud.
  it("coordenadas fuera del planeta devuelven null", () => {
    expect(puntoDeRespuesta([{ lat: "200", lon: "-74.36" }])).toBeNull();
  });
});
