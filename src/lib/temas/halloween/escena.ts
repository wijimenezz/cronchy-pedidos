/* Escena de Halloween del header, dibujada en un <canvas>.
 *
 * Todo el movimiento es procedural, no hay animaciones grabadas:
 * - Murciélagos con ala articulada (hombro → codo → muñeca → tres dedos) y membrana entre los
 *   huesos. El batido baja más rápido de lo que sube, como en un murciélago real, y en la
 *   subida el ala se pliega. Cada punta va un poco retrasada respecto al codo, y ese retraso
 *   es lo que le da el latigazo natural. De vez en cuando planean, y se apartan del cursor
 *   (o del dedo en móvil).
 * - Telarañas generadas al azar: radios, espiral combada hacia el centro, gotas de rocío que
 *   destellan. Se "tejen" al cargar y se mecen con un viento suave.
 * - Araña que baja haciendo rápel con rebote de muelle, cuelga como un péndulo, patalea al
 *   trepar y huye hacia arriba si te acercas.
 * - Brasas que suben desde abajo.
 *
 * El núcleo (`crearEscena`) no toca el DOM: recibe un contexto 2D y el tiempo transcurrido.
 * `iniciarEscenaHalloween` es la envoltura para el navegador.
 */

export type Punto = { x: number; y: number };

const TAU = Math.PI * 2;
const CREMA = "250, 235, 215";

const azar = (a: number, b: number) => a + Math.random() * (b - a);
const mezclar = (a: number, b: number, t: number) => a + (b - a) * t;
const acotar = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const suave = (t: number) => {
  const u = acotar(t, 0, 1);
  return u * u * (3 - 2 * u);
};

/** Ruido suave barato: tres senos con frecuencias y fases al azar. Devuelve ~[-1, 1]. */
function crearRuido(): (t: number) => number {
  const f = [azar(0.25, 0.5), azar(0.7, 1.2), azar(1.7, 2.6)];
  const p = f.map(() => azar(0, TAU));
  return (t) =>
    Math.sin(t * f[0] + p[0]) * 0.55 +
    Math.sin(t * f[1] + p[1]) * 0.3 +
    Math.sin(t * f[2] + p[2]) * 0.15;
}

/* ============================== TELARAÑAS ============================== */

type Telarana = {
  cx: number;
  cy: number;
  radios: { ang: number; largo: number }[];
  anillos: number[];
  cerrada: boolean;
  /** De esquina: el centro va pegado a la esquina y lo que se mece es el borde. */
  deEsquina: boolean;
  /** Colgante: pinta un hilo desde el centro hasta el techo. */
  conHilo: boolean;
  alfa: number;
  retraso: number;
  gotas: { i: number; k: number; fase: number; r: number }[];
  ruido: (t: number) => number;
};

function crearTelarana(o: {
  cx: number;
  cy: number;
  desde: number;
  hasta: number;
  largo: number;
  radios: number;
  anillos: number;
  alfa: number;
  retraso: number;
  cerrada?: boolean;
  conHilo?: boolean;
}): Telarana {
  const cerrada = !!o.cerrada;
  const radios = Array.from({ length: o.radios }, (_, i) => {
    const u = cerrada ? i / o.radios : i / (o.radios - 1);
    const borde = !cerrada && (i === 0 || i === o.radios - 1);
    return {
      ang: mezclar(o.desde, o.hasta, u) + (borde ? 0 : azar(-0.07, 0.07)),
      largo: o.largo * azar(0.82, 1.08),
    };
  });
  const anillos = Array.from({ length: o.anillos }, (_, k) =>
    acotar((k + 1) / (o.anillos + 0.4) + azar(-0.03, 0.03), 0.08, 0.97),
  );
  const tramos = cerrada ? o.radios : o.radios - 1;
  const gotas = Array.from({ length: Math.round(o.radios * 0.7) }, () => ({
    i: Math.floor(azar(0, tramos)),
    k: Math.floor(azar(0, o.anillos)),
    fase: azar(0, TAU),
    r: azar(0.9, 1.7),
  }));
  return {
    cx: o.cx,
    cy: o.cy,
    radios,
    anillos,
    cerrada,
    deEsquina: !cerrada,
    conHilo: !!o.conHilo,
    alfa: o.alfa,
    retraso: o.retraso,
    gotas,
    ruido: crearRuido(),
  };
}

function puntoTelarana(w: Telarana, i: number, frac: number, t: number): Punto {
  const r = w.radios[i];
  const peso = w.deEsquina ? Math.pow(frac, 1.4) : (1 - frac) * 0.9;
  const viento = w.ruido(t * 0.6);
  return {
    x: w.cx + Math.cos(r.ang) * r.largo * frac + viento * 3.2 * peso,
    y: w.cy + Math.sin(r.ang) * r.largo * frac + Math.abs(viento) * 1.6 * peso,
  };
}

function dibujarTelarana(ctx: CanvasRenderingContext2D, w: Telarana, t: number, completa: boolean) {
  const edad = completa ? 99 : t - w.retraso;
  if (edad <= 0) return;
  const pRadios = suave(edad / 1.1);
  const pEspiral = acotar((edad - 0.7) / 2.4, 0, 1);
  const n = w.radios.length;

  ctx.lineCap = "round";
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = `rgba(${CREMA}, ${w.alfa})`;

  ctx.beginPath();
  const centro = puntoTelarana(w, 0, 0, t);
  if (w.conHilo) {
    ctx.moveTo(centro.x, centro.y);
    ctx.lineTo(centro.x + w.ruido(t * 0.6) * 1.5, -2);
  }
  for (let i = 0; i < n; i++) {
    const b = puntoTelarana(w, i, pRadios, t);
    ctx.moveTo(centro.x, centro.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();

  const tramos = w.cerrada ? n : n - 1;
  const visibles = pEspiral * tramos * w.anillos.length;
  ctx.beginPath();
  let cont = 0;
  for (let k = 0; k < w.anillos.length && cont < visibles; k++) {
    const f = w.anillos[k];
    for (let i = 0; i < tramos && cont < visibles; i++, cont++) {
      const a = puntoTelarana(w, i, f, t);
      const b = puntoTelarana(w, (i + 1) % n, f, t);
      const parcial = acotar(visibles - cont, 0, 1);
      ctx.moveTo(a.x, a.y);
      if (parcial < 1) {
        ctx.lineTo(mezclar(a.x, b.x, parcial), mezclar(a.y, b.y, parcial));
      } else {
        // El hilo de la espiral se comba hacia el centro, no va recto.
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        ctx.quadraticCurveTo(mezclar(mx, centro.x, 0.14), mezclar(my, centro.y, 0.14), b.x, b.y);
      }
    }
  }
  ctx.stroke();

  if (pEspiral < 1) return;
  for (const g of w.gotas) {
    const a = puntoTelarana(w, g.i, w.anillos[g.k], t);
    const b = puntoTelarana(w, (g.i + 1) % n, w.anillos[g.k], t);
    const x = mezclar(a.x, b.x, 0.5);
    const y = mezclar(a.y, b.y, 0.5) + 0.8;
    const brillo = Math.pow((Math.sin(t * 0.9 + g.fase) + 1) / 2, 10);
    ctx.fillStyle = `rgba(${CREMA}, ${0.3 + brillo * 0.6})`;
    ctx.beginPath();
    ctx.arc(x, y, g.r, 0, TAU);
    ctx.fill();
    if (brillo > 0.25) {
      const l = g.r * 4 * brillo;
      ctx.strokeStyle = `rgba(255, 245, 225, ${brillo * 0.8})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(x - l, y);
      ctx.lineTo(x + l, y);
      ctx.moveTo(x, y - l);
      ctx.lineTo(x, y + l);
      ctx.stroke();
    }
  }
}

function crearTelaranas(W: number, H: number, escritorio: boolean): Telarana[] {
  const q = Math.PI / 2;
  const lista = [
    crearTelarana({ cx: -3, cy: -3, desde: -0.02, hasta: q + 0.02, largo: escritorio ? 110 : 80, radios: 7, anillos: escritorio ? 8 : 6, alfa: 0.3, retraso: 0.2 }),
    crearTelarana({ cx: W + 3, cy: -3, desde: q - 0.02, hasta: Math.PI + 0.02, largo: escritorio ? 80 : 54, radios: 6, anillos: 5, alfa: 0.18, retraso: 0.9 }),
  ];
  if (escritorio) {
    lista.push(
      crearTelarana({ cx: -3, cy: H + 3, desde: -q - 0.02, hasta: 0.02, largo: 62, radios: 6, anillos: 5, alfa: 0.2, retraso: 1.5 }),
      crearTelarana({ cx: W * 0.62, cy: 20, desde: 0, hasta: TAU, largo: 36, radios: 11, anillos: 7, alfa: 0.16, retraso: 1.2, cerrada: true, conHilo: true }),
    );
  } else {
    lista.push(
      crearTelarana({ cx: W + 3, cy: H + 3, desde: Math.PI - 0.02, hasta: Math.PI * 1.5 + 0.02, largo: 50, radios: 5, anillos: 4, alfa: 0.22, retraso: 1.5 }),
    );
  }
  return lista;
}

/* ============================== MURCIÉLAGOS ============================== */

type Murcielago = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dir: 1 | -1;
  /** 0 = lejos (pequeño, lento, tenue), 1 = cerca. */
  prof: number;
  escala: number;
  vel: number;
  fase: number;
  frec: number;
  frecBase: number;
  amp: number;
  planeando: boolean;
  reloj: number;
  baseY: number;
  ruido: (t: number) => number;
};

function crearMurcielago(W: number, H: number, dir: 1 | -1, retraso: number, y: number): Murcielago {
  const prof = Math.random();
  const frecBase = mezclar(8, 5.2, prof);
  const vel = mezclar(45, 100, prof);
  return {
    x: dir > 0 ? -50 - retraso : W + 50 + retraso,
    y: acotar(y, 12, H - 12),
    vx: dir * vel,
    vy: 0,
    dir,
    prof,
    escala: mezclar(0.32, 0.72, prof),
    vel,
    fase: Math.random(),
    frec: frecBase,
    frecBase,
    amp: 1,
    planeando: false,
    reloj: azar(1.5, 3.5),
    baseY: acotar(y, 12, H - 12),
    ruido: crearRuido(),
  };
}

/** Elevación del ala en radianes según la fase del batido. Baja en el 42 % del ciclo y sube
    en el 58 % restante: el golpe hacia abajo es el que empuja, y es más rápido. */
function elevacion(p: number): number {
  const q = ((p % 1) + 1) % 1;
  if (q < 0.42) return mezclar(0.95, -0.75, (1 - Math.cos((Math.PI * q) / 0.42)) / 2);
  return mezclar(-0.75, 0.95, (1 - Math.cos((Math.PI * (q - 0.42)) / 0.58)) / 2);
}

/** Cuánto se pliega el ala: nada al bajar, al máximo a mitad de la subida. */
function pliegue(p: number): number {
  const q = ((p % 1) + 1) % 1;
  return q < 0.42 ? 0 : Math.sin((Math.PI * (q - 0.42)) / 0.58) * 0.45;
}

function moverMurcielago(m: Murcielago, dt: number, t: number, H: number, puntero: Punto | null) {
  m.reloj -= dt;
  if (m.reloj <= 0) {
    m.planeando = !m.planeando;
    m.reloj = m.planeando ? azar(0.5, 1.1) : azar(1.6, 3.8);
  }
  let asustado = false;
  let ax = (m.dir * m.vel * (m.planeando ? 1.12 : 1) - m.vx) * 1.5;
  const yObj = acotar(m.baseY + m.ruido(t) * H * 0.28, 12, H - 12);
  let ay = (yObj - m.y) * 2.2 - m.vy * 1.6 + (m.planeando ? 14 : 0);

  if (puntero) {
    const dx = m.x - puntero.x;
    const dy = m.y - puntero.y;
    const d = Math.hypot(dx, dy);
    if (d < 110 && d > 0.1) {
      const f = (1 - d / 110) * 1600;
      ax += (dx / d) * f;
      ay += (dy / d) * f;
      asustado = true;
      m.planeando = false;
    }
  }

  const ampObj = m.planeando ? 0.22 : 1;
  const frecObj = asustado ? m.frecBase * 1.6 : m.planeando ? m.frecBase * 0.45 : m.frecBase;
  m.amp += (ampObj - m.amp) * Math.min(1, dt * 5);
  m.frec += (frecObj - m.frec) * Math.min(1, dt * 4);
  m.fase += m.frec * dt;

  m.vx += ax * dt;
  m.vy += ay * dt;
  m.x += m.vx * dt;
  m.y += m.vy * dt;
}

function dibujarAla(ctx: CanvasRenderingContext2D, s: 1 | -1, p: number, amp: number) {
  const L1 = 9;
  const L2 = 11;
  const L3 = 15;
  // Al planear, las alas quedan fijas en una V suave hacia arriba.
  const ang = (q: number, k = 1) => (amp * elevacion(q) + (1 - amp) * 0.18) * k;
  const f = pliegue(p) * amp;

  const S = { x: s * 2.6, y: -1.2 };
  const aE = ang(p) * 0.8;
  const E = { x: S.x + s * L1 * Math.cos(aE), y: S.y - L1 * Math.sin(aE) };
  const aW = ang(p - 0.05, 1.05);
  const lW = L2 * (1 - 0.45 * f);
  const Wr = { x: E.x + s * lW * Math.cos(aW), y: E.y - lW * Math.sin(aW) };
  const dedos = [0.72, 0.1, -0.85].map((o, j) => {
    const a = ang(p - 0.1 - 0.03 * j, 1.1) + o * (1 - 0.55 * f);
    const l = L3 * [0.8, 1, 0.82][j] * (1 - 0.6 * f);
    return { x: Wr.x + s * l * Math.cos(a), y: Wr.y - l * Math.sin(a) };
  });
  const pata = { x: s * 2.4, y: 8.5 };

  const feston = (A: Punto, B: Punto, C: Punto, k: number) =>
    ctx.quadraticCurveTo(mezclar((A.x + B.x) / 2, C.x, k), mezclar((A.y + B.y) / 2, C.y, k), B.x, B.y);

  // Membrana: más oscura junto al cuerpo, algo translúcida hacia las puntas.
  const grad = ctx.createLinearGradient(S.x, S.y, dedos[1].x, dedos[1].y);
  grad.addColorStop(0, "#160510");
  grad.addColorStop(1, "#3b1422");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(S.x, S.y);
  ctx.lineTo(E.x, E.y);
  ctx.lineTo(Wr.x, Wr.y);
  ctx.lineTo(dedos[0].x, dedos[0].y);
  feston(dedos[0], dedos[1], Wr, 0.2);
  feston(dedos[1], dedos[2], Wr, 0.2);
  feston(dedos[2], pata, E, 0.16);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(20, 5, 12, 0.95)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(S.x, S.y);
  ctx.lineTo(E.x, E.y);
  ctx.lineTo(Wr.x, Wr.y);
  for (const d of dedos) {
    ctx.moveTo(Wr.x, Wr.y);
    ctx.lineTo(d.x, d.y);
  }
  ctx.moveTo(Wr.x, Wr.y); // pulgar con garra
  ctx.lineTo(Wr.x + s * 1.3, Wr.y - 1.6);
  ctx.stroke();
}

function dibujarMurcielago(ctx: CanvasRenderingContext2D, m: Murcielago) {
  const p = m.fase % 1;
  // Al bajar las alas el cuerpo sube un poco: es la sustentación.
  const bob = -Math.sin(TAU * p) * 1.4 * m.amp;
  const inclinacion = acotar(m.vy / 260, -0.4, 0.4) * m.dir + Math.sin(TAU * p) * 0.04 * m.amp;

  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.rotate(inclinacion);
  ctx.scale(m.escala, m.escala);
  ctx.translate(0, bob);
  ctx.globalAlpha = mezclar(0.5, 1, m.prof);

  dibujarAla(ctx, -1, p, m.amp);
  dibujarAla(ctx, 1, p, m.amp);

  ctx.fillStyle = "#170610";
  ctx.beginPath();
  ctx.ellipse(0, 1.8, 3.3, 5.6, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -4.3, 2.9, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-2.6, -5.2);
  ctx.lineTo(-3.4, -9.8);
  ctx.lineTo(-0.9, -6.6);
  ctx.moveTo(2.6, -5.2);
  ctx.lineTo(3.4, -9.8);
  ctx.lineTo(0.9, -6.6);
  ctx.fill();

  ctx.strokeStyle = "#170610";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-1.2, 7);
  ctx.lineTo(-1.7, 8.8);
  ctx.moveTo(1.2, 7);
  ctx.lineTo(1.7, 8.8);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 170, 60, 0.95)";
  ctx.beginPath();
  ctx.arc(-1.05, -4.5, 0.5, 0, TAU);
  ctx.arc(1.05, -4.5, 0.5, 0, TAU);
  ctx.fill();

  ctx.restore();
}

/* ============================== ARAÑA ============================== */

type EstadoArana = "arriba" | "bajando" | "colgando" | "subiendo";

type Arana = {
  estado: EstadoArana;
  largo: number;
  vLargo: number;
  reloj: number;
  ang: number;
  vAng: number;
  prisa: boolean;
  ruido: (t: number) => number;
};

/** El hilo nace fuera del header, 20 px por encima del borde. */
const TECHO = -20;

function moverArana(a: Arana, dt: number, t: number, maxLargo: number, cerca: boolean) {
  if (cerca && (a.estado === "bajando" || a.estado === "colgando")) {
    a.estado = "subiendo";
    a.prisa = true;
  }
  if (a.estado === "arriba") {
    a.reloj -= dt;
    if (a.reloj <= 0) {
      a.estado = "bajando";
      a.vAng = azar(-0.5, 0.5);
    }
  } else if (a.estado === "bajando" || a.estado === "colgando") {
    // Rápel con muelle: baja, se pasa un poco y rebota.
    const objetivo = a.estado === "colgando" ? maxLargo + Math.sin(t * 0.8) * 1.5 : maxLargo;
    a.vLargo += ((objetivo - a.largo) * 10 - a.vLargo * 4.2) * dt;
    a.largo += a.vLargo * dt;
    if (a.estado === "bajando" && Math.abs(objetivo - a.largo) < 0.6 && Math.abs(a.vLargo) < 3) {
      a.estado = "colgando";
      a.reloj = azar(3.5, 7);
    }
    if (a.estado === "colgando") {
      a.reloj -= dt;
      if (a.reloj <= 0) a.estado = "subiendo";
    }
  } else {
    a.vLargo = 0;
    a.largo -= (a.prisa ? 95 : 32) * dt;
    if (a.largo < TECHO + 2) {
      a.estado = "arriba";
      a.reloj = azar(2.5, 6);
      a.prisa = false;
    }
  }

  // Péndulo amortiguado con un empujón de viento.
  const Lp = Math.max(a.largo - TECHO, 12);
  const acel = -(900 / Lp) * Math.sin(a.ang) - 1.4 * a.vAng + a.ruido(t) * 0.9;
  a.vAng += acel * dt;
  a.ang = acotar(a.ang + a.vAng * dt, -0.5, 0.5);
}

function posicionArana(a: Arana, ax: number): Punto {
  const Lp = Math.max(a.largo - TECHO, 0);
  return { x: ax + Math.sin(a.ang) * Lp, y: TECHO + Math.cos(a.ang) * Lp };
}

function dibujarArana(ctx: CanvasRenderingContext2D, a: Arana, ax: number, t: number) {
  if (a.largo <= TECHO + 2) return;
  const { x, y } = posicionArana(a, ax);
  const trepando = a.estado === "subiendo";

  ctx.strokeStyle = `rgba(${CREMA}, 0.55)`;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(ax, TECHO);
  ctx.lineTo(x, y);
  ctx.stroke();

  // Cuelga cabeza abajo, del abdomen, como las de verdad. El eje local +y apunta a la cabeza.
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-a.ang);

  ctx.strokeStyle = "#170610";
  ctx.lineWidth = 1.3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const bases = [-0.75, -0.2, 0.3, 0.85];
  ctx.beginPath();
  for (const s of [-1, 1]) {
    for (let j = 0; j < 4; j++) {
      const meneo = trepando
        ? Math.sin(t * 16 + j * 1.7 + (s > 0 ? Math.PI : 0)) * 0.4
        : Math.sin(t * 1.1 + j * 2 + s) * 0.06;
      const al = bases[j] + meneo;
      const raiz = { x: s * 2.4, y: 5.5 + j * 1.5 };
      const rodilla = { x: raiz.x + s * 6.5 * Math.cos(al), y: raiz.y + 6.5 * Math.sin(al) - 2.2 };
      const be = Math.min(al + 0.95, 1.45);
      const pie = { x: rodilla.x + s * 5.6 * Math.cos(be), y: rodilla.y + 7 * Math.sin(be) };
      ctx.moveTo(raiz.x, raiz.y);
      ctx.lineTo(rodilla.x, rodilla.y);
      ctx.lineTo(pie.x, pie.y);
    }
  }
  ctx.stroke();

  ctx.fillStyle = "#170610";
  ctx.beginPath();
  ctx.ellipse(0, 0, 4.6, 5.6, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 7.5, 3.2, 3.4, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.beginPath();
  ctx.ellipse(-1.4, -1.6, 1.3, 2.2, -0.3, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#ffb347";
  ctx.beginPath();
  ctx.arc(-1, 9.6, 0.65, 0, TAU);
  ctx.arc(1, 9.6, 0.65, 0, TAU);
  ctx.fill();

  ctx.restore();
}

/* ============================== BRASAS ============================== */

type Brasa = { x: number; y: number; vy: number; r: number; fase: number };

function crearBrasa(W: number, H: number, alAzar: boolean): Brasa {
  return {
    x: azar(0, W),
    y: alAzar ? azar(H * 0.4, H) : H + 4,
    vy: azar(8, 18),
    r: azar(0.8, 1.8),
    fase: azar(0, TAU),
  };
}

/* ============================== ESCENA ============================== */

export type Escena = {
  redimensionar(W: number, H: number, escritorio: boolean): void;
  actualizar(dt: number, puntero: Punto | null): void;
  dibujar(ctx: CanvasRenderingContext2D): void;
};

/** Núcleo sin DOM. `reducido` = sin movimiento: telarañas completas y araña colgada. */
export function crearEscena(reducido = false): Escena {
  let W = 0;
  let H = 0;
  let escritorio = false;
  let t = 0;
  let proximaBandada = 0.8;
  let telaranas: Telarana[] = [];
  let brasas: Brasa[] = [];
  const murcielagos: Murcielago[] = [];
  const arana: Arana = {
    estado: reducido ? "colgando" : "arriba",
    largo: TECHO,
    vLargo: 0,
    reloj: 1.2,
    ang: 0,
    vAng: 0,
    prisa: false,
    ruido: crearRuido(),
  };

  const maxLargo = () => Math.min(58, H * 0.45);
  const anclaArana = () => (escritorio ? 239 : W - 69);
  const hayArana = () => W >= 360;

  return {
    redimensionar(w, h, esc) {
      W = w;
      H = h;
      escritorio = esc;
      telaranas = crearTelaranas(W, H, escritorio);
      const nBrasas = escritorio ? 14 : 8;
      brasas = Array.from({ length: nBrasas }, () => crearBrasa(W, H, true));
      if (reducido) arana.largo = maxLargo();
    },

    actualizar(dt, puntero) {
      if (reducido || W === 0) return;
      t += dt;

      if (t >= proximaBandada && murcielagos.length < 7) {
        const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
        const r = Math.random();
        const n = r < 0.55 ? 1 : r < 0.88 ? 2 : 3;
        const baseY = azar(0.15, 0.7) * H;
        for (let i = 0; i < n; i++) {
          murcielagos.push(crearMurcielago(W, H, dir, i * azar(18, 40), baseY + azar(-18, 18)));
        }
        murcielagos.sort((a, b) => a.prof - b.prof);
        proximaBandada = t + azar(3, 7.5);
      }
      for (let i = murcielagos.length - 1; i >= 0; i--) {
        const m = murcielagos[i];
        moverMurcielago(m, dt, t, H, puntero);
        if (m.x < -90 || m.x > W + 90 || m.y < -80 || m.y > H + 80) murcielagos.splice(i, 1);
      }

      if (hayArana()) {
        const pos = posicionArana(arana, anclaArana());
        const cerca = !!puntero && Math.hypot(puntero.x - pos.x, puntero.y - pos.y) < 55;
        moverArana(arana, dt, t, maxLargo(), cerca);
      }

      for (let i = 0; i < brasas.length; i++) {
        const b = brasas[i];
        b.y -= b.vy * dt;
        b.x += Math.sin(t * 1.3 + b.fase) * 6 * dt;
        if (b.y < H * 0.3) brasas[i] = crearBrasa(W, H, false);
      }
    },

    dibujar(ctx) {
      ctx.clearRect(0, 0, W, H);

      if (!reducido) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (const b of brasas) {
          const vida = acotar((b.y - H * 0.3) / (H * 0.35), 0, 1);
          const a = vida * (0.55 + 0.45 * Math.sin(t * 7 + b.fase * 3));
          ctx.fillStyle = `rgba(255, 120, 30, ${a * 0.18})`;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r * 3.2, 0, TAU);
          ctx.fill();
          ctx.fillStyle = `rgba(255, 175, 70, ${a * 0.85})`;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }

      for (const w of telaranas) dibujarTelarana(ctx, w, t, reducido);
      if (hayArana()) dibujarArana(ctx, arana, anclaArana(), t);
      for (const m of murcielagos) dibujarMurcielago(ctx, m);
    },
  };
}

/* ============================== NAVEGADOR ============================== */

export type OpcionesEscena = {
  reducido?: boolean;
  /** Por defecto, `min-width: 1024px` (el `lg` de Tailwind). */
  esEscritorio?: () => boolean;
};

/** Monta la escena en un canvas y devuelve la función que la desmonta. Se pausa sola cuando
    el header sale de pantalla o la pestaña se oculta. */
export function iniciarEscenaHalloween(canvas: HTMLCanvasElement, opciones: OpcionesEscena = {}): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const reducido = !!opciones.reducido;
  const esEscritorio = opciones.esEscritorio ?? (() => window.matchMedia("(min-width: 1024px)").matches);
  const escena = crearEscena(reducido);

  let dpr = 1;
  let raf = 0;
  let corriendo = false;
  let enPantalla = true;
  let ultimo = 0;
  let puntero: Punto | null = null;
  let punteroVence = 0;

  const pintar = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    escena.dibujar(ctx);
  };

  const medir = () => {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    escena.redimensionar(r.width, r.height, esEscritorio());
    pintar();
  };

  const paso = (ahora: number) => {
    const dt = Math.min(0.05, (ahora - ultimo) / 1000 || 0.016);
    ultimo = ahora;
    if (puntero && ahora > punteroVence) puntero = null;
    escena.actualizar(dt, puntero);
    pintar();
    raf = requestAnimationFrame(paso);
  };

  const arrancar = () => {
    if (corriendo || reducido || document.hidden || !enPantalla) return;
    corriendo = true;
    ultimo = performance.now();
    raf = requestAnimationFrame(paso);
  };
  const parar = () => {
    corriendo = false;
    cancelAnimationFrame(raf);
  };

  // El canvas no recibe eventos (pointer-events: none), así que se escucha en la ventana.
  const alPuntero = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (x < -20 || x > r.width + 20 || y < -20 || y > r.height + 20) return;
    puntero = { x, y };
    punteroVence = performance.now() + (e.pointerType === "mouse" ? 1000 : 700);
  };
  const alVisibilidad = () => (document.hidden ? parar() : arrancar());

  const ro = new ResizeObserver(medir);
  const io = new IntersectionObserver(([e]) => {
    enPantalla = e.isIntersecting;
    if (enPantalla) arrancar();
    else parar();
  });
  ro.observe(canvas);
  io.observe(canvas);
  window.addEventListener("pointermove", alPuntero, { passive: true });
  window.addEventListener("pointerdown", alPuntero, { passive: true });
  document.addEventListener("visibilitychange", alVisibilidad);

  medir();
  arrancar();

  return () => {
    parar();
    ro.disconnect();
    io.disconnect();
    window.removeEventListener("pointermove", alPuntero);
    window.removeEventListener("pointerdown", alPuntero);
    document.removeEventListener("visibilitychange", alVisibilidad);
  };
}
