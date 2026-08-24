/**
 * El deep link que entrega un ticket ya armado al sistema.
 *
 * Es el contrato con el mundo de fuera, y tiene dos implementaciones: en la tablet lo atiende la
 * app `com.pos.bluetoothprinter` (`PrintRawActivity`), y en Windows un handler registrado en el
 * sistema. **Ninguna de las dos sabe qué es un pedido**: reciben bytes y los vuelcan.
 *
 * Esa es toda la gracia del diseño. La misma app sigue sirviendo al POS de AppSheet por los hosts
 * `print` y `printreceipt`, donde el ticket sí lo maqueta el Java; aquí lo maqueta esta app, y
 * cambiar el diseño de una comanda no vuelve a requerir compilar un APK.
 */

/** El `android:scheme` que declara el `intent-filter` del manifest. No lo cambies sin el APK. */
export const ESQUEMA_IMPRESION = "cronchyprinter";

/**
 * La versión del formato del payload. **Campo reservado: hoy no la valida ningún handler.**
 *
 * Se escribe para que el día que exista un `v=2` haya dónde mirar, pero conviene no creerse más
 * de lo que hace: ni `PrintRawActivity` ni el script de Windows la leen, así que **ahora mismo no
 * protege de nada**. Y no hace falta que proteja: un APK sin el host `raw` en su manifest ni
 * siquiera recibe la URL, así que no hay ningún aparato al que haya que decirle que no entiende.
 *
 * Lo que hay que hacer antes de cambiar el formato: validarla en los dos handlers *primero*,
 * desplegar, y solo entonces subir el número. Está apuntado en `docs/impresora-android/README.md`.
 */
const VERSION = 1;

/**
 * Los bytes ESC/POS empaquetados en una URL.
 *
 * **base64url y no base64**: el alfabeto normal usa `+`, `/` y `=`, que en un query string hay
 * que escapar —y `+` se lee como espacio—, así que un `encodeURIComponent` triplicaría uno de
 * cada tres bytes. Un ticket normal son ~1-2 KB, muy por debajo de cualquier límite de URL o de
 * la línea de comandos de Windows.
 */
export function enlaceImpresion(bytes: Uint8Array): string {
  const d = Buffer.from(bytes).toString("base64url");

  return `${ESQUEMA_IMPRESION}://raw?v=${VERSION}&d=${d}`;
}
