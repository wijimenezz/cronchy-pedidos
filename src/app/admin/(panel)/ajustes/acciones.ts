"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guardarCorrecciones } from "@/db/queries/barrios";
import {
  eliminarExcepcion,
  guardarExcepcion,
  guardarHorarioSemanal,
} from "@/db/queries/horario";
import {
  actualizarAceptaPedidos,
  actualizarDatosLocal,
  actualizarLlaveNequi,
  actualizarMensajeCerrado,
  guardarQrPago,
} from "@/db/queries/store";
import { guardarUbicacionTienda } from "@/db/queries/zonas";
import { exigirRol } from "@/lib/autorizacion";
import { DIAS_SEMANA_LARGOS } from "@/lib/fechas";
import { esUrlDeFotoProducto } from "@/lib/imagenes";
import { esTelefonoValido } from "@/lib/notificaciones/transporte";
import { diaDeBogota } from "@/lib/pedidos/dias";
import { borrarFotoProducto } from "@/lib/storage";
import { buscarUbicacion } from "@/lib/tienda/geocodificar";
import { esPuntoValido } from "@/lib/zonas";

/**
 * Los datos con los que el cliente paga. Todo esto es de admin (regla 12): cambiar la llave
 * es cambiar a qué cuenta llega la plata de cada pedido.
 *
 * `revalidatePath("/checkout")` en las dos acciones aunque el checkout sea `force-dynamic`:
 * es la misma pareja que ya hace `guardarTiempoEstimado`, cuesta nada y cubre el día que esa
 * página deje de serlo.
 */

export type ResultadoAjuste = { ok: true } | { ok: false; error: string };

/**
 * La dirección y el teléfono del local. Existe para que un traslado no dependa de un despliegue.
 *
 * Los dos se pueden vaciar a propósito, y por eso son `nullable` en vez de obligatorios: una tienda
 * a la que todavía no le han puesto dirección es un estado real. Lo que no se puede es guardar un
 * teléfono con una forma que después rompa el `wa.me` que se arma con él, así que se valida con
 * **`esTelefonoValido`**, exactamente el mismo que usa `crearPedidoSchema` para el del cliente.
 */
const localSchema = z.object({
  direccion: z
    .string()
    .trim()
    .max(160, "Máximo 160 caracteres")
    .nullable()
    .transform((v) => v || null),
  telefono: z
    .string()
    .trim()
    .nullable()
    .transform((v) => v || null)
    .refine((v) => v === null || esTelefonoValido(v), "Teléfono inválido"),
});

export async function guardarDatosLocal(entrada: unknown): Promise<ResultadoAjuste> {
  const sesion = await exigirRol("admin");

  const parsed = localSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const guardado = await actualizarDatosLocal(
    sesion.storeId,
    parsed.data.direccion,
    parsed.data.telefono,
  );
  if (!guardado) return { ok: false, error: "No pudimos guardar los datos del local." };

  // La carta es ISR y su pie —y el menú lateral— muestran la dirección: sin esto, un traslado
  // tardaría hasta un minuto en aparecer, o más en una pestaña ya abierta.
  revalidatePath("/");
  revalidatePath("/checkout");
  revalidatePath("/admin/ajustes");

  return { ok: true };
}

const llaveSchema = z.object({
  // Una llave Bre-B puede ser un número, un correo o una @arroba, así que no se valida el
  // formato: solo que quepa y no esté vacía. Inventar un patrón aquí sería rechazar llaves
  // legítimas el día que Bre-B añada un tipo nuevo.
  llave: z
    .string()
    .trim()
    .min(1, "Escribe la llave")
    .max(60, "Esa llave es demasiado larga")
    .nullable(),
  titular: z
    .string()
    .trim()
    .max(60, "Máximo 60 caracteres")
    .nullable()
    .transform((v) => v || null),
});

export async function guardarLlaveNequi(entrada: unknown): Promise<ResultadoAjuste> {
  const sesion = await exigirRol("admin");

  const parsed = llaveSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const guardado = await actualizarLlaveNequi(
    sesion.storeId,
    parsed.data.llave,
    parsed.data.titular,
  );
  if (!guardado) return { ok: false, error: "No pudimos guardar la llave." };

  revalidatePath("/checkout");
  revalidatePath("/admin/ajustes");

  return { ok: true };
}

/**
 * El pin del local. Es el mismo dato que se arrastra en el mapa de Zonas y escribe la misma columna
 * (`guardarUbicacionTienda`): dos editores para un solo hecho, a propósito — el mapa grande sirve
 * para colocarlo mirando las zonas, y este para no salir de Ajustes al mudarse.
 *
 * De este punto sale el mapa que se le abre al cliente cuando el GPS le falla (regla 14) y el
 * «Cómo llegar» de quien viene a recoger, así que se valida antes de escribirlo.
 */
export async function guardarUbicacionLocal(entrada: {
  lat: number;
  lng: number;
}): Promise<ResultadoAjuste> {
  const sesion = await exigirRol("admin");

  if (!esPuntoValido(entrada)) return { ok: false, error: "Ubicación inválida" };

  await guardarUbicacionTienda(sesion.storeId, entrada);

  // El checkout usa este punto para centrar su mapa y el seguimiento para el «Cómo llegar».
  revalidatePath("/checkout");
  revalidatePath("/admin/ajustes");
  revalidatePath("/admin/zonas");

  return { ok: true };
}

/**
 * Dónde cae la dirección escrita, según OpenStreetMap.
 *
 * **No guarda nada**: devuelve el punto para que la pantalla mueva el pin y el admin lo confirme.
 * Los datos de OSM en Fusagasugá son pobres (regla 14) y una dirección colombiana puede caer a
 * varias cuadras; guardar el resultado a ciegas sería dejar un pin equivocado que nadie revisa.
 *
 * Es una server action y no un route handler porque solo la usa el panel: no hay razón para poner
 * una llamada a un tercero en la superficie pública.
 */
export type ResultadoBusqueda =
  | { ok: true; punto: { lat: number; lng: number } }
  | { ok: false; error: string };

/**
 * Dónde se busca. Sin acotar, "Calle 17 # 7-44" hace match en media Latinoamérica y el primer
 * resultado por relevancia puede estar a mil kilómetros con la misma pinta de correcto.
 *
 * Está escrita aquí y no en la base porque `store` no tiene columna de ciudad y hoy hay una sola
 * tienda. El día del multi-tenant (regla 5) esto sale de la fila de la tienda, igual que todo lo
 * demás — y es el único sitio que habría que tocar.
 */
const CIUDAD = "Fusagasugá, Cundinamarca";

export async function buscarDireccionEnMapa(entrada: {
  direccion: string;
}): Promise<ResultadoBusqueda> {
  await exigirRol("admin");

  const parsed = z.object({ direccion: z.string().trim().min(1).max(160) }).safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "Escribe la dirección antes de buscarla." };

  const punto = await buscarUbicacion(parsed.data.direccion, CIUDAD);

  if (!punto) {
    return { ok: false, error: "No encontramos esa dirección en el mapa. Arrastra el pin a mano." };
  }

  return { ok: true, punto };
}

const qrSchema = z.object({
  url: z
    .string("Esa imagen no es válida")
    .refine(esUrlDeFotoProducto, "Esa imagen no es válida")
    .nullable(),
});

export async function guardarQrNequi(entrada: unknown): Promise<ResultadoAjuste> {
  const sesion = await exigirRol("admin");

  const parsed = qrSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const guardado = await guardarQrPago(sesion.storeId, parsed.data.url);
  if (!guardado) return { ok: false, error: "No pudimos guardar el QR." };

  // Después de escribir la columna y no antes, igual que las fotos de la carta: si el UPDATE
  // falla, el QR anterior sigue siendo el bueno y borrarlo habría dejado el checkout
  // apuntando a un objeto inexistente. Best-effort — `borrarFotoProducto` traga sus errores.
  if (guardado.previo && guardado.previo !== parsed.data.url) {
    await borrarFotoProducto(guardado.previo);
  }

  revalidatePath("/checkout");
  revalidatePath("/admin/ajustes");

  return { ok: true };
}

/**
 * Los nombres de barrio que OSM devuelve mal (ver `src/lib/barrio.ts`).
 *
 * Solo viajan las filas que el admin tocó. `nombre` vacío se guarda como NULL: es la forma de
 * decir "este nombre no sirve, que lo escriba el cliente".
 *
 * **Sin `revalidatePath("/checkout")`**, al revés que sus dos vecinas: el barrio no se
 * renderiza en esa página, se pide a `/api/zonas/cotizar` cada vez que el pin se mueve. Ese
 * endpoint es `force-dynamic` y consulta el diccionario en cada llamada, así que una
 * corrección se ve en el siguiente arrastre sin revalidar nada.
 */
const correccionesSchema = z.object({
  correcciones: z
    .array(
      z.object({
        id: z.uuid("Barrio inválido"),
        nombre: z
          .string()
          .trim()
          .max(120, "Máximo 120 caracteres")
          .transform((v) => v || null),
      }),
    )
    .max(200, "Demasiados cambios de una vez"),
});

export async function guardarCorreccionesBarrio(entrada: unknown): Promise<ResultadoAjuste> {
  const sesion = await exigirRol("admin");

  const parsed = correccionesSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const guardado = await guardarCorrecciones(sesion.storeId, parsed.data.correcciones);
  if (!guardado) return { ok: false, error: "No pudimos guardar los barrios." };

  revalidatePath("/admin/ajustes");

  return { ok: true };
}

// ------------------------------------------------------------
// Horario de atención (regla 6) y el interruptor de pánico
// ------------------------------------------------------------

/**
 * Todo lo de aquí abajo escribe lo que decide si se puede pedir, así que va con
 * `revalidatePath("/checkout")`: es la página que llama a `opcionesDeEntrega`. La carta no entra
 * porque no pinta el horario en ninguna parte.
 *
 * Los esquemas repiten los CHECK de la base a propósito, mismo motivo que `actualizarTiempoEstimado`:
 * la última palabra la tiene Postgres, pero quien está en el panel merece leer español y no un
 * `violates check constraint "store_hours_check"`.
 */

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const horaSchema = z.string().regex(HORA, "Escribe la hora como 12:00");

const horarioSchema = z.object({
  dias: z
    .array(
      z.object({
        diaSemana: z.number().int().min(0).max(6),
        abre: horaSchema,
        cierra: horaSchema,
      }),
    )
    .max(7, "Un día de la semana no se puede mandar dos veces")
    .superRefine((dias, ctx) => {
      if (new Set(dias.map((d) => d.diaSemana)).size !== dias.length) {
        ctx.addIssue({ code: "custom", message: "Un día de la semana viene repetido" });
        return;
      }

      for (const dia of dias) {
        // Comparar "HH:MM" como texto vale porque van con cero delante: "09:30" < "12:00".
        if (dia.cierra <= dia.abre) {
          ctx.addIssue({
            code: "custom",
            // El CHECK de la base es `cierra > abre`, así que un turno que cruza la medianoche
            // (20:00 a 02:00) no es representable. Se dice, en vez de un "datos inválidos" que
            // dejaría al admin probando horas al azar.
            message: `El ${DIAS_SEMANA_LARGOS[dia.diaSemana].toLowerCase()} cierra antes de abrir. Un horario que pasa de la medianoche no se puede guardar.`,
          });
        }
      }
    }),
});

export async function guardarHorario(entrada: unknown): Promise<ResultadoAjuste> {
  const sesion = await exigirRol("admin");

  const parsed = horarioSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const guardado = await guardarHorarioSemanal(sesion.storeId, parsed.data.dias);
  if (!guardado) return { ok: false, error: "No pudimos guardar el horario." };

  revalidatePath("/checkout");
  revalidatePath("/admin/ajustes");

  return { ok: true };
}

/**
 * Un día suelto: cerrado, o abierto a otras horas.
 *
 * **Con `cerrado = false` las horas son obligatorias**, y no es una manía del formulario: así lo
 * lee `rangosDelDia`, que las da por buenas con un `!`. Una fila sin horas y sin cerrar sería un
 * día que no se puede interpretar.
 */
const excepcionSchema = z
  .object({
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elige una fecha"),
    cerrado: z.boolean(),
    abre: horaSchema.nullable(),
    cierra: horaSchema.nullable(),
    motivo: z
      .string()
      .trim()
      .max(120, "Máximo 120 caracteres")
      .nullable()
      .transform((v) => v || null),
  })
  // El día de hoy sale del reloj de Bogotá y no del navegador (regla 6). Aquí sí se puede llamar
  // a la base de fechas del servidor, al revés que en `crearPedidoSchema`, que es compartido con
  // el cliente y por eso tiene que ser puro.
  .refine((v) => v.fecha >= diaDeBogota(), "Esa fecha ya pasó")
  .refine(
    (v) => v.cerrado || (v.abre !== null && v.cierra !== null),
    "Escribe a qué hora abres y a qué hora cierras ese día",
  )
  .refine(
    (v) => v.cerrado || v.abre === null || v.cierra === null || v.cierra > v.abre,
    "El cierre tiene que ser después de la apertura",
  );

export async function guardarExcepcionDelDia(entrada: unknown): Promise<ResultadoAjuste> {
  const sesion = await exigirRol("admin");

  const parsed = excepcionSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const guardado = await guardarExcepcion(sesion.storeId, parsed.data);
  if (!guardado) return { ok: false, error: "No pudimos guardar el día." };

  revalidatePath("/checkout");
  revalidatePath("/admin/ajustes");

  return { ok: true };
}

export async function eliminarExcepcionDelDia(entrada: unknown): Promise<ResultadoAjuste> {
  const sesion = await exigirRol("admin");

  const parsed = z.object({ id: z.uuid("Día inválido") }).safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const borrado = await eliminarExcepcion(sesion.storeId, parsed.data.id);
  if (!borrado) return { ok: false, error: "Ese día ya no estaba en la lista." };

  revalidatePath("/checkout");
  revalidatePath("/admin/ajustes");

  return { ok: true };
}

/**
 * El interruptor de pánico. Un toque, sin confirmación: es la doctrina de los toggles del panel y
 * aquí pesa más que en ninguno — se apaga con la freidora dañada, no con calma.
 */
export async function cambiarAceptaPedidos(entrada: {
  aceptaPedidos: boolean;
}): Promise<ResultadoAjuste> {
  const sesion = await exigirRol("admin");

  const parsed = z.object({ aceptaPedidos: z.boolean() }).safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "Dato inválido" };

  const guardado = await actualizarAceptaPedidos(sesion.storeId, parsed.data.aceptaPedidos);
  if (!guardado) return { ok: false, error: "No pudimos cambiar el estado de la tienda." };

  revalidatePath("/checkout");
  revalidatePath("/admin/ajustes");

  return { ok: true };
}

export async function guardarMensajeCerrado(entrada: unknown): Promise<ResultadoAjuste> {
  const sesion = await exigirRol("admin");

  const parsed = z
    .object({
      mensaje: z
        .string()
        .trim()
        .max(160, "Máximo 160 caracteres")
        .nullable()
        .transform((v) => v || null),
    })
    .safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const guardado = await actualizarMensajeCerrado(sesion.storeId, parsed.data.mensaje);
  if (!guardado) return { ok: false, error: "No pudimos guardar el mensaje." };

  revalidatePath("/checkout");
  revalidatePath("/admin/ajustes");

  return { ok: true };
}
