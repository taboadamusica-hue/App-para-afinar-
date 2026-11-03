# AfinaVoz 🎤

Afinador y entrenador vocal "de bolsillo": un Melodyne simplificado que funciona en el móvil desde el navegador (y se puede instalar como app).

## Qué hace

- **Afinador en vivo**: activa el micro, muestra la nota, los cents de desviación y la curva de tono en tiempo real. Puedes fijar tonalidad y escala para que te compare con las notas correctas de la canción.
- **Canciones**: crea canciones (título, artista, tonalidad, escala y emoción que quieres transmitir) y graba tomas. Cada toma guarda la curva de tono y el audio, y genera un informe:
  - Vista tipo Melodyne: bloques de nota coloreados por desafinación + curva de tono, sincronizada con la reproducción.
  - Afinación: desviación media, tendencia (alto/bajo), % de tiempo afinado, rango usado, notas más difíciles, entradas por debajo (scoop).
  - Estabilidad y vibrato (velocidad y amplitud).
  - **Tono de voz**: brillo (oscuro ↔ metálico), aire en la voz, rango dinámico.
  - **Emoción**: estimación en el mapa energía × valencia (alegre, tenso, sereno, triste, apasionado, íntimo…) y % de coincidencia con la emoción que buscabas, con consejos para acercarte.
  - Puntuación global (55% afinación, 25% estabilidad, 20% expresividad) y consejos.
- **Entrenar**: nota sostenida, nota al azar, escala mayor/menor y arpegio, con referencia sonora. Cuenta como acierto cantar la nota en cualquier octava.
- **Progreso**: racha de días, minutos cantados, evolución de la puntuación y de los cents, mejora por canción y rango vocal registrado.

Todo se guarda solo en el dispositivo (IndexedDB). Se puede exportar/importar una copia en JSON (sin audios).

## Cómo usarla

Necesita servirse por HTTPS o `localhost` (los navegadores solo permiten el micrófono así):

```bash
npm start          # sirve en http://localhost:8080
npm test           # pruebas del detector de tono y del análisis
```

Para el móvil, publícala en cualquier hosting estático (p. ej. GitHub Pages) y ábrela desde Safari/Chrome → "Añadir a pantalla de inicio".

## Cómo funciona

- `js/pitch.js` — detección de tono con el algoritmo **YIN** (error < 3 cents en las pruebas), notas y escalas.
- `js/analysis.js` — segmentación en notas, afinación, vibrato, timbre (centroide espectral y claridad armónica) y modelo de emoción.
- `js/audio.js` — micrófono (sin cancelación de eco ni control de ganancia, para no falsear la voz), grabación y tonos de referencia.
- `js/draw.js` — rollo de piano y gráficas en canvas.
- `js/app.js` — interfaz.

> La "emoción" es una estimación heurística a partir de volumen, timbre, ritmo, contorno melódico y la escala de la canción. Sirve como orientación, no como juicio absoluto; el volumen depende también de la distancia al micro.
