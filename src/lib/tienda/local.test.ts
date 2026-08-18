import { describe, expect, it } from "vitest";
import { comoLlegarUrl } from "./local";

const PIN = { lat: 4.3372, lng: -74.3653 };

/**
 * El enlace de «Cómo llegar» que ve quien recoge.
 *
 * Lo que hay que fijar es el **orden de preferencia** y, sobre todo, que sin nada devuelva `null`:
 * un botón que existe siempre y a veces lleva a ninguna parte es peor que un botón que no está.
 */
describe("comoLlegarUrl", () => {
  it("con pin, apunta al pin", () => {
    expect(comoLlegarUrl({ direccion: "Calle 17 # 7-44", ubicacion: PIN })).toBe(
      "https://maps.google.com/maps?q=4.3372,-74.3653",
    );
  });

  // El pin es un punto exacto y la dirección escrita es texto que Maps tiene que adivinar: cuando
  // están los dos, gana el que no se puede malinterpretar.
  it("el pin gana a la dirección escrita", () => {
    const url = comoLlegarUrl({ direccion: "Calle 17 # 7-44", ubicacion: PIN })!;
    expect(url).not.toContain("Calle");
  });

  it("sin pin, busca por la dirección escrita", () => {
    expect(comoLlegarUrl({ direccion: "Calle 17 # 7-44, Balmoral", ubicacion: null })).toBe(
      "https://maps.google.com/maps?q=Calle%2017%20%23%207-44%2C%20Balmoral",
    );
  });

  it("sin pin y sin dirección no hay enlace", () => {
    expect(comoLlegarUrl({ direccion: null, ubicacion: null })).toBeNull();
  });

  // Una dirección que quedó en blanco no es una dirección: buscarla abriría Maps en la nada.
  it("una dirección en blanco cuenta como no tenerla", () => {
    expect(comoLlegarUrl({ direccion: "   ", ubicacion: null })).toBeNull();
  });
});
