import { BUCKET_COMPROBANTES, rutaComprobante, type TipoImagen } from "@/lib/comprobantes";

/**
 * Subidas a Supabase Storage. SOLO SERVIDOR: usa la service role key, que da acceso
 * total a las tablas. Nunca importar este módulo desde un componente del navegador
 * ni prefijar sus variables con `NEXT_PUBLIC_`.
 *
 * Se habla con la REST API por `fetch` en vez de instalar `@supabase/supabase-js`:
 * la única operación que hace falta es un PUT de un objeto, y el SDK arrastraría el
 * cliente de realtime (WebSocket) y postgrest, que este proyecto no usa —el acceso a
 * datos es Drizzle— y que CLAUDE.md prohíbe. Además, si el SDK no está instalado es
 * imposible importarlo por error en el cliente y filtrar la llave.
 */

function entorno(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. Mira .env.example — son de servidor, sin NEXT_PUBLIC_.",
    );
  }
  return { url: url.replace(/\/$/, ""), key };
}

export async function subirComprobante(
  bytes: ArrayBuffer,
  tipo: TipoImagen,
): Promise<{ url: string }> {
  const { url, key } = entorno();
  const ruta = rutaComprobante(tipo);
  const destino = `${url}/storage/v1/object/${BUCKET_COMPROBANTES}/${ruta}`;

  const respuesta = await fetch(destino, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": tipo,
      "x-upsert": "false",
    },
    body: bytes,
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => "");
    throw new Error(`Supabase Storage respondió ${respuesta.status}: ${detalle.slice(0, 200)}`);
  }

  return { url: destino };
}
