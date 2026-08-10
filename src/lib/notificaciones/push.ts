import webpush from "web-push";
import { borrarSuscripcion, suscripcionesDeTienda } from "@/db/queries/push";

/**
 * El empujón al panel cuando entra un pedido.
 *
 * Es el único canal que llega con el navegador cerrado: en la tablet Android lo entrega el
 * sistema operativo aunque Chrome no esté vivo. Los otros dos —el pitido y la notificación de la
 * página— necesitan el panel abierto en alguna pestaña.
 *
 * Solo servidor, runtime Node: `web-push` cifra el payload (RFC 8291) con `node:crypto`.
 */

/** Configurar VAPID es global en la librería, así que se hace una vez y se recuerda. */
let configurado = false;
let yaSeQuejo = false;

/**
 * El estándar exige que el sujeto sea una URI, y lo natural es escribir el correo pelado.
 * `web-push` lo rechaza con "Vapid subject is not a valid URL", así que se normaliza en vez de
 * castigar la forma obvia de escribirlo: un `mailto:` que falta no vale un deploy en el que no
 * llega ni un aviso.
 */
function normalizarSujeto(valor: string): string {
  const limpio = valor.trim();

  return /^(mailto:|https?:\/\/)/i.test(limpio) ? limpio : `mailto:${limpio}`;
}

/**
 * Devuelve si el push puede salir.
 *
 * **Se queja en voz alta la primera vez que no puede**, y eso importa: quien llama envuelve esto
 * en un `try/catch` para no tumbar el checkout, así que una configuración mal puesta se
 * traduciría en silencio absoluto — ni push, ni error, ni pista. Un aviso que no llega y no deja
 * rastro es el peor de los dos mundos.
 */
function configurar(): boolean {
  if (configurado) return true;

  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  const sujeto = process.env.VAPID_SUBJECT;

  if (!publica || !privada || !sujeto) {
    if (!yaSeQuejo) {
      yaSeQuejo = true;
      console.warn(
        "Web Push apagado: faltan NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY o VAPID_SUBJECT.",
      );
    }
    return false;
  }

  try {
    webpush.setVapidDetails(normalizarSujeto(sujeto), publica, privada);
    configurado = true;
    return true;
  } catch (error) {
    if (!yaSeQuejo) {
      yaSeQuejo = true;
      console.error("Web Push apagado: las llaves VAPID no son válidas.", error);
    }
    return false;
  }
}

/**
 * Avisa a todos los dispositivos de la tienda de que entró un pedido.
 *
 * **El payload lleva lo mínimo.** Número y nada más: esto se ve en una pantalla bloqueada, y quien
 * pasa por al lado del mostrador no tiene por qué leer el nombre ni la dirección de nadie. Es la
 * misma doctrina de la regla 18, donde la pantalla del domiciliario tampoco expone la ficha.
 *
 * **Nunca lanza.** Lo llama `POST /api/pedidos` con el pedido ya creado: si el push falla, el
 * cliente ya hizo su compra y la respuesta no puede cambiar por eso. Los fallos se registran.
 */
export async function enviarPushPedidoNuevo(storeId: string, numero: number): Promise<void> {
  if (!configurar()) return;

  const suscripciones = await suscripcionesDeTienda(storeId).catch(() => []);
  if (suscripciones.length === 0) return;

  const payload = JSON.stringify({
    titulo: "Cronchy · pedido nuevo",
    cuerpo: `Entró el pedido #${numero}`,
  });

  // `allSettled` y no `all`: un dispositivo caído no puede impedir que los demás se enteren.
  const resultados = await Promise.allSettled(
    suscripciones.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      ),
    ),
  );

  await limpiarMuertas(suscripciones, resultados);
}

/**
 * Un 404 o un 410 del servicio de push significan que esa suscripción ya no existe —el navegador
 * se desinstaló, se limpiaron los datos del sitio, caducó—. Es la única señal fiable de que hay
 * que borrarla: por antigüedad no se sabe, porque una tablet que lleva meses avisando bien tiene
 * la misma edad que una muerta.
 *
 * Cualquier otro error (un 500 del servicio, la red) se registra y se deja: la suscripción puede
 * estar perfectamente viva.
 */
async function limpiarMuertas(
  suscripciones: { endpoint: string }[],
  resultados: PromiseSettledResult<unknown>[],
): Promise<void> {
  const muertas: string[] = [];

  resultados.forEach((resultado, i) => {
    if (resultado.status !== "rejected") return;

    const estado = (resultado.reason as { statusCode?: number })?.statusCode;
    if (estado === 404 || estado === 410) {
      muertas.push(suscripciones[i].endpoint);
    } else {
      console.error("Fallo al empujar el aviso de pedido:", resultado.reason);
    }
  });

  await Promise.all(muertas.map((endpoint) => borrarSuscripcion(endpoint).catch(() => {})));
}
