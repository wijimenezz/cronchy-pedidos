"use client";

import { useEffect, useRef } from "react";

/**
 * Canvas con la escena animada (telarañas, murciélagos, araña, brasas). Es client component
 * porque necesita el DOM; el resto de la decoración sigue siendo de servidor.
 * Si el usuario pide "reducir movimiento", la escena se pinta una vez, quieta.
 *
 * **El motor se importa DENTRO del efecto, y no arriba, a propósito.** Turbopack mete en la
 * entrada de la ruta todo client component que aparezca en el grafo del servidor, lo rendericen
 * o no, y el registro de temas importa este archivo aunque el tema activo sea "default". Con un
 * import estático los ~26 KB del motor bajaban en cada visita a la carta; con `import()` van en
 * un chunk aparte que solo se pide cuando esta capa se monta de verdad. El `next/dynamic` del
 * registro no basta por sí solo: desde un server component no corta ese grafo.
 */
export function CapaHalloween({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let detener: () => void = () => {};
    let alCambiar: (() => void) | null = null;
    let desmontado = false;

    import("@/lib/temas/halloween/escena").then(({ iniciarEscenaHalloween }) => {
      if (desmontado) return;
      detener = iniciarEscenaHalloween(canvas, { reducido: mq.matches });
      alCambiar = () => {
        detener();
        detener = iniciarEscenaHalloween(canvas, { reducido: mq.matches });
      };
      mq.addEventListener("change", alCambiar);
    });

    return () => {
      desmontado = true;
      if (alCambiar) mq.removeEventListener("change", alCambiar);
      detener();
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={className} />;
}
