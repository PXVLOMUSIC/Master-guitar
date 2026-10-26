# Strumio — Aprende guitarra (prototipo PWA)

Aplicación web progresiva (PWA) para aprender guitarra paso a paso, estilo Duolingo,
con afinador en tiempo real, retos diarios, recompensas y soporte para ukelele y bajo.

## Cómo ejecutar

```bash
cd guitar-app
python -m http.server 8765
# abrir http://127.0.0.1:8765/
```

> El afinador requiere micrófono. Funciona en contextos seguros (HTTPS o localhost).

## Estructura

- `index.html` — shell de la app
- `css/styles.css` — estilos
- `js/app.js` — router y vistas
- `js/audio.js` — Web Audio + detección de pitch (autocorrelación)
- `js/instruments.js` — instrumentos y afinaciones
- `js/gamification.js` — XP, rachas, corazones, logros
- `js/storage.js` — persistencia (localStorage)
- `data/lessons.json` — currículo
- `data/chords.json` — diagramas de acordes
- `sw.js` — service worker (offline)

## Próximos pasos

Ver `INVESTIGACION_Y_RECOMENDACIONES.md`.
