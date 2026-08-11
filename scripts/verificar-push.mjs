/**
 * Comprueba que los avisos por Web Push pueden funcionar.
 *
 *   pnpm verificar-push
 *
 * Existe porque este subsistema falla callado por naturaleza: si no hay a quién empujar, o las
 * llaves están mal, el envío no lanza nada — simplemente no llega un aviso, y eso solo se nota
 * cuando se enfría un pedido. Esta comprobación ya encontró dos problemas reales: un
 * `VAPID_SUBJECT` sin el `mailto:` (que hacía fallar TODOS los envíos) y cero suscripciones
 * registradas (que los hacía inútiles).
 *
 * **La pregunta que más resuelve es la última: cuántos dispositivos hay suscritos.** Si son cero,
 * no hay nada que depurar en el servidor — falta que alguien abra el panel y active los avisos.
 *
 * No imprime ningún secreto: de las llaves solo dice si están y cuánto miden.
 *
 * Es .mjs y no .ts para correrlo con node a secas, como `configurar-purga.mjs`.
 */
import { config } from "dotenv";
import webpush from "web-push";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });

let fallos = 0;
const ok = (m) => console.log(`  OK    ${m}`);
const mal = (m) => {
  fallos++;
  console.log(`  FALLA ${m}`);
};

console.log("\n1. Variables de entorno\n");

const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privada = process.env.VAPID_PRIVATE_KEY;
const sujeto = process.env.VAPID_SUBJECT;

// Una llave pública VAPID son 65 bytes en base64url = 87 caracteres; la privada, 32 = 43.
if (!publica) mal("falta NEXT_PUBLIC_VAPID_PUBLIC_KEY");
else if (publica.length !== 87) mal(`la pública mide ${publica.length} y deberían ser 87`);
else ok("pública presente (87 caracteres)");

if (!privada) mal("falta VAPID_PRIVATE_KEY");
else if (privada.length !== 43) mal(`la privada mide ${privada.length} y deberían ser 43`);
else ok("privada presente (43 caracteres) — no se imprime");

if (!sujeto) mal("falta VAPID_SUBJECT");
else ok(`sujeto = ${sujeto}`);

console.log("\n2. ¿Son un par válido?\n");

if (publica && privada && sujeto) {
  try {
    // Mismo arreglo que hace el servidor: un correo pelado no es una URI y `web-push` lo rechaza.
    const normalizado = /^(mailto:|https?:\/\/)/i.test(sujeto.trim())
      ? sujeto.trim()
      : `mailto:${sujeto.trim()}`;

    webpush.setVapidDetails(normalizado, publica, privada);
    ok("web-push acepta el par");
  } catch (error) {
    mal(`web-push rechaza las llaves: ${error.message}`);
  }
}

console.log("\n3. La base de datos\n");

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!url) {
  mal("no hay DIRECT_URL ni DATABASE_URL");
} else {
  const sql = postgres(url, { prepare: false, max: 1 });

  try {
    const columnas = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'push_subscription'
    `;

    if (columnas.length === 0) {
      mal("la tabla push_subscription no existe — falta pnpm db:migrate");
    } else {
      ok(`push_subscription existe (${columnas.length} columnas)`);

      const suscripciones = await sql`
        SELECT s.creado_en, u.email, left(s.endpoint, 40) AS endpoint
        FROM push_subscription s
        LEFT JOIN app_user u ON u.id = s.user_id
        ORDER BY s.creado_en DESC
      `;

      if (suscripciones.length === 0) {
        mal(
          "CERO dispositivos suscritos: por eso no llega ningún aviso.\n" +
            "        Abre /admin/pedidos y toca «Activar avisos». Si ya lo hiciste, el panel\n" +
            "        te dirá bajo el botón qué canal no quedó armado.",
        );
      } else {
        ok(`${suscripciones.length} dispositivo(s) suscrito(s)`);
        for (const s of suscripciones) {
          console.log(
            `        ${s.creado_en.toISOString().slice(0, 16).replace("T", " ")}  ` +
              `${(s.email ?? "?").padEnd(28)} ${s.endpoint}…`,
          );
        }
      }
    }
  } catch (error) {
    mal(`error consultando la base: ${error.message}`);
  } finally {
    await sql.end();
  }
}

console.log(
  fallos === 0
    ? "\nTodo listo: un pedido nuevo debería avisar.\n"
    : `\n${fallos} cosa(s) por arreglar.\n`,
);

process.exit(fallos === 0 ? 0 : 1);
