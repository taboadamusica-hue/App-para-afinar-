# Afinador IA

Afinador para el navegador (PWA) con un **asistente de IA privado, recurrente y proactivo**.

## Qué hace

- **Afinador**: detección de tono YIN en tiempo real (precisión < 1 cent). Guitarra (estándar y Drop D), bajo, ukelele, violín, violonchelo y modo cromático. La de referencia ajustable (415–460 Hz).
- **Privado**: no hay servidores ni cuentas. El audio se analiza al momento y no se graba; lo que aprende el asistente se guarda solo en el navegador (`localStorage`). Se puede exportar o borrar desde Ajustes.
- **Proactivo**: aprende cómo se desafina cada cuerda y, sin que preguntes:
  - te saluda al abrir con tu racha y la cuerda por la que conviene empezar;
  - te indica la siguiente cuerda a afinar (la más inestable primero);
  - avisa si una cuerda ya afinada se vuelve a mover mientras tocas, y sugiere revisar la clavija o cambiarla si pasa a menudo;
  - detecta cuerdas que llegan cada vez más desafinadas (cuerdas viejas);
  - tras 25 min tocando, sugiere repasar la afinación;
  - propone activar un recordatorio a la hora a la que sueles practicar.
- **Recurrente**: recordatorio diario de práctica (hora y días configurables; no molesta si ya afinaste ese día) y resumen semanal los lunes. Con la app abierta aparecen en la app y como notificación; con la PWA instalada en Chrome/Edge, el service worker los lanza también con la app cerrada (Periodic Background Sync).
- **Chat local**: pregúntale «¿cómo voy?», «¿qué cuerda se desafina más?», tu racha, recordatorios, privacidad o consejos.

## Uso

Necesita HTTPS (o `localhost`) para el micrófono y el service worker:

```sh
python3 -m http.server 8000
# abre http://localhost:8000
```

Se puede publicar tal cual en GitHub Pages. Para recordatorios con la app cerrada, instálala («Instalar app» en Chrome/Edge) y permite notificaciones.

## Estructura

- `js/pitch.js` – detección de tono (YIN) y utilidades de notas
- `js/assistant.js` – el asistente: aprendizaje local, avisos proactivos, recordatorios y chat
- `js/memory.js` – memoria local y sincronización mínima con el service worker
- `js/app.js` – interfaz, audio y planificador
- `sw.js` – modo sin conexión y recordatorios en segundo plano
