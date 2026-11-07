# Mi IA

Una IA de chat **local y privada** que contesta lo que **tú le enseñes**. Funciona en el navegador, sin internet, sin cuentas y sin filtros: no hay ningún servidor detrás y nada sale de tu dispositivo.

## Cómo entrenarla

- **Desde el chat**: si no sabe algo, te pregunta qué debería responder y lo aprende con tu siguiente mensaje.
  - `/aprende pregunta = respuesta` le enseña algo al momento. Para dar varias respuestas alternativas, sepáralas con ` --- `.
  - 👍 refuerza una respuesta y aprende esa forma de preguntarlo.
  - 👎 te pide la respuesta correcta y sustituye la equivocada.
  - «¿Te referías a…?»: si no está segura, te propone lo más parecido que conoce y, si aciertas, aprende la nueva forma de preguntar.
  - `/olvida` borra lo último que respondió. `/saltar` cancela una pregunta pendiente.
- **Pestaña Entrenar**:
  - Pares de pregunta y respuesta, con varias formas de preguntar (una por línea) y respuestas alternativas (separadas con `---`).
  - Aprender de textos: pega apuntes, una biografía o preguntas frecuentes, o carga archivos `.txt` o `.md`. Responde con el fragmento más relevante.
  - Personalidad: nombre, saludo, qué decir cuando no sabe algo y lo exigente que es antes de responder.
  - Editar o borrar cualquier cosa que haya aprendido.
  - Exportar o importar su memoria en JSON para pasarla a otro dispositivo o guardar copias.
- Las respuestas admiten `{nombre}`, `{hora}` y `{fecha}`.

## Cómo funciona

Busca entre lo que le has enseñado la pregunta más parecida a la tuya. Para medir el parecido combina dos cosas: las palabras que coinciden (TF-IDF, sin acentos ni palabras vacías y con raíces simplificadas) y los trozos de tres letras en común (trigramas), lo que le permite tolerar faltas de ortografía. No es un modelo de lenguaje: no inventa ni redacta respuestas nuevas, sino que responde con lo que tú le has dado. Cuanto más la entrenes (y más formas de preguntar le enseñes), mejor contesta.

## Uso

Abre `index.html` desde un servidor local:

```sh
python3 -m http.server 8000
# http://localhost:8000
```

También se puede publicar tal cual en GitHub Pages. Lo aprendido se guarda en el `localStorage` de ese navegador.

## Archivos

- `js/brain.js`: el motor (aprendizaje, búsqueda y correcciones).
- `js/app.js`: el chat, la pestaña de entrenamiento y las copias de seguridad.
- `index.html`, `styles.css`, `icon.svg`
