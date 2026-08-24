# Imprimir desde el panel en Windows

El panel manda los tickets por un deep link, `cronchyprinter://raw?...`, con los bytes ESC/POS
dentro. En la tablet lo atiende la app de Android; en Windows lo atiende esto.

**Son los mismos bytes.** El ticket sale idéntico en los dos sitios, y la app web no sabe —ni
tiene que saber— en qué sistema está.

## Por qué hace falta

Un navegador **no puede imprimir sin diálogo**: `window.print()` siempre abre la ventana de
Ctrl+P, y no hay API que lo evite. Como el requisito es "toco el botón e imprime", la impresión
tiene que salir del navegador. Este script es esa salida.

## Instalación (una vez por equipo)

1. Copia esta carpeta a algún sitio estable del PC, por ejemplo
   `C:\Cronchy\impresion-windows`. **Si luego la mueves, hay que reinstalar**: la ruta queda
   escrita en el registro.

2. Abre `imprimir-ticket.ps1` con el Bloc de notas y escribe el nombre de la impresora:

   ```powershell
   $NombreImpresora = "POS-80C"
   ```

   El nombre tiene que ser el exacto de **Configuración › Bluetooth y dispositivos › Impresoras
   y escáneres**. Si lo dejas vacío, usa la predeterminada de Windows.

3. Clic derecho en `instalar.ps1` › **Ejecutar con PowerShell**.

   No hace falta ser administrador: se registra solo para tu usuario.

4. La primera vez que imprimas, Chrome preguntará si abrir la aplicación externa. Marca
   **"Permitir siempre"** y a partir de ahí es un toque y papel.

Para quitarlo:

```powershell
powershell -ExecutionPolicy Bypass -File .\instalar.ps1 -Desinstalar
```

## Si algo no sale

El script corre con la ventana oculta, así que deja un registro. Ábrelo:

```
%TEMP%\cronchy-impresion.log
```

Una línea `OK 812 bytes -> POS-80C` significa que el ticket llegó al spooler. Si aparece ahí y
no sale papel, el problema está entre el spooler y la impresora, no en el panel.

Los errores además abren un cuadro de diálogo: un botón que no hace nada y no dice por qué es
peor que uno que falla en voz alta.

## Detalles que no se deducen del código

- **Se imprime en modo RAW, por `winspool.drv`.** `Out-Printer` y la impresión normal de Windows
  pasan por el driver, que rasterizaría los comandos ESC/POS: saldrían impresos como texto
  literal o como metros de basura. RAW los entrega tal cual al aparato.
- **No hay que compartir la impresora.** La receta clásica de `copy /b archivo \\PC\Impresora`
  obliga a compartirla en la red; el spooler en RAW no.
- **Sirve para USB y para red por igual**, mientras la impresora esté instalada en Windows.
- **Los acentos ya vienen resueltos desde la web**: los bytes salen en el subconjunto común de
  CP437 y CP850, con un `ESC t 0` delante que fija la página de códigos. Este script no toca el
  contenido.
