# CLAUDE.md — Cronchy Pedidos

Plataforma de pedidos en línea para **Cronchy - Churros y Helados** (Fusagasugá, Colombia).
El cliente entra por un link, arma su pedido, paga en efectivo o Nequi, y el negocio
lo recibe y lo gestiona desde un panel. El cliente y el negocio reciben avisos por
**WhatsApp**; los pedidos NO se reciben por WhatsApp, se reciben en el panel.

Idioma del código: identificadores y comentarios en **español**, igual que el dominio.
Responde en español.

---

## Stack

| Capa          | Elección                                                  |
| ------------- | --------------------------------------------------------- |
| Framework     | Next.js 15 (App Router) + TypeScript estricto             |
| Base de datos | PostgreSQL en Supabase                                    |
| Geoespacial   | Extensión **PostGIS** (zonas de cobertura)                |
| Archivos      | Supabase Storage (fotos de productos, comprobantes Nequi) |
| ORM           | Drizzle                                                   |
| Estilos       | Tailwind CSS + shadcn/ui                                  |
| Mapas         | Leaflet + tiles de OpenStreetMap; Leaflet-Geoman en admin |
| Carrito       | Zustand + persistencia en localStorage                    |
| Validación    | Zod (compartida cliente/servidor)                         |
| Auth (panel)  | Sesión propia: cookie firmada contra `app_user`            |
| Tests         | Vitest                                                    |
| Deploy        | Vercel — **plan Pro**, ver abajo                          |

**Por qué Pro y no el gratuito:** el plan Hobby de Vercel es para proyectos **no comerciales**, y
esto vende churros. No es un límite técnico que se pueda optimizar —se puede bajar el polling
todo lo que se quiera y seguiría fuera de los términos—, es una condición del negocio. Se anota
aquí para que no se redescubra el día del lanzamiento.

---

## Comandos

```bash
pnpm dev              # desarrollo
pnpm build            # build de producción
pnpm lint
pnpm test             # Vitest
pnpm db:generate      # generar migración desde src/db/schema.ts
pnpm db:migrate       # aplicar migraciones
pnpm db:studio        # explorar la base de datos
pnpm configurar-purga # deja SUPABASE_URL y la service key en Vault (una vez, ver más abajo)
```

---

## Estructura

```
src/
  app/
    (tienda)/                 menú público — SSG + ISR
      page.tsx
      producto/[slug]/
    pedido/[token]/           seguimiento público del cliente
    entrega/[token]/          el domiciliario confirma la entrega — otra llave (regla 18)
    admin/                    panel — protegido
      login/
      (panel)/                grupo con sesión: cabecera, nav y exigirRol()
        pedidos/              tablero con polling + [numero]/ detalle
                              SelectorDia + PedidosDelDia: consulta de un día pasado
                              ResumenDia + DescargarPedidos: cifras y export (admin)
        catalogo/             switches de agotado (US21)
        zonas/                mapa con polígonos de cobertura — solo admin
        productos/            CRUD completo: 3 columnas categoría/producto/detalle
        opciones/             salsas, toppings, sabores: 2 columnas lista/opciones
    api/
  proxy.ts                    corta /admin/* sin sesión (antes "middleware")
  db/
    schema.ts                 definición Drizzle
    tipos-geo.ts              customType geometry para PostGIS
    queries/                  consultas reutilizables
      panel.ts                pedidos del panel + cambio de estado
      resumen.ts              cifras del día (SQL agregado) + pedidos para el export
      domiciliarios.ts        agenda de couriers + asignación + confirmarEntrega
      disponibilidad.ts       switches de agotado
      catalogo.ts             CRUD de categorías, productos y enganches
      opciones.ts             CRUD de las listas de opciones y sus opciones
  lib/
    precios.ts                CÁLCULO DE PRECIOS — fuente única de verdad
    zonas.ts                  CÁLCULO DE DOMICILIO — fuente única de verdad
    barrio.ts                 SUGERENCIA de barrio desde el pin (OSM) — nunca fuente de verdad
    horario.ts                ¿está abierta la tienda en tal instante?
    fechas.ts                 nombres de meses y días + calendario sin zona horaria
                              (el único módulo de fechas que puede usar el cliente)
    export/
      hojas.ts                LAS CIFRAS del XLSX — puro, testeado
      libro.ts                el archivo: celdas, formatos y hojas
    validaciones.ts           esquemas Zod
    autorizacion.ts           exigirRol() — permisos del panel
    texto.ts                  slugify() + slugLibre()
    imagenes.ts               magic bytes, buckets, tope de fotos
    catalogo/
      engancles.ts            TRADUCCIÓN de la regla 15 — puro, testeado
    auth/
      sesion.ts               firma/verifica la cookie (Web Crypto, corre en el proxy)
      cookie.ts               leer/guardar/borrar — usa next/headers
      password.ts             bcrypt (jamás desde el proxy)
    pedidos/
      estados.ts              etiquetas + máquina de transiciones
      dias.ts                 QUÉ DÍA ES CADA COSA en Bogotá — puro, testeado
      franjas.ts              HORAS PROGRAMABLES (regla 16) — puro, testeado
      entrega.ts              compone tienda + horario: qué se puede ofrecer hoy
    notificaciones/
      plantillas.ts           TEXTO de los mensajes — fuente única
      transporte.ts           adaptador: whatsapp-link | whatsapp-api | telegram
    (impresion.ts)            PENDIENTE: no existe. La tabla de permisos lo promete
  components/
```

---

## Reglas de dominio — NO NEGOCIABLES

Estas reglas nacieron de decisiones de diseño ya tomadas. No las cambies sin preguntar.

### 1. Los precios se calculan SIEMPRE en el servidor

El navegador manda **qué** eligió el cliente (ids de producto y de opciones), nunca
**cuánto** cuesta. `POST /api/pedidos` recalcula todo desde la base de datos y compara.
Si el total del cliente no coincide, se ignora el del cliente. Nunca confíes en un
precio que venga del request.

Todo el cálculo vive en `src/lib/precios.ts`. Si necesitas un precio en otro archivo,
importa desde ahí; no repliques la lógica.

### 2. `order_item.snapshot` congela el pedido

Cada item guarda un JSONB con el nombre del producto, los modificadores elegidos y el
precio de cada uno **en el momento de la compra**. Nunca reconstruyas un pedido viejo
haciendo JOIN contra los precios actuales: si mañana sube el churro, se reescribiría
el historial y la contabilidad pasada cambiaría sola.

`product_id` en `order_item` existe solo para reportes agregados, no para mostrar el pedido.

### 3. Modificadores: `incluido` vs `adicional`

Un mismo grupo (ej. "Salsas") se engancha **dos veces** al mismo producto vía
`product_modifier_group`, distinguido por `modo`:

- `modo='incluido'` → `precio_unitario = 0`. Es lo que el producto ya trae.
- `modo='adicional'` → `precio_unitario = 2000`. Sección aparte, plegada por defecto.

El precio efectivo de una opción es `precio_unitario` del enganche; si es `NULL`,
se usa `modifier_option.precio_delta`.

### 4. Lo que el producto incluye es obligatorio

Si un producto trae salsas o toppings incluidos, el cliente **elige todos** o no puede
añadirlo al carrito. No son un extra que se pueda saltar: ya están pagados dentro del
precio, y un pedido sin ellos llega incompleto a cocina.

Se modela con `min_select = max_select` y `avisar_incompleto = false` en el enganche:

| Producto                           | Salsas | Toppings |
| ---------------------------------- | ------ | -------- |
| Clásico / Chiqui / Frutilla / Ring | 1      | 1        |
| Cronchy Mega                       | 1      | 2        |
| Cronchy Amigos                     | 2      | —        |
| Cronchy Familiar                   | 4      | —        |
| Cronchy Churros                    | 1      | —        |

Los grupos en modo `adicional` (las salsas de pago) siguen siendo opcionales: `min_select = 0`.

`calcularItem` bloquea con el error `seleccion_incompleta`, y la ficha usa
`gruposIncompletos()` —del mismo módulo— para decir cuántas faltan en cada sección. Nunca
repliques ese cálculo en un componente.

**`avisar_incompleto` sigue existiendo en el motor** (avisa sin bloquear, y está probado),
pero hoy **ningún enganche lo usa**. Si algún día vuelve a haber un grupo opcional con
recordatorio, el mecanismo está listo; mientras tanto, no asumas que existe ese caso.

### 5. `store_id` en todas las tablas

Hoy hay una sola tienda, pero cada tabla lleva `store_id` y toda consulta lo filtra.
La tienda se resuelve en **un solo lugar** (`getStore()`); no la hardcodees en queries.
Esto es el seguro para el multi-tenant futuro.

### 6. Zona horaria: America/Bogota

Toda comparación de horario de atención usa la zona de la tienda, nunca UTC ni la hora
del servidor. La lógica vive en `src/lib/horario.ts` y considera, en este orden:

1. `store.acepta_pedidos` (interruptor manual, gana sobre todo)
2. `store_closure` para la fecha de hoy
3. `store_hours` del día de la semana

`calcularDisponibilidad` y `ahoraEnBogota` reciben el instante como parámetro, así que sirven
igual para "¿está abierta ahora?" que para "¿lo estará a las 7?" — que es lo que necesita el
pedido programado (regla 16). La vuelta, de hora local de Bogotá a instante absoluto, es
`instanteEnBogota()`: **la única conversión del proyecto**, y ahí es donde se asume que
Colombia es UTC-5 sin horario de verano.

### 7. Dinero en enteros

Todos los montos son pesos colombianos en `INT`. Nunca `float`, nunca decimales.

### 8. Los upsell son items propios

Cuando el cliente agrega una bebida desde la ficha de un churro, esa bebida se convierte
en su **propio `order_item`**, no en un modificador del churro. Si no, no llega a la barra
en el ticket de cocina ni aparece en los reportes de bebidas.

Consecuencia en el precio: **un upsell se cobra por el `precio_base` de su producto**, no
por el `precio_delta` del enganche. Al ser un item independiente, el servidor lo calcula
como cualquier otro producto. Un mismo Latte Frío cuesta lo mismo pedido suelto que
agregado desde un churro.

Por eso la línea base del carrito guarda su selección **sin** los grupos de tipo `upsell`
(`seleccionSinUpsells` en `src/lib/checkout/mapeo.ts`): si el upsell viajara dentro de la
selección del churro _y_ como línea suelta, el servidor lo cobraría dos veces.

Si algún día se quiere un precio promocional por comprar la bebida junto al churro, hay
que modelarlo como promoción explícita; `precio_delta` no sirve para eso.

### 9. Nunca borrar opciones, apagarlas

Los sabores de helado cambian cada semana. El panel usa el switch `disponible`, no
DELETE. Borrar rompe la trazabilidad de pedidos viejos.

Una **lista** entera (`modifier_group`) tampoco se borra: se archiva con
`modifier_group.activo`. Además de la trazabilidad, aquí borrar es destructivo de verdad —
`modifier_option.group_id` y `product_modifier_group.group_id` son `ON DELETE CASCADE`, así
que un DELETE se llevaría en silencio las opciones **y** los enganches de todos los productos
que la usaban.

`activo = false` significa exactamente dos cosas, y ninguna más:

- no aparece en el desplegable de la Carta, así que no se puede enganchar a productos nuevos;
- no sale en "Qué hay hoy".

**La carta pública no se entera**: los productos que ya la usan la siguen ofreciendo. Sacarla
de la ficha de un churro que exige elegir 1 salsa lo dejaría sin ninguna que ofrecer y, por la
regla 4, imposible de añadir al carrito. Por lo mismo `listarGruposEnganchables` devuelve
también las archivadas —es el diccionario con el que el panel resuelve el nombre de cada
enganche ya guardado— y quien filtra es la UI, solo sobre lo que se puede **añadir**.

### 10. Mensajería: el texto y el transporte van separados

El **contenido** de cada mensaje vive en `src/lib/notificaciones/plantillas.ts` y se
genera siempre desde el `snapshot` del pedido, nunca consultando precios actuales.

El **envío** pasa por `transporte.ts`, que expone `enviar(destino, mensaje)` y hoy
implementa `whatsapp-link`: genera una URL `wa.me/57XXXXXXXXXX?text=...` que el panel
abre con un toque desde el WhatsApp normal del negocio. Mañana puede implementar
`whatsapp-api` sin tocar ni una plantilla. Nunca llames a un proveedor de mensajería
directamente desde un route handler o un componente.

**Ningún aviso sale solo, y eso no es un pendiente: es el transporte.** `wa.me` necesita que
un humano toque el link, así que todo mensaje al cliente lo dispara un empleado desde el panel.
Enviar de verdad en automático exige la Cloud API con un número dedicado. Si alguien pide "que
le llegue solo al cliente", la respuesta es esa, no un cron.

**No todos los estados llevan mensaje, y los dos que no lo llevan tampoco son un pendiente:**

- `nuevo` **no avisa**. Hubo un "recibimos tu pedido, está pendiente de confirmar" que el panel
  ofrecía en cuanto entraba, y era un mensaje de más: al cliente le llegaban dos WhatsApp con
  medio minuto de diferencia, uno para decir que llegó y otro para decir que sí. Lo único
  honesto que se puede decir antes de que alguien mire el pedido es "pendiente", y eso no vale
  un mensaje. **El primer aviso al cliente es el de la aceptación**, y por eso es el que carga
  el resumen —número, total y cuándo llega— que antes iba en el de `nuevo`.
- `entregado` **no avisa**: el cliente acaba de recibir la comida en la mano.

`llevaAviso(estado)` dice si un estado tiene mensaje **sin armarlo**, porque el candado de
idempotencia (regla 11) se cierra antes de enviar. No lo reimplementes llamando a
`cambioEstado` con un pedido de mentira: eso se hacía antes y reventó en cuanto una plantilla
empezó a leer el total. Y no lo dupliques en la UI: `avisoPendiente` sale de `llevaAviso` en la
consulta del panel, así que quitar un estado de `TEXTO_ESTADO` borra su botón "Avisar" solo.

Formato: texto plano, `*negrita*` de WhatsApp, separadores `--------------------------------`.

### 11. Los avisos son idempotentes

Antes de enviar un aviso de cambio de estado, verificar en `order_status_event` que ese
estado no se haya notificado ya. Un pedido nunca debe generar dos veces el mismo mensaje,
y un estado que retrocede (ej. de `en_camino` a `preparando`) no dispara aviso.
Registrar el envío en `order_status_event.notificado_en`.

### 12. Roles del panel: `admin` y `colaborador`

`app_user` lleva la columna `rol` (`'admin'` | `'colaborador'`). No hay más roles.

- **admin** (los dueños): todo — CRUD de catálogo y precios, zonas, usuarios, pedidos.
- **colaborador** (empleados): gestión de pedidos (aceptar, cambiar estado, imprimir,
  asignar domiciliario, avisos) y los switches `disponible` / `agotado` de productos,
  variantes y opciones. **No** puede: cambiar precios, crear ni eliminar productos,
  tocar zonas ni usuarios.

`src/proxy.ts` (el "middleware" de Next, renombrado en la 16) protege las rutas
`/admin/*`, pero eso NO basta: **toda server action y route handler del panel llama
`exigirRol()`** (`src/lib/autorizacion.ts`) declarando el rol mínimo, porque las
mutaciones se pueden invocar sin pasar por la ruta. Una mutación sin `exigirRol()` es un
bug de seguridad, no un descuido de estilo.

**La sesión es propia, no Auth.js.** Aquí no hay OAuth ni providers ni registro público:
son dos o tres empleados con correo y clave. Una cookie httpOnly con el payload firmado
por HMAC-SHA256 (`src/lib/auth/sesion.ts`), 12 horas de vigencia y bcrypt para la clave.
Se firma con **Web Crypto y no con `node:crypto`** porque el proxy corre en el Edge
Runtime; por lo mismo `password.ts` vive aparte, ya que bcrypt no puede entrar ahí.
El secreto es `AUTH_SECRET` y cambiarlo cierra todas las sesiones.

El primer usuario se crea con `pnpm crear-usuario <correo> "<nombre>" admin` — el CRUD de
usuarios vive dentro del panel, al que no se entra sin uno. Reejecutarlo con el mismo
correo cambia la clave, que es cómo se recupera un acceso perdido.

### 13. El domicilio se calcula por zonas dibujadas, y se congela en el pedido

Las zonas de cobertura son polígonos que el admin dibuja sobre un mapa en
`/admin/zonas`. Tabla `delivery_zone`:

| Columna   | Tipo                    | Notas                                         |
| --------- | ----------------------- | --------------------------------------------- |
| id        | uuid                    |                                               |
| store_id  | uuid                    | como todas las tablas (regla 5)               |
| nombre    | text                    | ej. "Centro", "Balmoral"                      |
| precio    | int                     | **CHECK precio > 0** — ver más abajo          |
| poligono  | geometry(Polygon, 4326) | índice GiST                                   |
| prioridad | int                     | menor = se evalúa primero                     |
| color     | text                    | hex, para pintarla en el mapa del admin       |
| activa    | boolean                 | apagar, no borrar (regla 9 aplica igual aquí) |

Cálculo — vive completo en `src/lib/zonas.ts`, mismo trato que `precios.ts`:
dado el punto del cliente, `ST_Covers` sobre las zonas activas ordenadas por
`prioridad`; la **primera** que cubre el punto define nombre y precio. Los
solapamientos son válidos y los resuelve la prioridad, nunca "la más barata".
Punto en el borde del polígono = **dentro** (por eso `ST_Covers` y no `ST_Contains`).

El pedido guarda `zona_nombre` y `costo_domicilio` como **snapshot** (regla 2 aplica al
domicilio igual que a los items). Editar o eliminar una zona jamás altera pedidos ya
creados. El total del pedido = subtotal de items + `costo_domicilio`.

**El domicilio siempre se cobra**: lo ejecuta un courier externo. No existe envío
gratis, no existe pedido mínimo, no existe zona a $0. Si alguien pide esas features,
la respuesta es no (decisión de negocio, no técnica).

Drizzle no trae tipo nativo para `geometry`: se define un **custom type** en
`schema.ts`. La extensión PostGIS se habilita en una migración (`CREATE EXTENSION IF
NOT EXISTS postgis`), no a mano en el dashboard.

### 14. El pin manda

El costo del domicilio se calcula sobre **la posición final del pin en el mapa,
confirmada explícitamente por el cliente** ("Confirmar ubicación") — nunca sobre la
lectura cruda del GPS ni sobre la dirección escrita.

- "Usar mi ubicación" usa `navigator.geolocation` (gratis, requiere HTTPS). El pin
  resultante **siempre es arrastrable**: el GPS de escritorio se ubica por IP y falla
  por cuadras.
- Si el cliente niega el permiso: mapa centrado en la tienda, pin manual.
- Si el pin queda a más de 500 m de la lectura GPS original: aviso
  ("verifica que el pin esté en tu dirección exacta"), **sin bloquear**.
- La dirección escrita, **el barrio** y las observaciones son referencia para el
  domiciliario; no participan en el cálculo. El pedido guarda el punto
  (`geometry(Point, 4326)`).

**`order.barrio` NO es `order.zona_nombre`, y confundirlos fue un bug real**: el panel y el
WhatsApp del domiciliario llegaron a mostrar "zona 2" bajo la etiqueta "Barrio". La zona es
una herramienta interna para partir el mapa y cobrar; el barrio es lo que lee quien entrega.
Conviven en columnas distintas y el detalle del panel muestra las dos por separado.

El barrio lo **sugiere el pin** vía Nominatim (`src/lib/barrio.ts`) y lo **confirma el
cliente**: se rellena el campo, nunca se guarda a ciegas. Solo se mira `address.neighbourhood`
—`suburb` devuelve la comuna, tan inútil para el domiciliario como "zona 2"—, la llamada sale
del servidor colgada de `/api/zonas/cotizar`, y si falla o tarda más de 1,5 s el campo se
queda vacío y se escribe a mano: el precio del domicilio no puede depender de un servicio
comunitario gratuito. Es OSM, no Google, igual que los mapas.

**Fuera de cobertura** (el punto no cae en ninguna zona activa): el checkout se
bloquea y muestra un botón de WhatsApp con mensaje pre-armado — resumen del carrito +
link de Google Maps con el pin — para que la tienda cotice el domicilio. Si el cliente
acepta, ese pedido se gestiona por chat (v1). Pedidos manuales desde el panel con
costo digitado: v1.1, el snapshot ya lo soporta.

### 15. El panel traduce, no expone el modelo

La UI de administración habla el idioma del negocio, no el del esquema. Quien edita un
producto ve "Salsas incluidas: [2] · Toppings incluidos: [1] · ¿Permite adicionales?"
— y el sistema genera o actualiza los enganches `product_modifier_group` (los dos
`modo`, `min_select = max_select`, precios) por debajo. Nadie que use el panel debe
saber qué es un "enganche". Esa traducción vive en el servidor, junto a la validación,
no en el componente.

Lo mismo aplica a zonas: dibujar, nombrar y ponerle precio; `prioridad` se maneja
reordenando la lista, no editando números. **Se reordena con botones ↑/↓ y no
arrastrando**: el drag nativo de HTML5 no funciona en táctil y el panel se opera desde el
teléfono; traer una librería de drag-and-drop solo para esto no se justificaba.

### 16. El pedido programado se valida contra las franjas que genera el servidor

El cliente elige entre "lo más pronto posible" y una hora. `order.programado_para` es un
`timestamptz` **nullable, y ese nullable es el modelo**: `NULL` significa "lo antes posible".
No hay columna `modo` al lado, porque un booleano junto a una fecha admite la fila imposible
"programado sin hora" y ningún CHECK razonable lo impide.

`opcionesDeEntrega()` (`src/lib/pedidos/entrega.ts`) es la **única** fuente de qué se puede
ofrecer, y la usan tanto el checkout como `POST /api/pedidos`. El servidor genera la lista de
franjas y al confirmar **solo acepta una de las suyas** (`esFranjaOfrecida`): es la regla 1
aplicada al tiempo — el navegador manda *cuál* eligió, nunca *si* vale. De paso resuelve
gratis la franja que caduca mientras el cliente llena el formulario. Nunca revalides una hora
a mano ni escribas rangos horarios en Zod: sería una segunda fuente de verdad que envejece
sola en cuanto cambie el horario.

Reglas de las franjas (`src/lib/pedidos/franjas.ts`, puro y testeado como `precios.ts`):

- Cada **30 minutos**, dentro de `[abre, cierra)` — el cierre nunca es una franja válida.
- El horizonte es **hoy y mañana**, sin calendario. La UI son dos pestañas y una rejilla.
- La primera franja de hoy es `ahora + store.minutos_estimado_max`, redondeado hacia arriba.
  Mañana no arrastra esa holgura: empieza en la hora de apertura.
- Un día sin horario —cierre excepcional o sin `store_hours`— no aparece.

**Programar funciona con la tienda cerrada**, que es su razón de ser: quien arma el pedido de
noche lo deja listo para el día siguiente. Pero `store.acepta_pedidos` sigue apagándolo todo
(regla 6): es el botón de pánico, y uno que deja pasar pedidos no es un botón de pánico. Esa
comprobación vive en `opcionesDeEntrega` y no en el módulo puro, precisamente para que no se
pueda saltar generando franjas por otro camino.

`store.minutos_estimado_min` / `_max` son el "llega en 30–45 min", editables desde
`/admin/pedidos` porque es donde se está cuando se nota que la cocina va lenta.

---

## Panel admin — pantallas y permisos

| Pantalla          | colaborador                                                  | admin                                                             |
| ----------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `admin/pedidos`   | ver, aceptar, cambiar estado, imprimir, avisos, domiciliario | todo, más el rango de entrega estimada, el resumen del día y la descarga XLSX |
| `admin/catalogo`  | switches `disponible` / `agotado` de productos y opciones    | igual                                                             |
| `admin/productos` | solo Visible↔Agotado (ni ocultar ni reactivar)               | CRUD completo, precios, fotos (de producto y de categoría), categorías, enganches |
| `admin/opciones`  | solo switch `disponible` (sabores de la semana)              | crear/renombrar/ordenar opciones, precio propio, archivar listas  |
| `admin/zonas`     | sin acceso (ni lectura)                                      | mapa: dibujar, editar vértices, precio, prioridad, activar/apagar |

Estados de un producto (independientes entre sí — no colapsarlos en un enum):

| Estado                                    | `visible` | `disponible` |
| ----------------------------------------- | --------- | ------------ |
| Normal (pedible)                          | true      | true         |
| Agotado (se ve, con etiqueta, no se pide) | true      | false        |
| Oculto (no aparece)                       | false     | —            |

Los toggles del panel son a **un clic, sin confirmación** (operación diaria). Las
acciones destructivas (eliminar producto) piden confirmación explícita y solo admin.
Al guardar cualquier cambio de catálogo o zonas se revalida el menú público (ISR).

**El panel se opera en una tablet de 12" y en escritorio**, no en un teléfono. Se diseña para
≥1024 px; por debajo sigue siendo usable, pero no es el caso principal. Esto **no reabre la
regla 15**: una tablet también es táctil, así que nada se arrastra.

`/admin/pedidos` es un **tablero de cuatro columnas** —Sin aceptar · En preparación · En camino
/ Listos · Terminados— y esos cuatro grupos son **los mismos hitos** que ve el cliente en su
seguimiento (`indiceDeHito`). Es a propósito: si la cocina y el cliente contaran el pedido en
fases distintas, uno de los dos estaría viendo algo que no está pasando. Lo que cambia son los
rótulos, porque cambia quién lee. `cancelado` no tiene hito para el cliente pero sí columna
aquí (Terminados): para la cocina es un pedido que ya no toca.

**Cuatro columnas, cuatro estados vivos, un toque por columna.** El recorrido es
`nuevo → preparando → en_camino|listo → entregado` (`pasosDelPedido`), y cada botón mueve la
tarjeta de columna: Aceptar · En camino / Listo para recoger · Entregado.

**`aceptado` salió del recorrido y sigue en el enum.** Era un paso entre `nuevo` y `preparando`
que caía en la misma columna y en el mismo hito que `preparando`, así que pulsarlo no movía la
tarjeta ni cambiaba nada de lo que veía el cliente: un botón "En preparación" dentro de la
columna "En preparación". Quien acepta un pedido lo acepta *porque* lo va a preparar, y ahora
"Aceptar" lo deja en `preparando` de una vez. El valor sobrevive en `estado_pedido` porque hay
historial escrito con él, y `ESTADO_RETIRADO` en `estados.ts` lo lee como `preparando` para que
un pedido guardado así siga pudiendo avanzar. **No lo quites del enum ni de los `Record`
exhaustivos del módulo**, y no lo uses para pedidos nuevos.

La consulta trae **lo vivo siempre, más lo terminado de hoy**. Lo vivo no se filtra por fecha
porque un pedido programado para mañana ya entró; lo terminado sí, o la última columna se
vuelve un archivo. El corte va en la consulta y no después: con el `limit` y sin filtro, un día
movido empujaría fuera justo los pedidos vivos.

**`?fecha=YYYY-MM-DD` no es ese tablero con un filtro: es otra pantalla.** Un día pasado
termina con **cero pedidos activos** —todo se despacha el mismo día, salvo lo programado de un
día para otro—, así que mirar atrás no es operar, es consultar qué entró. Se ve como una lista
(`PedidosDelDia`), no como cuatro columnas de las que tres estarían vacías, y la consulta es
`listarPedidosDelDia`: rango cerrado y semiabierto por `creadoEn` (`[medianoche, medianoche)` de
Bogotá), **sin** la rama de lo vivo, que arrastraría a esa vista los pedidos abiertos de hoy.
Son dos preguntas distintas, y por eso son dos funciones y no una con bandera. El día de un
pedido es el de `creadoEn`: uno tomado el lunes para el martes cuenta como del lunes.

Esa lista es un **server component sin estado**: un día cerrado no cambia, así que no hay
polling, ni sonido, ni botones — cada fila abre el detalle, que sí opera. **`ListaPedidos` no
recibe ninguna bandera y no sabe que existen los días pasados**: la bifurcación vive en
`page.tsx`, y en modo consulta ese componente sencillamente no se monta.

Consecuencia que hay que tener presente antes de "arreglarla": **al salir de hoy, el tablero se
desmonta y con él se van el polling, la alarma y el `(N)` del título** — las limpiezas de los
`useEffect` lo hacen solas. Un panel dejado en "ayer" es un panel que no vigila el local, y por
eso la lista lleva un aviso permanente y el atajo "Volver a hoy". No hay vuelta automática: un
tablero que salta solo mientras alguien lo lee es peor que uno quieto.

La aritmética del día vive en `src/lib/pedidos/dias.ts`, pura y testeada como `franjas.ts`. No
inventes otra: un error de zona horaria ahí no rompe nada visible, solo mete los pedidos de la
noche en el turno equivocado. El límite superior del rango es **exclusivo**, o un pedido de
medianoche se contaría en dos días a la vez.

**`dias.ts` es de servidor y `fechas.ts` es de los dos.** El primero importa `horario.ts`, que
importa la capa de base de datos: usarlo desde un `'use client'` mete `postgres` en el bundle del
navegador y el build lo rechaza. Por eso lo que es calendario puro —contar días entre dos
`"YYYY-MM-DD"`, correr uno adelante o atrás, los nombres de los meses— vive en `fechas.ts`, sin
zona horaria y sin dependencias. Regla práctica: si necesitas saber **qué hora es en Bogotá**, es
`dias.ts`; si solo mueves números de calendario, es `fechas.ts`.

### El resumen del día y la descarga

Dos piezas, dos preguntas. El **resumen** (icono de estadísticas) es de **un día** y sirve para
cerrar el turno y cuadrar la caja; la **descarga** XLSX es de **un rango** y sirve para
contabilidad. Las dos son de **admin**: ahí sale junto lo que facturó el negocio.

**Las cifras se agregan en SQL (`db/queries/resumen.ts`), nunca sumando la lista de la pantalla.**
Parece equivalente y no lo es: en un día pasado daría igual, pero el tablero de **hoy** muestra
"lo vivo siempre, más lo terminado de hoy", así que arrastra pedidos vivos creados **ayer** y
además está topado en 100 filas. Sumar eso da una cifra que no es la del día y que se corta sola
justo el día que más se factura.

**Un pedido cancelado aparece pero no suma.** Queda fuera de ventas, productos y domicilios —esa
plata no entró—, y se cuenta en su propia casilla. Los tres conteos cuadran:
`domicilios + recoger + cancelados = pedidos`. Y el dinero también:
`ventas = productos + domicilios − descuentos`; si algún día no cuadra, hay un pedido mal escrito.

`pedidosDelRango` **no reusa `listarPedidosDelDia`**, y eso es deliberado: aquella tiene
`TOPE_DIA = 300` y un archivo que descarta filas en silencio es peor que uno lento —se vería
completo y la suma saldría corta—. El tope de la descarga es el del rango
(`MAXIMO_DIAS_RANGO = 92`), que sí se le puede decir a quien descarga. Por lo mismo, las líneas
con un snapshot corrupto se **cuentan** y salen avisadas en la hoja de resumen, en vez de
descartarse en silencio como hace la pantalla.

**En el XLSX los montos son números y las fechas son fechas.** Un Excel donde el total es la
cadena `"$59.500"` no se puede sumar, que es justo para lo que se descarga: `pesos()` se queda en
la pantalla. Y las fechas pasan por `enHoraDeBogota()` antes de escribirse, porque Excel guarda
un número de días **sin zona horaria** y `write-excel-file` lo calcula con `getTime()` a secas:
sin corregir, un pedido de las 3 pm se abriría como las 8 pm y la caja de la noche caería en el
día siguiente.

Falta una hoja que sí tiene la referencia de la que se copió el formato, y falta a propósito:
`Sedes`, porque hay una sola tienda. `Domiciliarios` tampoco está, pero por otro motivo: son una
agenda de contactos externos, no una nómina con turnos ni pagos que reportar — quién llevó cada
pedido viaja en su columna de la hoja `Pedidos`, que es donde se puede cruzar con las ventas. La
columna de cupón no existe todavía: cuando llegue va junto a `Descuento $`. **No se añade vacía**,
que se leería como un dato perdido.

### 18. El domiciliario tiene su propia llave, y solo abre una puerta

Asignar un pedido manda un WhatsApp al domiciliario con un link para **confirmar la entrega**
desde su teléfono (`/entrega/<token>`). Ese link es el único write del proyecto **sin sesión de
panel**, así que lo que lo sostiene queda escrito:

- **`order.token_entrega` es distinto de `token_publico` a propósito.** El del cliente solo
  *lee* su seguimiento; este *escribe* un estado. Reusar el del cliente le daría poder para
  marcar su propio pedido como entregado. Dos permisos, dos llaves, y no se mezclan.
- **Lo que decide qué se puede hacer no es el token, es `validarCambioEstado`**: solo
  `en_camino → entregado`. Un link filtrado no cancela, no adelanta un pedido que sigue en
  preparación y no sirve dos veces. Hay tests que fijan justo eso.
- **La pantalla no expone datos.** Número, nombre y calle; ni teléfono, ni total, ni items — todo
  eso ya se lo mandamos por WhatsApp, y repetirlo solo serviría para que un reenvío por error
  enseñe la ficha de un cliente.
- El evento se registra con `user_id` NULL: no lo tocó nadie del panel. Quién lo llevaba se sabe
  por `order.domiciliario_nombre`.

**Los domiciliarios son una agenda, no empleados** (tabla `courier`): el domicilio lo ejecuta un
courier externo (regla 13). El teléfono los identifica, como en `customer`, y se archivan con
`activo` en vez de borrarse (regla 9). El pedido guarda `courier_id` **más** nombre y teléfono
como snapshot (regla 2), igual que `zona_nombre`.

**Asignar NO cambia el estado del pedido.** Entre que se llama al domiciliario y que llega pasan
entre cinco y quince minutos, y durante esa espera el pedido sigue en preparación — que es la
verdad. Ponerlo "en camino" al asignar sería avisarle al cliente que ya salió cuando está en el
mostrador. Reasignar sobrescribe y vuelve a mandar el mensaje: repetirlo es normal, no un error,
y por eso ahí no hay candado de idempotencia. El de la regla 11 protege los avisos al **cliente**.

El mensaje al domiciliario vive en `plantillas.ts` como todos (regla 10) y tiene su propio tipo de
entrada: necesita `paga_con` y si el pedido ya está pagado, que son datos de caja y no tienen por
qué existir en los avisos al cliente. Lleva **cuánto cobrar y la devuelta ya calculada** —para eso
existe `order.paga_con`, y hasta ahora no lo leía nadie—, y cuando el pago está confirmado lo
sustituye por un **NO COBRAR** solo, sin ninguna cifra al lado: cobrar un pedido ya pagado es un
incidente con el cliente. **No lleva el detalle de productos**: no arma el pedido, lo lleva, y el
texto viaja dentro de una URL `wa.me` que se rompe si crece.

### 19. Avanzar el pedido avisa al cliente en el mismo toque

El botón naranja del tablero cambia el estado **y** abre el WhatsApp del cliente si ese estado
lleva mensaje. Eran dos botones y el segundo se olvidaba: es un solo momento —el pedido cambió de
sitio, hay que decírselo— y partirlo en dos no lo hacía más seguro.

La idempotencia no se relaja, y queda cerrada por partida doble: `cambiarEstadoPedido` reserva la
fila con `SELECT … FOR UPDATE` y valida la transición, así que de dos pestañas pulsando a la vez
**solo una gana el cambio de estado** — y solo esa llega a pedir el aviso. El candado de
`marcarEstadoNotificado` sigue siendo el segundo cierre.

Si el navegador bloquea la ventana emergente, `window.open` devuelve `null` —señal fiable— y la
tarjeta ofrece el enlace a mano. **No se reabre el candado**: la URL ya está en el cliente, a un
clic, y revertir un candado que existe para no enviar dos veces sería peor que el problema. El
botón ámbar "Avisar" sigue existiendo como reintento para lo que quedó pendiente de antes.

**El polling del panel NO se pausa con la pestaña oculta.** Parece la optimización obvia y es
justo la que no se puede hacer: desde que el tablero avisa con sonido, ese intervalo dejó de ser
"pintar la pantalla" y es **lo que detecta el pedido**. Pausarlo apaga la alarma cuando el
empleado está en otra cosa, que es cuando hace falta. (El navegador ya frena por su cuenta los
temporizadores de fondo a ~1 por minuto; una pestaña que suena queda exenta de ese freno.)

**El intervalo es de 15 s, y antes eran 5 puestos a ojo.** Nadie acepta un pedido en menos de
quince, así que el ritmo rápido no compraba nada aprovechable y sí costaba: con el panel abierto
de 12 a 8 pm son ~58.000 invocaciones al mes por pestaña, contra ~173.000 a 5 s. Lo que hace que
no se noten es que **volver a la pestaña y recuperar la conexión disparan una consulta
inmediata** —con un tope de 3 s entre ellas—, y que el aviso de "sin conexión" sale con el
evento `offline` y no esperando a que falle una petición.

**Supabase Realtime está evaluado y descartado, por ahora.** Para un SaaS multi-tienda es la
arquitectura correcta; aquí cuesta más de lo que rinde. Realtime autoriza con RLS, RLS evalúa un
JWT de Supabase, y este panel se autentica con la cookie propia firmada por HMAC (regla 12): no
existe tal JWT. Adoptarlo obliga a activar RLS sobre `order` —nombre, teléfono, dirección y pin
del cliente—, publicar la llave `anon` (que hoy no sale al navegador, ver Convenciones) y migrar
la auth o firmar JWTs propios. **Reconsiderarlo cuando haya multi-tienda**, sobre unos 10
paneles abiertos a la vez. La migración será barata: la alarma reacciona a *una lista nueva de
pedidos*, no a cómo llegó, así que solo cambia quién llama a `setPedidos`.

El aviso son dos disparadores: suena al aparecer un id que no estaba, y **insiste cada 30 s**
mientras quede algo sin aceptar, así que el silencio significa que alguien lo tiene. No suena al
abrir el panel por lo que ya estaba —la lista de vistos se siembra con lo que llega del
servidor— y el audio necesita **un gesto del usuario** antes de poder sonar: de ahí el botón de
"Activar sonido", que no es un adorno sino el requisito del navegador.

---

## Convenciones

- **Conexión a Supabase:** usar el transaction pooler (puerto 6543) con
  `postgres(url, { prepare: false })`. Las migraciones y el introspect usan el session
  pooler (5432). La conexión directa NO sirve: es IPv6.
- **Sin RLS, y por eso la llave `anon` NUNCA sale al cliente.** Las tablas no tienen
  Row Level Security porque todo el acceso pasa por el servidor. Como consecuencia:
  prohibido usar `NEXT_PUBLIC_SUPABASE_ANON_KEY` o el cliente de Supabase en
  componentes del navegador. Si esa llave se filtra, las tablas quedan expuestas.
  Las subidas a Storage también van desde el servidor.
- **Storage: dos buckets, y la diferencia importa.** `comprobantes` es **privado**
  —guarda datos personales y se lee por un proxy autenticado del panel— y se purga a
  los 60 días con **`pg_cron` dentro de Supabase** (no un cron de Vercel: corre en la
  base y no depende del hosting). `productos` es **público**: son las fotos de la carta,
  las ve cualquiera sin sesión. El free tier son 1 GB entre los dos.
- **Las dos cabeceras de Storage.** `src/lib/storage.ts` manda `Authorization: Bearer` **y**
  `apikey`. Las llaves nuevas de Supabase (`sb_secret_…`) no son JWT y con solo
  `Authorization` el servicio contesta `400 Invalid Compact JWS`, sin mencionar la cabecera
  que falta. Y ojo al leer: un objeto ausente llega como **400 con el 404 dentro del
  cuerpo** (`NoSuchKey`), no como 404.
- **La purga vive en la migración `0012`** (`public.purgar_comprobantes`, job diario de
  `pg_cron` a las 02:30 de Bogotá). Borra el objeto vía `pg_net` —quitar la fila de
  `storage.objects` dejaría el archivo ocupando cuota— y pone `order.comprobante_url` a
  NULL sin tocar el snapshot (regla 2). La URL y la llave las lee de **Vault**, no del
  archivo de migración: se cargan una vez con `pnpm configurar-purga`, y sin ellas la
  función falla a propósito en vez de borrar a medias.
- **Fotos de productos:** máximo 3 por producto; se comprimen ANTES de subir
  (WebP, ~800 px, ~100–150 KB). La primera es la portada.
- **La foto de categoría es una sola y se sube más grande.** Vive en `category.banner_url`, va al
  mismo bucket público bajo `categorias/<id>/`, se edita desde `/admin/productos` (icono de foto en
  la fila de la categoría, **solo admin**) y abre la sección en la carta. Se comprime a **1280 px**
  (`LADO_MAXIMO_BANNER`) y no a 800: es un hero a ancho completo, no una miniatura.
  **`CategoryBanner` es el único `next/image` sin `unoptimized`**, y esa excepción está razonada en
  el propio componente: su ancho mostrado va de ~390 a ~1016 px. No lo "corrijas" contra la
  convención de las miniaturas.
- **Server Components por defecto.** `'use client'` solo donde hay interacción real
  (modal de producto, carrito, panel, mapas).
- **El menú público se sirve con ISR, y encima hay cuatro capas de caché.** Solo la última
  la resuelve `revalidatePath("/")`; las otras tres explican por qué un cambio del panel
  no aparece solo en una pestaña ya abierta. Esto no se deduce del código —los defaults
  hay que ir a buscarlos a `node_modules`— así que queda escrito:

  | Capa | Qué retiene | Cuánto |
  | ---- | ----------- | ------ |
  | Pestaña ya abierta | todo | para siempre; lo mitiga `RefrescarAlVolver` |
  | `lib/tienda/productos-cache.ts` | la ficha ya descargada | vida de la pestaña |
  | Router Cache de Next (`experimental.staleTimes.static`) | el menú al volver con `<Link>` | default **300 s**, bajado a 30 |
  | ISR (`export const revalidate = 60`) | el HTML de `/` | 60 s, y **0 tras guardar en el panel** |

  Nada de esto es una barrera: quien decide sigue siendo el servidor, que recalcula precios
  y disponibilidad al confirmar (regla 1) y cuyo error traduce el checkout a un mensaje
  accionable. Ver una carta vieja es incómodo, nunca peligroso.

  **`pnpm dev` no prueba nada de esto**: en desarrollo no existen ni el Router Cache ni el
  ISR real. Cualquier cambio de caché se verifica con `pnpm build && pnpm start`.
- **El tipo de pedido caduca a las 6 horas, y esa caducidad es la feature.** `cronchy_tipo_pedido`
  se guardaba para siempre, así que quien recogió la semana pasada volvía y llegaba al checkout
  todavía en `recoger` — donde el paso de la dirección **se salta entero** y nada se lo gritaba.
  El modal bloqueante de `SelectorTipoPedido` ya sabía preguntar cuando el valor es `null`; lo que
  faltaba era que dejara de ser eterno. Seis horas cubren "miré a las 4 y pedí a las 9" sin llegar
  al día siguiente. No es "hasta medianoche en Bogotá" porque esa aritmética vive en `dias.ts`, que
  arrastra la capa de base de datos, y esto corre en el navegador. La lógica está partida en
  `leerGuardado(crudo, ahora)`, pura y testeada, porque Vitest corre en `environment: "node"` y ahí
  no hay `localStorage`. El checkout llama `renovarTipoPedido()` al montarse: estar ahí prueba que
  la elección sigue vigente, y sin eso la pregunta podría saltar a mitad del pago.

  **Dentro del checkout se cambia en el paso 1 y en ningún otro.** Ahí es gratis: el paso 1 existe
  en las dos listas (`[1,2,3]` y `[1,3]`) así que no hay salto, y la dirección persiste en
  `datos-cliente` aunque deje de viajar en el payload. En el paso 3 hay un total en pantalla y
  puede haber un comprobante de Nequi ya transferido — mover el tipo ahí es invalidar dinero. El
  paso 3 **muestra** el tipo ("Información de entrega" vs "Recoges en tienda") y no deja cambiarlo.
- **Nada de polling en la tienda pública.** El panel sí lo usa (son 2-3 empleados); la carta
  la ven todos los clientes desde datos móviles, y una petición por visitante cada N
  segundos no se justifica. `RefrescarAlVolver` reacciona a que el cliente vuelva a la
  pestaña: mientras nadie mira, no sale ni una petición.

  **La única excepción es `/pedido/[token]`**, y está medida: ahí no hay "todos los
  visitantes", hay **una** persona con **un** pedido en curso mirando si avanza. `SeguirEstado`
  consulta cada 15 s, solo con la pestaña visible, solo hasta `entregado`/`cancelado`, y contra
  un endpoint que devuelve `{ estado }` y nada más — la página completa se vuelve a pedir solo
  cuando el estado cambió de verdad. Son ~20 consultas diminutas en la vida de un pedido. No lo
  copies a la carta: ahí el cálculo da otro resultado.
- Imágenes siempre con `next/image`, con **loader apuntando al CDN de Supabase**
  (o `unoptimized`): las fotos ya se suben optimizadas y no hay que gastar la cuota
  de optimización de Vercel en trabajo ya hecho. Los clientes entran desde datos
  móviles.
- **Leaflet solo en el cliente:** los componentes de mapa se cargan con
  `dynamic(..., { ssr: false })` — Leaflet toca `window` y revienta en SSR.
- Mobile-first, siempre. El escritorio es el caso raro aquí.
- Validación con Zod en el borde de cada route handler, antes de tocar la base.
- Los estados del pedido se registran en `order_status_event`, no solo actualizando
  `order.estado`.
- Tests con Vitest para `precios.ts`, `horario.ts`, `zonas.ts`, `pedidos/franjas.ts` y
  `pedidos/dias.ts` como mínimo — es donde un bug cuesta plata real. Para `zonas.ts`: punto
  dentro, fuera, en el borde, en solapamiento (gana prioridad) y con todas las zonas apagadas.
  Para `franjas.ts`: la anticipación de hoy, que mañana no la arrastre, el turno partido, el
  límite del cierre y que el instante guardado sea el de Bogotá y no el de UTC. Para `dias.ts`:
  las 11:30 de la noche (que en UTC ya son el día siguiente), la medianoche en los dos bordes
  del rango, y los saltos de mes, de año y de 29 de febrero.

## Qué NO hacer

- No introducir microservicios, colas ni WebSockets. El panel usa polling cada 15s.
- No agregar una pasarela de pago. El flujo es efectivo o comprobante de Nequi.
- No usar la API de WhatsApp con el número actual del negocio: ese número se usa para
  hablar con proveedores y la Cloud API lo dejaría inutilizable en la app. Los avisos
  salen por `wa.me` desde el panel. Migrar a Cloud API solo con un número dedicado.
- No usar APIs de Google Maps (Geocoding, Places, JS API): los mapas son Leaflet +
  OpenStreetMap y el cálculo es PostGIS. Google queda como upgrade futuro explícito,
  nunca como atajo.
- No crear lógica de envío gratis, pedido mínimo ni descuentos de domicilio: no
  existen en este negocio (regla 13).
- No crear productos de prueba: el seed usa el catálogo real.
- No convertir el proyecto en multi-tenant todavía.
