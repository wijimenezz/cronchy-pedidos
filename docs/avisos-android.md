# Que el pedido nuevo se oiga en la tablet

Cómo dejar la tablet del mostrador avisando de un pedido **aunque el empleado esté en AppSheet,
en WhatsApp o en Canva**, y aunque el panel esté cerrado del todo.

Los pasos 1 y 2 son los que de verdad lo garantizan, y **no son código**: los hace sonar Android.
Hay que hacerlos una vez por tablet.

---

## Por qué hace falta configurar algo

Con el panel en segundo plano Android congela la página: los temporizadores se paran, así que el
polling de 15 s no corre y **el tablero ni siquiera se entera del pedido**. No hay nada que sonar.

Lo que sí llega siempre es la notificación, porque la entrega el sistema operativo. Y una
notificación web **no puede elegir su sonido** —la opción `sound` no existe en ningún navegador—,
así que suena con el tono genérico del canal, que en una cocina no se oye. Lo que sí se puede es
**cambiarle el tono a ese canal desde los ajustes del teléfono**, y ponerle la alarma del panel.

Un service worker tampoco puede reproducir audio: solo mostrar notificaciones. Eso no es una
limitación de este proyecto, es de la plataforma.

---

## 1. Poner la alarma del panel como tono de notificación

1. En el panel, con los avisos armados (la campana encendida), tocar **«Tono para Android»**. Baja
   `cronchy-pedido-nuevo.wav` — son 5,5 s de la misma alarma de 3100 Hz que suena en pantalla.
2. Moverlo con el explorador de archivos a la carpeta **`Notifications`** del almacenamiento
   interno. Si no existe, se crea con ese nombre exacto.
3. Ajustes › **Aplicaciones** › **Pedidos** › **Notificaciones** › el canal que aparezca.
4. Ahí dentro:
   - **Sonido** → elegir `cronchy-pedido-nuevo`.
   - **Importancia** → **Urgente** (o "Mostrar en pantalla"), para que salga el aviso emergente.
   - **Vibración** → encendida.
   - **Anular No molestar** → encendido.

> Si el canal no aparece, es que la tablet todavía no ha recibido ninguna notificación del panel:
> haz un pedido de prueba y vuelve.

## 2. Lo mismo en Telegram

Al entrar un pedido también llega un mensaje completo al chat de Telegram del negocio (número,
total, forma de pago, items, dirección). Telegram entrega con la app cerrada, así que es el
respaldo del respaldo — y deja poner un sonido **por chat**:

Abrir el chat › ⋮ › **Notificaciones** › **Sonido** → el mismo archivo. Y **Excepciones** →
anular No molestar.

## 3. Quitar las dos apps del ahorro de batería

Ajustes › Aplicaciones › **Pedidos** (y luego **Telegram**) › **Batería** → **Sin restricciones**.

Sin esto Android puede retrasar la entrega de las notificaciones cuando la tablet lleva un rato
quieta, que es exactamente el momento en que entra un pedido.

---

## Qué esperar después

| Situación | Qué suena |
| --- | --- |
| Panel al frente | La alarma de la página (3100 Hz), y la notificación |
| Panel abierto, tú en AppSheet | La notificación con la alarma como tono. Si Android no ha congelado la página, además suena la de la página |
| Panel cerrado del todo | La notificación con la alarma como tono |
| Tablet en No molestar | Igual, si marcaste las excepciones |
| Sin internet en la tablet | Nada. No hay canal que sobreviva a eso |

## Lo que NO va a pasar, y no es un fallo

- **El `(N)` del título no se ve** con el panel instalado como app: en modo `standalone` no hay
  barra de pestañas donde mirarlo. Quedan el sonido y la notificación.
- **El volumen del aviso lo manda el canal multimedia / de notificaciones de Android.** Los tres
  niveles del panel solo afectan al pitido que genera la página. Ninguna web puede subir el
  volumen del sistema.
- **Aparece un aviso permanente de "reproduciendo"** mientras los avisos están armados. Es a
  propósito: es lo que impide que Android congele la página, y de paso es la señal visible de que
  la alarma está encendida. Desaparece al apagar la campana.

## Si aun así se pierde un pedido

Por orden, lo que hay que mirar:

1. ¿La campana del panel está encendida? Sin eso no hay ni sonido ni push.
2. ¿El panel muestra algún aviso bajo la barra de botones? Ahí dice qué canal quedó sin armar.
3. `pnpm verificar-push` desde el proyecto: dice si hay suscripciones registradas y si las llaves
   VAPID están bien.
4. `pnpm verificar-telegram`: manda un mensaje de prueba al chat.

Si todo lo anterior está bien y el sonido sigue sin oírse, el problema es el volumen de
notificaciones del sistema, no el código.
