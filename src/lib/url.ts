/**
 * URL pública de la app. Se usa para armar el link de seguimiento que viaja en los
 * mensajes de WhatsApp, así que no puede quedar en `localhost` en producción.
 *
 * Orden: la variable explícita manda; si no, las que Vercel inyecta sola; y de último
 * el entorno de desarrollo.
 */
export function resolverBaseUrl(): string {
  const explicita = process.env.NEXT_PUBLIC_BASE_URL;
  if (explicita) return sinBarraFinal(explicita);

  const produccion = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (produccion) return `https://${sinBarraFinal(produccion)}`;

  // Preview deploys: cada uno tiene su propio host.
  const preview = process.env.VERCEL_URL;
  if (preview) return `https://${sinBarraFinal(preview)}`;

  return "http://localhost:3000";
}

function sinBarraFinal(valor: string): string {
  return valor.replace(/\/+$/, "");
}
