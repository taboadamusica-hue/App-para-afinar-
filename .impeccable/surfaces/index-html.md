---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: []
---

# AfinaVoz app shell (todas las pantallas)

Mode: Operate. Audiencia: cantantes practicando en casa, ensayos, camerino, clases. Tarea: ver la afinación de un vistazo, grabar tomas por canción, entrenar, seguir el progreso.

## Direction contract

THESIS: Canon de app de música a nivel Spotify: el contenido (canciones, tu voz) pone el color; la interfaz es negra, tipográfica y silenciosa. Rechaza el "dashboard de tarjetas grises con un acento neón" del borrador anterior.

OWN-WORLD: Fondo casi negro con superficies escalonadas (sin bordes; jerarquía por luminosidad). Cada canción recibe un color propio derivado de su título: portada cuadrada con iniciales y degradado de cabecera en su página. Acento de marca coral/ámbar cálido (no verde) para acción principal; estados afinado/alto/bajo en verde-menta/ámbar/rojo con texto. Tipografía del sistema en pesos 700–900 con tracking negativo en títulos; cifras tabulares. Botones píldora, botón circular grande para grabar/empezar, filas de lista con miniatura, iconos SVG lineales en la barra inferior.

STORY: Abres y ves la nota enorme; cantas y la aguja y la curva responden. En Canciones ves tu biblioteca como una lista de discos; dentro, la cabecera con su color, la evolución y el botón de grabar. El informe se lee como una pantalla de "Wrapped": la nota grande, luego detalles.

FIRST VIEWPORT: Afinador: cabecera mínima (título de sección grande a la izquierda, botón micro píldora a la derecha); nota gigante centrada (~96px, 900) con cents y Hz debajo; medidor horizontal con zona central; curva en vivo a ancho completo; selectores de tonalidad/escala como chips. Barra inferior de 4 pestañas con iconos SVG.

FORM: Canon (salida estándar elegida por el usuario), referente Spotify. seed: ac5661c2f9229215

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
