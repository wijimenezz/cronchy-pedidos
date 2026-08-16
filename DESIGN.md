# DESIGN.md — Sistema de diseño Cronchy

> Reglas visuales de la plataforma. Claude Code las aplica en CADA pantalla para
> que todo se vea como Cronchy y no como un template genérico. Cuando este
> documento y el CLAUDE.md hablen de lo mismo, el CLAUDE.md manda en lo técnico
> (estructura, Tailwind, componentes) y este en lo visual (color, forma, tono).
>
> Personalidad de la marca: **cálida, divertida, artesanal, con humor**.
> Frase guía: _"Sonríe, que la vida es churrísima"_.

---

## 1. Colores

Paleta tomada del logo, el packaging y el mural reales.

```css
/* --- Marca --- */
--cronchy-naranja: #f26b1d; /* ACCIÓN: botones, precios, activo, badges */
--cronchy-naranja-oscuro: #e2570e; /* hover/pressed del naranja */
--cronchy-cafe: #1f0e04; /* TEXTO principal, títulos, estructura y fondo del header/footer (mismo token) */
--cronchy-crema: #faf3e8; /* FONDO de toda la app */
--cronchy-crema-oscura: #e8dfd0; /* superficies elevadas sobre crema, bordes */

/* --- Neutrales sobre crema --- */
--texto-principal: #1f0e04; /* café, no negro puro */
--texto-suave: #6b4a38; /* descripciones, secundario */
--texto-tenue: #9a8574; /* placeholders, deshabilitado */
--blanco-tarjeta: #fdf9f2; /* tarjetas y modales, un blanco cálido */

/* --- Semánticos --- */
--exito: #4a7c3f; /* verde apagado, del mural */
--alerta: #d97b29; /* naranja ámbar: "te falta una salsa" */
--error: #c0392b; /* rojo del mural, para errores reales */
--agotado: #9a8574; /* gris cálido para productos sin stock */
--programado: #3a5a8a; /* azul frío: el pedido que NO se prepara ahora */
--programado-suave: #eef2f8; /* su fondo de tarjeta, un blanco frío */

/* --- Badges de producto --- */
--badge-vendido: #e03e00; /* "Más vendido" */
--badge-nuevo: #f28c1d; /* "Nuevo" */
--badge-recomendado: #e2570e; /* mismo que naranja-oscuro */
```

### Reglas de color — no negociables

- **El fondo de la app es crema (`--cronchy-crema`)**, no blanco. Las tarjetas y
  modales van en blanco cálido (`--blanco-tarjeta`) para elevarse sobre la crema.
- **El texto es café (`#1F0E04`), nunca negro puro.** El mismo token de café se
  usa como fondo del header y el footer (café oscuro casi negro, con el logo y
  la navegación en crema/naranja encima). El negro puro rompe la calidez de la
  marca.
- **El naranja es SOLO acción y énfasis**: botón "Añadir", precios, tab activo,
  badge "Recomendado", total. No lo uses como fondo de zonas grandes — cansa la
  vista y le quita fuerza como llamada a la acción.
- **Los badges de estado tienen su propio token.** "Más vendido" (`--badge-vendido`,
  rojo) y "Nuevo" (`--badge-nuevo`) no reusan `--naranja`; solo "Recomendado"
  comparte color con el naranja-oscuro (`--badge-recomendado`).
- **Contraste AA obligatorio.** Naranja sobre crema pasa para texto grande y
  botones; para texto pequeño usa café. Nunca crema sobre naranja en texto chico.
- El **rojo se reserva para errores reales**, no para decoración. El aviso de
  "te falta una salsa" es ámbar (`--alerta`), no rojo: no es un error, es un
  recordatorio. La única excepción es el badge "Más vendido", que usa rojo
  como color de marca del mockup, no como estado de error.
- **El frío es solo del pedido programado**, y es la única excepción a una paleta
  cálida. No es un capricho: ámbar, rojo y naranja ya están tomados por urgencia,
  error y acción, y lo programado no es ninguna de las tres — es lo único que se
  distingue por **cuándo** y no por en qué estado está. Un pedido que no se
  prepara ahora tiene que separarse de un vistazo de los diez que sí. Vive en el
  panel (tarjeta del tablero y detalle) y **no aparece en la tienda pública**: al
  cliente no le sirve de nada. Si alguien lo "corrige" a naranja por coherencia de
  marca, el color deja de significar algo.
- **Sobre crema, un tinte por opacidad no se ve: usa un token de fondo propio.** El
  primer intento pintó la tarjeta programada con `bg-programado/5` y en pantalla no
  se distinguía de una normal — la crema es tan clara y tan cálida que mezclarle un
  azul medio lo desatura hasta dejarlo gris. Por eso existe `--programado-suave`, un
  blanco frío hecho a mano. La regla general: `color/opacidad` sirve para píldoras y
  bordes, no para diferenciar dos fondos grandes.

---

## 2. Tipografía

La marca usa letra manuscrita/redondeada con carácter. En pantalla:

```
Títulos y nombres de producto → Baloo 2 (redondeada, amigable, con peso)
Cuerpo, precios, formularios   → Nunito (redondeada, altísima legibilidad)
```

Ambas de Google Fonts, cargadas con `next/font`. Nunito de cuerpo mantiene la
familia redondeada del logo sin sacrificar lectura en párrafos y en el checkout.

```css
--font-titulo: "Baloo 2", system-ui, sans-serif; /* weight 500-700 */
--font-cuerpo: "Nunito", system-ui, sans-serif; /* weight 400-700 */
```

Escala (mobile-first):

| Uso                           | Tamaño  | Peso | Fuente  |
| ----------------------------- | ------- | ---- | ------- |
| Título de sección / categoría | 24-28px | 600  | Baloo 2 |
| Nombre de producto (tarjeta)  | 18px    | 600  | Baloo 2 |
| Nombre de producto (modal)    | 22px    | 600  | Baloo 2 |
| Precio                        | 16-18px | 700  | Nunito  |
| Cuerpo / descripción          | 15px    | 400  | Nunito  |
| Etiquetas de opción           | 15px    | 500  | Nunito  |
| Texto secundario              | 13px    | 400  | Nunito  |

No uses más de estos dos tipos. La variedad la da el peso y el color, no más fuentes.

---

## 3. Forma y sensación

La marca es redondeada en todo: el logo, los personajes, el packaging. La app
debe sentirse igual de suave.

```css
--radio-sm: 8px; /* inputs, badges */
--radio-md: 16px; /* tarjetas, botones */
--radio-lg: 24px; /* modales, hojas inferiores */
--radio-full: 9999px; /* botón principal "Añadir", chips, contadores +/- */

--sombra-tarjeta: 0 2px 8px rgba(67, 30, 14, 0.08); /* sombra café, no gris */
--sombra-modal: 0 -4px 24px rgba(67, 30, 14, 0.12);
```

- **Bordes redondeados generosos.** Nada de esquinas rectas: contradicen la marca.
- **El botón principal ("Añadir", "Enviar pedido") es tipo píldora** (`radio-full`),
  naranja, con el texto en crema. Es el elemento más reconocible de la interfaz.
- **Sombras en tono café**, nunca gris neutro. Un gris frío sobre crema se ve sucio.
- **Espaciado con aire.** Mobile-first, dedos gordos: mínimo 44px de alto en todo
  lo tocable (botones, +/-, tabs). Padding cómodo dentro de tarjetas.

---

## 4. Uso de personajes y doodles — CON MEDIDA

La marca tiene cuatro personajes (churro con gorra, helado, caja de churros,
churro con audífonos) y un set de garabatos (corazones, "smile", "yummy",
"like it", chispas). Son oro, pero saturan si se abusa.

**Regla de oro: los personajes aparecen en momentos VACÍOS o de CELEBRACIÓN,
nunca sobre contenido que el cliente está leyendo o decidiendo.**

Dónde SÍ:

- **Pantalla de bienvenida** (el modal Domicilio/Recoger): un personaje saluda.
- **Carrito vacío:** un personaje triste/esperando + "Tu caja está vacía".
- **Confirmación de pedido:** personaje celebrando + "¡Sonríe, tu pedido va en camino!".
- **Seguimiento:** el personaje de la caja como ícono del estado "en camino".
- **Banners de categoría:** un doodle sutil de fondo, muy tenue (opacidad ~8%).
- **Fondos:** garabatos de la marca en opacidad muy baja (5-8%) como textura de
  la crema, jamás compitiendo con las fotos.

Dónde NO:

- Sobre la tarjeta de un producto (la foto del churro manda).
- Dentro del modal de configuración (el cliente está decidiendo, no jugando).
- En el checkout (es un momento serio: datos, pago, comprobante).
- Detrás de texto que se deba leer.

El tono de voz acompaña: microcopys con la personalidad de la marca —
"¡Antójate de algo rico!", "Sonríe, que la vida es churrísima", "¿Le sumamos
una bebida?" — pero SIN estorbar la tarea. En el checkout, el copy es claro y
directo, sin chistes.

---

## 5. Componentes clave

### Tarjeta de producto (grid del menú)

- Foto arriba, proporción **4:3**, esquinas superiores redondeadas (`radio-md`),
  `object-fit: cover`. La foto es la protagonista.
- Badge de estado (Recomendado/Agotado; Nuevo/Más vendido reservados a futuro,
  ver §1) en la esquina superior izquierda de la foto. Corazón de favorito
  (visual, sin persistencia) en círculo blanco translúcido, esquina superior
  derecha.
- Debajo, alineado a la izquierda (no centrado): nombre (Baloo 2 18/600 café),
  descripción a 1-2 líneas (truncada, Nunito 13 suave), y en la MISMA fila el
  precio (Nunito 700 naranja, a la izquierda) y el botón píldora "Agregar +"
  (a la derecha).
- Fondo de la tarjeta: `--blanco-tarjeta`. Sombra `--sombra-tarjeta`.
- **Producto agotado:** foto en escala de grises + opacidad 60%, badge "Agotado"
  gris, no tocable. No se oculta si el admin quiere mostrarlo agotado; se ve
  apagado.

### Modal / hoja de producto

- En móvil es una **hoja inferior** (bottom sheet) que sube, con `radio-lg` arriba.
- Carrusel de fotos arriba, luego nombre, descripción, y los grupos de
  modificadores en orden.
- **Grupos "incluido"** con su etiqueta y contador "0 de N".
- **Grupos "adicional"** plegados como `+ Agregar más salsas`, se expanden al tocar.
- Barra fija abajo: contador de cantidad (píldora con −/+) y botón
  **Añadir $XX.XXX** (píldora naranja, ocupa el resto del ancho). El precio del
  botón se actualiza en vivo con cada opción.

### Contador de cantidad (−/+)

- Píldora crema oscura con − y + en café, número en el centro. Alto mínimo 44px.
- El − se deshabilita (tenue) en 1.

### Botones

- **Primario:** píldora naranja, texto crema, peso 600. Hover → naranja oscuro.
- **Secundario:** borde café 1.5px, texto café, fondo transparente.
- **Terciario / texto:** solo texto naranja subrayado al hover.
- Deshabilitado: naranja al 40%, cursor no permitido. (Ej.: "Añadir" sin sabor
  de helado elegido.)

### Tabs de categoría

- Fila horizontal scrolleable, sticky bajo el header.
- Tab activo: texto naranja + subrayado naranja grueso. Inactivo: texto café suave.

### Aviso "te falta una opción"

- Banda ámbar suave (`--alerta` al 12% de fondo, texto ámbar), `radio-sm`, con un
  ícono. Texto tipo "Te falta elegir 1 salsa incluida". NO bloquea, solo avisa.

### Barra inferior de carrito (storefront)

- Fija abajo, píldora naranja ancha: cantidad de items · "Ver carrito" · total.
- Siempre visible cuando hay algo en el carrito.

---

## 6. Fotografía

El menú vive de las fotos. Reglas para que se vean parejas:

- **Proporción 4:3** en las tarjetas, **1:1 o 4:3** en el carrusel del modal.
- Siempre `next/image` con `object-fit: cover`, nunca deformar.
- Fondos de foto idealmente cálidos (los de la marca: rosados, coral, madera),
  que combinan con la crema. Evitar fondos fríos azulados.
- Placeholder mientras carga: un tono crema sólido, no un spinner gris.
- Si un producto no tiene foto, mostrar un fondo crema con el logo/ícono de
  Cronchy centrado tenue, no una imagen rota.

---

## 7. Accesibilidad y no-negociables

- Contraste AA mínimo en todo texto (usar café sobre crema para texto pequeño).
- Todo lo tocable ≥ 44×44px.
- Estados de foco visibles (anillo naranja) para navegación con teclado.
- La app funciona y se ve bien en un teléfono de gama media a 360px de ancho:
  es el caso principal. El escritorio es secundario.
- Nada de animaciones pesadas: microtransiciones suaves (150-200ms) en botones y
  al abrir el modal. El cliente está en datos móviles.

---

## 8. Resumen para pegar en Tailwind

Cuando configures `tailwind.config`, extiende con estos tokens:

```
colors:
  crema:        '#FAF3E8'
  crema-oscura: '#E8DFD0'
  tarjeta:      '#FDF9F2'
  naranja:      '#F26B1D'
  naranja-osc:  '#E2570E'
  cafe:         '#1F0E04'
  cafe-suave:   '#6B4A38'
  cafe-tenue:   '#9A8574'
  exito:        '#4A7C3F'
  alerta:       '#D97B29'
  error:        '#C0392B'
  badge-vendido:      '#E03E00'
  badge-nuevo:        '#F28C1D'
  badge-recomendado:  '#E2570E'
borderRadius:
  usar 8 / 16 / 24 / full
fontFamily:
  titulo: Baloo 2 · cuerpo: Nunito
```
