/**
 * LA COMANDA DE COCINA — qué hay que preparar, en papel.
 *
 * Puro y sin base de datos, igual que `plantillas.ts`: recibe el pedido y devuelve bytes. Todo
 * sale del `snapshot` congelado (regla 2), así que reimprimir un pedido de ayer saca lo que el
 * cliente pagó y no los precios de hoy.
 *
 * **No lleva un solo precio, y eso no es un olvido**: esto es para armar el pedido. Lo que se
 * cobró va en el recibo, que es otro ticket con otro lector.
 *
 * **Tampoco lleva teléfono ni dirección.** La comanda se queda en el mostrador y va grapada a la
 * bolsa; la dirección la necesita quien reparte, y esa le llega por WhatsApp (regla 18). Misma
 * doctrina que el payload del push: lo que no hace falta ahí, no se imprime.
 */

import { crearTicket } from "./escpos";
import { agruparModificadores, contarPreparacion } from "@/lib/pedidos/modificadores";
import {
  cuandoCorto,
  horaCorta,
  type ItemSnapshot,
  type TipoPedido,
} from "@/lib/notificaciones/plantillas";

/**
 * Lo que la comanda necesita saber, y nada más.
 *
 * Es un tipo propio y no `PedidoPanel` por lo mismo que `plantillas.ts` declara
 * `PedidoParaMensaje`: así este módulo no depende de la capa de base de datos, y la lista de
 * campos es la documentación de lo que de verdad acaba en el papel.
 */
export type PedidoParaComanda = {
  numero: number;
  tipo: TipoPedido;
  creadoEn: Date;
  /** La hora que pidió el cliente, o `null` si la quiere lo antes posible (regla 16). */
  programadoPara: Date | null;
  clienteNombre: string;
  barrio?: string | null;
  items: ItemSnapshot[];
  notas?: string | null;
};

const ROTULO_TIPO: Record<TipoPedido, string> = {
  domicilio: "DOMICILIO",
  recoger: "RECOGE EN TIENDA",
};

/** "2x Cronchy Mega". Sin `×` porque en el papel se transliteraría igual. */
function tituloItem(item: ItemSnapshot): string {
  return `${item.cantidad}x ${item.nombre}`;
}

export function comanda(pedido: PedidoParaComanda, ahora: Date = new Date()): Uint8Array {
  const ticket = crearTicket();
  const { unidades } = contarPreparacion(pedido.items);

  ticket
    .separador("=")
    .linea(`#${pedido.numero}`, { tamano: "doble", centrado: true, negrita: true })
    .linea(ROTULO_TIPO[pedido.tipo], { centrado: true, negrita: true })
    .separador("=");

  // Un programado se anuncia, y con el día: "7:00 pm" a secas en un pedido tomado de noche para
  // el día siguiente es alguien friendo doce horas antes.
  if (pedido.programadoPara) {
    ticket.linea(`PROGRAMADO ${cuandoCorto(pedido.programadoPara, ahora)}`, { negrita: true });
  } else {
    ticket.linea(`Entró ${horaCorta(pedido.creadoEn)}`);
  }

  ticket.envuelto(pedido.clienteNombre);

  // Solo en domicilio: en un recoger no hay a dónde llevarlo, y una línea vacía bajo esa
  // etiqueta se lee como un dato que falta.
  if (pedido.tipo === "domicilio" && pedido.barrio) ticket.envuelto(pedido.barrio);

  ticket.separador();

  // De aquí abajo va TODO en negrita —título, incluidos, extras y notas—, y en texto normal se
  // quedan el encabezado y el conteo del pie. El criterio no es "lo importante", que acabaría
  // siendo todo, sino **lo que hay que preparar**: es el bloque que se lee agachado sobre la
  // freidora, y lo demás es contexto.
  for (const item of pedido.items) {
    const { incluidos, extras } = agruparModificadores(item.modificadores);

    ticket.envuelto(tituloItem(item), { negrita: true });

    for (const grupo of incluidos) {
      ticket.envuelto(`${grupo.etiqueta}: ${grupo.valores.join(", ")}`, {
        sangria: 3,
        negrita: true,
      });
    }

    // Lo cobrado aparte se marca con un `+`, que es lo que lo distingue de un incluido: se separa
    // por PRECIO y no por el nombre del grupo, que el snapshot no distingue (regla 2). La negrita
    // NO es lo que los separa —va en todo el bloque del ítem—, y por eso el `+` no se puede
    // quitar por redundante.
    for (const extra of extras) {
      const cantidad = extra.cantidad > 1 ? ` x${extra.cantidad}` : "";
      ticket.envuelto(`+ ${extra.nombre}${cantidad}`, { sangria: 3, negrita: true });
    }

    if (item.notas) {
      ticket.envuelto(`>> ${item.notas.toUpperCase()}`, { sangria: 3, negrita: true });
    }

    ticket.linea();
  }

  if (pedido.notas) {
    ticket.separador().envuelto(`Nota: ${pedido.notas}`, { negrita: true });
  }

  return ticket
    .separador("=")
    .linea(unidades === 1 ? "1 ítem para preparar" : `${unidades} ítems para preparar`, {
      centrado: true,
    })
    .cortar()
    .bytes();
}
