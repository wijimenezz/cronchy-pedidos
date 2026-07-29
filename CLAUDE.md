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
| Archivos      | Supabase Storage (fotos de productos, comprobantes Nequi) |
| ORM           | Drizzle                                                   |
| Estilos       | Tailwind CSS + shadcn/ui                                  |
| Carrito       | Zustand + persistencia en localStorage                    |
| Validación    | Zod (compartida cliente/servidor)                         |
| Auth (panel)  | Auth.js, credenciales contra `app_user`                   |
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
    admin/                    panel — client components, protegido
      pedidos/
      productos/
      opciones/               sabores, toppings, salsas
      zonas/
    api/
  db/
    schema.ts                 definición Drizzle
    queries/                  consultas reutilizables
  lib/
    precios.ts                CÁLCULO DE PRECIOS — fuente única de verdad
    horario.ts                ¿está abierta la tienda ahora?
    validaciones.ts           esquemas Zod
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

| Producto           | Salsas | Toppings |
| ------------------ | ------ | -------- |
| Clásico / Chiqui / Frutilla / Ring | 1 | 1 |
| Cronchy Mega       | 1      | 2        |
| Cronchy Amigos     | 2      | —        |
| Cronchy Familiar   | 4      | —        |
| Cronchy Churros    | 1      | —        |

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
selección del churro *y* como línea suelta, el servidor lo cobraría dos veces.

Si algún día se quiere un precio promocional por comprar la bebida junto al churro, hay
que modelarlo como promoción explícita; `precio_delta` no sirve para eso.

### 9. Nunca borrar opciones, apagarlas

Los sabores de helado cambian cada semana. El panel usa el switch `disponible`, no
DELETE. Borrar rompe la trazabilidad de pedidos viejos.

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
- **Storage:** las subidas van a buckets de Supabase. Los comprobantes de Nequi se
  purgan a los 60 días con una tarea programada; el free tier son 1 GB.
- **Server Components por defecto.** `'use client'` solo donde hay interacción real
  (modal de producto, carrito, panel).
- El menú público se sirve con **ISR**; se revalida cuando el admin guarda cambios.
- Imágenes siempre con `next/image`. Los clientes entran desde datos móviles.
- Mobile-first, siempre. El escritorio es el caso raro aquí.
- Validación con Zod en el borde de cada route handler, antes de tocar la base.
- Los estados del pedido se registran en `order_status_event`, no solo actualizando
  `order.estado`.
- Tests con Vitest para `precios.ts` y `horario.ts` como mínimo — es donde un bug
  cuesta plata real.

## Qué NO hacer

- No introducir microservicios, colas ni WebSockets. El panel usa polling cada 5s.
- No agregar una pasarela de pago. El flujo es efectivo o comprobante de Nequi.
- No usar la API de WhatsApp con el número actual del negocio: ese número se usa para
  hablar con proveedores y la Cloud API lo dejaría inutilizable en la app. Los avisos
  salen por `wa.me` desde el panel. Migrar a Cloud API solo con un número dedicado.
- No crear productos de prueba: el seed usa el catálogo real.
- No convertir el proyecto en multi-tenant todavía.
