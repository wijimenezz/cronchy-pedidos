import { z } from "zod";
import { esTelefonoValido } from "@/lib/notificaciones/transporte";
import { esUrlDeComprobante } from "@/lib/comprobantes";
import { normalizarCodigo } from "@/lib/cupones";

/**
 * Lo que ve el cliente cuando deja vacío algo obligatorio. Vive aquí para que el
 * esquema y la UI digan exactamente lo mismo.
 *
 * Sin un mensaje propio, Zod responde en inglés y en jerga ("Too small: expected
 * string to have >=1 characters"), que a un cliente no le dice nada.
 */
export const REQUERIDO = "Campo requerido";

/**
 * Un id del dominio: cualquier UUID que Postgres acepte, que es lo que de verdad hay.
 *
 * `z.uuid()` NO sirve aquí. Exige RFC 4122 —el 13º dígito tiene que ser la versión (1-8) y
 * el 17º la variante (8/9/a/b)— y las migraciones de seed escribieron ids legibles a mano:
 * `22222222-0000-…` las categorías, `33333333-0000-…` los grupos de modificadores. Llevan
 * ceros justo en esas dos posiciones, así que Zod los rechazaba con un "Invalid UUID" que
 * el panel mostraba tal cual, en inglés, al intentar guardar un producto.
 *
 * Esos ids son perfectamente válidos para una columna `uuid`: Postgres guarda 128 bits en
 * formato 8-4-4-4-12 y no mira versión ni variante. El que se estaba inventando una regla
 * era el validador, no la base. `z.guid()` comprueba la forma y nada más, que es
 * exactamente el contrato que tenemos.
 *
 * Úsalo para TODO id que venga de fuera. Si vuelve a aparecer un `.uuid()` suelto, el día
 * que un seed escriba otro id "bonito" se rompe la pantalla que lo valide — y si es el
 * checkout, se rompe el cobro.
 */
export const idSchema = z.guid("Identificador inválido");

/**
 * Campo que puede no venir. Un `<input>` vacío llega como "" (no como undefined), así
 * que se normaliza ANTES de validar: `barrioTexto: "  "` no cuenta como barrio escrito
 * y un comprobante vacío no falla por "URL inválida".
 *
 * Se hace con `preprocess` y no con `.optional().or(z.literal(""))` a propósito: en esa
 * unión, un valor que falla las dos ramas (un correo mal escrito no es un email válido
 * *ni* es "") produce un error de unión con mensaje genérico, y el cliente termina
 * viendo justo el texto técnico que se quiere evitar.
 */
const opcional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    schema.optional(),
  );

const textoOpcional = (max: number) =>
  opcional(z.string().trim().max(max, `Máximo ${max} caracteres`));

/**
 * El formato `YYYY-MM-DD` no garantiza que la fecha exista: ante un 31 de febrero,
 * `new Date` desborda al 3 de marzo sin avisar. Se reconstruye y se compara para
 * detectarlo, y de paso se descarta un cumpleaños en el futuro.
 *
 * Se arma con `new Date(a, m, d)` (hora local) y no con `new Date("YYYY-MM-DD")`,
 * que se interpretaría como UTC y en Colombia caería un día antes.
 */
function esFechaRealYPasada(valor: string): boolean {
  const [a, m, d] = valor.split("-").map(Number);
  if (a < 1900) return false;

  const fecha = new Date(a, m - 1, d);
  return (
    fecha.getFullYear() === a &&
    fecha.getMonth() === m - 1 &&
    fecha.getDate() === d &&
    fecha.getTime() <= Date.now()
  );
}

const seleccionEngancheSchema = z.object({
  productModifierGroupId: idSchema,
  opciones: z
    .array(
      z.object({
        modifierOptionId: idSchema,
        cantidad: z.number().int().positive().max(20),
      }),
    )
    .max(20),
});

const itemSchema = z.object({
  productId: idSchema,
  cantidad: z.number().int().positive().max(20),
  seleccion: z.array(seleccionEngancheSchema).max(20),
  /**
   * `.nullish()` y no `.optional()`: **el `null` es el caso normal, no el raro**.
   * `carritoAItems` normaliza a `null` la línea sin observaciones, y `null` es lo que dice el
   * tipo del dominio en las tres representaciones que atraviesa —`ItemCarrito`,
   * `ItemSolicitado` e `ItemCalculado`— y lo que ya acepta `itemSnapshotSchema` aquí abajo.
   *
   * Con `.optional()` esto rechazaba toda línea sin nota, o sea casi todas, y como el route
   * handler valida con este mismo esquema no había forma de crear un pedido por ningún
   * camino. Si vuelve a "limpiarse" a `.optional()`, el checkout deja de funcionar entero.
   */
  notas: z.string().trim().max(280, "Máximo 280 caracteres").nullish(),
});

/**
 * Login del panel. Deliberadamente laxo en la clave: aquí no se está creando una cuenta,
 * se está comprobando una que ya existe, y exigir "mínimo 8 caracteres" al entrar solo
 * le diría a quien prueba claves cuáles ni vale la pena intentar.
 */
export const loginSchema = z.object({
  email: z.string({ error: REQUERIDO }).trim().min(1, REQUERIDO).max(160),
  clave: z.string({ error: REQUERIDO }).min(1, REQUERIDO).max(200),
});

export const crearPedidoSchema = z
  .object({
    tipo: z.enum(["domicilio", "recoger"]),
    // El `error` del constructor cubre el campo ausente (undefined), que no llega a los
    // checks; el `min(1)` cubre el string vacío. Sin el primero, un campo que no viaja
    // responde "Invalid input: expected string, received undefined".
    clienteNombre: z
      .string({ error: REQUERIDO })
      .trim()
      .min(1, REQUERIDO)
      .max(120, "Máximo 120 caracteres"),
    // El `min(1)` va antes del refine para que un campo en blanco diga "Campo requerido"
    // y no "Teléfono inválido", que suena a que lo escribió mal.
    clienteTelefono: z
      .string({ error: REQUERIDO })
      .trim()
      .min(1, REQUERIDO)
      .refine(esTelefonoValido, "Teléfono inválido"),
    clienteEmail: opcional(
      z.string().trim().email("Correo inválido").max(160, "Máximo 160 caracteres"),
    ),
    clienteCumple: opcional(
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
        .refine(esFechaRealYPasada, "Fecha inválida"),
    ),
    recibeNombre: textoOpcional(120),
    recibeTelefono: opcional(z.string().trim().refine(esTelefonoValido, "Teléfono inválido")),
    /**
     * El pin que el cliente confirmó (regla 14). El servidor vuelve a resolver la zona con
     * estas coordenadas: no llega ni el id de la zona ni el precio, porque el cliente no
     * decide cuánto cuesta su domicilio (regla 1).
     */
    punto: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .optional(),
    direccion: textoOpcional(280),
    /**
     * El barrio que dejó escrito el cliente. Lo sugiere el pin (OSM) pero se guarda lo que él
     * confirme: el destinatario de este texto es el domiciliario, y lo que le sirve es el
     * nombre que la gente usa, no el que tenga mapeado OpenStreetMap.
     *
     * No se confunde con `zona_nombre`, que es la zona que cobró el domicilio (regla 13) y no
     * viaja nunca en el request: el cliente no decide cuánto cuesta su domicilio (regla 1).
     */
    barrio: textoOpcional(120),
    indicaciones: textoOpcional(280),
    /**
     * La hora que el cliente eligió, en ISO 8601. Ausente = "lo más pronto posible".
     *
     * Aquí solo se comprueba la **forma**. Que esa hora sea una de las que la tienda ofrece lo
     * decide el route handler comparándola contra las franjas que él mismo acaba de generar
     * (`esFranjaOfrecida`), que es la regla 1 aplicada al tiempo: el navegador manda cuál
     * eligió, nunca si vale. Un rango escrito en Zod sería una segunda fuente de verdad que
     * envejecería sola en cuanto cambiara el horario.
     */
    programadoPara: opcional(z.string().datetime({ offset: true, message: "Hora inválida" })),
    metodoPago: z.enum(["efectivo", "nequi", "transferencia", "datafono"]),
    /**
     * Con cuánto piensa pagar, para que el domiciliario lleve la devuelta. Opcional: ausente
     * significa "no lo dijo".
     *
     * **No se compara contra el total** y no es un descuido: el total lo calcula el servidor
     * desde la base (regla 1) y este esquema no lo conoce ni debe. Si el cliente escribe menos
     * de lo que cuesta, el panel muestra el número tal cual y no inventa una devuelta negativa.
     */
    pagaCon: opcional(
      z
        .number()
        .int("Escribe un valor sin centavos")
        .positive("Tiene que ser mayor que cero")
        .max(1_000_000, "Ese billete no existe"),
    ),
    // Solo se acepta una URL que haya salido de nuestro propio endpoint de subida:
    // el cliente controla este campo y si no, podría apuntar a cualquier dominio.
    comprobanteUrl: opcional(
      z
        .string()
        .url("El comprobante no es válido.")
        .refine(esUrlDeComprobante, "El comprobante no es válido."),
    ),
    /**
     * El código que escribió el cliente. Ausente = sin cupón.
     *
     * Aquí se comprueba la **forma** y se normaliza, nada más. Que exista, que no esté vencido y
     * que cubra algo de este carrito lo decide el route handler contra la base
     * (`buscarCuponPorCodigo` + `aplicarCupon`): es la regla 1 aplicada al descuento — el navegador
     * manda *cuál* código, nunca *cuánto* vale. Escribir esas reglas en Zod sería una segunda
     * fuente de verdad que envejece sola en cuanto alguien apague el cupón desde el panel.
     */
    cupon: opcional(z.string().trim().max(24, "Ese cupón no existe").transform(normalizarCodigo)),
    notas: textoOpcional(280),
    /**
     * El visto bueno del tratamiento de datos. Obligatorio y solo `true`: un pedido sin
     * consentimiento no se crea.
     *
     * Aquí viaja el **sí**, nunca el cuándo — la fecha la sella el servidor al insertar
     * (`crearPedidoEnDB`), porque el reloj del navegador se cambia en dos toques y un sello de
     * tiempo elegido por el propio interesado no es evidencia de nada. Es la regla 1 aplicada al
     * consentimiento, igual que la 16 lo es al tiempo y la 20 al descuento.
     *
     * Sin este campo requerido, el checkbox vuelve a ser lo que era: un `disabled` en un botón,
     * que cualquier POST a mano se salta.
     */
    politicaAceptada: z.literal(true, {
      error: "Debes aceptar el tratamiento de datos",
    }),
    /**
     * Qué versión del documento aceptó. Opcional en el esquema y no requerido como el sí: el
     * pedido no puede caerse porque una pestaña vieja mande el payload sin este campo, y una
     * versión ausente se distingue perfectamente de una equivocada.
     */
    politicaVersion: textoOpcional(32),
    /**
     * Si quiere los avisos por WhatsApp del estado de su pedido.
     *
     * `default(true)` y no requerido, al revés que `politicaAceptada`: el sí es lo que el negocio
     * hace por omisión —es finalidad necesaria del servicio, no publicidad—, así que un payload
     * sin el campo significa "como siempre" y no un consentimiento inventado. Un pedido no se
     * rechaza por esto.
     *
     * Que un `false` se respete de verdad no depende de aquí: lo hacen `avisoCambioEstado` y el
     * cálculo de `avisoPendiente` del panel.
     */
    aceptaAvisos: z.boolean().default(true),
    items: z.array(itemSchema).min(1, "Tu carrito está vacío").max(30),
  })
  .superRefine((data, ctx) => {
    if (data.tipo === "domicilio" && !data.direccion) {
      ctx.addIssue({
        code: "custom",
        path: ["direccion"],
        message: REQUERIDO,
      });
    }
    // Mismo trato que la dirección, y por la misma razón: los dos son lo que lee el
    // domiciliario. Un pedido sin barrio es el que termina en una llamada preguntando dónde
    // queda. En "recoger" no aplica, y por eso la regla vive aquí y no en un NOT NULL.
    if (data.tipo === "domicilio" && !data.barrio) {
      ctx.addIssue({
        code: "custom",
        path: ["barrio"],
        message: REQUERIDO,
      });
    }
    // Sin pin no hay domicilio: es lo que fija el precio (regla 14).
    if (data.tipo === "domicilio" && !data.punto) {
      ctx.addIssue({
        code: "custom",
        path: ["punto"],
        message: "Confirma tu ubicación en el mapa.",
      });
    }
    // Un nombre sin teléfono (o al revés) deja al domiciliario sin a quién llamar.
    if (Boolean(data.recibeNombre) !== Boolean(data.recibeTelefono)) {
      ctx.addIssue({
        code: "custom",
        path: [data.recibeNombre ? "recibeTelefono" : "recibeNombre"],
        message: "Indica el nombre y el teléfono de quien recibe.",
      });
    }
    if (data.metodoPago === "nequi" && !data.comprobanteUrl) {
      ctx.addIssue({
        code: "custom",
        path: ["comprobanteUrl"],
        message: "Adjunta el comprobante de Nequi.",
      });
    }
  });

export type CrearPedidoInput = z.infer<typeof crearPedidoSchema>;

/**
 * `order_item.snapshot` es una columna jsonb, así que Drizzle la entrega como `unknown`.
 * Este esquema es la única puerta de entrada a ese contenido: congelado en el momento de
 * la compra (regla 2), es lo que se muestra en el seguimiento y en los mensajes, sin
 * volver a consultar precios actuales.
 */
export const itemSnapshotSchema = z.object({
  nombre: z.string(),
  // `.nullish()` por lo mismo que `notas`: los pedidos anteriores a esta columna no traen la
  // clave, y un snapshot que deja de parsear es un pedido que desaparece de su seguimiento.
  imagen: z.string().nullish(),
  cantidad: z.number().int().positive(),
  subtotal: z.number().int(),
  modificadores: z
    .array(
      z.object({
        grupo: z.string(),
        nombre: z.string(),
        cantidad: z.number().int(),
        precio: z.number().int(),
      }),
    )
    .default([]),
  notas: z.string().nullish(),
});
