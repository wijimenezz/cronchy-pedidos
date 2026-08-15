/**
 * Comprueba que el aviso interno por Telegram puede funcionar, y manda uno de prueba.
 *
 *   pnpm verificar-telegram
 *
 * Existe por el mismo motivo que `verificar-push.mjs`: este canal falla callado. Si el token está
 * mal, si el bot nunca habló con el chat o si el id del chat es de otro sitio, el envío no tumba
 * nada — simplemente no llega un mensaje, y eso solo se nota cuando se enfría un pedido.
 *
 * No imprime ningún secreto: del token solo dice si está y cuánto mide.
 *
 * Es .mjs y no .ts para correrlo con node a secas, como los otros scripts.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

let fallos = 0;
const ok = (m) => console.log(`  OK    ${m}`);
const mal = (m) => {
  fallos++;
  console.log(`  FALLA ${m}`);
};

console.log("\n1. Variables de entorno\n");

const token = process.env.TELEGRAM_BOT_TOKEN;
const chat = process.env.TELEGRAM_CHAT_ID;

if (!token) mal("falta TELEGRAM_BOT_TOKEN");
else ok(`TELEGRAM_BOT_TOKEN presente (${token.length} caracteres)`);

if (!chat) mal("falta TELEGRAM_CHAT_ID");
else ok(`TELEGRAM_CHAT_ID = ${chat}`);

const API = `https://api.telegram.org/bot${token}`;

/**
 * La Bot API contesta 200 con `{ok:false, description}` en casi todos los errores.
 *
 * El timeout va con un `AbortController` propio y no con `AbortSignal.timeout` porque este script
 * termina con `process.exitCode`: un temporizador todavía vivo al cerrar hace que node reviente en
 * Windows con un assert de libuv, y un verificador que acaba en crash parece roto aunque todo
 * haya salido bien.
 */
async function llamar(metodo, cuerpo) {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), 10000);

  try {
    const respuesta = await fetch(`${API}/${metodo}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo ?? {}),
      signal: control.signal,
    });

    return respuesta.json();
  } finally {
    clearTimeout(temporizador);
  }
}

// Sin las dos variables no hay nada que probar contra la API, pero el resumen se imprime igual.
if (token && chat) {
  console.log("\n2. El bot\n");

  try {
    const yo = await llamar("getMe");

    if (!yo.ok) mal(`el token no sirve: ${yo.description}`);
    else ok(`responde @${yo.result.username} (${yo.result.first_name})`);
  } catch (error) {
    mal(`no se pudo hablar con api.telegram.org: ${error.message}`);
  }

  console.log("\n3. El chat\n");

  try {
    const envio = await llamar("sendMessage", {
      chat_id: chat,
      text:
        "<b>🔔 Prueba de avisos</b>\n" +
        "Si lees esto, los pedidos nuevos van a llegar por aquí.",
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });

    if (envio.ok) {
      ok("mensaje de prueba enviado — míralo en el chat");
    } else if (envio.description?.includes("chat not found")) {
      mal(
        "chat not found. El id está mal o el bot nunca habló con ese chat.\n" +
          "        Escríbele algo al bot (o añádelo al grupo), y saca el id de:\n" +
          `        https://api.telegram.org/bot<TU_TOKEN>/getUpdates`,
      );
    } else {
      mal(`Telegram rechazó el envío: ${envio.description}`);
    }
  } catch (error) {
    mal(`no se pudo enviar: ${error.message}`);
  }
}

console.log(
  fallos === 0
    ? "\nTodo listo: un pedido nuevo debería avisar por Telegram.\n"
    : `\n${fallos} cosa(s) por arreglar.\n`,
);

// `exitCode` y no `process.exit()`: forzar la salida con la conexión de undici todavía cerrándose
// hace que node reviente en Windows con un assert de libuv, justo después de decir que todo va bien.
process.exitCode = fallos === 0 ? 0 : 1;
