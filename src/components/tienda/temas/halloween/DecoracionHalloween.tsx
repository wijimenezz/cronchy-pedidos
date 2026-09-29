import { CapaHalloween } from "./CapaHalloween";
import styles from "./halloween.module.css";

/**
 * Capa decorativa de Halloween para el <Header>. Va como primer hijo del header, que ya es
 * `relative`; el contenido del header va en `relative z-10` para quedar encima.
 *
 * Orden de abajo arriba: velo nocturno → canvas animado → calabaza → niebla.
 * Lo animado con física vive en el canvas (lib/temas/halloween/escena.ts); lo que es un bucle
 * simple (calabaza, niebla, resplandor del logo) sigue en CSS, que es más barato.
 */
export function DecoracionHalloween() {
  return (
    <div aria-hidden className={styles.capa}>
      <div className={styles.noche} />
      <CapaHalloween className={styles.lienzo} />

      <svg className={styles.calabaza} viewBox="0 0 32 32">
        <path d="M16 8c-1-3 1-5 3-5" stroke="#4a6b22" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <ellipse cx="10" cy="19" rx="8" ry="10" fill="#c9561a" />
        <ellipse cx="22" cy="19" rx="8" ry="10" fill="#c9561a" />
        <ellipse cx="16" cy="19" rx="7" ry="11" fill="#f07a26" />
        <g className={styles.cara} fill="#ffd23f">
          <path d="M9 16l3-4 3 4z" />
          <path d="M17 16l3-4 3 4z" />
          <path d="M8 21l2 2 2-1.5 2 1.5 2-1.5 2 1.5 2-1.5 2 1.5 2-2c-1 4-5 5.5-8 5.5S9 25 8 21z" />
        </g>
      </svg>

      <div className={styles.niebla} />
    </div>
  );
}
