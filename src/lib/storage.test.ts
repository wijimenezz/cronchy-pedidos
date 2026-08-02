import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  borrarFotoProducto,
  descargarComprobante,
  subirComprobante,
  subirFotoProducto,
} from "@/lib/storage";

/**
 * El contrato con Supabase Storage, con el `fetch` stubeado.
 *
 * Aquí no hay lógica de negocio que probar: lo que se prueba es lo que este módulo le
 * dice al servicio externo y cómo interpreta lo que le responde. Justo donde estaban los
 * dos bugs que impedían subir una sola foto —faltaba la cabecera `apikey`, y un objeto
 * ausente llega como 400 y no como 404—, y ninguno de los dos se ve leyendo el código.
 */

const BASE = "https://proyecto.supabase.co";
const PRODUCTO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CATEGORIA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let llamadas: { url: string; init: RequestInit }[] = [];

function responder(respuesta: Response) {
  vi.stubGlobal("fetch", (url: string | URL, init: RequestInit = {}) => {
    llamadas.push({ url: String(url), init });
    return Promise.resolve(respuesta);
  });
}

const ok = () => new Response("{}", { status: 200 });

beforeEach(() => {
  llamadas = [];
  vi.stubEnv("SUPABASE_URL", BASE);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_prueba");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** Las cabeceras van como objeto plano en todas las llamadas de este módulo. */
function cabecerasDe(indice = 0): Record<string, string> {
  return llamadas[indice].init.headers as Record<string, string>;
}

describe("autenticación", () => {
  it("manda apikey además de Authorization al subir", async () => {
    responder(ok());
    await subirFotoProducto(new ArrayBuffer(8), "image/webp", { productId: PRODUCTO });

    // Sin `apikey`, una llave `sb_secret_…` (que no es un JWT) recibe un
    // "400 Invalid Compact JWS" y NINGUNA subida funciona.
    expect(cabecerasDe()).toMatchObject({
      Authorization: "Bearer sb_secret_prueba",
      apikey: "sb_secret_prueba",
    });
  });

  it("manda las dos cabeceras al leer un comprobante", async () => {
    responder(new Response(new ArrayBuffer(4), { status: 200 }));
    await descargarComprobante(`${BASE}/storage/v1/object/comprobantes/2026/07/x.jpg`);

    expect(cabecerasDe()).toMatchObject({
      Authorization: "Bearer sb_secret_prueba",
      apikey: "sb_secret_prueba",
    });
  });

  it("manda las dos cabeceras al borrar una foto", async () => {
    responder(ok());
    await borrarFotoProducto(`${BASE}/storage/v1/object/public/productos/${PRODUCTO}/f.webp`);

    expect(llamadas[0].init.method).toBe("DELETE");
    expect(cabecerasDe()).toMatchObject({ apikey: "sb_secret_prueba" });
  });

  it("no sube nada si falta la configuración", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    responder(ok());

    await expect(
      subirFotoProducto(new ArrayBuffer(8), "image/webp", { productId: PRODUCTO }),
    ).rejects.toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(llamadas).toHaveLength(0);
  });
});

describe("URLs devueltas", () => {
  it("la foto de producto se devuelve con la ruta pública de lectura", async () => {
    responder(ok());
    const { url } = await subirFotoProducto(new ArrayBuffer(8), "image/webp", {
      productId: PRODUCTO,
    });

    // Se ESCRIBE en /object/<bucket>/ y se LEE en /object/public/<bucket>/. Devolver la
    // de escritura da un 400 al cargar la imagen, y además no encaja ni con
    // `esUrlDeFotoProducto` ni con el `remotePattern` de next.config.
    expect(llamadas[0].url).toBe(`${BASE}/storage/v1/object/productos/${PRODUCTO}/${uuidDe(url)}.webp`);
    expect(url).toMatch(
      new RegExp(`^${BASE}/storage/v1/object/public/productos/${PRODUCTO}/[0-9a-f-]{36}\\.webp$`),
    );
  });

  it("el banner de categoría va a su propia carpeta del mismo bucket", async () => {
    responder(ok());
    const { url } = await subirFotoProducto(new ArrayBuffer(8), "image/webp", {
      categoryId: CATEGORIA,
    });

    expect(url).toContain(`/object/public/productos/categorias/${CATEGORIA}/`);
  });

  it("el comprobante se devuelve SIN /public/, porque su bucket es privado", async () => {
    responder(ok());
    const { url } = await subirComprobante(new ArrayBuffer(8), "image/jpeg");

    expect(url).not.toContain("/public/");
    expect(url).toMatch(
      new RegExp(`^${BASE}/storage/v1/object/comprobantes/\\d{4}/\\d{2}/[0-9a-f-]{36}\\.jpg$`),
    );
  });

  it("lanza si Storage rechaza la subida", async () => {
    responder(new Response("mensaje del servicio", { status: 500 }));

    await expect(subirComprobante(new ArrayBuffer(8), "image/jpeg")).rejects.toThrow(
      /500.*mensaje del servicio/,
    );
  });
});

describe("comprobante ausente", () => {
  const URL_COMPROBANTE = `${BASE}/storage/v1/object/comprobantes/2026/07/x.jpg`;

  it("devuelve null ante el 404 que Supabase envuelve en un 400", async () => {
    // Esta es la respuesta REAL de Supabase para un objeto que no existe.
    responder(
      new Response(
        '{"statusCode":"404","error":"not_found","message":"Object not found","code":"NoSuchKey"}',
        { status: 400 },
      ),
    );

    // Si esto lanzara, el panel respondería 500 en vez del 410 "ya se purgó".
    await expect(descargarComprobante(URL_COMPROBANTE)).resolves.toBeNull();
  });

  it("devuelve null también ante un 404 de verdad", async () => {
    responder(new Response("", { status: 404 }));
    await expect(descargarComprobante(URL_COMPROBANTE)).resolves.toBeNull();
  });

  it("un fallo real del servicio sí lanza", async () => {
    responder(new Response("upstream caído", { status: 500 }));
    await expect(descargarComprobante(URL_COMPROBANTE)).rejects.toThrow(/500/);
  });

  it("devuelve el archivo y su tipo cuando está", async () => {
    responder(
      new Response(new ArrayBuffer(12), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );

    const archivo = await descargarComprobante(URL_COMPROBANTE);
    expect(archivo?.tipo).toBe("image/png");
    expect(archivo?.cuerpo.byteLength).toBe(12);
  });
});

function uuidDe(url: string): string {
  return url.split("/").pop()!.replace(".webp", "");
}
