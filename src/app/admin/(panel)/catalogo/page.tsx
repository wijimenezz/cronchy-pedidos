import { getStore } from "@/db/queries/store";
import {
  listarOpcionesParaDisponibilidad,
  listarProductosParaDisponibilidad,
} from "@/db/queries/disponibilidad";
import { exigirRol } from "@/lib/autorizacion";
import { Interruptor } from "@/components/admin/Interruptor";
import { marcarOpcionDisponible, marcarProductoDisponible } from "./acciones";

export const dynamic = "force-dynamic";

/**
 * Qué hay y qué se acabó (US21). No es el CRUD del catálogo —eso es de admin y llega
 * después—: es la pantalla que se abre a media tarde cuando se acaba un sabor.
 */
export default async function CatalogoPage() {
  await exigirRol("colaborador");
  const tienda = await getStore();

  const [categorias, grupos] = await Promise.all([
    listarProductosParaDisponibilidad(tienda.id),
    listarOpcionesParaDisponibilidad(tienda.id),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-titulo text-xl font-bold text-cafe">Qué hay hoy</h1>
        <p className="font-cuerpo text-[13px] text-cafe-tenue">
          Lo que apagues desaparece del menú al instante. Nada se borra.
        </p>
      </div>

      {categorias.map((categoria) => (
        <section
          key={categoria.categoria}
          className="rounded-md border border-crema-oscura bg-tarjeta p-4"
        >
          <h2 className="mb-2 font-titulo text-base font-bold text-cafe">
            {categoria.categoria}
          </h2>
          <ul className="divide-y divide-crema-oscura">
            {categoria.productos.map((producto) => (
              <li key={producto.id}>
                <Interruptor
                  id={producto.id}
                  nombre={producto.nombre}
                  disponible={producto.disponible}
                  accion={marcarProductoDisponible}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {grupos.map((grupo) => (
        <section key={grupo.id} className="rounded-md border border-crema-oscura bg-tarjeta p-4">
          <h2 className="mb-2 font-titulo text-base font-bold text-cafe">{grupo.nombre}</h2>
          <ul className="divide-y divide-crema-oscura">
            {grupo.opciones.map((opcion) => (
              <li key={opcion.id}>
                <Interruptor
                  id={opcion.id}
                  nombre={opcion.nombre}
                  disponible={opcion.disponible}
                  accion={marcarOpcionDisponible}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
