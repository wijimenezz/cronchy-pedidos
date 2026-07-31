import { z } from "zod";
import { esTelefonoValido } from "@/lib/notificaciones/transporte";
import { esUrlDeComprobante } from "@/lib/comprobantes";

/**
 * Lo que ve el cliente cuando deja vacío algo obligatorio. Vive aquí para que el
 * esquema y la UI digan exactamente lo mismo.
 *
 * Sin un mensaje propio, Zod responde en inglés y en jerga ("Too small: expected
 * string to have >=1 characters"), que a un cliente no le dice nada.
 */
export const REQUERIDO = "Campo requerido";

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
  productModifierGroupId: z.string().uuid(),
  opciones: z
    .array(
      z.object({
        modifierOptionId: z.string().uuid(),
        cantidad: z.number().int().positive().max(20),
      }),
    )
    .max(20),
});

const itemSchema = z.object({
  productId: z.string().uuid(),
  cantidad: z.number().int().positive().max(20),
  seleccion: z.array(seleccionEngancheSchema).max(20),
  notas: z.string().trim().max(280).optional(),
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
    zonaId: opcional(z.string().uuid("Barrio inválido")),
    barrioTexto: textoOpcional(120),
    direccion: textoOpcional(280),
    indicaciones: textoOpcional(280),
    metodoPago: z.enum(["efectivo", "nequi", "transferencia", "datafono"]),
    // Solo se acepta una URL que haya salido de nuestro propio endpoint de subida:
    // el cliente controla este campo y si no, podría apuntar a cualquier dominio.
    comprobanteUrl: opcional(
      z
        .string()
        .url("El comprobante no es válido.")
        .refine(esUrlDeComprobante, "El comprobante no es válido."),
    ),
    notas: textoOpcional(280),
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
    // US11: el barrio puede venir de la lista (zonaId) o escrito a mano (barrioTexto).
    // Exigir solo zonaId dejaría sin poder pedir a todo barrio que no esté cargado.
    if (data.tipo === "domicilio" && !data.zonaId && !data.barrioTexto) {
      ctx.addIssue({
        code: "custom",
        path: ["zonaId"],
        message: REQUERIDO,
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
