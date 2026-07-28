"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ChevronDown, Minus, Plus, X } from "lucide-react";
import { pesos } from "@/lib/notificaciones/plantillas";
import { useCarrito } from "@/lib/carrito";
import { useTipoPedido } from "@/lib/tienda/tipo-pedido";
import { precargarProducto } from "@/lib/tienda/productos-cache";
import { calcularItem } from "@/lib/precios-calculo";
import type { SeleccionEnganche } from "@/lib/precios-calculo";
import type { EngancheParaFicha, OpcionParaFicha, ProductoParaFicha } from "@/db/queries/productos";

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

function precioOpcion(enganche: EngancheParaFicha, opcion: OpcionParaFicha): number {
  return enganche.modo === "incluido" ? 0 : (enganche.precioUnitario ?? opcion.precioDelta);
}

function sinOpcion(seleccion: Record<string, number>, opcionId: string): Record<string, number> {
  return Object.fromEntries(Object.entries(seleccion).filter(([id]) => id !== opcionId));
}

function StepperCantidad({
  valor,
  onCambiar,
  min = 0,
}: {
  valor: number;
  onCambiar: (delta: number) => void;
  min?: number;
}) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-crema-oscura px-1.5 py-1">
      <button
        type="button"
        onClick={() => onCambiar(-1)}
        disabled={valor <= min}
        aria-label="Quitar uno"
        className="flex size-6 items-center justify-center rounded-full font-bold text-cafe disabled:opacity-40"
      >
        <Minus className="size-3.5" />
      </button>
      <span className="min-w-[16px] text-center text-sm font-bold text-cafe">{valor}</span>
      <button
        type="button"
        onClick={() => onCambiar(1)}
        aria-label="Agregar uno"
        className="flex size-6 items-center justify-center rounded-full font-bold text-cafe"
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
  esRadio,
  onToggle,
  onCambiarCantidad,
}: {
  enganche: EngancheParaFicha;
  opcion: OpcionParaFicha;
  cantidad: number;
  esRadio: boolean;
  onToggle: () => void;
  onCambiarCantidad: (delta: number) => void;
}) {
  const seleccionada = cantidad > 0;
  const precio = precioOpcion(enganche, opcion);

  return (
    <div className="flex items-center gap-3 rounded-md border border-crema-oscura px-3 py-2">
      <button
        type="button"
        onClick={onToggle}
        disabled={!opcion.disponible}
        className="flex flex-1 items-center justify-between gap-2 text-left disabled:opacity-40"
      >
        <span
          className={`text-sm font-medium ${seleccionada ? "text-naranja" : "text-cafe"} ${
            esRadio ? "" : ""
          }`}
        >
          {opcion.nombre}
          {!opcion.disponible && " (agotado)"}
        </span>
        {precio > 0 && <span className="text-xs text-cafe-suave">+{pesos(precio)}</span>}
      </button>
      {enganche.permiteCantidad ? (
        <StepperCantidad valor={cantidad} onCambiar={onCambiarCantidad} />
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
  plegable,
  expandido,
  onToggleExpandir,
  onToggleOpcion,
  onCambiarCantidad,
}: {
  enganche: EngancheParaFicha;
  seleccion: Record<string, number>;
  plegable: boolean;
  expandido: boolean;
  onToggleExpandir: () => void;
  onToggleOpcion: (opcionId: string) => void;
  onCambiarCantidad: (opcionId: string, delta: number) => void;
}) {
  const recibidas = Object.values(seleccion).reduce((n, c) => n + c, 0);
  const esRequerido = enganche.minSelect > 0 && !enganche.avisarIncompleto;
  const avisoSuave = enganche.avisarIncompleto && recibidas === 0;

  const opciones = (
    <div className="flex flex-col gap-2">
      {enganche.opciones.map((opcion) => (
        <FilaOpcion
          key={opcion.id}
          enganche={enganche}
          opcion={opcion}
          cantidad={seleccion[opcion.id] ?? 0}
          esRadio={enganche.maxSelect === 1}
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
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-titulo text-base font-semibold text-cafe">
          {enganche.nombreGrupo}
          {esRequerido && <span className="text-error"> *</span>}
        </h4>
        <span className="text-xs text-cafe-tenue">
          {recibidas} de {enganche.maxSelect}
        </span>
      </div>
      {opciones}
      {avisoSuave && (
        <p className="mt-2 rounded-sm bg-alerta/12 px-3 py-2 text-xs text-alerta">
          Te falta elegir tu {enganche.nombreGrupo.toLowerCase()}.
        </p>
      )}
    </div>
  );
}

export function ProductoFicha({ productId, onClose }: { productId: string; onClose: () => void }) {
  const [producto, setProducto] = useState<ProductoParaFicha | null>(null);
  const [error, setError] = useState(false);
  const [cantidad, setCantidad] = useState(1);
  const [selecciones, setSelecciones] = useState<SeleccionesPorGrupo>({});
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

  function toggleOpcion(enganche: EngancheParaFicha, opcionId: string) {
    setSelecciones((prev) => {
      const actual = prev[enganche.id] ?? {};
      if (enganche.maxSelect === 1) {
        const yaSeleccionada = (actual[opcionId] ?? 0) > 0;
        return { ...prev, [enganche.id]: yaSeleccionada ? {} : { [opcionId]: 1 } };
      }
      const yaSeleccionada = (actual[opcionId] ?? 0) > 0;
      if (yaSeleccionada) {
        return { ...prev, [enganche.id]: sinOpcion(actual, opcionId) };
      }
      const suma = Object.values(actual).reduce((n, c) => n + c, 0);
      if (suma >= enganche.maxSelect) return prev;
      return { ...prev, [enganche.id]: { ...actual, [opcionId]: 1 } };
    });
  }

  function cambiarCantidadOpcion(enganche: EngancheParaFicha, opcionId: string, delta: number) {
    setSelecciones((prev) => {
      const actual = prev[enganche.id] ?? {};
      const cantidadActual = actual[opcionId] ?? 0;
      const suma = Object.values(actual).reduce((n, c) => n + c, 0);
      const maxPorOpcion = enganche.maxPorOpcion ?? Infinity;
      const tope = Math.min(maxPorOpcion, enganche.maxSelect - (suma - cantidadActual));
      const nueva = Math.max(0, Math.min(tope, cantidadActual + delta));
      return {
        ...prev,
        [enganche.id]: nueva > 0 ? { ...actual, [opcionId]: nueva } : sinOpcion(actual, opcionId),
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
      seleccion: construirSeleccion(selecciones),
      modificadores: resultado.valor.base.modificadores,
      avisos: resultado.valor.base.avisos,
      notas: null,
    });

    for (const upsell of resultado.valor.upsells) {
      agregarConfigurado({
        productoId: upsell.productId,
        nombre: upsell.nombreProducto,
        precioBase: producto.productosUpsell[upsell.productId]?.precioBase ?? upsell.precioUnitario,
        precioUnitarioEstimado: upsell.precioUnitario,
        cantidad: upsell.cantidad,
        seleccion: [],
        modificadores: [],
        avisos: [],
        notas: null,
      });
    }

    onClose();
  }

  const enganclesSeleccion = producto?.engancles.filter((e) => e.tipo === "seleccion") ?? [];
  const enganclesUpsell = producto?.engancles.filter((e) => e.tipo === "upsell") ?? [];

  const precioTotal = resultado?.ok
    ? resultado.valor.base.subtotal + resultado.valor.upsells.reduce((n, u) => n + u.subtotal, 0)
    : null;

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

        {enganclesUpsell.map((enganche) => (
          <div key={enganche.id}>
            <h3 className="font-titulo text-base font-semibold text-cafe">{enganche.nombreGrupo}</h3>
            <div className="mt-2 flex flex-col gap-2">
              {enganche.opciones.map((opcion) => {
                const ref = opcion.productoRef ? producto.productosUpsell[opcion.productoRef] : undefined;
                const cantidadSel = selecciones[enganche.id]?.[opcion.id] ?? 0;
                const precio = precioOpcion(enganche, opcion);
                return (
                  <div key={opcion.id} className="flex items-center gap-3 rounded-md border border-crema-oscura p-2">
                    <div className="relative size-12 shrink-0 overflow-hidden rounded-sm bg-crema-oscura">
                      {ref?.imagen && <Image src={ref.imagen} alt="" fill sizes="48px" className="object-cover" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-cafe">{ref?.nombre ?? opcion.nombre}</p>
                      <p className="text-xs text-cafe-suave">{pesos(precio)}</p>
                    </div>
                    {enganche.permiteCantidad ? (
                      <StepperCantidad
                        valor={cantidadSel}
                        onCambiar={(delta) => cambiarCantidadOpcion(enganche, opcion.id, delta)}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleOpcion(enganche, opcion.id)}
                        className={`rounded-full px-4 py-1.5 text-sm font-bold ${
                          cantidadSel > 0 ? "bg-crema-oscura text-cafe" : "bg-naranja text-crema hover:bg-naranja-osc"
                        }`}
                      >
                        {cantidadSel > 0 ? "Quitar" : "Agregar"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );

  const barraInferior = (
    <div className="flex shrink-0 items-center gap-3 border-t border-crema-oscura px-5 py-4">
      <StepperCantidad valor={cantidad} onCambiar={(d) => setCantidad((c) => Math.max(1, c + d))} min={1} />
      <button
        type="button"
        onClick={agregarAlCarrito}
        disabled={!resultado?.ok}
        className="flex-1 rounded-full bg-naranja px-4 py-3 font-cuerpo text-sm font-bold text-crema transition-colors hover:bg-naranja-osc disabled:pointer-events-none disabled:opacity-40"
      >
        {precioTotal !== null ? `Añadir ${pesos(precioTotal)}` : "Elige las opciones"}
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
