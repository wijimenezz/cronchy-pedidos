import Image from "next/image";
import { EstadoTienda } from "@/components/tienda/EstadoTienda";
import { SelectorTipoPedido } from "@/components/tienda/SelectorTipoPedido";
import { Drawer } from "@/components/tienda/Drawer";
import { CategoryNav } from "@/components/tienda/CategoryNav";
import { CartButton } from "@/components/tienda/CartButton";

type Tienda = {
  nombre: string;
  telefono: string | null;
  whatsappUrl: string | null;
  direccion: string | null;
  /** Solo lo consume el <Drawer>; el header no lo pinta. */
  googleResenasUrl: string | null;
};

type Categoria = { id: string; nombre: string; slug: string };

export function Header({
  tienda,
  categorias,
}: {
  tienda: Tienda;
  categorias: Categoria[];
}) {
  return (
    /* Fondo: los blobs de marca (public/patrones/ondas_naranjas.svg) sobre el terracota. El
       `bg-terracota` no es decoración redundante, es el respaldo: va como background-color
       debajo de la imagen, así que si el SVG no carga el header queda liso y no transparente.
       El color y el tono de la textura NO se ajustan aquí, sino en dos atributos del SVG.

       Con `--terracota` en `#a34117`, que es oscuro, todo lo que se pinta encima va en CLARO:
       `text-crema` aquí, la hamburguesa y la bolsa en crema, y la nav igual. Medido sobre ese
       fondo, la crema da **5.73:1** y sobre un blob de la textura 6.67:1, así que la nav de
       escritorio —texto de 16 px, umbral 4.5— cumple con holgura, y los iconos, cuyo umbral es
       3:1 por ser gráficos, de sobra.

       Ese margen se lo debe al fondo: con el `#bf5526` que tuvo antes la crema se quedaba en
       4.19:1 y la nav no llegaba al 4.5. Aun así, aquí NO se usan tonos apagados: un `/80`
       sobre este fondo cae a 4.4:1 y volvería a rozar el límite. Si se aclara el fondo, esta
       cifra es la primera que hay que releer.

       Ojo con la intuición al cambiar el fondo: con texto CLARO hay que oscurecerlo para ganar
       contraste, y con texto oscuro es al revés. Este header ha ido y venido dos veces.

       `bg-repeat-x` y no `bg-repeat`: el tile del SVG va espejado, así que encaja consigo
       mismo en horizontal, pero en vertical NO es seamless. Da igual porque mide 679 px de
       alto y este header no pasa de 188, así que nunca se repite en ese eje — y declararlo
       deja escrito el límite para quien cambie la escala. */
    <header className="relative z-30 flex flex-col gap-2 bg-terracota bg-[url('/patrones/ondas_naranjas.svg')] bg-[length:906px_680px] bg-repeat-x px-2 pt-3 pb-2 text-crema lg:sticky lg:top-0 lg:flex-row lg:items-center lg:justify-between lg:gap-8 lg:px-8 lg:py-3">
      <div className="flex w-full items-center justify-between gap-2 lg:w-auto lg:gap-8">
        <div className="lg:hidden">
          <Drawer tienda={tienda} />
        </div>
        {/* El logo sigue al fondo, y ha ido y venido: en café mientras `--terracota` fue un tono
            claro, y en claro ahora que es `#a34117`. Su palabra principal es blanco puro y da
            6.31:1 contra el fondo pelado; el subtítulo, crema, 5.28:1. Los dos cumplen AA.

            **DOS TRAMPAS DE ESTE ARCHIVO, y las dos costaron una vuelta:**

            1. El PNG que llegó traía 279 px de margen transparente a la izquierda, 348 a la
               derecha, 303 arriba y 189 abajo. Con `object-contain` la caja ajusta LA IMAGEN, no
               el dibujo, así que ese margen se comía la mitad del espacio y el logo se veía a
               98×32 px en vez de a 145×65 — aunque el archivo medía lo mismo que el anterior.
               Lo que se usa aquí es el recorte a su bbox real (1166×387); el original sin
               recortar sigue en public/ al lado. Si algún día se resube el logo, hay que
               comprobar el margen: un export con aire vuelve a encogerlo sin cambiar de tamaño.
            2. Al abrirlo parece que falta la palabra "Cronchy". No falta: es blanco puro y el
               visor de imágenes pinta la transparencia en blanco. Blanco sobre blanco.

            LA CAJA es más ancha que la que tuvo el logo de tres líneas, y no es un capricho.
            Este dibujo tiene dos (Cronchy + subtítulo), así que su relación es 3.01:1 contra
            2.23:1, y a igual alto sale más ancho. Con w-48 el logo se pinta a 192×64, o sea
            prácticamente el MISMO ALTO que el de antes (65 y 62), que es lo que se lee como
            "tamaño". Igualar también el ancho es imposible con otra composición.

            Son 192 y no 200 por la pantalla estrecha: con 200 la caja se solapaba 4 px con el
            área táctil de la bolsa a 320 px de ancho (la columna ahí son 289 px y el reparto
            pedía 296). Los 8 px de diferencia no se ven, y a 320 ya no se solapa nada.

            Los altos de la caja (`h-28` / `lg:h-24`) NO se tocan: el `object-contain` limita por
            el ancho, así que solo sirven para mantener el header en 188 y 120 px. Bajarlos a la
            medida del logo le quitaría al header su holgura vertical. */}
        <div className="relative h-28 w-48 shrink-0 lg:h-24 lg:w-48">
          <Image
            src="/logo_cronchy_borde_grueso.png"
            alt={tienda.nombre}
            fill
            sizes="160px"
            priority
            className="object-contain"
          />
        </div>
        <CategoryNav categorias={categorias} variant="desktop" />
        <CartButton className="lg:hidden" />
      </div>

      {/* Rejilla de tres columnas en móvil y no un `flex`, para que el selector Domicilio/Recoger
          se quede donde estaba: la columna del medio en `auto` y las de los lados en `1fr`. Con un
          `flex justify-center` el personaje lo habría empujado a la derecha.

          **No es un centrado garantizado, y conviene saberlo antes de fiarse.** `1fr` es
          `minmax(auto, 1fr)`, así que la primera columna nunca baja de lo que mide el personaje
          con su letrero: en una pantalla estrecha (320–360 px) crece por encima de la tercera y el
          chip se corre a la derecha. No desborda —el reparto sigue cabiendo—, pero simétrico solo
          es mientras sobre sitio.

          Desde `lg` vuelve a ser el `flex` de siempre, donde el personaje ya no existe. */}
      <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 lg:flex lg:w-auto lg:justify-end">
        {/* Debajo de la hamburguesa, y vivo exactamente mientras ella: los dos son `lg:hidden`. */}
        <div className="justify-self-start lg:hidden">
          <EstadoTienda />
        </div>
        <SelectorTipoPedido />
        {/* La tercera columna existe para equilibrar la primera. Vacía a propósito. */}
        <div aria-hidden className="lg:hidden" />
        <CartButton className="hidden lg:flex" />
      </div>
    </header>
  );
}
