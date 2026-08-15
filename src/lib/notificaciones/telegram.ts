import { pedidoNuevoTelegram, type PedidoParaTelegram } from "./plantillas";
import { tiendaParaMensaje } from "./avisos";
import { itemCalculadoASnapshot, type PedidoCalculado } from "@/lib/precios";
import type { CrearPedidoInput } from "@/lib/validaciones";

/**
 * El aviso interno por Telegram cuando entra un pedido.
 *
 * **No pasa por `transporte.ts` y eso es deliberado**: aquel adapta un mismo mensaje al cliente a
 * distintos canales (`wa.me` hoy, Cloud API mañana). Esto es otra cosa — un canal propio del
 * negocio, con su destino (un chat, no un teléfono), su formato (HTML) y su botón. El precedente
 * es `push.ts`, que tampoco pasa por ahí.
 *
 * Es un canal de SALIDA y nada más: no hay webhook, ni comandos, ni bot que conteste. Eso sería
 * un servicio con estado, y aquí no hace falta.
 */

const API = "https://api.telegram.org";

/** Un Telegram lento no puede quedarse colgado del checkout de un cliente que ya pagó. */
const TIMEOUT_MS = 5000;

let yaSeQuejo = false;

/**
 * El token y el chat, o `null` si no están.
 *
 * **Se queja en voz alta la primera vez que no puede**, igual que `push.ts`: quien llama envuelve
 * esto en un `try/catch` para no tumbar el checkout, así que una variable mal puesta se traduciría
 * en silencio absoluto — ni aviso, ni error, ni pista de por qué.
 */
function configurar(): { token: string; chat: string } | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chat) {
    if (!yaSeQuejo) {
      yaSeQuejo = true;
      console.warn("Telegram apagado: faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID.");
    }
    return null;
  }

  return { token, chat };
}

/**
 * Del pedido recién creado al pedido que entiende la plantilla.
 *
 * Sale de lo que el route handler ya tiene en la mano —lo que el cliente mandó y lo que el
 * servidor calculó—, así que no hay una segunda consulta para contar un pedido que se acaba de
 * escribir. Los items pasan por `itemCalculadoASnapshot`, el mismo que se guarda en la base: lo
 * que se lee en el chat es exactamente lo que va a mostrar el panel.
 */
function paraTelegram(
  input: CrearPedidoInput,
  calculo: PedidoCalculado,
  creado: { numero: number; esClienteNuevo: boolean },
  ahora: Date,
): PedidoParaTelegram {
  return {
    numero: creado.numero,
    tipo: input.tipo,
    programadoPara: input.programadoPara ? new Date(input.programadoPara) : null,
    clienteNombre: input.clienteNombre,
    clienteTelefono: input.clienteTelefono,
    esClienteNuevo: creado.esClienteNuevo,
    direccion: input.direccion ?? null,
    barrio: input.barrio ?? null,
    indicaciones: input.indicaciones ?? null,
    zonaNombre: calculo.zonaNombre,
    items: calculo.items.map(itemCalculadoASnapshot),
    costoDomicilio: calculo.costoDomicilio,
    total: calculo.total,
    metodoPago: input.metodoPago,
    // Solo tiene sentido en efectivo, igual que al guardarlo: en Nequi no hay devuelta.
    pagaCon: input.metodoPago === "efectivo" ? (input.pagaCon ?? null) : null,
    // Un comprobante cargado es la única prueba de pago que maneja este negocio.
    pagado: Boolean(input.comprobanteUrl),
    notas: input.notas ?? null,
    creadoEn: ahora,
  };
}

/**
 * Avisa al chat del equipo de que entró un pedido.
 *
 * **Nunca lanza.** Lo llama `POST /api/pedidos` con el pedido ya creado: el cliente ya compró y la
 * respuesta de su checkout no puede cambiar porque Telegram esté caído. Tampoco hay reintentos ni
 * cola — si no sale, el pedido sigue estando en el panel, que es de donde se opera.
 */
export async function avisarPedidoNuevo(
  input: CrearPedidoInput,
  calculo: PedidoCalculado,
  creado: { numero: number; esClienteNuevo: boolean },
  store: { nombre: string },
  ahora: Date = new Date(),
): Promise<void> {
  const config = configurar();
  if (!config) return;

  const { texto, urlPanel } = pedidoNuevoTelegram(
    paraTelegram(input, calculo, creado, ahora),
    tiendaParaMensaje(store),
    ahora,
  );

  try {
    const respuesta = await fetch(`${API}/bot${config.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chat,
        text: texto,
        parse_mode: "HTML",
        // Sin esto, el link del panel se lleva media pantalla en una tarjeta de vista previa que
        // además tarda en cargar y no dice nada: el panel exige sesión.
        disable_web_page_preview: true,
        reply_markup: botonPanel(urlPanel),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!respuesta.ok) {
      // El cuerpo trae el motivo real ("chat not found", "can't parse entities"), y sin él
      // depurar esto es adivinar.
      const detalle = await respuesta.text().catch(() => "");
      console.error(`Telegram rechazó el aviso (${respuesta.status}):`, detalle);
    }
  } catch (error) {
    console.error("No se pudo avisar del pedido por Telegram:", error);
  }
}

/**
 * El botón que abre el pedido en el panel.
 *
 * **Telegram rechaza el mensaje entero si la URL del botón no le gusta** —y `http://localhost` no
 * le gusta—, así que fuera de https se manda sin botón. El aviso, que es lo que importa, llega
 * igual; el link vive dentro del panel de todas formas.
 */
function botonPanel(urlPanel: string) {
  if (!urlPanel.startsWith("https://")) return undefined;

  return { inline_keyboard: [[{ text: "📋 Abrir en el panel", url: urlPanel }]] };
}
