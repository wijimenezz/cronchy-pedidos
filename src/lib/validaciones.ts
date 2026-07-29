import { z } from "zod";
import { esTelefonoValido } from "@/lib/notificaciones/transporte";
import { esUrlDeComprobante } from "@/lib/comprobantes";

/**
 * Un `<input>` vacío llega como "" al hacer submit, no como undefined. Sin esto,
 * `comprobanteUrl: ""` fallaría con "Invalid url" en vez del mensaje real ("Adjunta
 * el comprobante"), y `barrioTexto: "  "` contaría como barrio escrito.
 */
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || undefined)
    .optional();

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

export const crearPedidoSchema = z
  .object({
    tipo: z.enum(["domicilio", "recoger"]),
    clienteNombre: z.string().trim().min(1).max(120),
    clienteTelefono: z.string().trim().refine(esTelefonoValido, "Teléfono inválido"),
    zonaId: z
      .string()
      .uuid()
      .optional()
      .or(z.literal("").transform(() => undefined)),
    barrioTexto: textoOpcional(120),
    direccion: textoOpcional(280),
    indicaciones: textoOpcional(280),
    metodoPago: z.enum(["efectivo", "nequi", "transferencia", "datafono"]),
    // Solo se acepta una URL que haya salido de nuestro propio endpoint de subida:
    // el cliente controla este campo y si no, podría apuntar a cualquier dominio.
    comprobanteUrl: z
      .string()
      .url()
      .refine(esUrlDeComprobante, "El comprobante no es válido.")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    notas: textoOpcional(280),
    items: z.array(itemSchema).min(1).max(30),
  })
  .superRefine((data, ctx) => {
    if (data.tipo === "domicilio" && !data.direccion) {
      ctx.addIssue({
        code: "custom",
        path: ["direccion"],
        message: "La dirección es obligatoria para domicilio.",
      });
    }
    // US11: el barrio puede venir de la lista (zonaId) o escrito a mano (barrioTexto).
    // Exigir solo zonaId dejaría sin poder pedir a todo barrio que no esté cargado.
    if (data.tipo === "domicilio" && !data.zonaId && !data.barrioTexto) {
      ctx.addIssue({
        code: "custom",
        path: ["zonaId"],
        message: "Selecciona tu barrio o escríbelo.",
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
