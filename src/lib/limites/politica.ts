/**
 * CUÁNTAS PETICIONES SE PERMITEN, y en qué ventana.
 *
 * Puro y sin base de datos, igual que `franjas.ts` o `cupones.ts`: recibe un conteo y devuelve si
 * pasa. Quién lleva la cuenta es `db/queries/limites.ts`, y quién lo aplica a una petición es
 * `lib/limites/index.ts`.
 *
 * **Esto NO protege la factura de Vercel.** Corre dentro de la función, o sea después de que la
 * invocación ya se pagó. Lo que protege es lo que hay detrás: Postgres, Storage, el bcrypt del
 * login, Nominatim y la bandeja del panel. Cortar el volumen antes de la función es cosa del
 * Firewall de Vercel, que se configura en el dashboard y no vive en este repo.
 */

/**
 * Ventana FIJA y no deslizante, a sabiendas.
 *
 * Cuesta una fila por clave y una escritura por comprobación; una deslizante obligaría a guardar
 * cada petición. Lo que se paga es que a caballo de dos ventanas se puede colar hasta el doble del
 * cupo en un instante —hay un test que lo fija, para que se lea como límite conocido y no como
 * bug—. Para lo que se defiende aquí eso da igual: nadie tumba un bcrypt con el doble de diez.
 */
export type Cupo = {
  /** Peticiones permitidas dentro de una ventana. */
  maximo: number;
  /** Cuánto dura la ventana. */
  ventanaSegundos: number;
};

/**
 * El presupuesto de cada ruta protegida. **Única fuente de "cuánto se permite".**
 *
 * Todos van holgados a propósito: estorbar a un cliente real cuesta un pedido perdido, y dejar
 * pasar a un abusador cuesta una consulta más. Ante la duda, holgado.
 *
 * Qué NO está y por qué: el resto de `/api/admin/*` va detrás de sesión, así que abusarlo exige
 * credenciales. El login es la única puerta de esa familia sin llave, y por eso es la única que
 * aparece aquí. `/api/admin/pedidos` además se consulta en bucle por diseño (regla 19).
 */
export const LIMITES = {
  /**
   * El más estricto, y el que más falta hacía. `POST /api/admin/sesion` corre bcrypt (~50 ms de
   * CPU) contra un hash señuelo **incluso con un correo que no existe**, para no delatar cuáles
   * son válidos. Eso, que protege del sondeo, convierte cada intento en trabajo garantizado.
   */
  login: { maximo: 10, ventanaSegundos: 300 },

  /** Crear un pedido escribe, notifica y empuja push. Nadie hace diez en un minuto de verdad. */
  pedido: { maximo: 10, ventanaSegundos: 60 },

  /** Sube un archivo a Storage, que es cuota que se paga. */
  comprobante: { maximo: 10, ventanaSegundos: 60 },

  /**
   * El que motivó todo esto: cuelga de **Nominatim**, un servicio comunitario gratuito. Abusarlo
   * no nos tumba a nosotros, nos bloquea el proyecto en OSM.
   */
  cotizar: { maximo: 30, ventanaSegundos: 60 },

  /** Se llama mientras el cliente escribe el código. */
  cupon: { maximo: 20, ventanaSegundos: 60 },

  /**
   * 30 aunque el polling sean 4 por minuto: volver a la pestaña y recuperar la conexión disparan
   * consultas inmediatas separadas por solo 3 s (regla 19). Un cupo justo cortaría a un cliente
   * que solo está mirando si ya salió su pedido.
   */
  seguimiento: { maximo: 30, ventanaSegundos: 60 },

  /** El domiciliario toca el link una vez; diez es margen para el dedo nervioso. */
  entrega: { maximo: 10, ventanaSegundos: 60 },

  /**
   * El letrero de abierto/cerrado del personaje. Cae **una llamada por visita a la carta** —y otra
   * al volver a la pestaña, con tope de un minuto—, así que el cupo va alto por el CGNAT de los
   * operadores colombianos: muchos clientes salen por la misma IP y un cupo justo dejaría a
   * vecinos que no se conocen sin saber si la tienda está abierta.
   */
  estado: { maximo: 60, ventanaSegundos: 60 },
} as const satisfies Record<string, Cupo>;

export type NombreLimite = keyof typeof LIMITES;

/**
 * A qué ventana pertenece un instante.
 *
 * Se ancla al epoch y no al primer acceso: así dos instancias serverless que atienden la misma IP
 * calculan **la misma** ventana sin hablar entre ellas, que es lo que hace que la cuenta sea una
 * sola. Devuelve el inicio, que es lo que se guarda en la fila.
 */
export function ventanaDe(ahora: Date, ventanaSegundos: number): Date {
  const ms = ventanaSegundos * 1000;

  return new Date(Math.floor(ahora.getTime() / ms) * ms);
}

export type Decision = {
  permitido: boolean;
  /** Cuántas quedan después de esta. Nunca negativo: no sirve decir "-7". */
  restantes: number;
  /** Cuándo se reinicia la cuenta. Es lo que va en `Retry-After`. */
  resetEn: Date;
};

/**
 * Si esta petición pasa, dado lo que ya se contó **incluyéndola**.
 *
 * El conteo llega ya incrementado porque quien lleva la cuenta lo hace en una sola sentencia
 * atómica: pedir el valor y luego sumarlo serían dos viajes y dos peticiones simultáneas se
 * pisarían la cuenta. Así que aquí `conteo` es "esta es la número N", y pasa mientras N no supere
 * el máximo.
 */
export function decidir(conteo: number, cupo: Cupo, ventana: Date): Decision {
  return {
    permitido: conteo <= cupo.maximo,
    restantes: Math.max(0, cupo.maximo - conteo),
    resetEn: new Date(ventana.getTime() + cupo.ventanaSegundos * 1000),
  };
}

/** Los segundos que faltan para que se reinicie, redondeados hacia arriba. Mínimo 1. */
export function segundosParaReset(resetEn: Date, ahora: Date): number {
  return Math.max(1, Math.ceil((resetEn.getTime() - ahora.getTime()) / 1000));
}
