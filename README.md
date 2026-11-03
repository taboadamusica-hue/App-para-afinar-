# MUSIC MAN 🎤🎸

Tu músico de bolsillo: **profesor de canto**, **afinador de guitarra** y **analizador de espectro** en una app web que funciona en el móvil (y se instala como app).

## Qué hace

### Canto (profesor de canto)
- **Tesitura**: elige tu tipo de voz (bajo, bajo-barítono, barítono, tenor, contratenor, contralto, mezzosoprano, soprano) o haz la **prueba de rango** y te la sugiere. Te recomienda una zona cómoda para trabajar a diario y tu extensión, la marca en el rollo de notas, ajusta los ejercicios a tu rango y avisa en el informe si una canción se sale.
- **Afinar voz**: nota, cents y curva de tono en tiempo real, con tonalidad y escala de referencia.
- **Canciones**: crea canciones y graba tomas. Cada toma genera un informe: vista tipo Melodyne (bloques de nota coloreados por desafinación + curva, sincronizada con el audio), afinación, tendencia alta/baja, estabilidad, vibrato, rango, notas difíciles, **tono de voz** (brillo, aire, dinámica) y **emoción** estimada, con consejos.
- **Entrenar**: nota sostenida, nota al azar, escalas mayor/menor y arpegio con referencia sonora (vale cualquier octava).

### Guitarra
- Afinador cromático con detección automática de la cuerda, o fijando una cuerda (suena su nota de referencia).
- Afinaciones: estándar, Drop D, medio tono y un tono abajo, Drop C, DADGAD, Open G, Open D y Open E.
- Marca cada cuerda como afinada tras medio segundo dentro de ±4 cents.

### Espectro
- Espectro en tiempo real (FFT de 8192 puntos, eje de frecuencia logarítmico) con retención de picos, tono fundamental y armónicos marcados.
- Espectrograma en cascada, tres rangos (voz, graves, completo) y botón para congelar.

### Progreso
- Racha de días, minutos, evolución de la puntuación y de los cents, mejora por canción y rango vocal. Ajustes y copia de seguridad.

Todo se guarda solo en el dispositivo (IndexedDB).

## Captación fluida

El tono se mide ~83 veces por segundo y pasa por un seguimiento (`js/tracker.js`) que:
- suaviza con un filtro *One Euro* (quieto cuando la nota está quieta, ágil cuando se mueve);
- se asienta en menos de 100 ms al cambiar de nota;
- corrige saltos de octava falsos y lecturas aisladas;
- mantiene la nota en microcortes, con un umbral de ruido con histéresis para no cortar finales de frase.

## Cómo usarla

Necesita HTTPS o `localhost` para el micrófono:

```bash
npm start   # http://localhost:8080
npm test    # pruebas del detector, el seguimiento y el análisis
```

Publicada con GitHub Pages: https://taboadamusica-hue.github.io/App-para-afinar-/

## Código

- `js/pitch.js` — detector de tono YIN, notas, escalas y afinaciones de guitarra.
- `js/tracker.js` — seguimiento fluido del tono.
- `js/analysis.js` — análisis de tomas: afinación, vibrato, timbre y emoción.
- `js/audio.js` — micrófono, grabación, tonos de referencia y analizador de espectro.
- `js/draw.js` — rollo de piano, gráficas, espectro y espectrograma.
- `js/app.js` — interfaz.

> La emoción es una estimación heurística (volumen, timbre, ritmo, contorno melódico y escala): orientación, no juicio absoluto.
