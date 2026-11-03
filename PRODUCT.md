# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(PWA instalable, pensada primero para el móvil en vertical.)

## Users

Cantantes en general que quieren afinar mejor y entrenar la voz con el móvil. Lo usan en cuatro situaciones: practicando en casa (sesiones tranquilas, móvil en el atril o la mesa), en ensayos con banda (local de ensayo, poca luz, ruido), antes de actuar (calentamiento rápido en camerino) y en clases de canto (revisando tomas junto a un profesor).

## Product Purpose

Un "Melodyne de bolsillo": escuchar tu voz por el micrófono, mostrar en tiempo real lo afinado que cantas, registrar tomas por canción y medir la evolución. Además juzga cómo cantas: afinación, estabilidad, vibrato, tono de voz (brillo, aire, dinámica) y emoción transmitida. Éxito = el cantante canta más afinado con el tiempo y entiende qué corregir.

## Positioning

Combina tres cosas que normalmente van separadas: afinador en vivo, registro de afinación por canción con vista tipo piano-roll, y una lectura de tono y emoción con consejos concretos. Todo local en el dispositivo, sin cuenta.

## Operating Context

- El móvil suele estar a cierta distancia (atril, mesa): la nota y el estado de afinación deben leerse de lejos y de un vistazo.
- Se canta mientras se mira: la interfaz no puede exigir precisión táctil durante la toma.
- Ambientes variados de luz: casa, local de ensayo oscuro, camerino.

## Capabilities and Constraints

- Afinador en vivo (YIN), tonalidad/escala de referencia, notación Do-Re-Mi o C-D-E, La4 configurable.
- Canciones con tomas (curva de tono + audio), informe con puntuación, piano-roll sincronizado, consejos.
- Entrenamiento: nota sostenida, nota al azar, escalas, arpegio; cualquier octava vale.
- Progreso: racha, minutos, gráficas, mejora por canción, rango vocal.
- Stack: HTML/CSS/JS sin dependencias ni build, módulos ES, IndexedDB, service worker. Publicado en GitHub Pages.
- La emoción es una estimación heurística y debe presentarse como orientación.

## Brand Commitments

Nombre: AfinaVoz. Interfaz en español.

## Evidence on Hand

No hay usuarios, testimonios ni métricas reales todavía; no inventarlos.

## Product Principles

1. Legible de un vistazo y a distancia mientras se canta.
2. Honesto: medir con precisión y decir claramente qué es estimación.
3. Animar a practicar: el progreso debe sentirse, sin infantilizar.
4. Todo en el bolsillo: rápido, offline, privado.

## Accessibility & Inclusion

El estado afinado/alto/bajo no puede depender solo del color (texto y posición además del color). Contraste suficiente en ambientes oscuros.

## Visual Preference (confirmada)

El usuario eligió la vía convencional bien ejecutada, no un mundo temático. Referente de acabado: **Spotify** (oscuro, contenido con color propio, tipografía en negrita, controles familiares). Igualar su nivel de pulido sin copiar su marca (ni su verde ni su logotipo).
