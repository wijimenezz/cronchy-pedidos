# PRD — Cronchy Pedidos (v1)

> Documento de requisitos del producto. Define **qué** se construye y con qué
> alcance. El **cómo** técnico (convenciones, reglas de implementación) vive en
> `CLAUDE.md`; cuando este PRD y el CLAUDE.md hablen del mismo tema, el CLAUDE.md
> manda en lo técnico y este documento en el alcance funcional.
>
> Formato: historias `USn`, criterios en viñetas verificables, restricciones
> explícitas. Claude Code puede leer una sección puntual sin cargar todo.

---

## 1. Introducción

Cronchy - Churros y Helados (Fusagasugá, Colombia) recibe hoy sus pedidos por
WhatsApp, escritos a mano. La v1 es una plataforma web de pedidos en línea:
el cliente entra por un link, arma su pedido con sus variaciones, paga (efectivo
o Nequi) y el negocio lo recibe y lo gestiona desde un panel. Los avisos al
cliente salen por WhatsApp mediante links `wa.me`.

Alcance de esta versión: **una sola tienda** (Cronchy). El modelo de datos ya
contempla `store_id` para un futuro multi-tienda, pero la v1 no lo expone.

---

## 2. Planteamiento del problema

- Tomar pedidos por chat es lento y propenso a errores: se pierden detalles de
  variaciones (sabor, salsas, toppings), direcciones y valores.
- El número de WhatsApp se comparte con proveedores; no se puede automatizar con
  la Cloud API sin inutilizarlo para el resto.
- No hay registro estructurado de pedidos ni de clientes, así que no se puede
  medir nada ni hacer marketing.
- El pedido manual no sugiere adiciones, así que se pierde ticket promedio.

## 3. Objetivos de la v1 (definición de éxito)

1. Un cliente puede completar un pedido **sin escribir por chat**.
2. La plataforma **reemplaza** el pedido manual por WhatsApp: cubre todos los
   casos que hoy se resuelven por chat (variaciones, notas, indicaciones de
   entrega, dividir en cajas).
3. El flujo **sugiere adiciones y bebidas** para subir el ticket promedio.

No-objetivos de la v1 (explícitos, para acotar a Claude Code):

- No es multi-tienda.
- No hay pasarela de pago en línea (solo efectivo y comprobante Nequi).
- No hay pedidos programados ni franjas horarias.
- No hay pedido mínimo.
- No hay integración con la Cloud API de WhatsApp.
- No hay app móvil nativa (es web / PWA).
- No hay programa de fidelización todavía.

---

## 4. Roles

- **Cliente:** anónimo, no requiere cuenta. Entra por el link, pide, hace
  seguimiento por un link privado.
- **Empleado:** inicia sesión. Ve pedidos, cambia su estado, marca productos y
  opciones como agotados. NO ve reportes de ventas, NO edita precios, NO borra
  productos, NO gestiona usuarios.
- **Admin** (Wilson y su esposa): todo lo del empleado, más CRUD de catálogo,
  precios, zonas de domicilio, horarios, usuarios y reportes.

---

## 5. Historias de usuario

### Cliente — armar el pedido

**US1.** Como cliente, al entrar quiero elegir entre **Domicilio** o **Recoger en
tienda**, para que el menú y el checkout se ajusten a mi caso.

**US2.** Como cliente, quiero ver el menú por **categorías** (Cronchys, Para
Compartir, Adicionales, Bebidas) con foto, nombre, descripción y precio, para
encontrar lo que busco.

**US3.** Como cliente, quiero abrir un producto y ver sus fotos, descripción y
las opciones que admite, para configurarlo a mi gusto.

**US4.** Como cliente, quiero elegir las variaciones **incluidas** del producto
(sabor de helado, salsas incluidas, topping incluido) sin costo extra, según lo
que ese producto permita.

**US5.** Como cliente, quiero agregar **salsas o toppings adicionales** en una
sección aparte, viendo el costo de +$2.000 por cada uno.

**US6.** Como cliente, quiero que me **avisen si me falta** elegir una salsa o
topping incluido, pero que aun así pueda agregar el producto al carrito si así
lo decido.

**US7.** Como cliente, si el producto exige sabor de helado (ej. Cono), quiero
que el sistema **me impida** agregarlo sin elegir sabor.

**US8.** Como cliente, quiero que al final del producto me ofrezcan **agregar una
bebida** (agua, frappé, latte frío), para complementar mi pedido.

**US9.** Como cliente, quiero poder escribir una **nota** en un producto (ej.
"sin canela"), para pedidos especiales.

**US10.** Como cliente, quiero ver mi **carrito** con el detalle de cada item y
el subtotal, y poder cambiar cantidades o eliminar, antes de pagar.

### Cliente — checkout

**US11.** Como cliente de domicilio, quiero ingresar mi **barrio** de una lista y
ver el costo de domicilio; si mi barrio no aparece, quiero poder escribirlo y que
el negocio confirme el valor después.

**US12.** Como cliente de domicilio, quiero ingresar mi **dirección e
indicaciones** de entrega (ej. "al frente del Farmatodo").

**US13.** Como cliente, quiero ingresar **nombre y teléfono** para que me
contacten.

**US14.** Como cliente, quiero elegir **método de pago**: efectivo o Nequi. No
necesito indicar con cuánto pago.

**US15.** Como cliente que paga con Nequi, quiero ver los **datos de la cuenta
Nequi del negocio** y el **total a pagar**, hacer la transferencia y **subir el
comprobante** en el checkout antes de enviar la orden.

**US16.** Como cliente, al confirmar quiero recibir un **mensaje de WhatsApp** con
el resumen de mi pedido y un **link de seguimiento**.

### Cliente — seguimiento

**US17.** Como cliente, quiero un **link privado** donde ver el estado de mi
pedido en vivo (recibido → aceptado → en preparación → en camino / listo →
entregado), sin necesidad de cuenta.

### Empleado / Admin — operación

**US18.** Como empleado, quiero ver la **lista de pedidos entrantes** ordenados
por más recientes, con su estado, para atender la operación.

**US19.** Como empleado, quiero **cambiar el estado** de un pedido, y que el
sistema registre quién y cuándo lo hizo.

**US20.** Como empleado, al cambiar un estado quiero un botón para **enviar el
aviso al cliente por WhatsApp** con un toque (link `wa.me`).

**US21.** Como empleado, quiero **marcar un producto o una opción como agotado**
desde el panel (ej. "hoy no hay helado de mora"), y que desaparezca del menú del
cliente al instante.

**US22.** Como empleado/admin, quiero definir el **estimado de entrega** al
aceptar un pedido, y avisarle al cliente si cambia.

**US23.** Como negocio, quiero recibir un **aviso de cada pedido nuevo** con todo
el detalle (cliente, dirección, link de Google Maps si hay, items, totales,
pago).

### Admin — gestión

**US24.** Como admin, quiero **CRUD de productos**: crear, editar precio,
descripción, fotos, categoría, activar/desactivar.

**US25.** Como admin, quiero administrar las **opciones que cambian seguido**
(sabores de helado semanales, toppings, salsas) con un switch de disponible, sin
borrarlas.

**US26.** Como admin, quiero administrar las **zonas de domicilio** (barrio +
precio).

**US27.** Como admin, quiero definir el **horario de atención** y un
**interruptor manual** para cerrar pedidos de inmediato cuando la cocina se
sature.

**US28.** Como admin, quiero un **CRUD de usuarios** (admin / empleado) para dar
y quitar acceso al panel.

**US29.** Como admin, quiero ver **reportes básicos**: ventas del día, productos
más vendidos, clientes frecuentes.

---

## 6. Requisitos técnicos

El stack, la estructura y las reglas de implementación están en `CLAUDE.md`.
Resumen para contexto:

- Next.js 15 (App Router) + TypeScript estricto, PostgreSQL en Supabase, Drizzle,
  Tailwind + shadcn/ui, Zustand para el carrito, Zod para validación, Auth.js
  para el panel, Vitest, deploy en Vercel.
- Menú público con SSG + ISR; panel como client components protegidos.
- Todo el acceso a datos pasa por el servidor; sin RLS y sin exponer llaves de
  Supabase al cliente.
- Precios recalculados SIEMPRE en el servidor; el cliente solo envía qué eligió.
- Cada `order_item` guarda un `snapshot` JSONB que congela nombre, modificadores
  y precios al momento de la compra.
- Los avisos de WhatsApp se generan en `lib/notificaciones/plantillas.ts` y se
  envían vía `transporte.ts` (hoy `wa.me`).

### Modelo de datos (ya implementado)

`store`, `store_hours`, `store_closure`, `app_user`, `category`, `product`,
`modifier_group`, `modifier_option`, `product_modifier_group`, `delivery_zone`,
`customer`, `order`, `order_item`, `order_status_event`.

### Regla clave — cálculo de precio de un item

```
precio_item = producto.precio_base
            + Σ (por cada modificador elegido en modo 'adicional':
                 cantidad × precio_unitario_del_enganche)

Los modificadores en modo 'incluido' suman 0.
```

- El bloque **incluido** de un grupo tiene `precio_unitario = 0`.
- El bloque **adicional** tiene `precio_unitario = 2000` (o el que defina el admin).
- El total del pedido = Σ subtotales de items + costo de domicilio − descuento.

### Estados del pedido

```
nuevo → aceptado → preparando → en_camino → entregado   (domicilio)
nuevo → aceptado → preparando → listo → entregado        (recoger)
cualquiera → cancelado
```

- Los estados no retroceden para efectos de aviso (regla de idempotencia).
- Nequi sin comprobante no puede salir de `nuevo`.

---

## 7. Criterios de aceptación por fase

### Fase A — Menú y carrito (storefront)

- [ ] Al entrar, un modal obliga a elegir Domicilio o Recoger antes de ver el menú.
- [ ] El menú se agrupa por categorías con tabs; cada producto muestra foto,
      nombre, descripción y precio.
- [ ] Un producto agotado (o con todas sus opciones agotadas) no aparece.
- [ ] El modal de producto muestra los grupos de modificadores en el orden
      definido, separando "incluido" de "adicional".
- [ ] Los adicionales muestran su precio (+$2.000) y actualizan el total en vivo.
- [ ] Si un grupo tiene `min_select > 0` y no se cumple, el botón "Añadir" queda
      deshabilitado.
- [ ] Si un grupo incluido no se completó pero no es obligatorio, se muestra un
      aviso suave y el botón "Añadir" sigue activo.
- [ ] El carrito persiste al recargar la página (localStorage) y permite cambiar
      cantidades y eliminar items.

### Fase B — Checkout y pedido

- [ ] El precio total lo recalcula el servidor; si difiere del carrito del
      cliente, gana el del servidor.
- [ ] En domicilio, elegir un barrio de la lista fija el costo; "mi barrio no
      aparece" marca el pedido como `domicilio_por_confirmar`.
- [ ] El cliente elige método de pago (efectivo o Nequi); en efectivo pasa
      directo, sin pedir con cuánto paga.
- [ ] En Nequi, el checkout muestra los datos de la cuenta y el total, y exige
      subir un comprobante (imagen) antes de confirmar.
- [ ] Al confirmar, se crea el pedido, se genera el `snapshot` de cada item y se
      registra/actualiza el `customer` por teléfono.
- [ ] Se genera el mensaje de confirmación con link de seguimiento y el mensaje
      de nuevo pedido para el negocio.

### Fase C — Panel y operación

- [ ] Login con Auth.js contra `app_user`; rutas del panel protegidas por rol.
- [ ] La lista de pedidos se actualiza por polling (~5s) y ordena por recientes.
- [ ] Cambiar el estado registra un `order_status_event` con el `user_id`.
- [ ] Cada cambio de estado ofrece un botón "avisar al cliente" que abre `wa.me`
      con el mensaje ya armado.
- [ ] Un mismo estado no genera dos avisos (idempotencia).
- [ ] El empleado puede marcar productos/opciones como agotados; el admin no ve
      diferencia salvo los permisos extra.
- [ ] Un pedido nuevo dispara la impresión del ticket de cocina vía deep link
      `cronchyprinter://print`.

### Fase D — Seguimiento y gestión

- [ ] `/pedido/[token]` muestra el estado actual y la línea de tiempo, sin login.
- [ ] El admin tiene CRUD de productos, opciones, zonas, horarios y usuarios.
- [ ] El interruptor `acepta_pedidos` cierra el storefront de inmediato.
- [ ] Fuera del horario de atención, el storefront no permite pedir.
- [ ] Reportes: ventas del día, top de productos, clientes frecuentes.

---

## 8. Restricciones y no-negociables

- **Dinero en enteros** (pesos colombianos). Nunca float.
- **Zona horaria America/Bogota** para toda lógica de horario.
- **`store_id` en toda tabla y query**, resuelto en un solo lugar.
- **Sin RLS**: la llave `anon` de Supabase nunca sale al navegador.
- **Precios y totales solo desde el servidor.**
- **Sabores/opciones se apagan, no se borran.**
- **El número de WhatsApp del negocio no se migra a la Cloud API** en la v1.
- **Sin dependencias nuevas pesadas** sin justificación: nada de microservicios,
  colas, WebSockets ni pasarelas de pago.
- **Mobile-first**: el caso principal es un cliente en datos móviles.
- **El comprobante Nequi es obligatorio** para que un pedido Nequi avance.

---

## 9. Preguntas abiertas (a resolver antes de las fases que las tocan)

- Sabores de helado, toppings y salsas reales (para el seed definitivo). — Fase A
- Lista completa de barrios y precios de domicilio. — Fase B
- Horario de atención real por día. — Fase D
- Datos de Nequi del negocio (titular y número para mostrar al cliente). — Fase B
- ¿Se captura ubicación GPS opcional para el link de Google Maps? — Fase B
