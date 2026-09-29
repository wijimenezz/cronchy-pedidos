import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { TemaTienda } from "@/config/temaTienda";
import estilosHalloween from "./halloween/halloween.module.css";

/**
 * Un tema es una CAPA encima del mismo <Header>, nunca otro header.
 * - `Decoracion`: se pinta como primer hijo del <header>, debajo del contenido (que va en
 *   `relative z-10`). Va con `next/dynamic`, pero OJO: desde un server component eso no evita
 *   que sus client components entren en el bundle de la carta. Lo pesado de un tema (un motor
 *   de canvas) se carga con `import()` dentro de un efecto — ver halloween/CapaHalloween.tsx.
 * - `claseLogo`: clase extra para el contenedor del logo.
 * - `claseFondo`: sustituye el color y la textura del <header>. Tiene que ser un CSS module (sin
 *   capa), que es lo que le gana a las utilidades de Tailwind sin `!important`.
 * - `personaje`: el dibujo junto a Abierto/Cerrado. `ancho` y `alto` son la RELACIÓN EXACTA del
 *   PNG —sus píxeles reales divididos por su MCD—, no el tamaño en pantalla: ver EstadoTienda.
 */
export type Tema = {
  Decoracion?: ComponentType;
  claseLogo?: string;
  claseFondo?: string;
  personaje?: PersonajeTema;
};

export type PersonajeTema = { src: string; ancho: number; alto: number };

/** Exhaustivo a propósito: añadir un valor a `TemaTienda` obliga a registrarlo aquí. */
export const TEMAS: Record<TemaTienda, Tema> = {
  default: {},
  halloween: {
    Decoracion: dynamic(() =>
      import("./halloween/DecoracionHalloween").then((m) => m.DecoracionHalloween),
    ),
    claseLogo: estilosHalloween.logoEmbrujado,
    claseFondo: estilosHalloween.fondo,
    // El helado vampiro, RECORTADO a su contorno: el original (public/personajes/helado-vampiro.png)
    // mide 1674×940 con 381 px de aire transparente a cada lado, y con `h-10` eso lo encogía y
    // ensanchaba la caja. Mismo problema que tuvo el logo. 893 y 935 no tienen divisor común, así
    // que la relación exacta son los píxeles tal cual.
    personaje: { src: "/temas/halloween/personaje.png", ancho: 893, alto: 935 },
  },
};
