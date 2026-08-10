"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ChevronDown, Minus, Plus, X } from "lucide-react";
import { pesos } from "@/lib/notificaciones/plantillas";
import { useCarrito } from "@/lib/carrito";
import { useTipoPedido } from "@/lib/tienda/tipo-pedido";
import { precargarProducto } from "@/lib/tienda/productos-cache";
import { calcularItem, precioEfectivoOpcion } from "@/lib/precios-calculo";
import { bebidasElegidas, pendientesDeFicha, seleccionSinUpsells } from "@/lib/checkout/mapeo";
import type { SeleccionEnganche } from "@/lib/precios-calculo";
import type {
  EngancheParaFicha,
  OpcionParaFicha,
  ProductoParaFicha,
  ProductoUpsellRef,
} from "@/db/queries/productos";

type SeleccionesPorGrupo = Record<string, Record<string, number>>;

function construirSeleccion(selecciones: SeleccionesPorGrupo): SeleccionEnganche[] {
  return Object.entries(selecciones)
    .map(([productModifierGroupId, opciones]) => ({
      productModifierGroupId,
      opciones: Object.entries(opciones)
        .filter(([, cantidad]) => cantidad > 0)
        .map(([modifierOptionId, cantidad]) => ({ modifierOptionId, cantidad })),
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
  const tope = Math.min(maxPorOpcion, enganche.maxSelect - (suma - cantidadActual));
  const nueva = Math.max(0, Math.min(tope, cantidadActual + delta));

  return nueva > 0 ? { ...actual, [opcionId]: nueva } : sinOpcion(actual, opcionId);
}

function sinOpcion(seleccion: Record<string, number>, opcionId: string): Record<string, number> {
  return Object.fromEntries(Object.entries(seleccion).filter(([id]) => id !== opcionId));
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
      <span className="min-w-[16px] text-center text-sm font-bold text-cafe">{valor}</span>
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

  return (
    // min-h-11: DESIGN §7 exige 44px mínimo en todo lo tocable.
    //
    // La atenuación va en la FILA y no en el botón del nombre: ahí dejaba el nombre en gris
    // con el stepper de al lado a todo color, que es exactamente lo que hacía pensar que la
    // cantidad sí se podía subir.
    <div
      className={`flex min-h-11 items-center gap-3 rounded-md border border-crema-oscura px-3 py-2 ${
        opcion.disponible ? "" : "opacity-40"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={!opcion.disponible}
        className="flex flex-1 items-center justify-between gap-2 self-stretch text-left"
      >
        <span className={`text-sm font-medium ${seleccionada ? "text-naranja" : "text-cafe"}`}>
          {opcion.nombre}
          {!opcion.disponible && " (agotado)"}
        </span>
        {precio > 0 && <span className="text-xs text-cafe-suave">+{pesos(precio)}</span>}
      </button>
      {enganche.permiteCantidad ? (
        <StepperCantidad
          valor={cantidad}
          onCambiar={onCambiarCantidad}
          deshabilitado={!opcion.disponible}
        />
      ) : (
        <span
          className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${
            seleccionada ? "border-naranja bg-naranja" : "border-crema-oscura"
          }`}
        >
          {seleccionada && <span className="size-2 rounded-full bg-crema" />}
        </span>
      )}
    </div>
  );
}

function GrupoEnganche({
  enganche,
  seleccion,
  plegable = false,
  expandido = false,
  onToggleExpandir,
  onToggleOpcion,
  onCambiarCantidad,
  compacto = false,
}: {
  enganche: EngancheParaFicha;
  seleccion: Record<string, number>;
  plegable?: boolean;
  expandido?: boolean;
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
  const faltan = enganche.avisarIncompleto ? 0 : Math.max(0, enganche.minSelect - recibidas);
  const agotadoEntero = sinNadaQueElegir(enganche);

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

  if (plegable) {
    return (
      <div>
        <button
          type="button"
          onClick={onToggleExpandir}
          className="flex w-full items-center justify-between rounded-md bg-crema-oscura/50 px-3 py-2 text-sm font-semibold text-cafe"
        >
          <span>{expandido ? enganche.nombreGrupo : `+ Agregar más ${enganche.nombreGrupo.toLowerCase()}`}</span>
          <ChevronDown className={`size-4 transition-transform ${expandido ? "rotate-180" : ""}`} />
        </button>
        {expandido && <div className="mt-2">{opciones}</div>}
      </div>
    );
  }

  return (
    <div>
      <div className={`flex items-center justify-between ${compacto ? "mb-1.5" : "mb-2"}`}>
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
        <span
          className={`${compacto ? "text-[11px]" : "text-xs"} ${
            faltan > 0 ? "font-bold text-alerta" : "text-cafe-tenue"
          }`}
        >
          {recibidas} de {enganche.maxSelect}
        </span>
      </div>
      {opciones}
      {faltan > 0 && (
        <p
          className={`mt-2 rounded-sm bg-alerta/12 text-alerta ${
            compacto ? "px-2 py-1 text-[11px]" : "px-3 py-2 text-xs"
          }`}
        >
          {agotadoEntero ? (
            <>Hoy no hay {enganche.nombreGrupo.toLowerCase()}.</>
          ) : (
            <>
              Te {faltan === 1 ? "falta" : "faltan"} {faltan} por elegir. Ya{" "}
              {faltan === 1 ? "viene incluida" : "vienen incluidas"} en el precio.
            </>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * Una bebida sugerida. Al elegirla se despliegan sus propias opciones (gas, sabor,
 * dulzor) aquí mismo: si viajara al carrito sin ellas, el servidor rechazaría el pedido
 * en el checkout, donde el cliente ya no puede reconfigurarla.
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
  onCambiarCantidadBebida: (enganche: EngancheParaFicha, opcionId: string, delta: number) => void;
}) {
  const elegida = cantidad > 0;
  // Los grupos upsell de una bebida no se pintan (invariante: llevan minSelect 0).
  const gruposBebida = bebida.engancles.filter((e) => e.tipo === "seleccion");

  return (
    <div className="rounded-md border border-crema-oscura">
      <div className="flex items-center gap-3 p-2">
        <div className="relative size-12 shrink-0 overflow-hidden rounded-sm bg-crema-oscura">
          {bebida.imagen && (
            <Image src={bebida.imagen} alt="" fill sizes="48px" className="object-cover" />
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-cafe">{bebida.nombre}</p>
          <p className="text-xs text-cafe-suave">{pesos(bebida.precioBase)}</p>
        </div>
        {enganche.permiteCantidad ? (
          <StepperCantidad valor={cantidad} onCambiar={onCambiarCantidad} />
        ) : (
          <button
            type="button"
            onClick={onToggle}
            className={`min-h-11 rounded-full px-4 text-sm font-bold ${
              elegida ? "bg-crema-oscura text-cafe" : "bg-naranja text-crema hover:bg-naranja-osc"
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
              onToggleOpcion={(opcionId) => onToggleOpcionBebida(grupoBebida, opcionId)}
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

export function ProductoFicha({ productId, onClose }: { productId: string; onClose: () => void }) {
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
  const [seleccionesUpsell, setSeleccionesUpsell] = useState<Record<string, SeleccionesPorGrupo>>({});
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});

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
      { productId: producto.id, cantidad, seleccion: construirSeleccion(selecciones), notas: null },
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
      Object.entries(seleccionesUpsell).map(([refId, grupos]) => [refId, construirSeleccion(grupos)]),
    );

    return bebidasElegidas(resultado.valor.upsells, producto.productosUpsell, seleccionesPorBebida).map(
      (bebida) => ({
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
      }),
    );
  }, [producto, resultado, seleccionesUpsell, tipoPedido]);

  function toggleOpcion(enganche: EngancheParaFicha, opcionId: string) {
    setSelecciones((prev) => ({
      ...prev,
      [enganche.id]: toggleEnGrupo(prev[enganche.id] ?? {}, enganche, opcionId),
    }));
  }

  function cambiarCantidadOpcion(enganche: EngancheParaFicha, opcionId: string, delta: number) {
    setSelecciones((prev) => ({
      ...prev,
      [enganche.id]: cantidadEnGrupo(prev[enganche.id] ?? {}, enganche, opcionId, delta),
    }));
  }

  // Mismos gestos, un nivel más adentro: la selección de cada bebida del upsell.
  function toggleOpcionBebida(refId: string, enganche: EngancheParaFicha, opcionId: string) {
    setSeleccionesUpsell((prev) => {
      const grupos = prev[refId] ?? {};
      return {
        ...prev,
        [refId]: { ...grupos, [enganche.id]: toggleEnGrupo(grupos[enganche.id] ?? {}, enganche, opcionId) },
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
          [enganche.id]: cantidadEnGrupo(grupos[enganche.id] ?? {}, enganche, opcionId, delta),
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
      precioUnitarioEstimado: resultado.valor.base.precioUnitario,
      cantidad: resultado.valor.base.cantidad,
      // Los upsells NO viajan en la selección de la línea base: van como líneas
      // propias, justo abajo (regla 8). Si fueran en los dos sitios, el checkout
      // mandaría ambos al servidor y la bebida se cobraría dos veces.
      seleccion: seleccionSinUpsells(construirSeleccion(selecciones), producto.engancles),
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

  const enganclesSeleccion = producto?.engancles.filter((e) => e.tipo === "seleccion") ?? [];
  const enganclesUpsell = producto?.engancles.filter((e) => e.tipo === "upsell") ?? [];

  // Se puede añadir solo si el producto Y todas sus bebidas están completos: una bebida
  // a medias produciría un 422 en el checkout, donde ya no se puede reconfigurar.
  const todoOk = Boolean(resultado?.ok) && calculosBebida.every((c) => c.resultado.ok);

  const precioTotal =
    resultado?.ok && todoOk
      ? resultado.valor.base.subtotal +
        calculosBebida.reduce((n, c) => n + (c.resultado.ok ? c.resultado.valor.base.subtotal : 0), 0)
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
        <div onClick={onClose} className="fixed inset-0 z-40 bg-cafe/40" aria-hidden />
        <div className="fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-[520px] flex-col items-center gap-3 rounded-t-lg bg-tarjeta p-8 text-center shadow-modal lg:inset-0 lg:m-auto lg:h-fit lg:max-w-sm lg:rounded-lg">
          <p className="text-sm text-cafe-suave">No pudimos cargar este producto.</p>
          <button type="button" onClick={onClose} className="text-sm font-bold text-naranja">
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  if (!producto) {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <div onClick={onClose} className="fixed inset-0 z-40 bg-cafe/40" aria-hidden />
        <div className="fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-[520px] items-center justify-center rounded-t-lg bg-tarjeta p-16 shadow-modal lg:inset-0 lg:m-auto lg:h-fit lg:max-w-sm lg:rounded-lg">
          <span className="font-titulo text-sm text-cafe-tenue">Cargando...</span>
        </div>
      </div>
    );
  }

  // Contenido de fotos: cada layout define su propio tamaño de contenedor.
  const carrusel = (producto.imagenes.length > 0 ? producto.imagenes : [null]).map((foto, i) => (
    <div key={i} className="relative h-full w-full shrink-0 snap-center bg-crema-oscura">
      {foto ? (
        <Image src={foto} alt={producto.nombre} fill sizes="520px" className="object-cover" />
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
      <h2 className="font-titulo text-xl font-semibold text-cafe">{producto.nombre}</h2>
      {producto.descripcion && <p className="mt-1 text-sm text-cafe-suave">{producto.descripcion}</p>}

      <div className="mt-4 flex flex-col gap-5">
        {enganclesSeleccion.map((enganche) => (
          <GrupoEnganche
            key={enganche.id}
            enganche={enganche}
            seleccion={selecciones[enganche.id] ?? {}}
            plegable={enganche.modo === "adicional"}
            expandido={enganche.modo === "incluido" || !!expandido[enganche.id]}
            onToggleExpandir={() => setExpandido((prev) => ({ ...prev, [enganche.id]: !prev[enganche.id] }))}
            onToggleOpcion={(opcionId) => toggleOpcion(enganche, opcionId)}
            onCambiarCantidad={(opcionId, delta) => cambiarCantidadOpcion(enganche, opcionId, delta)}
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
            if (tipoPedido === "domicilio" && !ref.disponibleDelivery) return false;
            if (tipoPedido === "recoger" && !ref.disponiblePickup) return false;
            return true;
          });

          if (ofrecibles.length === 0) return null;

          return (
            <div key={enganche.id}>
              <h3 className="font-titulo text-base font-semibold text-cafe">{enganche.nombreGrupo}</h3>
              <div className="mt-2 flex flex-col gap-2">
                {ofrecibles.map((opcion) => (
                  <FilaUpsell
                    key={opcion.id}
                    enganche={enganche}
                    bebida={producto.productosUpsell[opcion.productoRef!]}
                    cantidad={selecciones[enganche.id]?.[opcion.id] ?? 0}
                    seleccionBebida={seleccionesUpsell[opcion.productoRef!] ?? {}}
                    onToggle={() => toggleOpcion(enganche, opcion.id)}
                    onCambiarCantidad={(delta) => cambiarCantidadOpcion(enganche, opcion.id, delta)}
                    onToggleOpcionBebida={(e, opcionId) =>
                      toggleOpcionBebida(opcion.productoRef!, e, opcionId)
                    }
                    onCambiarCantidadBebida={(e, opcionId, delta) =>
                      cambiarCantidadOpcionBebida(opcion.productoRef!, e, opcionId, delta)
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
      <StepperCantidad valor={cantidad} onCambiar={(d) => setCantidad((c) => Math.max(1, c + d))} min={1} />
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
      <div onClick={onClose} className="fixed inset-0 z-40 bg-cafe/40" aria-hidden />
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
            <div className="relative rounded-t-lg bg-tarjeta px-5 py-4">{infoContenido}</div>
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
