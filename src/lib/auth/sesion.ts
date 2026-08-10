/**
 * Sesión del panel: un token firmado que viaja en una cookie httpOnly.
 *
 * No se usa Auth.js a propósito. Aquí no hay OAuth, ni providers, ni registro público:
 * son dos o tres empleados con correo y clave contra `app_user`. Una librería de auth
 * resolvería problemas que este proyecto no tiene, a cambio de una capa que hay que
 * entender para depurarla.
 *
 * Todo lo de este archivo es puro y usa **Web Crypto**, nunca `node:crypto`: el
 * middleware lo importa y corre en el Edge Runtime, donde `node:crypto` no existe.
 * Por eso también vive separado de `password.ts` — bcrypt no puede entrar al middleware.
 *
 * El token NO es un secreto reutilizable ni pretende serlo: va firmado, no cifrado.
 * Cualquiera que lo tenga puede leer el rol y el id; lo que no puede es fabricar uno.
 */

export type Rol = "admin" | "colaborador";

export type Sesion = {
  /** id de `app_user` */
  sub: string;
  rol: Rol;
  storeId: string;
  /** epoch en segundos */
  exp: number;
};

export const NOMBRE_COOKIE = "cronchy_sesion";

/** Un turno de trabajo. Al terminarlo hay que volver a entrar. */
export const DURACION_SEGUNDOS = 12 * 60 * 60;

function secreto(): string {
  const valor = process.env.AUTH_SECRET;
  if (!valor || valor.length < 32) {
    throw new Error(
      "Falta AUTH_SECRET (mínimo 32 caracteres). Mira .env.example — genérala con `openssl rand -base64 32`.",
    );
  }
  return valor;
}

async function clave(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secreto()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

// base64url a mano y no con `Buffer`: el middleware no lo tiene.
function aBase64Url(bytes: Uint8Array): string {
  let binario = "";
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// El `new ArrayBuffer(...)` explícito no es adorno: un `new Uint8Array(n)` se tipa sobre
// `ArrayBufferLike`, que incluye `SharedArrayBuffer` y no encaja en el `BufferSource` que
// pide `crypto.subtle`.
function deBase64Url(texto: string): Uint8Array<ArrayBuffer> {
  const base = texto.replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(base + "=".repeat((4 - (base.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binario.length));
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/**
 * `ahora` es parámetro para poder probar la expiración sin manipular el reloj.
 */
export async function firmarSesion(
  datos: Omit<Sesion, "exp">,
  ahora: number = Date.now(),
): Promise<string> {
  const sesion: Sesion = { ...datos, exp: Math.floor(ahora / 1000) + DURACION_SEGUNDOS };
  const cuerpo = aBase64Url(new TextEncoder().encode(JSON.stringify(sesion)));
  const firma = await crypto.subtle.sign("HMAC", await clave(), new TextEncoder().encode(cuerpo));

  return `${cuerpo}.${aBase64Url(new Uint8Array(firma))}`;
}

/**
 * Devuelve `null` ante cualquier problema —token ausente, malformado, firmado con otra
 * llave o vencido— en vez de lanzar o de distinguir entre casos: quien llama solo tiene
 * una decisión que tomar, y un mensaje más específico solo le serviría a quien esté
 * probando a falsificar cookies.
 */
export async function verificarSesion(
  token: string | undefined | null,
  ahora: number = Date.now(),
): Promise<Sesion | null> {
  if (!token) return null;

  const punto = token.indexOf(".");
  if (punto < 1) return null;

  const cuerpo = token.slice(0, punto);
  const firma = token.slice(punto + 1);

  try {
    // `subtle.verify` compara en tiempo constante; comparar los strings a mano abriría
    // un canal lateral por tiempo.
    const valida = await crypto.subtle.verify(
      "HMAC",
      await clave(),
      deBase64Url(firma),
      new TextEncoder().encode(cuerpo),
    );
    if (!valida) return null;

    const sesion = JSON.parse(new TextDecoder().decode(deBase64Url(cuerpo))) as Sesion;
    if (typeof sesion.exp !== "number" || sesion.exp * 1000 <= ahora) return null;
    if (sesion.rol !== "admin" && sesion.rol !== "colaborador") return null;
    if (!sesion.sub || !sesion.storeId) return null;

    return sesion;
  } catch {
    return null;
  }
}
