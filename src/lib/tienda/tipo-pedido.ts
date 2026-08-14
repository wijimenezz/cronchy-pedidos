import { useSyncExternalStore } from "react";
import { useCarrito, type ItemCarrito } from "@/lib/carrito";

export type TipoPedido = "domicilio" | "recoger";

const STORAGE_KEY = "cronchy_tipo_pedido";
const EVENTO_CAMBIO = "cronchy-tipo-pedido-changed";

/**
 * Cuánto vale la respuesta del modal de bienvenida.
 *
 * Sin caducidad, la elección de hace dos semanas seguía viva: quien recogió la última vez volvía,
 * armaba el carrito y llegaba al checkout todavía en `recoger` —donde el paso de la dirección se
 * salta entero— sin que nada se lo gritara. El modal bloqueante ya sabía preguntar cuando no hay
 * respuesta; lo que faltaba era que la respuesta dejara de ser eterna.
 *
 * Seis horas cubren el "miré a las 4 y pedí a las 9" sin llegar nunca al día siguiente, que es el
 * caso del error. **No se usa "hasta medianoche en Bogotá"** aunque conceptualmente encaje mejor:
 * esa aritmética vive en `pedidos/dias.ts`, que arrastra `horario.ts` y con él la capa de base de
 * datos, y esto corre en el navegador.
 */
export const VIGENCIA_MS = 6 * 60 * 60 * 1000;

type Guardado = { valor: TipoPedido; en: number };

function esTipoPedido(valor: unknown): valor is TipoPedido {
  return valor === "domicilio" || valor === "recoger";
}

/**
 * La única pieza con lógica de verdad, aparte a propósito: los tests corren en `environment:
 * "node"` y ahí no existe `localStorage`.
 *
 * Un JSON que no parsea es **el formato viejo** —la cadena pelada que se guardaba antes— y se
 * trata como caducado: los clientes que ya tenían una respuesta guardada vuelven a responder una
 * vez, que es justo lo que se quiere.
 */
export function leerGuardado(crudo: string | null, ahora: number): TipoPedido | null {
  if (!crudo) return null;

  let dato: unknown;
  try {
    dato = JSON.parse(crudo);
  } catch {
    return null;
  }

  if (typeof dato !== "object" || dato === null) return null;

  const { valor, en } = dato as Partial<Guardado>;
  if (!esTipoPedido(valor) || typeof en !== "number") return null;

  // Un `en` en el futuro (reloj del teléfono mal puesto) da negativo y pasa: preguntar de más por
  // un reloj torcido es peor que fiarse de él.
  return ahora - en < VIGENCIA_MS ? valor : null;
}

function guardar(valor: TipoPedido) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ valor, en: Date.now() } satisfies Guardado));
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENTO_CAMBIO, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENTO_CAMBIO, callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): TipoPedido | null {
  return leerGuardado(localStorage.getItem(STORAGE_KEY), Date.now());
}

function getServerSnapshot(): TipoPedido | null {
  return null;
}

/**
 * Lee el tipo de pedido (domicilio/recoger) elegido en el modal de bienvenida.
 *
 * `useSyncExternalStore` evita el error de hidratación, pero OJO: no evita el
 * parpadeo. El snapshot del servidor es siempre `null`, así que en una página
 * estática (ISR) el HTML se pinta como si nadie hubiera elegido nunca, y el valor
 * real recién aparece al hidratar. Quien dependa de esto para decidir si pinta algo
 * tiene que esperar al montaje —como hace `SelectorTipoPedido`— o el usuario verá
 * aparecer y desaparecer cosas.
 */
export function useTipoPedido(): TipoPedido | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function elegirTipoPedido(nuevo: TipoPedido) {
  guardar(nuevo);
  window.dispatchEvent(new Event(EVENTO_CAMBIO));
}

/**
 * Cambia el tipo **y limpia el carrito** de lo que ese canal no vende, devolviendo lo retirado
 * para que quien llame pueda decirlo.
 *
 * Existe porque el tipo se cambia desde dos sitios —el modal del encabezado y el paso 1 del
 * checkout— y los dos tienen que depurar. Con la depuración suelta en cada componente, el
 * segundo que se escribiera se olvidaría, y el síntoma sería un pedido que revienta al
 * confirmar: el peor momento posible para descubrirlo.
 *
 * `elegirTipoPedido` se queda debajo y sin tocar: hay un caso que no debe depurar —la primera
 * respuesta del modal, cuando el carrito está vacío por definición— y sobre todo separar las dos
 * deja claro cuál es la operación con efectos.
 *
 * Ojo a la dirección de la dependencia: este módulo pasa a conocer el carrito. Es lo que se
 * quiso, porque la alternativa era duplicar la regla.
 */
export function cambiarTipoPedido(nuevo: TipoPedido): ItemCarrito[] {
  const anterior = getSnapshot();
  elegirTipoPedido(nuevo);

  // Reelegir el mismo tipo no puede retirar nada: el carrito ya cumple ese canal.
  if (anterior === nuevo) return [];

  return useCarrito.getState().depurarPorTipo(nuevo);
}

/**
 * Estira la vigencia sin cambiar la respuesta. Lo llama el checkout al montarse: estar ahí es la
 * señal más fuerte de que la elección sigue siendo la buena, y sin esto la pregunta podría saltar
 * a mitad del pago — justo la interrupción junto al dinero que la caducidad quiere evitar.
 *
 * No dispara el evento: el valor no cambió y solo provocaría un render de más.
 */
export function renovarTipoPedido() {
  const vigente = getSnapshot();
  if (vigente) guardar(vigente);
}
