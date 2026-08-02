import { getStore } from "@/db/queries/store";
import { listarListasDelPanel } from "@/db/queries/opciones";
import { exigirRol } from "@/lib/autorizacion";
import { EditorOpciones } from "./EditorOpciones";

export const dynamic = "force-dynamic";

/**
 * Donde se crean y se editan las salsas, los toppings y los sabores.
 *
 * En el modelo son `modifier_group` y `modifier_option`; aquí son "listas" y "opciones"
 * (regla 15). La palabra "grupo" no aparece en la pantalla, y "enganche" mucho menos: qué
 * producto usa cuál lista, y cuántas incluye, se decide en la Carta.
 *
 * Entra el colaborador porque el sabor que se acaba a media tarde es cosa suya; los
 * controles de edición los esconde la UI y los corta de verdad el `exigirRol` de cada
 * acción (regla 12).
 */
export default async function OpcionesPage() {
  const sesion = await exigirRol("colaborador");
  const tienda = await getStore();

  const listas = await listarListasDelPanel(tienda.id);

  return <EditorOpciones listas={listas} esAdmin={sesion.rol === "admin"} />;
}
