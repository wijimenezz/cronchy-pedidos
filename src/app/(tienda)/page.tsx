import { getStore } from "@/db/queries/store";
import { obtenerMenu } from "@/db/queries/menu";
import { cuponAnunciado } from "@/db/queries/cupones";
import { diaDeBogota } from "@/lib/pedidos/dias";
import { AvisoCupon } from "@/components/tienda/AvisoCupon";
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
  /**
   * El cupón que se está anunciando, si hay alguno vivo.
   *
   * El día se calcula aquí y no en el componente: de él depende que un cupón vencido deje de
   * anunciarse, y el reloj del navegador puede estar en cualquier zona. Que esta página sea ISR no
   * lo estanca — el panel revalida `/` al guardar un cupón, y de todos modos se rehace cada 60 s.
   */
  const cupon = await cuponAnunciado(tienda.id, diaDeBogota());

  const recomendados = categorias.flatMap((c) => c.productos.filter((p) => p.recomendado));

  return (
    <>
      {/* Solo aquí y no en el layout: el layout arrastraría al checkout, donde refrescar a
          mitad del formulario es ruido —ahí la regla 1 ya protege el precio al confirmar. */}
      <RefrescarAlVolver />
      <Header tienda={tienda} categorias={categorias} />
      <CategoryNav categorias={categorias} variant="mobile" />

      <main className="flex-1 px-4 pb-4 lg:mx-auto lg:max-w-contenido lg:px-8">
        {/* Arriba del todo: quien entra tiene que enterarse del cupón antes de armar el pedido,
            no cuando ya está pagando. */}
        {cupon && <AvisoCupon codigo={cupon.codigo} anuncio={cupon.anuncio} />}

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
