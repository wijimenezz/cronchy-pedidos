import { z } from "zod";
import { esTelefonoValido } from "@/lib/notificaciones/transporte";

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
    zonaId: z.string().uuid().optional(),
    barrioTexto: z.string().trim().max(120).optional(),
    direccion: z.string().trim().max(280).optional(),
    indicaciones: z.string().trim().max(280).optional(),
    metodoPago: z.enum(["efectivo", "nequi", "transferencia", "datafono"]),
    comprobanteUrl: z.string().url().optional(),
    pagaCon: z.number().int().positive().optional(),
    notas: z.string().trim().max(280).optional(),
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
    if (data.tipo === "domicilio" && !data.zonaId) {
      ctx.addIssue({
        code: "custom",
        path: ["zonaId"],
        message: "Selecciona una zona de domicilio.",
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
