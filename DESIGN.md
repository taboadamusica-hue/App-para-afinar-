---
name: MUSIC MAN
description: Profesor de canto, afinador de guitarra y analizador de espectro de bolsillo, al nivel de acabado de una app de música de primera línea.
colors:
  bg: "#0e0e10"
  surface: "#18181b"
  surface-2: "#222226"
  surface-3: "#2e2e33"
  text: "#f4f4f5"
  muted: "#a1a1aa"
  dim: "#8b8b94"
  line: "#2a2a2f"
  in-tune: "#4ade9a"
  warn: "#fbbf4a"
  bad: "#ff6464"
  rec: "#ff3b5c"
  curve: "#8fb8ff"
typography:
  tuner-note:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "clamp(88px, 30vw, 128px)"
    fontWeight: 900
    lineHeight: 0.95
    letterSpacing: "-0.04em"
  view-title:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 900
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  hero-title:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "clamp(28px, 8vw, 40px)"
    fontWeight: 900
    lineHeight: 1.1
    letterSpacing: "-0.035em"
  section-title:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
  meta:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 500
    lineHeight: 1.45
rounded:
  cover: "6px"
  surface: "10px"
  select: "14px"
  sheet: "16px"
  pill: "999px"
spacing:
  gutter: "16px"
  stack: "8px"
  section: "28px"
components:
  button-light:
    backgroundColor: "{colors.text}"
    textColor: "{colors.bg}"
    rounded: "{rounded.pill}"
    height: "44px"
    padding: "0 20px"
  button-dark:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    height: "44px"
    padding: "0 20px"
  button-dark-hover:
    backgroundColor: "{colors.surface-3}"
  record-button:
    backgroundColor: "{colors.rec}"
    rounded: "{rounded.pill}"
    size: "60px"
  play-button:
    backgroundColor: "{colors.in-tune}"
    textColor: "#05140d"
    rounded: "{rounded.pill}"
    size: "56px"
  pill-select:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.select}"
    height: "52px"
  chip-selected:
    backgroundColor: "{colors.text}"
    textColor: "{colors.bg}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
  fact-tile:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.surface}"
    padding: "14px"
---

# Design System: MUSIC MAN

## Overview

Canon de app de música, con el acabado de Spotify como referente (elegido por el usuario) pero sin su marca. La interfaz es negra, tipográfica y callada; el color lo ponen el contenido y el estado: cada canción tiene su propio color, y la afinación se lee en verde menta, ámbar o rojo. Está pensada para leerse de lejos con el móvil en el atril: una nota enorme, un estado en palabras y una sola acción principal por pantalla.

## Colors

### Primary
- **Texto / blanco** (`#f4f4f5`): títulos y botón principal en píldora blanca.

### Neutral
- **Fondo** (`#0e0e10`), **superficie** (`#18181b`), **superficie 2** (`#222226`), **superficie 3** (`#2e2e33`): la jerarquía va por luminosidad, nunca por bordes.
- **Secundario** (`#a1a1aa`) y **tenue** (`#8b8b94`): metadatos; ambos ≥4.5:1 sobre el fondo.

### Estados
- **Afinado** (`#4ade9a`), **casi** (`#fbbf4a`), **desafinado** (`#ff6464`), **grabar** (`#ff3b5c`), **curva de tono** (`#8fb8ff`).

### Named Rules
- **El contenido pone el color.** Cada canción toma un tono derivado de su título (`hsl(h 70% 58%) → hsl(h+35 60% 30%)` en la portada; `hsl(h 45% 30%)` al fondo de cabecera y barra superior). No hay color de marca decorativo.
- **El estado nunca va solo en color.** Afinado/alto/bajo siempre lleva texto y posición en el medidor.

## Typography

Figtree (variable 400–900, alojada en `fonts/`, licencia OFL) para todo. Títulos en 800–900 con tracking negativo; cifras tabulares en todo el documento.

### Hierarchy
- **Nota del afinador**: 88–128px / 900, el elemento más grande de la app.
- **Puntuación de toma**: 112px / 900.
- **Título de vista**: 26px / 900. **Título de canción**: 28–40px / 900. **Sección**: 19px / 800.
- **Cuerpo**: 15px / 400. **Metadatos**: 13.5px / 500.

## Layout

Una columna de 640px máximo, márgenes laterales de 16px. Barra superior fija (título a la izquierda, micro a la derecha) y barra inferior de cuatro pestañas (Canto, Guitarra, Espectro, Progreso), ambas alineadas con la columna en pantallas anchas. Canto tiene un control segmentado propio (Afinar voz · Canciones · Entrenar) bajo la barra superior. Los lienzos (rollo de piano, curva) van a sangre (`.bleed`). Secciones separadas 28px por encima y 12px por debajo del título.

## Elevation & Depth

Plano. Solo dos sombras neutras: portadas (`0 4px 14px rgba(0,0,0,.35)`, la grande `0 12px 36px rgba(0,0,0,.5)`) y botones redondos (`0 6px 18px rgba(0,0,0,.45)`). Nada de halos de color. El único resplandor es el degradado radial de estado detrás de la nota del afinador.

## Shapes

Píldoras para botones, chips y la barra del medidor; 10px para superficies de datos; 14px para selectores; 6–8px para portadas; hoja inferior con 16px arriba.

## Components

### Buttons
Píldora blanca (principal), píldora oscura (secundaria; el rojo del texto indica una acción destructiva), círculo rojo para grabar (el punto se convierte en cuadrado mientras graba) y círculo menta para empezar un ejercicio (se vuelve gris con cuadrado para cancelar).

### Chips
Selección de ejercicio como grupo de radios en chips desplazables; el seleccionado se invierte a blanco.

### Cards / Containers
Sin tarjetas con borde. Las filas de lista son transparentes con resalte al pasar el ratón; los datos van en mosaicos de superficie de 10px.

### Inputs / Fields
Selectores «píldora» con etiqueta pequeña encima del valor y un chevron. Los campos de la hoja inferior van sobre superficie 2. El interruptor usa el menta.

### Navigation
Barra inferior con iconos SVG lineales propios (trazo 1.8, y 2.4 en la pestaña activa) y etiqueta. La flecha atrás aparece solo en las subpantallas.

### Control segmentado
Pista de superficie con tres segmentos; el activo sube a superficie 3 con texto blanco.

### Cuerdas de guitarra
Seis botones en rejilla (número de cuerda, nota grande, octava). La cuerda detectada sube a superficie 3; la fijada se invierte a blanco; la afinada lleva un punto menta.

### Espectro y espectrograma
Eje logarítmico con rejilla en superficie de lienzo; curva azul con relleno degradado hacia transparente, retención de picos en gris al 50 %, fundamental en menta sólida y armónicos en menta discontinua. El espectrograma usa la rampa fondo → azul → menta → ámbar → blanco.

### Rollo de piano (componente propio)
Filas por semitono (las notas de la escala, teñidas de verde), bloques de nota coloreados según su error en cents, la nota correcta en línea discontinua, la curva de tono en azul y el cursor de reproducción en blanco.

## Do's and Don'ts

### Do:
- Dar a la nota y a la puntuación el tamaño máximo; todo lo demás, por debajo.
- Derivar el color de cada pantalla de la canción.
- Usar iconos SVG del sprite de `index.html`.

### Don't:
- Usar el verde ni el logotipo de Spotify.
- Poner bordes o sombras de color en las superficies.
- Usar emojis como iconos de interfaz (las caras de emoción del informe son contenido, no iconos).
