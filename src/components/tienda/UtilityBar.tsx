import { MessageCircle, Star } from "lucide-react";
import { normalizarTelefono } from "@/lib/notificaciones/transporte";

export function UtilityBar({
  tienda,
  hayRecomendados,
}: {
  tienda: { telefono: string | null };
  hayRecomendados: boolean;
}) {
  const linkWhatsapp = tienda.telefono
    ? `https://wa.me/${normalizarTelefono(tienda.telefono)}?text=${encodeURIComponent(
        "Hola, quiero hacer un pedido en Cronchy",
      )}`
    : null;

  if (!linkWhatsapp && !hayRecomendados) return null;

  return (
    <div className="flex items-center justify-between bg-naranja px-4 py-2 text-sm font-medium text-crema">
      {linkWhatsapp ? (
        <a
          href={linkWhatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 hover:underline"
        >
          <MessageCircle className="size-4" />
          Contáctanos
        </a>
      ) : (
        <span />
      )}

      {hayRecomendados ? (
        <a href="#recomendados" className="flex items-center gap-1.5 hover:underline">
          <Star className="size-4" />
          Recomendados
        </a>
      ) : (
        <span />
      )}
    </div>
  );
}
