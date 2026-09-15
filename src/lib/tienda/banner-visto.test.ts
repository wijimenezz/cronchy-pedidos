import { describe, expect, it } from "vitest";
import { debeMostrarBanner } from "./banner-visto";

const BIG_GODO = "11111111-1111-1111-1111-111111111111";
const PROMO_MARTES = "22222222-2222-2222-2222-222222222222";

describe("debeMostrarBanner", () => {
  it("un banner que este dispositivo no ha visto se muestra", () => {
    expect(debeMostrarBanner(BIG_GODO, null)).toBe(true);
  });

  it("el mismo banner, ya visto, no se vuelve a mostrar", () => {
    expect(debeMostrarBanner(BIG_GODO, BIG_GODO)).toBe(false);
  });

  /**
   * **La regla entera.** Se guarda el id del banner y no un "ya vio algo": publicar uno nuevo lo
   * vuelve a mostrar solo, sin que nadie tenga que acordarse de resetear nada en el panel.
   */
  it("publicar otro banner lo vuelve a mostrar, aunque haya memoria del anterior", () => {
    expect(debeMostrarBanner(PROMO_MARTES, BIG_GODO)).toBe(true);
  });

  it("sin banner activo no hay nada que mostrar", () => {
    expect(debeMostrarBanner(null, null)).toBe(false);
    expect(debeMostrarBanner(null, BIG_GODO)).toBe(false);
  });

  // `localStorage` devuelve cadenas y lo que hay guardado puede ser basura de una versión
  // anterior. Ante la duda se muestra: enseñar un anuncio de más es mucho menos malo que
  // tragarse el único aviso que el negocio quería dar.
  it("una memoria ilegible no silencia el banner", () => {
    expect(debeMostrarBanner(BIG_GODO, "")).toBe(true);
    expect(debeMostrarBanner(BIG_GODO, "   ")).toBe(true);
    expect(debeMostrarBanner(BIG_GODO, "null")).toBe(true);
  });
});
