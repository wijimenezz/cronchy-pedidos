import { getStore } from "@/db/queries/store";
import { obtenerMenu } from "@/db/queries/menu";
import { Header } from "@/components/tienda/Header";
import { UtilityBar } from "@/components/tienda/UtilityBar";
import { CategoryTabs } from "@/components/tienda/CategoryTabs";
import { CategoryBanner } from "@/components/tienda/CategoryBanner";
import { ProductCard } from "@/components/tienda/ProductCard";
import { CartBar } from "@/components/tienda/CartBar";
import { Footer } from "@/components/tienda/Footer";

// Interino hasta que exista el panel admin (Fase C) y pueda revalidar on-demand.
export const revalidate = 60;

export default async function MenuPage() {
  const tienda = await getStore();
  const categorias = await obtenerMenu(tienda.id);

  const recomendados = categorias.flatMap((c) => c.productos.filter((p) => p.recomendado));

  return (
    <>
      <Header tienda={tienda} />

      <div className="sticky top-0 z-10 shadow-tarjeta">
        <UtilityBar tienda={tienda} hayRecomendados={recomendados.length > 0} />
        <CategoryTabs categorias={categorias} />
      </div>

      <main className="flex-1 px-4 pb-4">
        {recomendados.length > 0 && (
          <section id="recomendados" className="scroll-mt-16 py-6">
            <CategoryBanner nombre="Recomendados" />
            <div className="mt-4 grid grid-cols-2 gap-3">
              {recomendados.map((producto) => (
                <ProductCard key={producto.id} producto={producto} />
              ))}
            </div>
          </section>
        )}

        {categorias.map((categoria) => (
          <section key={categoria.id} id={categoria.slug} className="scroll-mt-16 py-6">
            <CategoryBanner nombre={categoria.nombre} bannerUrl={categoria.bannerUrl} />

            <div className="mt-4 grid grid-cols-2 gap-3">
              {categoria.productos.map((producto) => (
                <ProductCard key={producto.id} producto={producto} />
              ))}
            </div>
          </section>
        ))}
      </main>

      <Footer tienda={tienda} />
      <CartBar />
    </>
  );
}
