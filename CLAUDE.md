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
| Deploy        | Vercel                                                    |

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
    admin/                    panel — protegido
      login/
      (panel)/                grupo con sesión: cabecera, nav y exigirRol()
        pedidos/              lista con polling + [numero]/ detalle
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
      disponibilidad.ts       switches de agotado
      catalogo.ts             CRUD de categorías, productos y enganches
      opciones.ts             CRUD de las listas de opciones y sus opciones
  lib/
    precios.ts                CÁLCULO DE PRECIOS — fuente única de verdad
    zonas.ts                  CÁLCULO DE DOMICILIO — fuente única de verdad
    horario.ts                ¿está abierta la tienda ahora?
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
    notificaciones/
      plantillas.ts           TEXTO de los mensajes — fuente única
      transporte.ts           adaptador: whatsapp-link | whatsapp-api | telegram
    impresion.ts              deep link cronchyprinter://
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
- La dirección escrita y las observaciones son referencia para el domiciliario;
  no participan en el cálculo. El pedido guarda el punto (`geometry(Point, 4326)`).

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

---

## Panel admin — pantallas y permisos

| Pantalla          | colaborador                                                  | admin                                                             |
| ----------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `admin/pedidos`   | ver, aceptar, cambiar estado, imprimir, avisos, domiciliario | todo                                                              |
| `admin/catalogo`  | switches `disponible` / `agotado` de productos y opciones    | igual                                                             |
| `admin/productos` | solo Visible↔Agotado (ni ocultar ni reactivar)               | CRUD completo, precios, fotos, categorías, enganches              |
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
- **Nada de polling en la tienda pública.** El panel sí lo usa (son 2-3 empleados); la carta
  la ven todos los clientes desde datos móviles, y una petición por visitante cada N
  segundos no se justifica. `RefrescarAlVolver` reacciona a que el cliente vuelva a la
  pestaña: mientras nadie mira, no sale ni una petición.
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
- Tests con Vitest para `precios.ts`, `horario.ts` y `zonas.ts` como mínimo — es
  donde un bug cuesta plata real. Para `zonas.ts`: punto dentro, fuera, en el borde,
  en solapamiento (gana prioridad) y con todas las zonas apagadas.

## Qué NO hacer

- No introducir microservicios, colas ni WebSockets. El panel usa polling cada 5s.
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
