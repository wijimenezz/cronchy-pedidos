import { beforeEach, describe, expect, it } from "vitest";
import { DURACION_SEGUNDOS, firmarSesion, verificarSesion } from "./sesion";

const SECRETO = "un-secreto-de-pruebas-con-mas-de-32-caracteres";
const OTRO_SECRETO = "otro-secreto-distinto-igualmente-largo-de-32";

const DATOS = {
  sub: "11111111-1111-4111-8111-111111111111",
  rol: "admin" as const,
  storeId: "22222222-2222-4222-8222-222222222222",
};

const AHORA = Date.UTC(2026, 6, 30, 12, 0, 0);

beforeEach(() => {
  process.env.AUTH_SECRET = SECRETO;
});

describe("firmarSesion / verificarSesion", () => {
  it("devuelve los mismos datos que se firmaron", async () => {
    const token = await firmarSesion(DATOS, AHORA);
    const sesion = await verificarSesion(token, AHORA);

    expect(sesion).toMatchObject(DATOS);
  });

  it("fija la expiración una jornada después de firmar", async () => {
    const token = await firmarSesion(DATOS, AHORA);
    const sesion = await verificarSesion(token, AHORA);

    expect(sesion?.exp).toBe(Math.floor(AHORA / 1000) + DURACION_SEGUNDOS);
  });

  it("sigue siendo válida justo antes de vencer", async () => {
    const token = await firmarSesion(DATOS, AHORA);
    const casiVencida = AHORA + DURACION_SEGUNDOS * 1000 - 1000;

    expect(await verificarSesion(token, casiVencida)).not.toBeNull();
  });

  it("rechaza una sesión vencida", async () => {
    const token = await firmarSesion(DATOS, AHORA);
    const vencida = AHORA + DURACION_SEGUNDOS * 1000 + 1000;

    expect(await verificarSesion(token, vencida)).toBeNull();
  });

  // El corazón del asunto: sin esto, cualquiera se firma un token de admin.
  it("rechaza un token firmado con otro secreto", async () => {
    const token = await firmarSesion(DATOS, AHORA);

    process.env.AUTH_SECRET = OTRO_SECRETO;
    expect(await verificarSesion(token, AHORA)).toBeNull();
  });

  it("rechaza un cuerpo alterado, aunque conserve la firma original", async () => {
    const token = await firmarSesion({ ...DATOS, rol: "colaborador" }, AHORA);
    const [, firma] = token.split(".");

    // Un ascenso a admin escribiendo el payload a mano.
    const falsificado = Buffer.from(JSON.stringify({ ...DATOS, rol: "admin", exp: 99999999999 }))
      .toString("base64url");

    expect(await verificarSesion(`${falsificado}.${firma}`, AHORA)).toBeNull();
  });

  it.each([
    ["ausente", undefined],
    ["vacío", ""],
    ["sin firma", "solo-cuerpo"],
    ["sin cuerpo", ".firma"],
    ["basura", "no-es-base64!!.tampoco@@"],
  ])("devuelve null ante un token %s", async (_caso, token) => {
    expect(await verificarSesion(token, AHORA)).toBeNull();
  });

  it("rechaza un rol que no existe", async () => {
    // Firmado con la llave buena, pero con un rol inventado: la firma es válida y aun así
    // no debe pasar, porque `rolAlcanza` no sabría qué hacer con él.
    process.env.AUTH_SECRET = SECRETO;
    const token = await firmarSesion({ ...DATOS, rol: "superadmin" as never }, AHORA);

    expect(await verificarSesion(token, AHORA)).toBeNull();
  });

  it("exige un AUTH_SECRET de largo razonable", async () => {
    process.env.AUTH_SECRET = "corto";
    await expect(firmarSesion(DATOS, AHORA)).rejects.toThrow(/AUTH_SECRET/);
  });
});
