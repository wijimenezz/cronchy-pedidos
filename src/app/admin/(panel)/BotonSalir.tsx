"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { desactivarPush } from "./pedidos/push";

export function BotonSalir() {
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);

  async function salir() {
    setSaliendo(true);

    // Antes de cerrar la sesión: el teléfono de quien ya no trabaja aquí no puede seguir sonando
    // con cada pedido. Si falla se sale igual — quedarse dentro por no poder desuscribirse sería
    // peor.
    await desactivarPush();

    await fetch("/api/admin/sesion", { method: "DELETE" }).catch(() => {});
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={salir}
      disabled={saliendo}
      className="min-h-11 rounded-full px-4 font-cuerpo text-sm font-bold text-cafe-suave transition-colors hover:bg-crema-oscura focus:outline-none focus:ring-2 focus:ring-naranja disabled:opacity-50"
    >
      {saliendo ? "Saliendo…" : "Salir"}
    </button>
  );
}
