"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Campo, claseControl } from "@/components/checkout/Campo";

/**
 * El `destino` viene del middleware, que solo escribe rutas (`request.nextUrl.pathname`).
 * Se vuelve a comprobar aquí porque llega por la URL y cualquiera puede escribirla:
 * aceptar `//evil.com` o `https://…` convertiría el login en un redirector abierto.
 */
function destinoSeguro(destino: string | undefined): string {
  if (!destino || !destino.startsWith("/") || destino.startsWith("//")) {
    return "/admin/pedidos";
  }
  return destino;
}

export function FormularioLogin({ destino }: { destino?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando) return;

    setEnviando(true);
    setError(null);

    try {
      const respuesta = await fetch("/api/admin/sesion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, clave }),
      });

      if (!respuesta.ok) {
        const cuerpo = await respuesta.json().catch(() => null);
        setError(cuerpo?.error ?? "No se pudo entrar. Intenta de nuevo.");
        setClave("");
        return;
      }

      // `replace` y no `push`: el login no debe quedar en el historial, o el botón de
      // volver del teléfono devuelve a una pantalla que ya no aplica.
      router.replace(destinoSeguro(destino));
      // La sesión nueva no cambia la URL, así que hay que forzar el refetch del server
      // component de destino; sin esto se vería el árbol cacheado de antes de entrar.
      router.refresh();
    } catch {
      setError("No hay conexión. Revisa tu internet.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
      <Campo etiqueta="Correo" requerido>
        {(props) => (
          <input
            {...props}
            type="email"
            name="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={claseControl()}
          />
        )}
      </Campo>

      <Campo etiqueta="Clave" requerido>
        {(props) => (
          <input
            {...props}
            type="password"
            name="clave"
            autoComplete="current-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            className={claseControl()}
          />
        )}
      </Campo>

      {error && (
        <p role="alert" className="font-cuerpo text-[13px] font-semibold text-error">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando || !email || !clave}
        className="min-h-11 rounded-full bg-naranja px-6 font-cuerpo text-[15px] font-bold text-crema transition-colors hover:bg-naranja-osc focus:outline-none focus:ring-2 focus:ring-naranja focus:ring-offset-2 disabled:opacity-50"
      >
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
