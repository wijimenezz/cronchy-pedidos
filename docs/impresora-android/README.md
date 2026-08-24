# Cómo modificar la app de impresión (Android Studio)

Estos archivos van al proyecto `com.pos.bluetoothprinter`, el APK que ya imprime desde el POS de
AppSheet. **AppSheet no se ve afectado**: sus hosts `print` y `printreceipt` siguen entrando por
`MainActivity` con el mismo contrato de query params.

Lo único que se añade es un host nuevo, `raw`, que recibe los bytes ESC/POS **ya armados** por la
app web de pedidos:

```
cronchyprinter://raw?v=1&d=<base64url>
```

Cambiar el diseño de un ticket ya no requiere compilar este APK: lo maqueta
`src/lib/impresion/` en el repo de la web, donde además está testeado.

---

## 1. Copiar los dos archivos nuevos

Van junto a `MainActivity.java`, en `app/src/main/java/com/pos/bluetoothprinter/`:

| Archivo | Qué hace |
| --- | --- |
| `PrinterGateway.java` | Encuentra la impresora guardada, conecta y manda bytes. Con reintento. |
| `PrintRawActivity.java` | Recibe el deep link, decodifica el base64url e imprime. **Sin interfaz.** |

## 2. Declarar la actividad en `AndroidManifest.xml`

Dentro de `<application>`, después del bloque de `MainActivity`:

```xml
<!-- Deep link: cronchyprinter://raw?v=1&d=<base64url>  (bytes ESC/POS ya armados) -->
<activity
    android:name=".PrintRawActivity"
    android:exported="true"
    android:launchMode="singleTop"
    android:noHistory="true"
    android:excludeFromRecents="true"
    android:taskAffinity=""
    android:theme="@android:style/Theme.Translucent.NoTitleBar">

    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="cronchyprinter" android:host="raw" />
    </intent-filter>
</activity>
```

**Ningún atributo sobra:**

- **`Theme.Translucent.NoTitleBar`** — es lo que hace que imprimir no saque al empleado del panel.
  Con el tema normal, cada ticket sería un salto a la pantalla de la app y una vuelta atrás. Y es
  lo que permite que "Aceptar" imprima **y** abra el WhatsApp del cliente en el mismo toque sin
  que eso sea un baile de tres aplicaciones.
- **`taskAffinity=""` + `excludeFromRecents`** — la ponen en su propia tarea, fuera de la de
  `MainActivity`. Sin eso, imprimir traería al frente la ventana de la app aunque el tema sea
  transparente, y al terminar volvería ahí en vez de a Chrome.
- **`noHistory`** — al salir no queda nada en la pila que el botón "atrás" pueda reabrir.
- **`singleTop`** — dos toques seguidos reusan la instancia y entran por `onNewIntent`.

## 3. Cerrar el enrutado de `MainActivity`

Hoy `printFromUri` enruta con un `else` abierto:

```java
if ("printreceipt".equals(host)) { printBusinessReceiptFromUri(uri); }
else                             { printKitchenTicketFromUri(uri); }
```

Un `raw` que llegue por el camino de respaldo del paso anterior caería en ese `else` y **se
imprimiría como comanda de AppSheet**: `splitParam` no encontraría `producto`, y saldría un ticket
vacío con encabezado. Hay que cerrarlo:

```java
private void printFromUri(Uri uri) {
    if (uri == null) return;
    String host = uri.getHost();

    if ("raw".equals(host))               printRawFromUri(uri);
    else if ("printreceipt".equals(host)) printBusinessReceiptFromUri(uri);
    else                                  printKitchenTicketFromUri(uri);
}

/** Los bytes ya vienen armados; aquí solo se decodifican. Ver PrintRawActivity. */
private void printRawFromUri(Uri uri) {
    String d = uri.getQueryParameter("d");
    if (d == null) { setStatus("Nada que imprimir"); return; }

    setLoading(true);
    sendToPrinter(Base64.decode(d, Base64.URL_SAFE | Base64.NO_WRAP), "Ticket");
}
```

Con su `import android.util.Base64;` arriba.

**Cuándo se usa este camino:** `PrintRawActivity` no tiene interfaz, así que no puede pedir el
permiso de Bluetooth ni dejar elegir impresora. Cuando falta alguna de las dos cosas, lanza
`MainActivity` con el mismo intent — que es donde el usuario sí puede arreglarlo y seguir.

## 4. Lo que NO se toca

`EscPosHelper.java` y `BluetoothPrinterManager.java` se quedan como están.

Nota aparte, no hace falta para esto: `EscPosHelper.text()` usa `getBytes("UTF-8")`, y estas
impresoras no hablan UTF-8 sino páginas de códigos. No se ha notado porque los datos de AppSheet
vienen sin tildes ("Sin Azucar"); el día que uno traiga una, saldrá "Ã¡". Los tickets nuevos no
pasan por ahí — la app web codifica en el subconjunto común de CP437 y CP850 y emite `ESC t 0`
para fijar la página.

---

## Pendiente para la próxima vez que se compile

Nada de esto bloquea hoy, pero conviene hacerlo cuando el APK vuelva a tocarse por otro motivo,
para no recompilar solo por esto:

- **Validar `v=1`.** El enlace lleva `?v=1&d=...` y **ningún handler lo mira** — ni
  `PrintRawActivity`, ni el script de Windows. Hoy da igual: un APK sin el host `raw` en su
  manifest ni siquiera recibe la URL, así que no hay nada que rechazar. Pero **antes de que exista
  un `v=2` hay que validarlo primero y desplegar**, o un aparato con el APK viejo interpretaría un
  payload nuevo como comandos sueltos y sacaría metros de papel. Serían tres líneas al principio
  de `imprimir()`: si `v` falta o no es `"1"`, `Toast` «Actualiza la app de impresión» y `finish()`.

- **El `getBytes("UTF-8")` de `EscPosHelper`.** Solo afecta a los tickets de AppSheet, que hoy
  vienen sin tildes. Ver la nota de la sección anterior.

---

## Probar que quedó bien

1. **Que AppSheet siga igual.** Mandar una venta desde el POS. Es la comprobación que no se puede
   saltar.
2. **Un ticket desde el panel web.** Debe salir el papel **sin que la pantalla se mueva del
   tablero**. Si aparece la pantalla azul de la app, falta el tema translúcido o el `taskAffinity`.
3. **Los acentos.** En el papel tiene que leerse "Cronchy Clásico" con tilde.
4. **La impresora apagada.** Tiene que salir el Toast de error, no un cuelgue. Al encenderla otra
   vez, el siguiente toque imprime — eso es el reintento de `PrinterGateway`.
5. **Sin impresora guardada** (borrar los datos de la app): el deep link debe abrir `MainActivity`
   para elegirla, y al conectar debe imprimir el ticket que venía en el link.
