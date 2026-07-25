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
--cronchy-naranja: #bf5526; /* ACCIÓN: botones, precios, activo, badges */
--cronchy-naranja-oscuro: #a8471e; /* hover/pressed del naranja */
--cronchy-cafe: #431e0e; /* TEXTO principal, títulos, estructura */
--cronchy-crema: #f2ece1; /* FONDO de toda la app */
--cronchy-crema-oscura: #e8dfd0; /* superficies elevadas sobre crema, bordes */

/* --- Neutrales sobre crema --- */
--texto-principal: #431e0e; /* café, no negro puro */
--texto-suave: #6b4a38; /* descripciones, secundario */
--texto-tenue: #9a8574; /* placeholders, deshabilitado */
--blanco-tarjeta: #fffcf7; /* tarjetas y modales, un blanco cálido */

/* --- Semánticos --- */
--exito: #4a7c3f; /* verde apagado, del mural */
--alerta: #d97b29; /* naranja ámbar: "te falta una salsa" */
--error: #c0392b; /* rojo del mural, para errores reales */
--agotado: #9a8574; /* gris cálido para productos sin stock */
```

### Reglas de color — no negociables

- **El fondo de la app es crema (`--cronchy-crema`)**, no blanco. Las tarjetas y
  modales van en blanco cálido (`--blanco-tarjeta`) para elevarse sobre la crema.
- **El texto es café (`#431E0E`), nunca negro puro.** El negro puro rompe la
  calidez de la marca.
- **El naranja es SOLO acción y énfasis**: botón "Añadir", precios, tab activo,
  badge "Recomendado", total. No lo uses como fondo de zonas grandes — cansa la
  vista y le quita fuerza como llamada a la acción.
- **Contraste AA obligatorio.** Naranja sobre crema pasa para texto grande y
  botones; para texto pequeño usa café. Nunca crema sobre naranja en texto chico.
- El **rojo se reserva para errores reales**, no para decoración. El aviso de
  "te falta una salsa" es ámbar (`--alerta`), no rojo: no es un error, es un
  recordatorio.

---

## 2. Tipografía

La marca usa letra manuscrita/redondeada con carácter. En pantalla:

```
Títulos y nombres de producto → Fredoka (redondeada, amigable, con peso)
Cuerpo, precios, formularios   → Nunito (redondeada, altísima legibilidad)
```

Ambas de Google Fonts, cargadas con `next/font`. Nunito de cuerpo mantiene la
familia redondeada del logo sin sacrificar lectura en párrafos y en el checkout.

```css
--font-titulo: "Fredoka", system-ui, sans-serif; /* weight 500-600 */
--font-cuerpo: "Nunito", system-ui, sans-serif; /* weight 400-700 */
```

Escala (mobile-first):

| Uso                           | Tamaño  | Peso | Fuente  |
| ----------------------------- | ------- | ---- | ------- |
| Título de sección / categoría | 24-28px | 600  | Fredoka |
| Nombre de producto (tarjeta)  | 18px    | 600  | Fredoka |
| Nombre de producto (modal)    | 22px    | 600  | Fredoka |
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
- Badge "Recomendado" naranja, píldora, esquina superior de la foto.
- Debajo: nombre (Fredoka 18/600 café), descripción a 1-2 líneas (truncada,
  Nunito 13 suave), precio (Nunito 700 naranja).
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
  crema:        '#F2ECE1'
  crema-oscura: '#E8DFD0'
  tarjeta:      '#FFFCF7'
  naranja:      '#BF5526'
  naranja-osc:  '#A8471E'
  cafe:         '#431E0E'
  cafe-suave:   '#6B4A38'
  cafe-tenue:   '#9A8574'
  exito:        '#4A7C3F'
  alerta:       '#D97B29'
  error:        '#C0392B'
borderRadius:
  usar 8 / 16 / 24 / full
fontFamily:
  titulo: Fredoka · cuerpo: Nunito
```
