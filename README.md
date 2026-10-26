# Strumio — Aprende guitarra (PWA)

**Demo:** <https://pxvlomusic.github.io/Master-guitar/>

Aplicación web progresiva para aprender guitarra, ukelele y bajo paso a paso,
con estilo de juego (XP, rachas, corazones y logros). Sin build, sin frameworks:
JavaScript moderno, Web Audio y Supabase.

## Funciones

- **125 lecciones** en 21 unidades (guitarra y ukelele).
- **Afinador** con micrófono (YIN + autocorrelación), modo cromático y por cuerda.
- **Metrónomo**, detector de acordes, entrenadores de oído y ritmo.
- **Practicar**: 29 herramientas en un hub con buscador, favoritos y ventanas modales.
- **Audio real CC0**: batería, bajo, guitarra y percusión (Karoryfer Samples),
  con capas de velocidad y round-robin.
- **Canciones**, backing tracks, secuenciador de 16 pasos, mezclador y exportación WAV.
- **Cuenta y sincronización** con Supabase: email/contraseña, enlace mágico y
  Google OAuth. Ranking, retos y progreso en la nube.
- **PWA instalable y offline**: shell precacheado, audio cacheado al reproducir,
  aviso de nueva versión y modo sin conexión.
- **Respaldo del progreso**: exportar/importar JSON y restablecer el dispositivo
  desde Ajustes → Datos y respaldo.

## Ejecutar en local

```bash
python serve.py
# http://127.0.0.1:9999/index.html
```

> El micrófono del afinador necesita un contexto seguro: `localhost` o HTTPS.
> `serve.py` envía `Cache-Control: no-store` para evitar JS antiguo en desarrollo.

## Despliegue

GitHub Pages publica la rama `main` en
<https://pxvlomusic.github.io/Master-guitar/>. Pasos y configuración de Supabase
en [`DEPLOY.md`](DEPLOY.md).

## Estructura

- `index.html` — shell de la app
- `css/styles.css` — sistema de diseño
- `js/app.js` — router y vistas
- `js/audio.js` — Web Audio, pitch y metrónomo
- `js/sample-engine.js` — muestras reales CC0
- `js/backing-pro.js` — mezclador y secuenciador
- `js/backend.js` + `js/supabase-config.js` — auth y sincronización
- `data/` — currículo, acordes, canciones y vídeos
- `assets/audio/` — muestras FLAC y `manifest.json` con licencias
- `sw.js` — service worker: shell + media cache y actualizaciones
- `backend/schema.sql` — tablas, RLS y triggers de Supabase

## Documentación

- [`DEPLOY.md`](DEPLOY.md) — publicar en GitHub Pages
- [`SOCIAL_LOGIN.md`](SOCIAL_LOGIN.md) — activar Google/GitHub/Discord
- [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) — base de datos y RLS
- [`MOBILE_PACKAGING.md`](MOBILE_PACKAGING.md) — Capacitor y tiendas

## Créditos

Muestras de audio: **Karoryfer Samples** (CC0). Los detalles y licencias están
en `assets/audio/manifest.json`.
