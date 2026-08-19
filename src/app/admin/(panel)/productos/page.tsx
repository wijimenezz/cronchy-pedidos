import { getStore } from "@/db/queries/store";
import { listarCatalogoDelPanel, listarGruposEnganchables } from "@/db/queries/catalogo";
import { exigirRol } from "@/lib/autorizacion";
import { EditorCatalogo } from "./EditorCatalogo";

export const dynamic = "force-dynamic";

/**
 * El CRUD del catálogo. Entra el colaborador —necesita ver la carta y marcar agotados—
 * pero solo el admin ve los controles de edición; quien corta de verdad es el `exigirRol`
 * de cada acción, no el `esAdmin` que se le pasa a la UI (regla 12).
 *
 * `/admin/catalogo` ("Qué hay hoy") sigue existiendo aparte: es la pantalla de una sola
 * columna que se abre a media tarde para apagar un sabor, y para eso esta sobra.
 */
export default async function ProductosPage() {
  const sesion = await exigirRol("colaborador");
  const tienda = await getStore();

  const [categorias, grupos] = await Promise.all([
    listarCatalogoDelPanel(tienda.id),
    listarGruposEnganchables(tienda.id),
  ]);

  // El tope de ancho lo pone cada pantalla desde que el tablero de pedidos necesita el ancho
  // completo; salió de `<main>` en el layout.
  return (
    <div className="mx-auto w-full max-w-contenido">
      <EditorCatalogo categorias={categorias} grupos={grupos} esAdmin={sesion.rol === "admin"} />
    </div>
  );
}
