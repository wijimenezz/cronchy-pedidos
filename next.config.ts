import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * Cuánto reutiliza el navegador una página estática ya visitada al volver a ella con
     * un `<Link>` — el "seguir comprando" del checkout, sin ir más lejos.
     *
     * El default de Next son 300 s, así que se podía servir hasta CINCO MINUTOS de carta
     * vieja aunque el panel ya la hubiera revalidado. 30 es el mínimo que Next admite, y
     * de todas formas el servidor recalcula todo al confirmar el pedido (regla 1).
     */
    staleTimes: { static: 30 },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "koipbxrmkylpucbsgmqd.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
