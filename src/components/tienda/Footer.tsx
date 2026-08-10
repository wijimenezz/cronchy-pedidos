import { MessageCircle, Star } from "lucide-react";
import { linkContactoWhatsapp } from "@/lib/notificaciones/transporte";

type Tienda = {
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  whatsappUrl: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  googleResenasUrl: string | null;
};

/**
 * Los glifos de marca van en SVG a mano porque lucide-react ya no trae iconos de
 * marca, y traer una librería entera para dos dibujos no se justifica.
 */
function IconoInstagram() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-hidden>
      <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16Zm0 5.68a4.16 4.16 0 1 0 0 8.32 4.16 4.16 0 0 0 0-8.32Zm0 6.86a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4Zm5.3-7.02a.97.97 0 1 1-1.94 0 .97.97 0 0 1 1.94 0Z" />
    </svg>
  );
}

function IconoTiktok() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-hidden>
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.59 2.59 0 1 1 .73-5.07v-3.2a5.75 5.75 0 0 0-.73-.05A5.73 5.73 0 1 0 15.54 15.4V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.29 4.29 0 0 1-3.24-1.48Z" />
    </svg>
  );
}

export function Footer({ tienda }: { tienda: Tienda }) {
  const linkWhatsapp = linkContactoWhatsapp(
    tienda,
    `Hola, quiero hacer un pedido en ${tienda.nombre}`,
  );

  const hayRedes = tienda.instagramUrl || tienda.tiktokUrl;

  return (
    <footer className="flex flex-col items-center gap-3 rounded-t-lg bg-cafe px-5 py-7 text-center text-crema shadow-tarjeta">
      <div className="font-titulo text-lg font-semibold">{tienda.nombre}</div>
      {tienda.direccion && <p className="text-sm text-crema/80">{tienda.direccion}</p>}

      {linkWhatsapp && (
        <a
          href={linkWhatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center gap-2 font-cuerpo text-sm font-bold text-crema"
        >
          <MessageCircle className="size-4" />
          Contáctanos
        </a>
      )}

      {hayRedes && (
        <div className="mt-1 flex flex-col items-center gap-2">
          <span className="font-titulo text-base font-semibold">Síguenos</span>
          <div className="flex gap-3">
            {tienda.instagramUrl && (
              <a
                href={tienda.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Síguenos en Instagram"
                className="flex size-11 items-center justify-center rounded-full bg-naranja text-crema"
              >
                <IconoInstagram />
              </a>
            )}
            {tienda.tiktokUrl && (
              <a
                href={tienda.tiktokUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Síguenos en TikTok"
                className="flex size-11 items-center justify-center rounded-full bg-naranja text-crema"
              >
                <IconoTiktok />
              </a>
            )}
          </div>
        </div>
      )}

      {tienda.googleResenasUrl && (
        <a
          href={tienda.googleResenasUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 flex min-h-11 items-center gap-2 rounded-full bg-naranja px-6 py-3 font-cuerpo text-sm font-bold text-crema"
        >
          <Star className="size-4" />
          Danos tu opinión
        </a>
      )}

      <div className="mt-1 text-xs text-crema/60">
        © {new Date().getFullYear()} {tienda.nombre}
      </div>
    </footer>
  );
}
