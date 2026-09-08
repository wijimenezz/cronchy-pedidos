# Pedido en mesa por NFC, y el POS que lo recibe

**Fecha:** 2026-09-07 · **Estado:** diseño aprobado, sin implementar

Este documento fija decisiones. **Nada de lo que describe existe todavía en el código**, así que
CLAUDE.md sigue siendo la verdad sobre lo que hay hoy; cada fase actualiza allí lo que haya vuelto
cierto.

---

## 1. Qué se quiere

Dos objetivos encadenados.

**El inmediato — pedir desde la mesa.** Cada mesa lleva un chip NFC. El cliente acerca el teléfono,
se abre la carta con esa mesa ya seleccionada, arma su pedido y paga por transferencia o en efectivo.
El pedido llega al panel identificado por su mesa, y el negocio puede ver qué pidió cada mesa.

**El de fondo — un POS propio que reemplace AppSheet.** Hoy el local se atiende con una app de
AppSheet y los pedidos online viven aquí: son dos contabilidades separadas. El POS nuevo debe
recibir los tres tipos de pedido en la misma caja del día, aguantar varias sedes, y dejar abierta la
puerta a venderse a otros negocios.

**Referencia investigada.** [Toteat](https://toteat.com/productos/sistema-pos-para-restaurantes)
(+4.500 restaurantes en LATAM) es un POS cloud todo-en-uno: mesas y salones, comandas a cocina,
inventario con recetas, menú QR y pedidos digitales, facturación electrónica, reportes en tiempo real,
+20 integraciones de delivery y
[multi-sucursal](https://toteat.com/es-co/blog/articulo/software-para-restaurantes-con-varias-sedes-en-colombia).
Sirve como norte, no como alcance de v1.

## 2. Decisiones

| Tema | Elegido | Por qué |
| --- | --- | --- |
| Datos | Una sola base para mesa, online y POS | Dos bases obligan a sincronizar catálogo y precios, y eso rompe la fuente única de la regla 1 |
| Código | Este repositorio, como monorepo | Con dos repos el dominio se duplica o se publica; duplicado acaba divergiendo |
| Mesa: pedidos sucesivos | Se acumulan en una cuenta | Es lo que hace un POS y lo que hará falta igual en la fase 6 |
| Mesa: pago | Efectivo o transferencia | El cliente está sentado en el local; no es el caso de «recoger» |
| Mesa: link filtrado | El empleado confirma | Reutiliza el paso `nuevo → preparando` que ya existe |
| Orden | La mesa va primero | No depende del monorepo ni del offline; se apoya en lo que ya hay |
| Sin internet (POS) | Innegociable | Un POS que no cobra sin wifi para el local |
| Escala | Sedes pronto, vender después | `store_id` ya está puesto (regla 5) |

## 3. Fase 1 — Pedido en mesa

### 3.1 Esquema

Dos obstáculos concretos en el esquema de hoy, y los dos van en **la misma migración** o la primera
inserción falla:

- `tipo_pedido` es un enum de Postgres con solo `['domicilio','recoger']`
  ([schema.ts:31](../../../src/db/schema.ts)). Añadir `'mesa'`.
- El CHECK de `order` — `(tipo = 'recoger') OR (direccion IS NOT NULL AND punto IS NOT NULL)`
  ([schema.ts:605](../../../src/db/schema.ts)) — **rechazaría un pedido de mesa**, que no tiene
  dirección ni pin. La condición pasa a eximir también a `mesa`.

Tablas nuevas:

```
mesa           id · store_id · nombre · codigo · activa
cuenta_mesa    id · store_id · mesa_id · estado · abierta_en · cerrada_en
order          + cuenta_mesa_id (nullable)
```

`estado` de la cuenta: `abierta` | `cobrada` | `cancelada`. La mesa se archiva con `activa`, no se
borra (regla 9). Las dos llevan `store_id` (regla 5).

**Por qué una cuenta explícita y no solo `order.mesa_id`.** Sin ella, «los pedidos de la mesa 5» son
los de hoy, los de ayer y los del mes pasado. Con ella hay algo que abrir, a lo que sumar y que
cerrar al cobrar. El escaneo se suma a la cuenta abierta de esa mesa si existe; si no, abre una.

**El riesgo de la cuenta heredada, y cómo se cierra.** Si nadie la cierra, el siguiente cliente que
se siente hereda la cuenta del anterior — y su cuenta. Se cierra al cobrar desde el panel, y además
caduca: una cuenta abierta sin pedidos nuevos se cierra al cambiar el día, con la aritmética de
`pedidos/dias.ts`, que ya es pura y testeada.

### 3.2 El chip y la URL

El NFC escribe un registro **NDEF con una URL** y no ejecuta nada más: `/m/<codigo>`. Al abrirla se
fija el tipo `mesa` con su mesa en el store del carrito.

**Junto al chip va un QR impreso, y no es redundancia.** La lectura NFC en segundo plano solo existe
en iPhone XS y posteriores; los anteriores necesitan Atajos o el Centro de Control. En un local eso
es un cliente que toca el chip y no ve nada. El QR cubre a todo el mundo y cuesta un adhesivo.

**La caducidad del tipo tiene que ser más corta que la actual.** `cronchy_tipo_pedido` caduca a las 6
horas para que quien recogió la semana pasada no llegue al checkout todavía en `recoger`. Un cliente
que se fue del local no puede seguir pidiendo «a la mesa 5» desde su casa, así que la mesa necesita
una ventana más corta. La lógica ya está partida en `leerGuardado(crudo, ahora)`, pura y testeada:
ahí se añade.

### 3.3 Pago

`metodosDePago` ([lib/pedidos/pago.ts](../../../src/lib/pedidos/pago.ts)) fuerza hoy que `recoger` se
pague por adelantado: preparar un pedido que nadie viene a recoger es comida a la basura. **La mesa
es el caso contrario** — el cliente ya está sentado y no puede irse sin pasar por la caja — así que
se le ofrecen `efectivo` y `nequi`, como en domicilio.

Se añade la rama al módulo puro y a sus pruebas. Quien lo hace cumplir sigue siendo
`esMetodoOfrecido` en `POST /api/pedidos`: es la regla 16 aplicada al dinero y no se mueve a Zod.

### 3.4 Contra el link filtrado

La URL del chip se puede copiar y compartir. La defensa es **el flujo que ya existe**: el pedido de
mesa entra como `nuevo` y nadie prepara nada hasta que un empleado lo acepta viendo que esa mesa está
ocupada. Es el recorrido `nuevo → preparando` de hoy, sin mecanismo nuevo que mantener.

Se descartó el código rotativo en la mesa: obliga a gestionar la rotación y reprogramar chips, para
un riesgo cuyo daño máximo es un pedido falso que se queda en el local.

### 3.5 Panel

La tarjeta del tablero gana la mesa como dato visible, **junto a `barrio` y `zona_nombre` y con el
mismo cuidado de no confundirlos** que documenta la regla 14 — son tres cosas distintas y ya hubo un
bug por mezclar dos de ellas. Más una vista por mesa que responde «qué pidió la 5 y qué debe».

El resumen del día y el XLSX los recogen sin rediseñarse: son pedidos como los demás.

## 4. El POS

### 4.1 La regla 1, reformulada

**La regla 1 (precios siempre en el servidor) y un POS offline no pueden convivir tal cual**: sin
internet no hay servidor al que preguntar. Se acota a lo que de verdad protegía:

> El precio que manda un **navegador de cliente** no se cree nunca y se recalcula en el servidor. El
> **POS**, operado por un empleado autenticado en un dispositivo del negocio, calcula en local con el
> mismo módulo puro, y el servidor revalida al sincronizar.

No hace falta motor nuevo: `ProductoFicha` es `'use client'` e importa `calcularItem` de
`lib/precios-calculo` — **el motor ya corre hoy en el navegador**. Igual `impresion/*`,
`pedidos/modificadores` y `cupones`: puros y testeados.

Esta reformulación **entra en CLAUDE.md cuando la fase 5 la haga cierta**, no antes.

### 4.2 Arquitectura

```
cronchy-pedidos/                    UNA base Supabase
  apps/
    tienda/     carta pública + panel admin   (lo de hoy, movido)
    pos/        POS del mostrador             (nuevo, local-first)
  packages/
    dominio/    precios · modificadores · impresión · cupones · fechas   ← PURO
    db/         esquema Drizzle · migraciones · queries                  ← toca Postgres
```

**Un pedido es un pedido, venga de donde venga.** Se añade `order.canal` (`'online' | 'pos'`) y los
tres tipos conviven en la misma tabla. La contabilidad cuadra sola y el XLSX ya existente ve todas
las vías sin rediseñarse.

**`dominio` y `db` separados no es burocracia:** el POS offline no puede arrastrar `postgres` al
bundle del dispositivo, y la separación lo impide de raíz en vez de por disciplina. Es la doctrina que
el repo ya sigue — `dias.ts` es de servidor porque importa la capa de base, `fechas.ts` es de los dos
porque es puro.

### 4.3 Cambios de esquema

- **La numeración deja de servir.** `numero` es un `serial` de Postgres y un dispositivo offline no
  puede pedirle un número a la base. Pasa a un identificador generado en el dispositivo (ULID) más un
  folio **por sede**, asignado al sincronizar o desde un rango preasignado por terminal. Es el detalle
  que más silenciosamente rompe un POS offline.
- **`store_id` ya está en todas las tablas** y era el seguro para esto. Para multi-sede lo que falta
  no es el esquema: es que `getStore()` deje de resolver una sola tienda.
- **`turno_caja`** (apertura, cierre, arqueo). Hoy solo existe «resumen del día».

## 5. Orden de construcción

| Fase | Qué | Deja utilizable |
| --- | --- | --- |
| 1 | Pedido en mesa por NFC | La mesa pidiendo, en el local |
| 2 | PoC del motor de sync | Una decisión escrita, no código |
| 3 | Reestructurar a monorepo | Nada visible; red = las 885 pruebas |
| 4 | POS de mostrador en línea | **Se apaga AppSheet en la venta** |
| 5 | Offline + numeración por sede + turno de caja | El POS aguanta sin wifi |
| 6 | El mesero opera la cuenta de mesa | Añadir, dividir, cobrar |
| 7 | Inventario y recetas | Stock y costos |
| 8 | Multi-sede | Segunda sede |
| 9 | Multi-tenant | Vender a terceros |
| — | **Facturación electrónica** | Cumplir cuando el régimen lo exija |

**La facturación electrónica no lleva número de fase a propósito.** No depende de las demás y no es
el peaje de vender a terceros: el negocio va a migrar igualmente. Entra cuando toque, y lo único que
las otras fases le deben es no cerrarle la puerta — ver §6.

**Fase 2 — la PoC.** Vender sin internet y sincronizar, montado dos veces: con
[PowerSync](https://powersync.com/blog/offline-first-apps-made-simple-supabase-powersync) —el único
con soporte offline de primera clase para Postgres, integra bien con Supabase— y con **cola propia
sobre IndexedDB**. Se verifica precio y límites del plan antes de comprometerse. Es la decisión más
cara del proyecto y condiciona todo lo demás.

## 6. Riesgos y preguntas abiertas

- **Facturación electrónica DIAN — hoy no se factura, y hay que migrar.** El negocio no emite
  factura electrónica todavía, así que **no bloquea ninguna fase**, pero la migración está prevista.
  Eso la saca de la fase 9: deja de ser solo el peaje para vender a terceros y pasa a ser una
  necesidad propia con fecha por decidir. Desde noviembre de 2024 el tiquete POS es electrónico —se
  transmite y valida ante la DIAN en tiempo real (Resolución 000165 de 2023)— y hay que apoyarse en un
  [Proveedor Tecnológico autorizado](https://facele.co/proveedor-tecnologico-dian-colombia-2026/).
  **La investigación queda pendiente y se hace antes de la fase 5**, por lo que dice el punto
  siguiente.

- **Y por eso la numeración hay que diseñarla una sola vez.** La fase 5 ya va a rehacer `numero` por
  el offline (§4.3), y la facturación electrónica impone lo suyo sobre ese mismo campo: rangos de
  numeración autorizados por la DIAN, con prefijo y vigencia. Si los folios por sede se diseñan sin
  mirar eso, se rehacen dos veces —y la segunda con ventas ya escritas encima, que es cuando duele—.
  **No hace falta implementar facturación para evitarlo: basta con investigar el formato de la
  numeración autorizada antes de cerrar el diseño de la fase 5.** Lo mismo, en menor medida, con los
  datos fiscales del cliente (documento o NIT), que hoy no se piden y una factura sí exige.
- **La fase 3 toca todo el repo a la vez**: mover `src/` cambia el *Root Directory* en Vercel, los
  scripts y `drizzle.config.ts`. Va sola en su rama, sin mezclarse con trabajo de producto.
- **La cuenta de mesa heredada** — mitigada con cierre al cobrar y caducidad diaria (§3.1).
- **Multi-sede no es multi-tenant.** CLAUDE.md dice hoy «no convertir el proyecto en multi-tenant
  todavía» y sigue vigente hasta la fase 9; la fase 8 no lo contradice.
