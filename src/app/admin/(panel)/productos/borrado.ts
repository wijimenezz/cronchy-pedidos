import type { ResultadoBorrado } from "@/db/queries/catalogo";

/**
 * Todo lo que puede devolver `eliminarProducto` MENOS el éxito. Excluir `ok` del parámetro es lo
 * que hace que esta función devuelva siempre un `string`: si aceptara el resultado completo
 * tendría que devolver `null` para el caso bueno, y quien la llama acabaría con un `?? "..."`
 * imposible de alcanzar.
 */
export type BorradoRechazado = Exclude<ResultadoBorrado, { estado: "ok" }>;

/**
 * Por qué no se pudo borrar un producto, dicho para el dueño de la churrería.
 *
 * Vive aparte de `acciones.ts` porque ese archivo es `"use server"` y ahí todo export tiene que
 * ser una acción async; hermano puro del route folder, igual que `pedidos/notificaciones.ts`.
 *
 * Cada motivo dice **qué hacer en su lugar**, no solo que no se puede: un producto vendido tiene
 * salida (Oculto) y uno que es acompañante también (quitarlo de esa lista). Un mensaje que solo
 * niega deja al admin pulsando el mismo botón.
 */
export function porQueNoSeBorra(resultado: BorradoRechazado): string {
  switch (resultado.estado) {
    case "sin_producto":
      return "Ese producto ya no existe.";

    case "tiene_ventas":
      return "Este producto ya se vendió, así que borrarlo reescribiría el historial. Ponlo en Oculto: desaparece de la carta y se puede volver a encender.";

    case "es_acompanante":
      return `Se ofrece como acompañante en ${comillas(resultado.listas)}. Quítalo de ${resultado.listas.length === 1 ? "esa lista" : "esas listas"} en Opciones y vuelve a intentarlo.`;
  }
}

/** «Bebidas» · «Bebidas» y «Postres» — el mismo formato que usa el panel para nombrar cosas. */
function comillas(nombres: string[]): string {
  const entre = nombres.map((n) => `«${n}»`);
  if (entre.length <= 1) return entre.join("");

  return `${entre.slice(0, -1).join(", ")} y ${entre.at(-1)}`;
}
