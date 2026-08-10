import { beforeEach, describe, expect, it, vi } from "vitest";
import { NoAutenticadoError, SinPermisoError, exigirRol, rolAlcanza } from "./autorizacion";
import { leerSesion } from "./auth/cookie";

// `cookie.ts` importa `next/headers`, que solo existe dentro de una petición de Next.
vi.mock("./auth/cookie", () => ({ leerSesion: vi.fn() }));

const SESION = {
  sub: "11111111-1111-4111-8111-111111111111",
  storeId: "22222222-2222-4222-8222-222222222222",
  exp: 9999999999,
};

beforeEach(() => {
  vi.mocked(leerSesion).mockReset();
});

describe("rolAlcanza", () => {
  it("admin alcanza cualquier rol", () => {
    expect(rolAlcanza("admin", "admin")).toBe(true);
    expect(rolAlcanza("admin", "colaborador")).toBe(true);
  });

  it("colaborador se alcanza a sí mismo pero no a admin", () => {
    expect(rolAlcanza("colaborador", "colaborador")).toBe(true);
    expect(rolAlcanza("colaborador", "admin")).toBe(false);
  });
});

describe("exigirRol", () => {
  it("devuelve la sesión cuando el rol alcanza", async () => {
    vi.mocked(leerSesion).mockResolvedValue({ ...SESION, rol: "admin" });

    await expect(exigirRol("colaborador")).resolves.toMatchObject({ rol: "admin" });
  });

  it("lanza NoAutenticadoError si no hay sesión", async () => {
    vi.mocked(leerSesion).mockResolvedValue(null);

    await expect(exigirRol("colaborador")).rejects.toBeInstanceOf(NoAutenticadoError);
  });

  // Los dos errores se distinguen porque quien llama actúa distinto: al primero lo manda
  // al login, al segundo no —ya está autenticado y sería un bucle—.
  it("lanza SinPermisoError si hay sesión pero el rol no alcanza", async () => {
    vi.mocked(leerSesion).mockResolvedValue({ ...SESION, rol: "colaborador" });

    await expect(exigirRol("admin")).rejects.toBeInstanceOf(SinPermisoError);
  });
});
