import { getStore } from "@/db/queries/store";
import { obtenerMenu } from "@/db/queries/menu";
import { Header } from "@/components/tienda/Header";
import { CategoryNav } from "@/components/tienda/CategoryNav";
import { CategoryBanner } from "@/components/tienda/CategoryBanner";
import { SectionTitle } from "@/components/tienda/SectionTitle";
import { ProductCard } from "@/components/tienda/ProductCard";
import { CartBar } from "@/components/tienda/CartBar";
import { Footer } from "@/components/tienda/Footer";
import { RefrescarAlVolver } from "@/components/tienda/RefrescarAlVolver";
import { SUBTITULO_CATEGORIA } from "@/lib/tienda/categoria-meta";

// El panel ya revalida esta ruta al apagar un producto o una opción, así que el menú se
// actualiza en el momento. El plazo se conserva como red de seguridad para lo que todavía
// se cambia por fuera del panel —precios, categorías— hasta que llegue su CRUD.
export const revalidate = 60;

export default async function MenuPage() {
  const tienda = await getStore();
  const categorias = await obtenerMenu(tienda.id);

  const recomendados = categorias.flatMap((c) => c.productos.filter((p) => p.recomendado));

  return (
    <>
      {/* Solo aquí y no en el layout: el layout arrastraría al checkout, donde refrescar a
          mitad del formulario es ruido —ahí la regla 1 ya protege el precio al confirmar. */}
      <RefrescarAlVolver />
      <Header tienda={tienda} categorias={categorias} />
      <CategoryNav categorias={categorias} variant="mobile" />

      <main className="flex-1 px-4 pb-4 lg:mx-auto lg:max-w-contenido lg:px-8">
        {recomendados.length > 0 && (
          <section id="recomendados" className="scroll-mt-24 py-6">
            <SectionTitle verTodosHref="#recomendados">Recomendados para ti</SectionTitle>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
              {recomendados.map((producto) => (
                <ProductCard key={producto.id} producto={producto} />
              ))}
            </div>
          </section>
        )}

        {categorias.map((categoria) => (
          <section key={categoria.id} id={categoria.slug} className="scroll-mt-24 py-6">
            <CategoryBanner
              nombre={categoria.nombre}
              bannerUrl={categoria.bannerUrl}
              subtitulo={SUBTITULO_CATEGORIA[categoria.slug]}
              ctaHref={`#${categoria.slug}-grid`}
              ctaLabel={`Ver todos los ${categoria.nombre.toLowerCase()}`}
            />

            <div
              id={`${categoria.slug}-grid`}
              className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5"
            >
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
