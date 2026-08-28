import { getStore } from "@/db/queries/store";
import { listarListasDelPanel, listarProductosParaUpsell } from "@/db/queries/opciones";
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

  // Los productos alimentan el selector de las listas de upsell. Se traen siempre y no solo
  // para el admin: son unas decenas de filas de tres columnas, y condicionarlo obligaría a un
  // estado de carga en una pantalla que hoy no tiene ninguno.
  const [listas, productos] = await Promise.all([
    listarListasDelPanel(tienda.id),
    listarProductosParaUpsell(tienda.id),
  ]);

  // El tope de ancho lo pone cada pantalla desde que el tablero de pedidos necesita el ancho
  // completo; salió de `<main>` en el layout.
  return (
    <div className="mx-auto w-full max-w-contenido">
      <EditorOpciones listas={listas} productos={productos} esAdmin={sesion.rol === "admin"} />
    </div>
  );
}
