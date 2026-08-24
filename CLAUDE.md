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
      cupones/              CRUD de cupones de descuento — solo admin
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
      cupones.ts              busca el cupón y expande su alcance + CRUD del panel
  lib/
    precios.ts                CÁLCULO DE PRECIOS — fuente única de verdad
    zonas.ts                  CÁLCULO DE DOMICILIO — fuente única de verdad
    cupones.ts                CÁLCULO DEL DESCUENTO (regla 20) — puro, testeado
    barrio.ts                 SUGERENCIA de barrio desde el pin (OSM) — nunca fuente de verdad
    horario.ts                ¿está abierta la tienda en tal instante?
    fechas.ts                 nombres de meses y días + calendario sin zona horaria
                              (el único módulo de fechas que puede usar el cliente)
    tienda/local.ts           DÓNDE QUEDA EL LOCAL y cómo se llega — puro, testeado
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
      modificadores.ts        cómo se LEE el snapshot en pantalla — puro, testeado
      entrega.ts              compone tienda + horario: qué se puede ofrecer hoy
    notificaciones/
      plantillas.ts           TEXTO de los mensajes — fuente única
      transporte.ts           adaptador: whatsapp-link | whatsapp-api | telegram
    impresion/
      escpos.ts               LOS BYTES de la impresora térmica — puro, testeado
      comanda.ts              el ticket de cocina — puro, testeado
      recibo.ts               el recibo del cliente — puro, testeado
      enlace.ts               el deep link `cronchyprinter://raw` (regla 22)
      pruebas/decodificar.ts  lee un ticket de vuelta a texto — solo para los tests
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

**Dos cosas del snapshot que hay que saber antes de pintarlo:**

- **El `modo` del enganche NO se guarda.** Cada modificador lleva solo `grupo`, `nombre`,
  `cantidad` y `precio`, así que "incluido vs adicional" no se puede reconstruir: `precio > 0`
  implica adicional con certeza, pero `precio === 0` puede ser un incluido **o** un adicional
  gratis (Gas, Nivel de dulce). Por eso lo que la UI separa es **cobrado vs no cobrado**, que sí
  responde el precio — llamarle "extra cobrado" a algo que costó $0 sería falso igual. No lo
  deduzcas del nombre del grupo: el esquema permite enganchar el mismo grupo en los dos modos con
  la misma etiqueta.
- **`precio` es UNITARIO.** Quien lo muestre multiplica por `cantidad`. El detalle del panel no lo
  hacía y decía $2.000 donde el WhatsApp del negocio decía $4.000 por el mismo pedido.

`src/lib/pedidos/modificadores.ts` hace las dos cosas —agrupar y repartir por precio— y es de
donde debe salir cualquier pantalla nueva. **El WhatsApp y el XLSX tienen su propio formato a
propósito** y no se unifican con ese módulo: en el export van los nombres completos porque va a
contabilidad, y en el mensaje el texto viaja dentro de una URL `wa.me` que se rompe si crece.

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

  **Ojo: `centroTienda` NO es la ubicación del local.** Es `store.ubicacion` **con respaldo al
  parque principal de Fusagasugá** cuando nadie ha fijado el pin, porque el mapa hay que abrirlo en
  algún sitio. Para decirle a alguien dónde recoger su pedido se usa la ubicación de verdad, que es
  nullable (`comoLlegarUrl` en `lib/tienda/local.ts`): con el respaldo, quien viene a recoger
  acabaría en el parque y con toda la confianza. Son dos valores de la misma columna y por eso se
  llaman distinto.

  **Y hay que decírselo, porque en iPhone el fallo es invisible.** Un cliente real tocó el botón
  y no pasó nada: tenía la Localización apagada para Safari a nivel de sistema, así que iOS ni
  llegó a mostrar el diálogo —contestó `PERMISSION_DENIED` en un milisegundo, sin preguntar— y
  acabó saliendo a los Ajustes del teléfono por su cuenta. El componente recibía el error, lo
  **tiraba** (callback sin parámetro) y pintaba una frase gris debajo del mapa de 256 px, o sea
  fuera de pantalla en un teléfono.

  `src/lib/checkout/ubicacion.ts` traduce el `code` a instrucciones, puro y probado, y el aviso
  se pinta pegado al botón. Tres cosas que no se pueden hacer y por eso no se intentan:

  - **No se puede reabrir el diálogo de permiso desde JavaScript**, ni enlazar a los Ajustes de
    iOS (`App-Prefs:` está bloqueado en Safari). Solo queda explicar dónde está el interruptor.
  - **No se puede consultar el permiso antes de pedirlo**: WebKit no implementa
    `permissions.query({name:"geolocation"})`. El `code` del callback es la única señal.
  - **Tras conceder el permiso, iOS no lo reevalúa sin recargar**, así que ahí el botón ofrece
    recargar y no reintentar. Se puede prometer que no se pierde nada porque el paso, el carrito
    y los datos viven en `localStorage`.

  El texto depende del navegador: todos los de iOS son WebKit y fallan igual, pero cada uno tiene
  su entrada en la lista de Localización. Ojo con el orden al leer el UA — el de Chrome en iPhone
  también termina en `Safari/…`, y mandar a un usuario de Chrome a "Ajustes › Safari" es mandarlo
  a una pantalla donde su navegador no está.
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

**Esa sugerencia es imprecisa por los datos, no por el código, y conviene saberlo antes de
intentar "arreglarla".** OSM tiene los 90 barrios de Fusagasugá como **nodos sueltos: ninguno
tiene polígono**. Sin áreas, Nominatim no puede responder "el punto está dentro de Balmoral" y
contesta por proximidad y peso interno, que a esta escala es casi azar. Medido sobre dos
pedidos reales separados 60 m, devolvió **las dos veces el barrio más lejano** de los dos
candidatos (Balmoral a 168 m vs Managua a 174 m → dijo Managua; y al revés en el otro). Cambiar
a "el nodo más cercano" tampoco lo arreglaría, y encima uno de esos nombres —"Managua"— no
existe en la ciudad.

Por eso hay una **capa de traducción de nombres**: la tabla `barrio` (`nombre_osm` → `nombre`,
NULL = no sugerir nada) se edita en `/admin/ajustes` y se aplica en `/api/zonas/cotizar`
**después** de `barrioDelPunto`, nunca dentro: esa función cachea la respuesta de OSM una hora,
y traducir antes de su caché serviría el nombre viejo una hora después de corregirlo. La parte
que decide es `resolverNombreBarrio`, pura y testeada, y sus tres casos no son dos: **sin fila
en la tabla** el nombre pasa tal cual (un barrio que OSM añadió luego), que no es lo mismo que
una fila con `nombre` NULL.

Lo que esa tabla **no** arregla, y por eso el campo sigue siendo editable: que el pin reciba el
nombre de un barrio vecino que sí existe. Traducir solo puede con los nombres que están mal
siempre. La solución de raíz sería dibujar los barrios como polígonos propios, y hasta hoy no
se ha necesitado.

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

**Y eso vale para TODO el camino del pedido, no solo para la hora.** La pregunta que hay que
hacer es "¿se puede pedir?" —`sePuedePedir(opciones)`, que es `pronto || dias.length`— y nunca
"¿está abierta ahora?". Son cosas distintas desde que existen las franjas, y confundirlas costó
un checkout sin salida: **`POST /api/comprobantes` preguntaba lo segundo**, así que de noche
rechazaba el archivo con un 409. Como `crearPedidoSchema` exige comprobante cuando el método es
`nequi`, un pedido programado se podía pagar en efectivo pero **no por Nequi** — y peor en
`recoger`, que se paga por adelantado y por tanto no tenía ninguna otra vía. El cliente lo
descubría al final del formulario.

Por eso `estaAbierta()` y `estaAbiertaEn()` **ya no existen**, y no es limpieza: el nombre es lo
que invita a volver a usar el criterio equivocado para decidir si se acepta algo. `horario.ts`
quedó puro —solo `calcularDisponibilidad` y compañía, sin tocar la base— y quien consulta es
`entrega.ts`. Si algún día hace falta saber si la tienda está abierta en un instante, que sea
para *mostrarlo*, jamás para autorizar un pedido.

`store.minutos_estimado_min` / `_max` son el "llega en 30–45 min", editables desde
`/admin/pedidos` porque es donde se está cuando se nota que la cocina va lenta.

### 22. La web arma el ticket; la impresora solo lo vuelca

Los tickets salen por una **térmica Bluetooth** a la que se llega con un deep link,
`cronchyprinter://raw?v=1&d=<base64url>`, que lleva dentro los bytes ESC/POS **ya armados**. Lo
atienden dos handlers distintos y ninguno de los dos sabe qué es un pedido: en la tablet, la app
`com.pos.bluetoothprinter` (`PrintRawActivity`); en Windows, un script registrado en el sistema
(`scripts/impresion-windows/`). Un solo enlace, un solo camino de código en la web.

**Esa app es la misma que imprime el POS de AppSheet, y por eso el host es nuevo.** Sus hosts
`print` y `printreceipt` maquetan el ticket en Java, con las columnas Producto/Helado/Cant/Toppings
cableadas: es el modelo de datos de AppSheet y un pedido de aquí no cabe en él —grupos de
modificadores arbitrarios (regla 3), domicilio o recoger, barrio, hora programada, cupón—. Se
añadió `raw` en vez de tocarlos, así que **AppSheet no se entera**. Ver `docs/impresora-android/`.

Lo que se gana: el diseño del ticket vive en `src/lib/impresion/`, puro y testeado como
`precios.ts`, y **cambiarlo no vuelve a requerir compilar un APK**.

Cuatro cosas que no se cambian:

- **El texto NUNCA sale en UTF-8.** Estas impresoras trabajan por *página de códigos*: `codificar`
  emite `ESC t 0` y traduce cada carácter al **subconjunto común de CP437 y CP850** —`á é í ó ú ñ
  Ñ ü Ü É ¿ ¡ °` están en la misma posición en las dos—, translitera el resto (`Á→A`, `×→x`,
  `·→-`) y en último caso pone una interrogación. Á, Í, Ó y Ú solo existen en CP850, así que
  mandar su byte pintaría un símbolo de caja en una impresora que arranque en 437. El
  `getBytes("UTF-8")` del Java es justo el bug que esto evita, y no se ha notado en AppSheet
  porque esos datos vienen sin tildes.
- **Imprimir no muta nada y no lleva candado.** Ni columna, ni evento, ni `revalidatePath`.
  Reimprimir es normal —el ticket se mojó, salió cortado, se lo llevó el domiciliario—, misma
  doctrina que reasignar (regla 18). El candado de la regla 11 protege los avisos al **cliente**.
- **La web nunca sabrá si el papel salió.** En cuanto se entrega la URL el control se va a otra
  app y no vuelve, igual que con `wa.me`. El acuse lo da el `Toast` del APK. No inventes una
  confirmación en pantalla.
- **La comanda no lleva precios ni dirección; el recibo sí lleva el desglose.** Son dos lectores:
  quien prepara y quien paga. La dirección la necesita el domiciliario y le llega por WhatsApp
  (regla 18) — misma doctrina que el payload del push: lo que no hace falta en un papel que se
  queda en el mostrador, no se imprime.

El desglose del recibo es **el mismo que el de `bloqueRecibo`** en `plantillas.ts`, hasta en qué
líneas se callan (regla 20: productos, descuento, subtotal, domicilio, total). Que el papel y el
WhatsApp contaran la misma plata de dos maneras sería un reclamo esperando a pasar.

**Aceptar imprime la comanda en el mismo toque** que cambia el estado y abre el WhatsApp (regla
19). Por eso `PrintRawActivity` **no puede tener interfaz**: con la pantalla de la app de por
medio, ese toque sería un baile de tres aplicaciones.

**Y el WhatsApp va PRIMERO, que es al revés de como se escribió y costó un bug.** Un toque trae
una sola *activación transitoria* del navegador y se la queda la primera API que la pida, así que
la segunda salida se queda sin gesto. Lo que pasa entonces no es simétrico: la impresión es **un**
salto (`<a>` → `cronchyprinter://`) y lo peor que le pasa es un «¿Abrir POS Printer?» en el propio
panel; el WhatsApp son **tres** —`window.open` → `wa.me` → `api.whatsapp.com` → `whatsapp://`— y el
último lo da una página que, sin gesto heredado, se queda en «Continue to WhatsApp Business?» con
el empleado eligiendo entre abrir la app y WhatsApp Web. Con la impresión delante, eso salía en
todos los pedidos aceptados. **El gesto se lo lleva la salida más frágil, no la primera que se
escribió.**

En el tablero, sin aceptar el icono saca la comanda de una y a partir de ahí abre un modal con los
dos tickets (`accionesDeTarjeta`, probado). En el detalle están siempre los dos, **también en un
pedido terminado**: es donde se viene a buscar el recibo de ayer.

**Windows no puede imprimir sin diálogo desde el navegador**, y por eso el handler existe:
`window.print()` siempre abre Ctrl+P. El script manda los bytes en **modo RAW** por `winspool.drv`
—`Out-Printer` pasa por el driver y rasterizaría el ESC/POS— y así no hace falta compartir la
impresora.

---

## Panel admin — pantallas y permisos

| Pantalla          | colaborador                                                  | admin                                                             |
| ----------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `admin/pedidos`   | ver, aceptar, cambiar estado, imprimir, avisos, domiciliario | todo, más el rango de entrega estimada, el resumen del día y la descarga XLSX |
| `admin/catalogo`  | switches `disponible` / `agotado` de productos y opciones    | igual                                                             |
| `admin/productos` | solo Visible↔Agotado (ni ocultar ni reactivar)               | CRUD completo, precios, fotos (de producto y de categoría), categorías, enganches |
| `admin/opciones`  | solo switch `disponible` (sabores de la semana)              | crear/renombrar/ordenar opciones, precio propio, archivar listas  |
| `admin/zonas`     | sin acceso (ni lectura)                                      | mapa: dibujar, editar vértices, precio, prioridad, activar/apagar |
| `admin/cupones`   | sin acceso (ni lectura)                                      | crear cupones, porcentaje, a qué aplican, vencimiento, aviso de la carta, apagar |
| `admin/ajustes`   | sin acceso (ni lectura)                                      | dirección y teléfono del local, con qué se paga (llave, titular, QR) y los nombres de barrio que OSM devuelve mal |

Estados de un producto (independientes entre sí — no colapsarlos en un enum):

| Estado                                    | `visible` | `disponible` |
| ----------------------------------------- | --------- | ------------ |
| Normal (pedible)                          | true      | true         |
| Agotado (se ve, con etiqueta, no se pide) | true      | false        |
| Oculto (no aparece)                       | false     | —            |

Los toggles del panel son a **un clic, sin confirmación** (operación diaria). Las
acciones destructivas (eliminar producto) piden confirmación explícita y solo admin.
Al guardar cualquier cambio de catálogo o zonas se revalida el menú público (ISR).

**Eliminar un producto sí existe, y su regla es: se borra lo que nunca se pidió; lo que se vendió
se oculta.** Es el único DELETE del catálogo, y no es una excepción a la regla 9 sino la misma
doctrina leída sobre las tres FKs que apuntan a `product.id`, que no significan lo mismo:
`product_modifier_group.product_id` va en CASCADE porque los enganches son **configuración** de
ese producto y se van con él; `order_item.product_id` no lleva `ON DELETE` porque es **historial**
(la regla 2 lo reserva para reportes agregados); y `modifier_option.producto_ref` tampoco, porque
es el catálogo **vivo** de otro producto — es lo que hace que un upsell se cobre por el
`precio_base` de su bebida (regla 8). Postgres ya rechaza los dos últimos casos, así que lo que
aporta `eliminarProducto` es comprobarlos antes y devolver el motivo: un 500 de la base no le dice
a nadie que la salida es Oculto, ni a qué lista de Opciones ir. El caso que esto resuelve es el
producto de prueba o duplicado, que nunca se vendió y hasta ahora se quedaba en el panel para
siempre.

**No se avisa antes de pulsar, a propósito.** Saber si un producto se vendió exige un agregado
sobre `order_item`, que no tiene índice por `product_id`, y pagarlo en cada carga del panel para
adornar un botón que se usa dos veces al año no vale. Quien decide es el servidor y la UI traduce
su error, igual que en el checkout; el panel de confirmación adelanta la condición con palabras.

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
columna **`Cupón`** ya llegó y va justo donde se dijo, junto a `Descuento $`: quien lee la fila
quiere el porqué al lado de la cifra (regla 20).

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
empleado está en otra cosa, que es cuando hace falta.

**Avisar de fondo es una pelea con el navegador, y hay tres piezas.** Aquí decía que "una pestaña
que suena queda exenta" del freno de fondo, y eso llevó a dar por hecho que funcionaba. No
funcionaba: durante meses la alarma **solo sonaba al volver y abrir la ventana**. Lo que hay que
saber:

- **El `AudioContext` se suspende en segundo plano y no revive solo.** Esta era la causa de que no
  sonara *nada*, no de que sonara tarde. `sonarAviso()` intenta `resume()` antes de rendirse, y
  puede hacerlo por código porque el botón ya aportó el gesto que exige el navegador. Sin ese
  primer gesto no hay nada que reanudar, que es correcto: nadie ha pedido que suene.
- **La exención del freno exige estar reproduciendo audio de verdad**, no poder reproducirlo. Por
  eso `iniciarMantenerDespierto()` deja un oscilador inaudible sonando mientras los avisos están
  armados. Es **best-effort**: las heurísticas de Chrome no son un contrato. Si dejan de eximir a
  la pestaña, el aviso sigue llegando con el retraso del throttling (~1 tic por minuto), no se
  pierde.
- **La notificación del sistema es el canal que se ve desde otra aplicación.** El `(N)` del título
  hay que verlo en la barra de pestañas y el pitido se pierde entre el ruido de la cocina. Lleva
  `requireInteraction` —una notificación que se desvanece a los cinco segundos es una que nadie
  vio— y `tag` + `renotify`, para reemplazar en vez de apilar cinco pedidos seguidos.
- **Sale por el service worker y no por `new Notification()`, porque en Android el constructor
  directo LANZA.** La primera versión usaba el constructor y no avisaba nada en la tablet, con el
  `catch` tragándoselo en silencio. `registration.showNotification()` funciona en los dos sitios.

Un solo botón arma los tres canales, porque el navegador exige un gesto tanto para desbloquear el
audio como para pedir el permiso de notificaciones. Si el permiso queda denegado el panel lo dice
en pantalla: uno que cree estar avisando y no avisa es peor que uno mudo declarado.

**Web Push es el tercer canal, y el único que llega con el navegador cerrado.** Lo dispara
`POST /api/pedidos` justo después de crear el pedido, envuelto en `try/catch`: el cliente ya
compró, así que un fallo empujando el aviso no puede convertirse en un error de su checkout.

- **En la tablet Android llega con Chrome cerrado del todo**, porque lo entrega el sistema
  operativo. Es el caso que motivó todo esto.
- **En Windows hace falta activar "Seguir ejecutando aplicaciones en segundo plano al cerrar Google
  Chrome"** (`chrome://settings/system`). Sin eso, al cerrar la última ventana el proceso muere y
  no recibe nada. Es un ajuste invisible y sin esta nota alguien va a concluir que el push no
  sirve.
- **El payload lleva solo el número del pedido.** Eso se ve en una pantalla bloqueada, y quien pasa
  al lado del mostrador no tiene por qué leer el nombre ni la dirección de nadie — misma doctrina
  que la regla 18.
- **Una suscripción muerta se detecta por el 404/410 del servicio de push, no por antigüedad**, y
  se borra ahí mismo. Cerrar sesión también la suelta: el teléfono de quien ya no trabaja aquí no
  puede seguir sonando.
- **`NEXT_PUBLIC_VAPID_PUBLIC_KEY` es la excepción legítima** a la regla de no exponer nada con ese
  prefijo: la llave pública VAPID está diseñada para ir al navegador y sola no autoriza nada. La
  privada, jamás.

**`public/sw.js` NO puede ganar un handler de `fetch`.** Es lo que alguien añadirá algún día "para
que funcione sin conexión", y un service worker que cachea respuestas rompe de raíz el ISR de la
carta y el polling del tablero: un pedido servido desde caché es un pedido que no existe. Ese
service worker existe solo para recibir avisos.

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

**El volumen del aviso no sale de la ganancia, y por eso está escrito.** El pitido original —dos
notas triangulares a 880 y 1320 Hz con la ganancia en `0.35`— no se oía en la tablet del mostrador,
y subir ese `0.35` no era el arreglo: el techo digital es `1.0`, así que por amplitud sola hay 2,8×
y pasarse recorta la onda. Las 4-6 veces que se pidieron salen de **la frecuencia** (3100 Hz, donde
converge el diseño de las alarmas de humo: un altavoz de tablet no rinde abajo y el oído es más
sensible entre 2 y 4 kHz), de **la onda cuadrada** (√3 más de valor eficaz a igual pico, y sus
armónicos caen en esa misma banda) y del pico al `0.9`. No hay compresor a propósito: una cuadrada
ya tiene el eficaz pegado al pico, así que no queda nada que recuperar. Medido en un
`OfflineAudioContext` sobre la misma ventana y sin contar la ventaja acústica de la frecuencia, el
eficaz sube **+21,8 dB** en Alto sin que el pico recorte —y la sonoridad percibida se dobla cada
~10 dB—, así que las 4-6× se cumplen con margen. Devolver esto a una triangular de 880 Hz porque
suena más agradable es devolver el aviso que no se oye.

El volumen se ajusta desde el tablero en tres niveles recordados (`cronchy_volumen_panel`), y
**cambiarlo suena en el momento**: un pedido real no se puede provocar a voluntad, así que sin esa
previsualización se estaría ajustando a ciegas. **Bajo sigue siendo más fuerte que el aviso viejo**
(+7,9 dB medidos), porque frecuencia y onda no dependen del nivel. Y lo que ningún nivel arregla:
la web no puede tocar el volumen de **multimedia** de Android — si está a media asta, no hay código
que lo suba.

### 20. El cupón descuenta un porcentaje, y lo decide el servidor

Un cupón (`CHURRO10`) descuenta un **porcentaje** sobre la parte del pedido que cubre. El cálculo
vive entero en `src/lib/cupones.ts`, puro y testeado como `precios.ts`: si necesitas saber cuánto
descuenta un cupón, importa de ahí.

Es **la regla 1 aplicada al descuento**, igual que la 16 lo es al tiempo y `metodosDePago` al
dinero: del navegador llega el **código**, nunca el monto. `POST /api/pedidos` lo busca
(`buscarCuponPorCodigo`), lo aplica desde cero y solo entonces sabe cuánto vale.
`/api/cupones/validar` existe para pintarlo en vivo mientras el cliente escribe, con el mismo
contrato que `/api/zonas/cotizar`: **no es la fuente del precio**.

Tres cosas del cálculo que no se cambian:

- **La base son los items elegibles. El domicilio no entra**, y no es un olvido: la regla 13 dice
  que el domicilio siempre se cobra porque lo ejecuta un courier externo. Ni siquiera llega como
  parámetro a `aplicarCupon`.
- **Se redondea una sola vez sobre la base**, nunca línea por línea: redondear por item deriva unos
  pesos y el total deja de cuadrar con el que el cliente vio.
- **Un upsell se evalúa como cualquier otro item.** La bebida agregada desde la ficha de un churro
  es su propio `order_item` con su propio `productId` (regla 8), así que un cupón de churros **no**
  la descuenta. Es correcto, y hay un test que lo fija.

**Un cupón que no sirve corta el pedido; no se ignora en silencio.** `calcularPedido` devuelve
`cupon_invalido` con su motivo y el checkout lo traduce con `mensajeDeRechazo` — la misma función
que usa la comprobación en vivo, para que el mismo problema no se explique de dos maneras. Cobrarle
el precio lleno a quien vio un total con descuento es peor que rechazarle el pedido: puede haberlo
transferido ya por Nequi. Ojo con el `null`: significa "escribió un código que no existe", que **no**
es lo mismo que no haber escrito ninguno (`undefined`).

El alcance se guarda como categorías y productos (`cupon_categoria`, `cupon_producto`) y se expande
a ids de producto **en cada lectura**: así un producto que entre mañana a una categoría cubierta
queda cubierto solo. La columna `alcance` no sobra —sin ella, "toda la carta" y "acoté pero no marqué
nada" son las dos cero filas, y la segunda descontaría sobre todo.

**Solo hay dos frenos: la fecha (`vence_el`) y el switch `activo`.** No hay tope de usos ni límite
por cliente, y es una decisión tomada, no un olvido: un código filtrado lo puede reusar la misma
persona hasta que venza. Si algún día hace falta, `usos_maximos` se cuenta sobre `order` (así un
pedido cancelado devuelve el cupo solo) con un `SELECT … FOR UPDATE` sobre la fila del cupón.
`vence_el` es `date` y no `timestamptz` porque "vence el 30 de septiembre" es un día de Bogotá: se
compara como cadena contra `diaDeBogota()`, y el cupón vale **durante todo** su último día.

Nada se borra (regla 9): se apaga. Por eso `order.cupon_id` no lleva `ON DELETE` — es historial—, y
`order.cupon_codigo` es el snapshot que se muestra, igual que `zona_nombre` (regla 2).

**El cupón llega por tres caminos y los tres escriben en el mismo sitio** (`carrito.cupon`): el campo
del paso 3, el link `?cupon=CHURRO10` y el aviso de la carta. Ese aviso (`cupon.anuncio`) cuelga del
cupón y no de `store` a propósito: así **muere con él** en vez de seguir anunciando una promo vencida.
Un índice único parcial garantiza que solo haya uno anunciado a la vez.

Y el detalle que hay que mirar dos veces al tocar el checkout: **el total con descuento se usa en
cuatro sitios** —el resumen, el «Transfiere este valor» de Nequi, el botón de confirmar y la devuelta
del efectivo—. Por eso existe `totalAPagar` como una sola constante: olvidar la del `DatoCopiable`
no cobra de más, hace algo peor, que es que el cliente **transfiera** de más.

### 21. El consentimiento de datos lo sella el servidor

El check del tratamiento de datos (Ley 1581) se guarda en `order.politica_aceptada_en`, un
`timestamptz` **nullable, y ese nullable es el modelo** — igual que `programado_para` (regla 16):
un booleano al lado admitiría la fila imposible "aceptó sin hora", que es justo la que no sirve
de evidencia. `NULL` significa "no hay consentimiento registrado".

Es **la regla 1 aplicada al consentimiento**: del navegador llega el **sí** (`politicaAceptada`,
que `crearPedidoSchema` exige `true`) y **nunca el cuándo**. La hora la pone `crearPedidoEnDB` con
`now()`, el mismo reloj que escribe `creado_en`. Un sello de tiempo que elige el propio interesado
no prueba nada, y el reloj de un teléfono se cambia en dos toques.

**Era un `disabled` en un botón, o sea nada.** Hasta la migración `0029` el check vivía solo como
`useState` en el checkout: no viajaba en el payload, no estaba en Zod y no había columna. Cualquier
POST armado a mano creaba el pedido sin dejar rastro. Por eso el campo es **requerido** en el
esquema y no opcional — si vuelve a ser opcional, la columna deja de significar algo.

Tres cosas que no se cambian:

- **No se rellena hacia atrás.** Los pedidos anteriores a la columna se quedan en `NULL` y el XLSX
  dice "No". Inventarles una fecha es exactamente lo que un registro de consentimiento no puede
  hacer: quedaría escrito que aceptaron el día que se corrió la migración.
- **No vive en el store persistido.** `datos-cliente.ts` ya lo decía de antes: el visto bueno es
  una decisión de UN pedido, no un dato del cliente. Se vuelve a marcar cada vez, y eso es lo que
  hace que cada pedido tenga su propia evidencia.
- **En el XLSX son cuatro columnas** (`Aceptó datos`, `Aceptó el`, `Versión política`,
  `Avisos WhatsApp`) más la hoja `Clientes`, que agrega por teléfono y responde "¿este cliente
  consintió, y desde cuándo?". Ahí el criterio es **al menos una** aceptación entre sus pedidos: el
  cliente de siempre tiene pedidos viejos sin marca y nuevos con ella, y decir "No" por el primero
  sería falso.

**El texto vive en `lib/legal/politica-datos.ts` como datos, no como JSX**, misma doctrina que
`plantillas.ts`: el documento cambia sin tocar un componente. `VERSION_POLITICA` se guarda en
`order.politica_version`, porque un registro que dice "aceptó" sin poder mostrar qué decía el
documento ese día se sostiene a medias. **Al editar el texto de forma que cambien las finalidades o
el responsable, hay que subir la versión** — dos textos distintos con la misma versión hacen que ese
registro deje de significar algo. El **medio** no lleva columna: hoy solo hay un camino de
aceptación, y una columna con un único valor posible es una constante, no un dato.

**El «Ver más» va fuera del `<label>`, y no es maquetación.** Dentro, el clic burbujea hasta el
label: abrir la política desmarcaría la aceptación, o la marcaría sin haber leído nada.

### La casilla de avisos por WhatsApp

`order.acepta_avisos` (`NOT NULL DEFAULT true`) dice si el cliente quiere que le escribamos por el
estado de su pedido. **Por defecto sí, y no es laxitud**: es finalidad necesaria del servicio —quien
pide quiere saber cuándo sale su comida—, no publicidad. Marketing sería otra columna y otra
casilla, esa sí desmarcada por defecto y con la Ley 2.300 encima. Por lo mismo `crearPedidoSchema`
lo trae con `.default(true)` en vez de exigirlo: un pedido nunca se rechaza por esto.

**El copy dice «avisos» y no «notificaciones automáticas», a propósito.** Por la regla 10 el mensaje
lo dispara un empleado desde el panel; prometer un envío automático sería prometer lo que el
transporte no hace.

Un `false` se respeta en **cinco sitios**, y el orden importa: los tres primeros salen **antes de
`marcarEstadoNotificado`**, o el candado de la regla 11 daría por avisado un estado que nunca se
avisó y el botón no volvería jamás.

1. `avisoCambioEstado` devuelve `null` — **el corte de fondo**, el único punto donde el teléfono del
   cliente entra en un `wa.me`, así que un camino nuevo lo hereda sin que nadie se acuerde.
2. `avisoDelAvance` (el botón naranja) sale antes del candado. El pedido **avanza igual**: lo que se
   calla es el mensaje, no el cambio de estado.
3. `prepararAviso` (el botón ámbar) igual, porque una server action se invoca sin pasar por la UI.
4. y 5. `avisoPendiente`, en `panel.ts` y en el detalle, para que el botón ni se ofrezca.

**Y el panel dice por qué**: un botón que desaparece sin explicación se lee como que el panel está
roto. Lo que **no** se apaga son «Llamar» y «Escribir» del detalle — resolver una novedad de la
entrega es contacto operativo (finalidad 5 de la política), no el aviso que el cliente rechazó. Y
quien dice que no no se queda a ciegas: le queda el seguimiento en `/pedido/[token]`.

---

## Convenciones

- **Conexión a Supabase:** usar el transaction pooler (puerto 6543) con
  `postgres(url, { prepare: false })`. Las migraciones y el introspect usan el session
  pooler (5432). La conexión directa NO sirve: es IPv6.
- **RLS activado y sin políticas: a la base se entra por `DATABASE_URL` y por ningún otro sitio.**
  Las 20 tablas llevan `.enableRLS()` en `schema.ts` y **cero políticas**, que en Postgres significa
  denegar todo a cualquier rol que no salte RLS. La app no se entera: conecta como `postgres`, que
  tiene `bypassrls` y es dueño de las tablas — igual que las migraciones, los tests y el `pg_cron`
  de la purga.

  **Esto estuvo apagado y no era teórico.** Con la llave `anon` —un secreto que vive en un
  dashboard, no en el código— se leían y escribían las 20 tablas: teléfono y dirección de cada
  cliente, y el hash de la clave del panel. Lo reportó Supabase como `rls_disabled_in_public`.

  Sigue **prohibido** usar `NEXT_PUBLIC_SUPABASE_ANON_KEY` o el cliente de Supabase en el navegador,
  y ahora por un motivo más fuerte: sin políticas no devolvería ni una fila. Las subidas a Storage
  también van desde el servidor.

  Tres cosas que hay que saber antes de tocar esto:

  - **Una tabla nueva nace SIN RLS.** Hay que acordarse del `.enableRLS()`; si se olvida, lo vuelve
    a cazar el linter de Supabase.
  - **Nunca `FORCE ROW LEVEL SECURITY`.** Con eso el dueño dejaría de saltar RLS y, sin políticas,
    la aplicación entera se quedaría sin leer nada.
  - **RLS protege tablas, no funciones.** `purgar_comprobantes` quedaba invocable por RPC con la
    llave `anon`, y el `REVOKE` hay que hacérselo a **PUBLIC**, no a `anon`: Postgres concede
    EXECUTE a PUBLIC en toda función nueva, así que revocar por rol es un no-op (pasó en la
    migración 0027 y lo arregla la 0028).
- **Storage: dos buckets, y la diferencia importa.** `comprobantes` es **privado**
  —guarda datos personales y se lee por un proxy autenticado del panel— y se purga a
  los 60 días con **`pg_cron` dentro de Supabase** (no un cron de Vercel: corre en la
  base y no depende del hosting). `productos` es **público**: son las fotos de la carta,
  las ve cualquiera sin sesión. El free tier son 1 GB entre los dos.

  Ese bucket público tiene **tres carpetas y ninguna más**: `<producto>/`, `categorias/` y
  `tienda/` (el QR de pago). La lista está cerrada en el regex de `esUrlDeFotoProducto`, que
  es el filtro con el que cada server action decide si guarda una URL — las URLs llegan del
  navegador, y sin ese corte un admin podría escribir el dominio de un tercero. Añadir una
  carpeta obliga a tocar `imagenes.ts`, `storage.ts` y `/api/admin/fotos`, en ese orden.
- **El pago se pide por llave y QR, nunca por número de teléfono.** El QR es el
  interoperable de **Bre-B**, no uno de Nequi: sirve desde la app de cualquier entidad, y por
  eso el checkout rotula el método "Nequi o Bre-B" aunque el enum `metodo_pago` siga diciendo
  `nequi` — el rótulo es de la pantalla, el enum es del historial ya escrito. `nequi_numero` y
  `nequi_titular` **siguen en la base pero no las lee nadie**, y ni siquiera viajan al
  navegador: mandar un celular que no se muestra sería filtrarlo a cambio de nada.

  **Recoger se paga por adelantado**: ahí no se ofrece efectivo, porque ponerse a preparar un
  pedido que nadie viene a buscar es comida a la basura. La lista de métodos la genera
  `metodosDePago` (`src/lib/pedidos/pago.ts`, puro y testeado) y quien la hace cumplir es
  `POST /api/pedidos` con `esMetodoOfrecido` — **es la regla 16 aplicada al dinero**, y por lo
  mismo no vive en Zod: `crearPedidoSchema` es puro y no sabe si hay llave configurada, así que
  la regla sería falsa justo en el caso del respaldo. **Sin llave, el efectivo vuelve** también
  en recoger: un checkout sin ninguna forma de pagar no protege nada, solo pierde el pedido en
  silencio.

  Cuidado con un detalle que no se ve en la pantalla: `metodoPago` vive en el carrito
  persistido y nada lo resetea al cambiar de tipo, así que el checkout **normaliza el heredado**
  con un efecto. Sin él, quien venía de un domicilio en efectivo llegaría al paso 3 sin ningún
  radio marcado y mandando `efectivo` igual, porque el payload sale del store y no del DOM.

  Dos cosas del QR que no se deducen del código:

  - **No se comprime al subirlo**, al revés que todo lo demás. `comprimirImagen` recomprime a
    WebP con pérdida, y aquí las dos cosas estorban: un QR denso pierde módulos, y el archivo
    tiene que abrirse en el selector de imágenes de la app de un banco, donde JPG y PNG son
    apuestas más seguras. Pesa ~124 KB; no hay nada que ahorrar. Por lo mismo se pinta con
    `unoptimized` en las dos pantallas.
  - **Se descarga por `/api/qr-pago` y no desde Storage**, porque el atributo `download` de un
    `<a>` **se ignora en enlaces cross-origin**: apuntando a Supabase, el navegador abriría la
    imagen en otra pestaña en vez de guardarla. Y guardarlo es justo el punto — el cliente
    está mirando el checkout en el mismo teléfono con el que va a pagar, así que no puede
    escanear su propia pantalla: guarda el QR y lo abre desde la galería en su app.
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
- Tests con Vitest para `precios.ts`, `horario.ts`, `zonas.ts`, `cupones.ts`, `pedidos/franjas.ts` y
  `pedidos/dias.ts` como mínimo — es donde un bug cuesta plata real. Para `cupones.ts`: el alcance
  acotado, que un upsell no entre, que el domicilio nunca entre en la base, el redondeo sobre el
  total y no por línea, y que el último día de vigencia todavía valga. Para `zonas.ts`: punto
  dentro, fuera, en el borde, en solapamiento (gana prioridad) y con todas las zonas apagadas.
  Para `franjas.ts`: la anticipación de hoy, que mañana no la arrastre, el turno partido, el
  límite del cierre y que el instante guardado sea el de Bogotá y no el de UTC. Para `dias.ts`:
  las 11:30 de la noche (que en UTC ya son el día siguiente), la medianoche en los dos bordes
  del rango, y los saltos de mes, de año y de 29 de febrero. Para `impresion/escpos.ts`: que una
  vocal con tilde sea UN byte y no la pareja de UTF-8, que las mayúsculas que solo tiene CP850
  pierdan la tilde, y que ninguna línea se pase de las 48 columnas — un ticket desbordado se
  parte solo y la cifra de la derecha aparece como si fuera otro dato.

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
- No maquetar tickets dentro del APK ni tocar sus hosts `print` / `printreceipt`: son de
  AppSheet. El ticket lo arma `src/lib/impresion/` y el APK solo vuelca bytes (regla 22).
- No mandar texto en UTF-8 a la impresora, ni "mejorar" `codificar` usando la tabla de CP850
  completa: se vería bien en una impresora y saldría con símbolos de caja en otra.
- No intentar imprimir desde el navegador con `window.print()` esperando que no salga el
  diálogo: no existe forma de evitarlo. Para eso está el handler de Windows.
- No convertir el proyecto en multi-tenant todavía.
