/**
 * La URL pública de la app.
 *
 * Tiene **un solo consumidor**: el link de seguimiento que viaja en el WhatsApp al cliente
 * (`tiendaParaMensaje`). Eso decide todo lo demás — el destinatario es el teléfono de alguien que
 * está en la calle esperando sus churros, así que **`localhost` nunca es un valor correcto aquí,
 * ni siquiera en desarrollo**. Un link que solo abre en la máquina de quien programa es un link
 * muerto para la única persona que lo va a tocar.
 *
 * Orden: la variable explícita manda; si no, las que Vercel inyecta sola; y de último el entorno
 * de desarrollo, que es un último recurso y no una opción válida.
 */
export function resolverBaseUrl(): string {
  const explicita = process.env.NEXT_PUBLIC_BASE_URL;
  const enVercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    // Preview deploys: cada uno tiene su propio host.
    process.env.VERCEL_URL;

  // Un `localhost` explícito estando desplegado se ignora, y esta guarda existe porque el caso
  // pasó: la variable quedó copiada del ejemplo en las variables de Vercel y todos los clientes
  // recibieron `http://localhost:3000/pedido/…`. Ninguna configuración justifica mandarle eso a
  // un cliente, así que el despliegue gana sobre lo que diga la variable.
  if (explicita && !(esLocal(explicita) && enVercel)) return sinBarraFinal(explicita);

  if (enVercel) return `https://${sinBarraFinal(enVercel)}`;

  return "http://localhost:3000";
}

function esLocal(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url.trim());
}

function sinBarraFinal(valor: string): string {
  return valor.replace(/\/+$/, "");
}
