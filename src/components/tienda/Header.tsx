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

       Todo el texto va en `text-cafe` pelado y sin tonos apagados, porque `--cafe` es el color
       más oscuro de la paleta y sobre el terracota da TODO el margen que hay: medido contra el
       `#ec6e38` de hoy son 4.29:1, así que un `/80` no llegaría ni a 3.5. Lo mismo pasa con la
       hamburguesa y el badge del carrito, que dejaron de ser naranja (1.12:1).

       Esa cifra cuelga de `--terracota` y hay que releerla si se cambia. Y ojo con la
       intuición: para SUBIR el contraste con texto oscuro hay que ACLARAR el fondo, no
       oscurecerlo — desde `#ec6e38`, oscurecer un 4 % baja a 3.99:1 y aclararlo un 5 % sube a
       4.52:1.

       `bg-repeat-x` y no `bg-repeat`: el tile del SVG va espejado, así que encaja consigo
       mismo en horizontal, pero en vertical NO es seamless. Da igual porque mide 679 px de
       alto y este header no pasa de 188, así que nunca se repite en ese eje — y declararlo
       deja escrito el límite para quien cambie la escala. */
    <header className="relative z-30 flex flex-col gap-2 bg-terracota bg-[url('/patrones/ondas_naranjas.svg')] bg-[length:906px_680px] bg-repeat-x px-2 pt-3 pb-2 text-cafe lg:sticky lg:top-0 lg:flex-row lg:items-center lg:justify-between lg:gap-8 lg:px-8 lg:py-3">
      <div className="flex w-full items-center justify-between gap-2 lg:w-auto lg:gap-8">
        <div className="lg:hidden">
          <Drawer tienda={tienda} />
        </div>
        {/* El logo va en café y no en blanco: sobre el terracota el blanco queda a 2.47:1.
            Fondo transparente y trazos gruesos; sus letras (#452a04) dan 4.32:1 contra el
            `#ec6e38` pelado, que es el peor caso porque los blobs de la textura son más claros
            (encima de un blob suben a 5.86:1). Por debajo de 4.5, aunque un logotipo está exento
            de ese mínimo — el que sí manda es el `text-cafe` del <header>, ver arriba.

            El <Drawer> NO comparte este PNG: su panel sigue con logo-cronchy-recortado.png, que
            es el mismo logo con trazo fino. Si algún día se igualan, es un `src`.

            La caja pierde ancho pero CONSERVA el alto, y las dos cosas importan. Este PNG es
            más cuadrado (2.04:1 contra los 2.94:1 del blanco), así que en la caja de aquél
            (w-56) se habría pintado un 46 % más alto; con w-38 sale a 152×75 px, o sea el mismo
            alto que tenía el blanco y 72 px menos de ancho. Y el `h-28` se queda porque el
            `object-contain` limita por el ancho: bajarlo a la medida del logo le quitaba al
            header los 36 px de holgura vertical que tenía, y el header entero pasaba de 188 a
            152 px de alto. Aquí solo se quería que el logo no creciera. */}
        <div className="relative h-28 w-38 shrink-0 lg:h-24 lg:w-36">
          <Image
            src="/logo_cronchy_oscuro_bold.png"
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
