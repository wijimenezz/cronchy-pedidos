"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Check, ChevronDown, Minus, Plus, X } from "lucide-react";
import { pesos } from "@/lib/notificaciones/plantillas";
import { useCarrito } from "@/lib/carrito";
import { useTipoPedido } from "@/lib/tienda/tipo-pedido";
import { precargarProducto } from "@/lib/tienda/productos-cache";
import {
  calcularItem,
  engancheCobra,
  esCasilla,
  esVariante,
  precioDesde,
  precioEfectivoOpcion,
} from "@/lib/precios-calculo";
// Puro y sin dependencias de servidor: `modificadores.ts` solo tiene un `import type` —que
// TypeScript borra al compilar— y `plantillas.ts` no importa nada. No engorda el bundle.
import { etiquetaCorta } from "@/lib/pedidos/modificadores";
import {
  bebidasElegidas,
  pendientesDeFicha,
  seleccionSinUpsells,
} from "@/lib/checkout/mapeo";
import type { SeleccionEnganche } from "@/lib/precios-calculo";
import type {
  EngancheParaFicha,
  OpcionParaFicha,
  ProductoParaFicha,
  ProductoUpsellRef,
} from "@/db/queries/productos";

type SeleccionesPorGrupo = Record<string, Record<string, number>>;

function construirSeleccion(
  selecciones: SeleccionesPorGrupo,
): SeleccionEnganche[] {
  return Object.entries(selecciones)
    .map(([productModifierGroupId, opciones]) => ({
      productModifierGroupId,
      opciones: Object.entries(opciones)
        .filter(([, cantidad]) => cantidad > 0)
        .map(([modifierOptionId, cantidad]) => ({
          modifierOptionId,
          cantidad,
        })),
    }))
    .filter((s) => s.opciones.length > 0);
}

/**
 * Una opción agotada no entra en la selección, y el guard va AQUÍ y no solo en el `disabled`
 * del botón: si vive en el CSS, cualquier gesto nuevo —o el teclado, o el DOM tocado a mano—
 * la vuelve a colar. Y colarla no es inofensivo: como lo incluido es obligatorio (regla 4),
 * una salsa agotada satisfacía el mínimo, el contador decía "2 de 2" y el botón Añadir se
 * quedaba bloqueado sin explicar por qué.
 *
 * El servidor la rechaza igual (`opcion_invalida / no_disponible`), pero eso es la red de
 * seguridad, no el sitio donde el cliente se entera.
 */
function disponible(enganche: EngancheParaFicha, opcionId: string): boolean {
  return enganche.opciones.find((o) => o.id === opcionId)?.disponible ?? false;
}

/**
 * Un grupo obligatorio del que se agotó TODO. El producto queda impedible de verdad, y hay
 * que decirlo: dejar el "Te faltan 2 por elegir" sobre una lista donde nada se puede tocar
 * manda al cliente a buscar un botón que no existe.
 */
function sinNadaQueElegir(enganche: EngancheParaFicha): boolean {
  const esRequerido = enganche.minSelect > 0 && !enganche.avisarIncompleto;
  return esRequerido && enganche.opciones.every((o) => !o.disponible);
}

/**
 * Selección de UN grupo tras tocar una opción. Extraída del componente para que el
 * producto de la ficha y las bebidas del upsell compartan exactamente el mismo
 * comportamiento (radio, tope de maxSelect, deseleccionar).
 */
function toggleEnGrupo(
  actual: Record<string, number>,
  enganche: EngancheParaFicha,
  opcionId: string,
): Record<string, number> {
  if (!disponible(enganche, opcionId)) return actual;

  const yaSeleccionada = (actual[opcionId] ?? 0) > 0;

  // maxSelect 1 se comporta como radio: elegir otra reemplaza la anterior.
  if (enganche.maxSelect === 1) {
    return yaSeleccionada ? {} : { [opcionId]: 1 };
  }
  if (yaSeleccionada) return sinOpcion(actual, opcionId);

  const suma = Object.values(actual).reduce((n, c) => n + c, 0);
  if (suma >= enganche.maxSelect) return actual;
  return { ...actual, [opcionId]: 1 };
}

/** Ídem para el stepper de cantidad, respetando maxPorOpcion y el tope del grupo. */
function cantidadEnGrupo(
  actual: Record<string, number>,
  enganche: EngancheParaFicha,
  opcionId: string,
  delta: number,
): Record<string, number> {
  if (!disponible(enganche, opcionId)) return actual;

  const cantidadActual = actual[opcionId] ?? 0;
  const suma = Object.values(actual).reduce((n, c) => n + c, 0);
  const maxPorOpcion = enganche.maxPorOpcion ?? Infinity;
  const tope = Math.min(
    maxPorOpcion,
    enganche.maxSelect - (suma - cantidadActual),
  );
  const nueva = Math.max(0, Math.min(tope, cantidadActual + delta));

  return nueva > 0
    ? { ...actual, [opcionId]: nueva }
    : sinOpcion(actual, opcionId);
}

function sinOpcion(
  seleccion: Record<string, number>,
  opcionId: string,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(seleccion).filter(([id]) => id !== opcionId),
  );
}

/**
 * ¿Esta sección nace plegada detrás de un "+ Agregar …"?
 *
 * Los adicionales sí, porque son una lista larga que no debe estorbarle a quien solo quiere su
 * churro. Las dos excepciones son las que no tienen lista que abrir: un **tamaño** hay que elegirlo
 * para poder añadir el producto, y una **casilla** es una pregunta de sí o no que se responde
 * marcándola. Plegada, cualquiera de las dos escondería justo lo que hay que ver.
 */
function sePliega(enganche: EngancheParaFicha): boolean {
  return (
    enganche.modo === "adicional" && !esVariante(enganche) && !esCasilla(enganche)
  );
}

function StepperCantidad({
  valor,
  onCambiar,
  min = 0,
  deshabilitado = false,
}: {
  valor: number;
  onCambiar: (delta: number) => void;
  min?: number;
  /** Opción agotada: los dos botones quedan muertos, no solo el de restar. */
  deshabilitado?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-crema-oscura px-1.5 py-1">
      <button
        type="button"
        onClick={() => onCambiar(-1)}
        disabled={deshabilitado || valor <= min}
        aria-label="Quitar uno"
        className="flex size-6 items-center justify-center rounded-full font-bold text-cafe disabled:opacity-40"
      >
        <Minus className="size-3.5" />
      </button>
      <span className="min-w-[16px] text-center text-sm font-bold text-cafe">
        {valor}
      </span>
      <button
        type="button"
        onClick={() => onCambiar(1)}
        disabled={deshabilitado}
        aria-label="Agregar uno"
        className="flex size-6 items-center justify-center rounded-full font-bold text-cafe disabled:opacity-40"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

function FilaOpcion({
  enganche,
  opcion,
  cantidad,
  onToggle,
  onCambiarCantidad,
}: {
  enganche: EngancheParaFicha;
  opcion: OpcionParaFicha;
  cantidad: number;
  onToggle: () => void;
  onCambiarCantidad: (delta: number) => void;
}) {
  const seleccionada = cantidad > 0;
  const precio = precioEfectivoOpcion(enganche, opcion);

  const claseFila = `flex min-h-11 items-center gap-3 rounded-md border border-crema-oscura px-3 py-2 ${
    opcion.disponible ? "" : "opacity-40"
  }`;

  const nombreYPrecio = (
    <>
      <span
        className={`flex-1 text-left text-sm font-medium ${
          seleccionada ? "text-naranja" : "text-cafe"
        }`}
      >
        {opcion.nombre}
        {!opcion.disponible && " (agotado)"}
      </span>
      {precio > 0 && (
        <span className="text-xs text-cafe-suave">+{pesos(precio)}</span>
      )}
    </>
  );

  // Redondo para elegir entre varias, cuadrado con check para marcar la única que hay: el
  // control dice de qué tipo de decisión se trata antes de leer nada.
  const indicador = esCasilla(enganche) ? (
    <span
      className={`flex size-6 shrink-0 items-center justify-center rounded-md border-2 ${
        seleccionada ? "border-naranja bg-naranja" : "border-crema-oscura"
      }`}
    >
      {seleccionada && <Check className="size-4 text-crema" strokeWidth={3} />}
    </span>
  ) : (
    <span
      className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${
        seleccionada ? "border-naranja bg-naranja" : "border-crema-oscura"
      }`}
    >
      {seleccionada && <span className="size-2 rounded-full bg-crema" />}
    </span>
  );

  // Sin stepper: la fila COMPLETA es el botón — nombre, precio e indicador
  // son una sola zona táctil.
  if (!enganche.permiteCantidad) {
    return (
      <button
        type="button"
        onClick={onToggle}
        disabled={!opcion.disponible}
        className={`${claseFila} w-full`}
      >
        {nombreYPrecio}
        {indicador}
      </button>
    );
  }

  // Con stepper: igual que antes, porque el stepper tiene sus propios botones
  // y no puede vivir dentro de otro botón (HTML inválido + clics ambiguos).
  return (
    <div className={claseFila}>
      <button
        type="button"
        onClick={onToggle}
        disabled={!opcion.disponible}
        className="flex flex-1 items-center justify-between gap-2 self-stretch text-left"
      >
        {nombreYPrecio}
      </button>
      <StepperCantidad
        valor={cantidad}
        onCambiar={onCambiarCantidad}
        deshabilitado={!opcion.disponible}
      />
    </div>
  );
}

function GrupoEnganche({
  enganche,
  seleccion,
  plegable = false,
  expandido = false,
  plegado = false,
  onExpandir,
  onToggleExpandir,
  onToggleOpcion,
  onCambiarCantidad,
  compacto = false,
}: {
  enganche: EngancheParaFicha;
  seleccion: Record<string, number>;
  plegable?: boolean;
  expandido?: boolean;
  /** Grupo incluido ya completo: se muestra como un resumen de una línea. */
  plegado?: boolean;
  onExpandir?: () => void;
  onToggleExpandir?: () => void;
  onToggleOpcion: (opcionId: string) => void;
  onCambiarCantidad: (opcionId: string, delta: number) => void;
  /** Dentro de la fila de una bebida: encoge la cabecera, nunca las filas de opción. */
  compacto?: boolean;
}) {
  const recibidas = Object.values(seleccion).reduce((n, c) => n + c, 0);
  const esRequerido = enganche.minSelect > 0 && !enganche.avisarIncompleto;
  // Lo incluido es obligatorio: mientras falten, el botón Añadir está bloqueado y hay que
  // decir cuántas para que el cliente no se quede adivinando por qué no puede continuar.
  const faltan = enganche.avisarIncompleto
    ? 0
    : Math.max(0, enganche.minSelect - recibidas);
  const agotadoEntero = sinNadaQueElegir(enganche);
  const cobra = engancheCobra(enganche);

  /**
   * Qué significa esta sección, cuando no se entiende sola.
   *
   * Va **fuera del pliegue** a propósito. "Azúcar y canela" nace plegada porque casi nadie
   * necesita tocarla, pero entonces lo único que se lee es el rótulo: no se sabe si hay que
   * elegir algo, ni qué llega si no se toca nada, ni que lo de dentro sirve para quitar. Metido
   * dentro, el texto solo lo vería quien ya lo había entendido.
   */
  const ayuda = enganche.ayudaGrupo ? (
    <p className={`text-cafe-suave ${compacto ? "text-[11px]" : "text-[13px]"}`}>
      {enganche.ayudaGrupo}
    </p>
  ) : null;

  const opciones = (
    <div className="flex flex-col gap-2">
      {enganche.opciones.map((opcion) => (
        <FilaOpcion
          key={opcion.id}
          enganche={enganche}
          opcion={opcion}
          cantidad={seleccion[opcion.id] ?? 0}
          onToggle={() => onToggleOpcion(opcion.id)}
          onCambiarCantidad={(delta) => onCambiarCantidad(opcion.id, delta)}
        />
      ))}
    </div>
  );

  // Grupo obligatorio ya completo: una sola línea con lo elegido, tocable para corregir.
  //
  // **El resumen es la mitad que importa.** Contraerlo a un "Toppings ✓" obligaría a reabrirlo
  // solo para verificar qué se eligió, y entonces el pliegue escondería información en vez de
  // ahorrar espacio. Con los nombres a la vista únicamente ahorra espacio.
  if (plegado && !plegable) {
    const elegidas = enganche.opciones
      .filter((opcion) => (seleccion[opcion.id] ?? 0) > 0)
      .map((opcion) => {
        const cuantas = seleccion[opcion.id] ?? 0;
        return cuantas > 1 ? `${opcion.nombre} ×${cuantas}` : opcion.nombre;
      })
      // Mismo formato que usa el panel para este dato (`agruparModificadores`): es lo mismo
      // leído en dos pantallas y no debería escribirse de dos maneras.
      .join(" · ");

    return (
      <button
        type="button"
        onClick={onExpandir}
        aria-expanded={false}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md bg-crema-oscura/50 px-3 py-2 text-left"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-cafe">
            {enganche.nombreGrupo}
          </span>
          <span className="block truncate text-xs text-naranja">
            {elegidas}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-cafe" />
      </button>
    );
  }

  if (plegable) {
    return (
      <div>
        {/* Lo que se puede AGREGAR se separa de lo que ya está resuelto: sin esto, esta caja se
            veía igual que el resumen plegado de un grupo obligatorio —misma crema, sin borde—, y
            la única sección que hace vender pasaba por "esto ya lo llenaste".

            El naranja va en el borde y en un tinte al 10 %, nunca en el texto ni de relleno: el
            rótulo mide 14 px y DESIGN.md §1 no lo deja ("para texto pequeño usa café", "nunca
            crema sobre naranja en texto chico"). Medido sobre este fondo, el naranja de marca da
            2,5:1 y el oscuro 3,1:1, y un relleno con texto crema 2,8:1 — los tres por debajo del
            4,5:1 de AA. En café son 11,8:1. Es el mismo documento el que dice que "color/opacidad
            sirve para píldoras y bordes", y esto es justo eso.

            Solo cuando `cobra`: los plegables gratis (Azúcar y canela, Gas, Nivel de dulce) se
            abren para QUITAR algo, y pintarlos del naranja de acción diría lo contrario. Es la
            misma condición que decide el rótulo unas líneas abajo, no un criterio nuevo.

            El `border` está en la parte común y el caso gratis lo neutraliza en transparente,
            para que las dos variantes queden alineadas al píxel al apilarse. */}
        <button
          type="button"
          onClick={onToggleExpandir}
          className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-semibold text-cafe ${
            cobra
              ? "border-naranja bg-naranja/10"
              : "border-transparent bg-crema-oscura/50"
          }`}
        >
          {/* El mismo texto abierto y cerrado: quien lo lee ya sabe qué hay dentro, y el estado
              lo dice el chevron. Antes cambiaba entre dos frases distintas.

              `etiquetaCorta` recorta el "Agregar más " que traen las etiquetas de los enganches
              adicionales, que era lo que producía "+ Agregar más agregar más toppings". Es la
              misma función con la que el panel dice "Toppings" en el detalle del pedido, así que
              la carta y el panel nombran el grupo igual — y da lo mismo si el enganche tiene
              etiqueta propia o cae al nombre del grupo.

              Y "adicionales" solo se dice si de verdad se cobra algo: este mismo modo sostiene
              los grupos opcionales gratis (Azúcar y canela), donde anunciar un adicional sería
              al revés de lo que hay dentro — quien abre "Azúcar y canela" es para quitarla. */}
          <span>
            {cobra
              ? `+ Agregar ${etiquetaCorta(enganche.nombreGrupo).toLowerCase()} adicionales`
              : etiquetaCorta(enganche.nombreGrupo)}
          </span>
          {/* El acento que remata la caja. Hereda el café del botón salvo cuando hay algo que
              agregar, y es el sitio donde el naranja sí puede ir sin tocar el texto. */}
          <ChevronDown
            className={`size-4 transition-transform ${cobra ? "text-naranja" : ""} ${expandido ? "rotate-180" : ""}`}
          />
        </button>
        {/* Alineado con el `px-3` del botón de arriba, para que se lea como su subtítulo. */}
        {ayuda && <div className="mt-1 px-3">{ayuda}</div>}
        {expandido && <div className="mt-2">{opciones}</div>}
      </div>
    );
  }

  return (
    <div>
      <div
        className={`flex items-center justify-between ${compacto ? "mb-1.5" : "mb-2"}`}
      >
        <h4
          className={
            compacto
              ? "font-cuerpo text-sm font-bold text-cafe"
              : "font-titulo text-base font-semibold text-cafe"
          }
        >
          {enganche.nombreGrupo}
          {esRequerido && <span className="text-error"> *</span>}
        </h4>
        {/* En una casilla no hay nada que completar, y un "0 de 1" al lado de una pregunta se lee
            como una tarea pendiente. */}
        {!esCasilla(enganche) && (
          <span
            className={`${compacto ? "text-[11px]" : "text-xs"} ${
              faltan > 0 ? "font-bold text-alerta" : "text-cafe-tenue"
            }`}
          >
            {recibidas} de {enganche.maxSelect}
          </span>
        )}
      </div>
      {/* Pegado al título: el `mb` del bloque de arriba ya separó, así que aquí se recupera. */}
      {ayuda && <div className={compacto ? "-mt-1 mb-1.5" : "-mt-1 mb-2"}>{ayuda}</div>}
      {opciones}
      {faltan > 0 && (
        <p
          className={`mt-2 rounded-sm bg-alerta/12 text-alerta ${
            compacto ? "px-2 py-1 text-[11px]" : "px-3 py-2 text-xs"
          }`}
        >
          {agotadoEntero ? (
            <>Hoy no hay {enganche.nombreGrupo.toLowerCase()}.</>
          ) : esVariante(enganche) ? (
            // Un tamaño NO viene incluido en el precio: lo pone. Decirle a alguien que su
            // "Mediano $8.000" ya está pagado dentro de un producto que vale $0 de base es
            // justo al revés de lo que va a pasar en la caja.
            <>
              Te {faltan === 1 ? "falta" : "faltan"} {faltan} por elegir. El precio depende de{" "}
              {faltan === 1 ? "cuál elijas" : "cuáles elijas"}.
            </>
          ) : (
            <>
              Te {faltan === 1 ? "falta" : "faltan"} {faltan} por elegir. Ya{" "}
              {faltan === 1 ? "viene incluida" : "vienen incluidas"} en el
              precio.
            </>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * Algo sugerido al final de la ficha: una bebida, una porción de helado. Al elegirlo se
 * despliegan sus propias opciones (gas, sabor, tamaño) aquí mismo: si viajara al carrito sin
 * ellas, el servidor rechazaría el pedido en el checkout, donde el cliente ya no puede
 * reconfigurarlo.
 */
function FilaUpsell({
  enganche,
  bebida,
  cantidad,
  seleccionBebida,
  onToggle,
  onCambiarCantidad,
  onToggleOpcionBebida,
  onCambiarCantidadBebida,
}: {
  enganche: EngancheParaFicha;
  /** El nombre y el precio salen del producto real, no de la opción: es lo que se cobra. */
  bebida: ProductoUpsellRef;
  cantidad: number;
  seleccionBebida: SeleccionesPorGrupo;
  onToggle: () => void;
  onCambiarCantidad: (delta: number) => void;
  onToggleOpcionBebida: (enganche: EngancheParaFicha, opcionId: string) => void;
  onCambiarCantidadBebida: (
    enganche: EngancheParaFicha,
    opcionId: string,
    delta: number,
  ) => void;
}) {
  const elegida = cantidad > 0;
  // Los grupos upsell de una bebida no se pintan (invariante: llevan minSelect 0).
  const gruposBebida = bebida.engancles.filter((e) => e.tipo === "seleccion");
  // El precio de aquí NO es `precioBase`: la porción de helado vale $0 de base y lleva el
  // precio entero en cada tamaño, así que pintarlo a secas ofrecía un helado por $0.
  const { minimo, hayRango } = precioDesde(bebida);
  // Mismo pliegue que en la ficha propia del producto, y por el mismo motivo: el helado trae
  // catorce toppings adicionales, y expandidos aquí dentro sepultan el resto del churro. Nace
  // como diga su `colapsado`, igual que arriba.
  const [expandido, setExpandido] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(gruposBebida.map((g) => [g.id, !g.colapsado])),
  );

  return (
    <div className="rounded-md border border-crema-oscura">
      <div className="flex items-center gap-3 p-2">
        <div className="relative size-12 shrink-0 overflow-hidden rounded-sm bg-crema-oscura">
          {bebida.imagen && (
            <Image
              src={bebida.imagen}
              alt=""
              fill
              sizes="48px"
              className="object-cover"
            />
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-cafe">{bebida.nombre}</p>
          <p className="text-xs text-cafe-suave">
            {hayRango && <span className="mr-1">desde</span>}
            {pesos(minimo)}
          </p>
        </div>
        {enganche.permiteCantidad ? (
          <StepperCantidad valor={cantidad} onCambiar={onCambiarCantidad} />
        ) : (
          <button
            type="button"
            onClick={onToggle}
            className={`min-h-11 rounded-full px-4 text-sm font-bold ${
              elegida
                ? "bg-crema-oscura text-cafe"
                : "bg-naranja text-crema hover:bg-naranja-osc"
            }`}
          >
            {elegida ? "Quitar" : "Agregar"}
          </button>
        )}
      </div>

      {/* Sangría, no tarjeta anidada: a 360px un doble padding deja las opciones sin aire. */}
      {elegida && gruposBebida.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-crema-oscura py-2 pl-4 pr-2">
          {gruposBebida.map((grupoBebida) => (
            <GrupoEnganche
              key={grupoBebida.id}
              compacto
              enganche={grupoBebida}
              seleccion={seleccionBebida[grupoBebida.id] ?? {}}
              // Mismo criterio que arriba: un tamaño es obligatorio y no se puede plegar, o el
              // cliente no vería por qué el botón no lo deja añadir.
              plegable={sePliega(grupoBebida)}
              expandido={!!expandido[grupoBebida.id]}
              onToggleExpandir={() =>
                setExpandido((prev) => ({
                  ...prev,
                  [grupoBebida.id]: !prev[grupoBebida.id],
                }))
              }
              onToggleOpcion={(opcionId) =>
                onToggleOpcionBebida(grupoBebida, opcionId)
              }
              onCambiarCantidad={(opcionId, delta) =>
                onCambiarCantidadBebida(grupoBebida, opcionId, delta)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ProductoFicha({
  productId,
  onClose,
}: {
  productId: string;
  onClose: () => void;
}) {
  const [producto, setProducto] = useState<ProductoParaFicha | null>(null);
  const [error, setError] = useState(false);
  const [cantidad, setCantidad] = useState(1);
  const [selecciones, setSelecciones] = useState<SeleccionesPorGrupo>({});
  // Lo que el cliente eligió DENTRO de cada bebida del upsell, por id del producto real
  // (no del modifierOption): es la llave con la que `calcularItem` devuelve los upsells.
  //
  // Al quitar una bebida su entrada NO se borra, a propósito: todo lo que se envía se
  // deriva de `resultado.valor.upsells`, que solo trae las de cantidad > 0. Así, si el
  // cliente la vuelve a agregar, no pierde lo que ya había elegido.
  const [seleccionesUpsell, setSeleccionesUpsell] = useState<
    Record<string, SeleccionesPorGrupo>
  >({});
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});
  /**
   * Grupos incluidos que ya se completaron y se muestran como una línea de resumen.
   *
   * **Se guarda "contraído" y no "expandido" a propósito**, y eso resuelve solo el ciclo de
   * corrección: solo se pone a `true` al completar el grupo, y a `false` al tocar el resumen. Si
   * el cliente reabre y quita una opción, nada lo vuelve a cerrar —correcto, ahora está incompleto
   * y el aviso de "te falta 1" tiene que verse— y al volver a elegir se contrae otra vez. Con la
   * lógica al revés haría falta un efecto vigilando la selección.
   */
  const [plegados, setPlegados] = useState<Record<string, boolean>>({});

  const agregarConfigurado = useCarrito((s) => s.agregarConfigurado);
  const tipoPedido = useTipoPedido();

  useEffect(() => {
    let cancelado = false;
    // Si `ProductCard` ya precargó este producto (al montarse la tarjeta),
    // esta promesa ya está resuelta o a punto de resolverse — la ficha
    // aparece con los datos listos en vez de esperar un fetch nuevo.
    precargarProducto(productId)
      .then((data) => {
        if (cancelado) return;
        setProducto(data);
        setExpandido(
          Object.fromEntries(
            data.engancles
              .filter((e) => e.modo === "adicional")
              .map((e) => [e.id, !e.colapsado]),
          ),
        );
      })
      .catch(() => !cancelado && setError(true));
    return () => {
      cancelado = true;
    };
  }, [productId]);

  const resultado = useMemo(() => {
    if (!producto) return null;
    return calcularItem(
      producto,
      {
        productId: producto.id,
        cantidad,
        seleccion: construirSeleccion(selecciones),
        notas: null,
      },
      tipoPedido ?? undefined,
    );
  }, [producto, cantidad, selecciones, tipoPedido]);

  /**
   * Cada bebida elegida, cotizada con el MISMO motor que usará el servidor. De aquí sale
   * el precio del botón, lo que se guarda en el carrito y el bloqueo por opciones que
   * falten: no hay una segunda versión de las reglas viviendo en la UI (regla 1).
   */
  const calculosBebida = useMemo(() => {
    if (!producto || !resultado?.ok) return [];

    const seleccionesPorBebida = Object.fromEntries(
      Object.entries(seleccionesUpsell).map(([refId, grupos]) => [
        refId,
        construirSeleccion(grupos),
      ]),
    );

    return bebidasElegidas(
      resultado.valor.upsells,
      producto.productosUpsell,
      seleccionesPorBebida,
    ).map((bebida) => ({
      bebida,
      resultado: calcularItem(
        bebida.producto,
        {
          productId: bebida.producto.id,
          cantidad: bebida.cantidad,
          seleccion: bebida.seleccion,
          notas: null,
        },
        tipoPedido ?? undefined,
      ),
    }));
  }, [producto, resultado, seleccionesUpsell, tipoPedido]);

  /**
   * Guarda la selección de un grupo y lo contrae si con eso quedó completo.
   *
   * La selección nueva se calcula **fuera** del updater, al revés que antes, porque hace falta
   * conocerla dos veces: para guardarla y para decidir si el grupo se cierra. Es seguro aquí
   * porque esto solo lo llaman manejadores de clic: entre dos toques React ya volvió a renderizar,
   * así que `selecciones` no puede estar viejo. La alternativa —llamar a `setPlegados` dentro del
   * updater— metería un efecto en una función que debe ser pura.
   */
  function aplicarEnGrupo(
    enganche: EngancheParaFicha,
    calcular: (actual: Record<string, number>) => Record<string, number>,
  ) {
    const nueva = calcular(selecciones[enganche.id] ?? {});

    setSelecciones((prev) => ({ ...prev, [enganche.id]: nueva }));

    // El criterio es "ya no cabe nada más". Por la regla 4 los incluidos tienen min === max, así
    // que hoy equivale a "cumplió el mínimo"; si algún día hubiera un "elige hasta 3, mínimo 1",
    // habría que decidir cuál de las dos cosas se quiere.
    //
    // **Una casilla nunca se contrae**: desaparecería en el mismo toque que la marca, y
    // desmarcarla costaría dos. El resumen de una línea ahorra espacio cuando hay una lista
    // debajo; con una sola opción no ahorra nada y esconde el check recién puesto.
    const suma = Object.values(nueva).reduce((n, c) => n + c, 0);
    if (suma >= enganche.maxSelect && !esCasilla(enganche)) {
      setPlegados((prev) => ({ ...prev, [enganche.id]: true }));
    }
  }

  function toggleOpcion(enganche: EngancheParaFicha, opcionId: string) {
    aplicarEnGrupo(enganche, (actual) =>
      toggleEnGrupo(actual, enganche, opcionId),
    );
  }

  function cambiarCantidadOpcion(
    enganche: EngancheParaFicha,
    opcionId: string,
    delta: number,
  ) {
    aplicarEnGrupo(enganche, (actual) =>
      cantidadEnGrupo(actual, enganche, opcionId, delta),
    );
  }

  // Mismos gestos, un nivel más adentro: la selección de cada bebida del upsell.
  function toggleOpcionBebida(
    refId: string,
    enganche: EngancheParaFicha,
    opcionId: string,
  ) {
    setSeleccionesUpsell((prev) => {
      const grupos = prev[refId] ?? {};
      return {
        ...prev,
        [refId]: {
          ...grupos,
          [enganche.id]: toggleEnGrupo(
            grupos[enganche.id] ?? {},
            enganche,
            opcionId,
          ),
        },
      };
    });
  }

  function cambiarCantidadOpcionBebida(
    refId: string,
    enganche: EngancheParaFicha,
    opcionId: string,
    delta: number,
  ) {
    setSeleccionesUpsell((prev) => {
      const grupos = prev[refId] ?? {};
      return {
        ...prev,
        [refId]: {
          ...grupos,
          [enganche.id]: cantidadEnGrupo(
            grupos[enganche.id] ?? {},
            enganche,
            opcionId,
            delta,
          ),
        },
      };
    });
  }

  function agregarAlCarrito() {
    if (!producto || !resultado?.ok) return;

    agregarConfigurado({
      productoId: producto.id,
      nombre: producto.nombre,
      precioBase: producto.precioBase,
      // Viajan al carrito para poder retirar la línea si el cliente cambia de canal.
      disponibleDelivery: producto.disponibleDelivery,
      disponiblePickup: producto.disponiblePickup,
      precioUnitarioEstimado: resultado.valor.base.precioUnitario,
      cantidad: resultado.valor.base.cantidad,
      // Los upsells NO viajan en la selección de la línea base: van como líneas
      // propias, justo abajo (regla 8). Si fueran en los dos sitios, el checkout
      // mandaría ambos al servidor y la bebida se cobraría dos veces.
      seleccion: seleccionSinUpsells(
        construirSeleccion(selecciones),
        producto.engancles,
      ),
      modificadores: resultado.valor.base.modificadores,
      avisos: resultado.valor.base.avisos,
      notas: null,
    });

    // Cada bebida entra como línea propia con SU selección (regla 8). Los datos salen de
    // `calcularItem` sobre la bebida, así que el nombre, el precio y los modificadores
    // son los del producto real y coinciden con lo que cobrará el servidor.
    for (const { bebida, resultado: calculo } of calculosBebida) {
      if (!calculo.ok) continue;
      agregarConfigurado({
        productoId: bebida.producto.id,
        nombre: bebida.producto.nombre,
        precioBase: bebida.producto.precioBase,
        // Los suyos, no los del churro: una bebida puede venderse por canales distintos que el
        // producto desde el que se añadió, y como línea propia se retira por su cuenta.
        disponibleDelivery: bebida.producto.disponibleDelivery,
        disponiblePickup: bebida.producto.disponiblePickup,
        precioUnitarioEstimado: calculo.valor.base.precioUnitario,
        cantidad: bebida.cantidad,
        seleccion: bebida.seleccion,
        modificadores: calculo.valor.base.modificadores,
        avisos: calculo.valor.base.avisos,
        notas: null,
      });
    }

    onClose();
  }

  const enganclesSeleccion =
    producto?.engancles.filter((e) => e.tipo === "seleccion") ?? [];
  const enganclesUpsell =
    producto?.engancles.filter((e) => e.tipo === "upsell") ?? [];

  // Se puede añadir solo si el producto Y todas sus bebidas están completos: una bebida
  // a medias produciría un 422 en el checkout, donde ya no se puede reconfigurar.
  const todoOk =
    Boolean(resultado?.ok) && calculosBebida.every((c) => c.resultado.ok);

  const precioTotal =
    resultado?.ok && todoOk
      ? resultado.valor.base.subtotal +
        calculosBebida.reduce(
          (n, c) => n + (c.resultado.ok ? c.resultado.valor.base.subtotal : 0),
          0,
        )
      : null;

  // Qué le falta al cliente, para que el botón bloqueado diga el motivo en vez de un
  // "Elige las opciones" que no dice cuál grupo está pendiente.
  const pendientes = producto
    ? pendientesDeFicha(
        producto,
        construirSeleccion(selecciones),
        calculosBebida.map((c) => c.bebida),
      )
    : [];

  // Si se agotó un grupo entero, "Elige salsas" sería una instrucción imposible: no queda
  // ninguna que elegir. Gana sobre el resto de textos porque no hay nada que el cliente pueda
  // hacer aquí.
  const impedible = enganclesSeleccion.some(sinNadaQueElegir);

  const textoBoton = impedible
    ? "No disponible por ahora"
    : precioTotal !== null
      ? `Añadir ${pesos(precioTotal)}`
      : pendientes.length > 0
        ? pendientes[0].nombreProducto
          ? `Elige ${pendientes[0].nombreGrupo.toLowerCase()} de ${pendientes[0].nombreProducto}`
          : `Elige ${pendientes[0].nombreGrupo.toLowerCase()}`
        : "Elige las opciones";

  if (error) {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-cafe/40"
          aria-hidden
        />
        <div className="fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-[520px] flex-col items-center gap-3 rounded-t-lg bg-tarjeta p-8 text-center shadow-modal lg:inset-0 lg:m-auto lg:h-fit lg:max-w-sm lg:rounded-lg">
          <p className="text-sm text-cafe-suave">
            No pudimos cargar este producto.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-bold text-naranja"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  if (!producto) {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-cafe/40"
          aria-hidden
        />
        <div className="fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-[520px] items-center justify-center rounded-t-lg bg-tarjeta p-16 shadow-modal lg:inset-0 lg:m-auto lg:h-fit lg:max-w-sm lg:rounded-lg">
          <span className="font-titulo text-sm text-cafe-tenue">
            Cargando...
          </span>
        </div>
      </div>
    );
  }

  // Contenido de fotos: cada layout define su propio tamaño de contenedor.
  const carrusel = (
    producto.imagenes.length > 0 ? producto.imagenes : [null]
  ).map((foto, i) => (
    <div
      key={i}
      className="relative h-full w-full shrink-0 snap-center bg-crema-oscura"
    >
      {foto ? (
        <Image
          src={foto}
          alt={producto.nombre}
          fill
          sizes="520px"
          className="object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-cafe-tenue">
          <span className="font-titulo text-sm">Cronchy</span>
        </div>
      )}
    </div>
  ));

  // Nombre, descripción y grupos: igual en ambos layouts, solo cambia el
  // contenedor de scroll que lo envuelve.
  const infoContenido = (
    <>
      <h2 className="font-titulo text-xl font-semibold text-cafe">
        {producto.nombre}
      </h2>
      {producto.descripcion && (
        <p className="mt-1 text-sm text-cafe-suave">{producto.descripcion}</p>
      )}

      <div className="mt-4 flex flex-col gap-5">
        {/* Un tamaño y una casilla van en modo 'adicional' —es la única forma de que el precio
            cuente— pero ninguno de los dos es un extra: el tamaño hay que elegirlo para poder
            añadir el producto, y la casilla es la pregunta entera. Por eso `sePliega` los excluye
            y se pintan abiertos, en vez de como un "+ Agregar tamaño adicionales" que además
            sería absurdo de leer. El tamaño, al elegirlo, se contrae a su línea de resumen igual
            que las salsas; la casilla no (ver `aplicarEnGrupo`). */}
        {enganclesSeleccion.map((enganche) => (
          <GrupoEnganche
            key={enganche.id}
            enganche={enganche}
            seleccion={selecciones[enganche.id] ?? {}}
            plegable={sePliega(enganche)}
            expandido={enganche.modo === "incluido" || !!expandido[enganche.id]}
            plegado={!!plegados[enganche.id]}
            onExpandir={() =>
              setPlegados((prev) => ({ ...prev, [enganche.id]: false }))
            }
            onToggleExpandir={() =>
              setExpandido((prev) => ({
                ...prev,
                [enganche.id]: !prev[enganche.id],
              }))
            }
            onToggleOpcion={(opcionId) => toggleOpcion(enganche, opcionId)}
            onCambiarCantidad={(opcionId, delta) =>
              cambiarCantidadOpcion(enganche, opcionId, delta)
            }
          />
        ))}

        {enganclesUpsell.map((enganche) => {
          // Sugerir algo que no se puede comprar es fricción pura: aquí se oculta en vez
          // de mostrarse "agotado" como en la tarjeta del menú. No se borra nada — la
          // opción sigue en la tabla y el admin la reactiva con un switch (regla 9).
          const ofrecibles = enganche.opciones.filter((opcion) => {
            if (!opcion.disponible || !opcion.productoRef) return false;
            const ref = producto.productosUpsell[opcion.productoRef];
            if (!ref || !ref.activo || !ref.disponible) return false;
            if (tipoPedido === "domicilio" && !ref.disponibleDelivery)
              return false;
            if (tipoPedido === "recoger" && !ref.disponiblePickup) return false;
            return true;
          });

          if (ofrecibles.length === 0) return null;

          return (
            <div key={enganche.id}>
              <h3 className="font-titulo text-base font-semibold text-cafe">
                {enganche.nombreGrupo}
              </h3>
              <div className="mt-2 flex flex-col gap-2">
                {ofrecibles.map((opcion) => (
                  <FilaUpsell
                    key={opcion.id}
                    enganche={enganche}
                    bebida={producto.productosUpsell[opcion.productoRef!]}
                    cantidad={selecciones[enganche.id]?.[opcion.id] ?? 0}
                    seleccionBebida={
                      seleccionesUpsell[opcion.productoRef!] ?? {}
                    }
                    onToggle={() => toggleOpcion(enganche, opcion.id)}
                    onCambiarCantidad={(delta) =>
                      cambiarCantidadOpcion(enganche, opcion.id, delta)
                    }
                    onToggleOpcionBebida={(e, opcionId) =>
                      toggleOpcionBebida(opcion.productoRef!, e, opcionId)
                    }
                    onCambiarCantidadBebida={(e, opcionId, delta) =>
                      cambiarCantidadOpcionBebida(
                        opcion.productoRef!,
                        e,
                        opcionId,
                        delta,
                      )
                    }
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );

  const barraInferior = (
    <div className="flex shrink-0 items-center gap-3 border-t border-crema-oscura px-5 py-4">
      <StepperCantidad
        valor={cantidad}
        onCambiar={(d) => setCantidad((c) => Math.max(1, c + d))}
        min={1}
      />
      <button
        type="button"
        onClick={agregarAlCarrito}
        // `todoOk` y no `resultado.ok`: este último solo mira el churro. Con una bebida de
        // upsell a medio configurar el botón se habilitaba, `agregarAlCarrito` la
        // descartaba en silencio y el cliente terminaba pagando menos de lo que creía pedir.
        disabled={!todoOk}
        className="flex-1 rounded-full bg-naranja px-4 py-3 font-cuerpo text-sm font-bold text-crema transition-colors hover:bg-naranja-osc disabled:pointer-events-none disabled:opacity-40"
      >
        {textoBoton}
      </button>
    </div>
  );

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-cafe/40"
        aria-hidden
      />
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[92vh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-lg bg-tarjeta shadow-modal lg:inset-0 lg:m-auto lg:h-[85vh] lg:max-h-[760px] lg:max-w-4xl lg:flex-row lg:rounded-lg">
        {/* Mobile: la foto vive fija en este contenedor (que nunca hace scroll);
            el panel de info es una capa aparte encima, con su propio scroll —
            por eso su contenido sube y tapa la foto al hacer scroll down. */}
        <div className="relative flex-1 overflow-hidden lg:hidden">
          <div className="absolute inset-x-0 top-0 flex h-72 snap-x snap-mandatory overflow-x-auto">
            {carrusel}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute top-3 right-3 z-20 flex size-8 items-center justify-center rounded-full bg-cafe/60 text-crema backdrop-blur-sm"
          >
            <X className="size-4" />
          </button>

          <div className="absolute inset-0 overflow-y-auto">
            <div className="h-72" aria-hidden />
            <div className="relative rounded-t-lg bg-tarjeta px-5 py-4">
              {infoContenido}
            </div>
          </div>
        </div>

        {/* Desktop: dos columnas normales, lado a lado, sin superposición —
            la foto no necesita scroll propio, la info sí. */}
        <div className="hidden flex-1 overflow-hidden lg:flex">
          <div className="relative flex h-full w-[45%] shrink-0 snap-x snap-mandatory overflow-x-auto">
            {carrusel}
          </div>
          <div className="relative flex-1 overflow-y-auto bg-tarjeta px-6 py-5">
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="absolute top-4 right-4 z-10 flex size-8 items-center justify-center rounded-full text-cafe hover:bg-crema-oscura"
            >
              <X className="size-4" />
            </button>
            {infoContenido}
          </div>
        </div>

        {barraInferior}
      </div>
    </div>
  );
}
