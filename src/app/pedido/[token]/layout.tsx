import { MarcoPublico } from "@/components/MarcoPublico";

/**
 * El seguimiento es una pantalla del cliente, así que lleva la misma columna angosta que
 * el menú. Necesita su propio layout porque vive fuera del grupo `(tienda)`: no tiene su
 * header ni su fondo, solo el marco.
 */
export default function PedidoLayout({ children }: { children: React.ReactNode }) {
  return <MarcoPublico>{children}</MarcoPublico>;
}
