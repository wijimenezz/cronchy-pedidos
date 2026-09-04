"use client";

import { useEffect, useRef, useState } from "react";

type Categoria = { id: string; nombre: string; slug: string };

export function CategoryNav({
  categorias,
  variant,
}: {
  categorias: Categoria[];
  variant: "mobile" | "desktop";
}) {
  const [activa, setActiva] = useState(categorias[0]?.slug);
  const entradas = useRef(new Map<string, IntersectionObserverEntry>());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (observados) => {
        for (const entrada of observados) {
          entradas.current.set(entrada.target.id, entrada);
        }

        const visibles = [...entradas.current.values()].filter(
          (e) => e.isIntersecting,
        );
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

  if (variant === "desktop") {
    return (
      <nav className="hidden items-center gap-6 lg:flex">
        {categorias.map((categoria) => {
          const esActiva = activa === categoria.slug;
          return (
            <a
              key={categoria.id}
              href={`#${categoria.slug}`}
              className={`border-b-2 pb-1 text-base font-semibold transition-colors ${
                esActiva
                  ? "border-cafe text-cafe"
                  : "border-transparent text-cafe hover:border-cafe/40"
              }`}
            >
              {categoria.nombre}
            </a>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="sticky top-0 z-30 flex gap-2 bg-crema px-2 py-2 lg:hidden">
      {categorias.map((categoria) => {
        const esActiva = activa === categoria.slug;
        return (
          <a
            key={categoria.id}
            href={`#${categoria.slug}`}
            className={`flex flex-1 items-center justify-center rounded-md py-2.5 text-center text-sm font-semibold transition-colors ${
              esActiva ? "bg-naranja text-crema" : "bg-tarjeta text-cafe"
            }`}
          >
            {categoria.nombre}
          </a>
        );
      })}
    </nav>
  );
}
