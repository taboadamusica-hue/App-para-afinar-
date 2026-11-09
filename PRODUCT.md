# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(PWA instalable, pensada primero para el móvil en vertical.)

## Users

Músicos en general —sobre todo cantantes y guitarristas— que quieren afinar mejor y entrenar con el móvil. Lo usan en cuatro situaciones: practicando en casa (sesiones tranquilas, móvil en el atril o la mesa), en ensayos con banda (local de ensayo, poca luz, ruido), antes de actuar (calentamiento rápido en camerino) y en clases de canto (revisando tomas junto a un profesor).

## Product Purpose

MUSIC MAN reúne cinco herramientas: profesor de canto, afinador de guitarra, reconocimiento de acordes, metrónomo y analizador de espectro. El profesor de canto es un "Melodyne de bolsillo": escuchar tu voz por el micrófono, mostrar en tiempo real lo afinado que cantas, registrar tomas por canción y medir la evolución. Además juzga cómo cantas: afinación, estabilidad, vibrato, tono de voz (brillo, aire, dinámica) y emoción transmitida. Éxito = el cantante canta más afinado con el tiempo y entiende qué corregir.

## Positioning

Combina tres cosas que normalmente van separadas: afinador en vivo, registro de afinación por canción con vista tipo piano-roll, y una lectura de tono y emoción con consejos concretos. Todo local en el dispositivo, sin cuenta.

## Operating Context

- El móvil suele estar a cierta distancia (atril, mesa): la nota y el estado de afinación deben leerse de lejos y de un vistazo.
- Se canta mientras se mira: la interfaz no puede exigir precisión táctil durante la toma.
- Ambientes variados de luz: casa, local de ensayo oscuro, camerino.

## Capabilities and Constraints

- Afinador de voz en vivo (YIN + seguimiento fluido), tonalidad/escala de referencia, notación Do-Re-Mi o C-D-E, La4 configurable.
- Tesitura (8 tipos de voz, con prueba de rango): zona cómoda y extensión recomendadas; guían ejercicios, rollo de notas e informes. Los rangos son orientativos.
- Afinador de guitarra: detección automática de cuerda o cuerda fijada con tono de referencia; afinaciones alternativas.
- Acordes: reconocimiento en vivo por micro y análisis de archivos de audio (acordes en el tiempo, tonalidad, BPM), con tono, cejilla, velocidad, bucle y diagramas de guitarra/piano. Implementación propia; no se copia código de otras apps (p. ej. Chord AI). No se descargan canciones de YouTube ni de servicios de streaming.
- Metrónomo: 30–300 BPM, tap tempo, compases simples y compuestos, subdivisiones, acentos por pulso, entrenador de velocidad y compases en silencio.
- Analizador de espectro: espectro logarítmico con retención de picos, fundamental y armónicos, espectrograma.
- Canciones con tomas (curva de tono + audio), informe con puntuación, piano-roll sincronizado, consejos.
- Entrenamiento: nota sostenida, nota al azar, escalas, arpegio; cualquier octava vale.
- Progreso: racha, minutos, gráficas, mejora por canción, rango vocal.
- Stack: HTML/CSS/JS sin dependencias ni build, módulos ES, IndexedDB, service worker. Publicado en GitHub Pages.
- La emoción es una estimación heurística y debe presentarse como orientación.

## Brand Commitments

Nombre: **MUSIC MAN** (en mayúsculas; antes «AfinaVoz»). Interfaz en español.

## Evidence on Hand

No hay usuarios, testimonios ni métricas reales todavía; no inventarlos.

## Product Principles

1. Legible de un vistazo y a distancia mientras se canta o se toca.
5. La captación debe sentirse fluida: respuesta inmediata al cambiar de nota y lectura quieta cuando la nota está quieta.
2. Honesto: medir con precisión y decir claramente qué es estimación.
3. Animar a practicar: el progreso debe sentirse, sin infantilizar.
4. Todo en el bolsillo: rápido, offline, privado.

## Accessibility & Inclusion

El estado afinado/alto/bajo no puede depender solo del color (texto y posición además del color). Contraste suficiente en ambientes oscuros.

## Visual Preference (confirmada)

El usuario eligió la vía convencional bien ejecutada, no un mundo temático. Referente de acabado: **Spotify** (oscuro, contenido con color propio, tipografía en negrita, controles familiares). Igualar su nivel de pulido sin copiar su marca (ni su verde ni su logotipo).
