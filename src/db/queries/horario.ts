import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { storeClosure, storeHours } from "@/db/schema";
import type { ContextoHorario } from "@/lib/horario";

export async function obtenerContextoHorarioHoy(
  storeId: string,
  fecha: string,
  diaSemana: number,
): Promise<Pick<ContextoHorario, "cierreHoy" | "horariosHoy">> {
  const [cierre, horarios] = await Promise.all([
    db.query.storeClosure.findFirst({
      where: and(eq(storeClosure.storeId, storeId), eq(storeClosure.fecha, fecha)),
    }),
    db.query.storeHours.findMany({
      where: and(eq(storeHours.storeId, storeId), eq(storeHours.diaSemana, diaSemana)),
      orderBy: asc(storeHours.abre),
    }),
  ]);

  return {
    cierreHoy: cierre
      ? { cerrado: cierre.cerrado, abre: cierre.abre, cierra: cierre.cierra, motivo: cierre.motivo }
      : null,
    horariosHoy: horarios.map((h) => ({ abre: h.abre, cierra: h.cierra })),
  };
}
