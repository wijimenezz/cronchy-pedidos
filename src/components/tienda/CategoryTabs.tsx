"use client";

import { useEffect, useRef, useState } from "react";

type Categoria = { id: string; nombre: string; slug: string };

export function CategoryTabs({ categorias }: { categorias: Categoria[] }) {
  const [activa, setActiva] = useState(categorias[0]?.slug);
  const entradas = useRef(new Map<string, IntersectionObserverEntry>());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (observados) => {
        for (const entrada of observados) {
          entradas.current.set(entrada.target.id, entrada);
        }

        const visibles = [...entradas.current.values()].filter((e) => e.isIntersecting);
        if (visibles.length > 0) {
          const masArriba = visibles.sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0];
          setActiva(masArriba.target.id);
        }
      },
      { rootMargin: "-120px 0px -70% 0px" },
    );

    for (const categoria of categorias) {
      const seccion = document.getElementById(categoria.slug);
      if (seccion) observer.observe(seccion);
    }

    return () => observer.disconnect();
  }, [categorias]);

  return (
    <nav className="sticky top-0 z-10 flex gap-4 overflow-x-auto border-b border-crema-oscura bg-crema px-4 py-3">
      {categorias.map((categoria) => (
        <a
          key={categoria.id}
          href={`#${categoria.slug}`}
          className={`shrink-0 whitespace-nowrap border-b-2 pb-1 text-sm font-medium transition-colors ${
            activa === categoria.slug
              ? "border-naranja text-naranja"
              : "border-transparent text-cafe-suave"
          }`}
        >
          {categoria.nombre}
        </a>
      ))}
    </nav>
  );
}
