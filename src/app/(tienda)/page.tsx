import { getStore } from "@/db/queries/store";
import { obtenerMenu } from "@/db/queries/menu";
import { CategoryTabs } from "@/components/tienda/CategoryTabs";
import { ProductCard } from "@/components/tienda/ProductCard";

// Interino hasta que exista el panel admin (Fase C) y pueda revalidar on-demand.
export const revalidate = 60;

export default async function MenuPage() {
  const tienda = await getStore();
  const categorias = await obtenerMenu(tienda.id);

  return (
    <>
      <CategoryTabs categorias={categorias} />

      <main className="flex-1 px-4 pb-24">
        {categorias.map((categoria) => (
          <section key={categoria.id} id={categoria.slug} className="scroll-mt-16 py-6">
            <h2 className="font-titulo text-2xl font-semibold text-cafe">{categoria.nombre}</h2>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {categoria.productos.map((producto) => (
                <ProductCard key={producto.id} producto={producto} />
              ))}
            </div>
          </section>
        ))}
      </main>
    </>
  );
}
