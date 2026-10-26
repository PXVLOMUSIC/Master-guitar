# Aplicación para aprender guitarra — Investigación y recomendaciones

> Documento de investigación, diseño y plan de arranque. Idioma: español.

## 1. Resumen ejecutivo

**Recomendación principal:** construir una **PWA (Progressive Web App) en HTML/CSS/JS** (con opción de empaquetar después como app nativa con Capacitor/Tauri), con gamificación estilo Duolingo, un currículo estructurado por niveles, un afinador en tiempo real con Web Audio API, y un motor de lecciones basado en ejercicios cortos (micro-learning de 3–5 min). El enfoque principal es guitarra (6 cuerdas), con soporte para ukelele (4 cuerdas) y bajo (4 cuerdas) como instrumentos secundarios, compartiendo el mismo motor de lecciones.

**Por qué web primero:** no hay Node/Flutter/.NET en el entorno actual, pero Python + navegador sí. Una PWA funciona en móvil, tablet y escritorio, se instala como app, funciona offline (con Service Worker) y permite iterar rápido. El afinador requiere `getUserMedia` (micrófono), que funciona en contextos seguros (HTTPS o localhost).

## 2. Cómo se aprende guitarra rápido (evidencia y principios)

### 2.1 Principios pedagógicos que funcionan

1. **Micro-learning (sesiones cortas, frecuentes).** 5–10 min diarios superan a 1 h semanal. Duolingo lo valida: la repetición espaciada (spaced repetition) con intervalos crecientes fija la memoria a largo plazo.
2. **Repetición espaciada + recuperación activa.** No basta con mostrar: hay que pedir al usuario que recuerde (recall) antes de mostrar la respuesta. Ej.: "¿Qué acorde es este diagrama?" antes de revelar.
3. **Práctica deliberada con feedback inmediato.** El afinador y la detección de acordes dan feedback en tiempo real; eso es lo que acelera el aprendizaje motor.
4. **Progresión por habilidades atómicas.** Partir de lo mínimo viable: postura → afinación → acordes abiertos (Em, Am, C, G, D) → cambios de acorde → ritmos → canciones → escalas → solos.
5. **Gamificación con propósito.** XP, rachas, corazones (vidas), ligas, logros, insignias. Pero el juego debe servir al aprendizaje, no sustituirlo.
6. **Motivación temprana (quick wins).** En la primera sesión el usuario debe tocar una canción reconocible (p. ej. "Smoke on the Water" con una cuerda, o un riff de 2 notas). Eso genera dopamina y retención.
7. **Multimodalidad.** Audio + visual (diagramas de acordes, tablatura, animación de dedos) + kinestésico (tocar). La app debe mostrar dónde poner los dedos y sonar cómo debe sonar.
8. **Personalización por nivel.** Test inicial de nivel (placement test) para no aburrir a quien ya sabe.

### 2.2 Currículo recomendado (guitarra)

**Nivel 0 — Descubrimiento (Día 1)**
- Anatomía de la guitarra (cuerdas, trastes, cejilla).
- Postura y cómo sostener.
- Afinación (estándar EADGBE).
- Primer sonido: tocar una cuerda al aire y otra en traste.

**Nivel 1 — Primeros acordes (Semanas 1–2)**
- Acordes abiertos: Em, Am, E, A.
- Cambios Em↔Am, E↔A.
- Ritmo básico: 4 negras, downstrokes.
- Primera canción de 2 acordes.

**Nivel 2 — Acordes mayores abiertos (Semanas 3–4)**
- C, G, D, F (F con cejilla suave).
- Progresiones I–V–vi–IV (C-G-Am-F).
- Rasgueo básico (down-up).
- Canciones de 3–4 acordes.

**Nivel 3 — Ritmo y técnica (Mes 2)**
- Rasgueo sincopado, palm mute.
- Acordes con cejilla (F, Bm).
- Escala pentatónica menor (pos. 1).
- Riffs sencillos.

**Nivel 4 — Intermediate (Mes 3–4)**
- Acordes de séptima (maj7, m7, dom7).
- Escalas mayores/menores.
- Arpegios, fingerpicking básico.
- Improvisación sobre backing track.

**Nivel 5 — Advanced**
- Modos, acordes extendidos, tapping, sweep picking.
- Transcripción, oído.
- Estilos (blues, rock, jazz, flamenco, fingerstyle).

### 2.3 Lo que hacen bien las apps líderes (benchmarking)

- **Yousician:** detección de audio en tiempo real, lecciones cortas, canciones reales, feedback de precisión. Suscripción.
- **Fender Play:** rutas por canción/estilo, videos HD, progreso visual.
- **GuitarTuna (Yousician):** afinador muy popular, juegos de oído.
- **Ultimate Guitar:** tablaturas, acordes, biblioteca enorme (licencias).
- **Duolingo:** gamificación, rachas, ligas, corazones, lecciones de 5 min, repetición espaciada.
- **Simply Guitar / GuitarTricks:** video + práctica.

**Lecciones aprendidas:**
- La detección de audio en tiempo real es el "moat" (ventaja competitiva) más fuerte. Sin ella, la app es solo contenido.
- Las canciones reales (licenciadas) son caras; empezar con canciones originales / dominio público / ejercicios.
- El onboarding debe ser < 60 s hasta la primera nota tocada.
- El contenido debe ser modular: cada lección = objetivo + demo + práctica + quiz.

## 3. Arquitectura recomendada

### 3.1 Stack tecnológico

| Capa | Tecnología | Justificación |
|---|---|---|
| Frontend | HTML5 + CSS3 + JS (ES modules) | Sin dependencias de build, funciona en cualquier navegador |
| Audio | Web Audio API + getUserMedia | Afinador y detección de pitch en tiempo real |
| Pitch detection | Autocorrelación (YIN simplificado) o librería `pitchy`/`ml5` | Ligero, sin backend |
| Persistencia | localStorage + IndexedDB (para audio/assets) | Offline-first |
| Offline | Service Worker + Cache API | PWA instalable |
| Empaquetado (futuro) | Capacitor o Tauri | App nativa iOS/Android/Desktop |
| Backend (futuro) | Python (FastAPI) + Postgres | Cuentas, sincronización, contenido |
| Contenido | JSON de lecciones + assets de audio (ogg/mp3) | Editable sin código |

### 3.2 Estructura de carpetas

```
guitar-app/
  index.html
  manifest.webmanifest
  sw.js
  css/
    styles.css
  js/
    app.js          # router + estado global
    audio.js        # Web Audio, afinador, pitch
    tuner.js        # UI del afinador
    lessons.js      # motor de lecciones
    gamification.js # XP, rachas, corazones, logros
    storage.js      # localStorage/IndexedDB
    instruments.js  # definiciones de instrumentos y afinaciones
    ui.js           # componentes reutilizables
  data/
    lessons.json
    chords.json
    songs.json
  assets/
    audio/  img/
```

### 3.3 Modelo de datos (conceptual)

- **User**: id, name, instrument, level, xp, gems, hearts, streak, lastPractice, settings.
- **Instrument**: id, name, strings[], tunings[].
- **Lesson**: id, unit, order, title, objectives[], steps[].
- **Step**: type (demo|practice|quiz|tuner), content, expected (nota/acorde/ritmo), feedback.
- **Achievement**: id, condition, reward.

### 3.4 Detección de audio (afinador)

Algoritmo (autocorrelación):
1. Capturar stream del micrófono con `getUserMedia({audio:true})`.
2. Crear `AnalyserNode` con fftSize 2048/4096.
3. Leer `getFloatTimeDomainData`.
4. Calcular autocorrelación: para cada lag τ, correlación = Σ x[i]·x[i+τ]. Encontrar el primer pico significativo. Frecuencia = sampleRate/τ.
5. Convertir frecuencia → nota MIDI → nombre de nota + cents de desviación.
6. Comparar con la cuerda objetivo (o auto-detectar la más cercana).

Soporte multi-instrumento mediante tabla de afinaciones:
- Guitarra estándar: E2 A2 D3 G3 B3 E4
- Guitarra drop D: D2 A2 D3 G3 B3 E4
- Ukelele (soprano/concert): G4 C4 E4 A4 (GCEA)
- Ukelele barítono: D3 G3 B3 E4
- Bajo 4 cuerdas: E1 A1 D2 G2
- Bajo 5 cuerdas: B0 E1 A1 D2 G2

## 4. Gamificación (diseño)

- **XP y niveles:** cada lección otorga XP; subir de nivel desbloquea contenido.
- **Racha diaria:** contador de días consecutivos; recompensa por mantenerla; "congelador de racha" (streak freeze) comprable con gemas.
- **Corazones (vidas):** 5 corazones; se pierden al fallar; se regeneran con el tiempo o se compran.
- **Gemas:** moneda premium para comprar congeladores, corazones, trajes.
- **Ligas:** Bronce → Plata → Oro → Platino → Diamante (ranking semanal entre usuarios similares).
- **Logros/insignias:** "Primera canción", "7 días de racha", "Afinador perfecto", etc.
- **Desafío diario:** una lección especial con recompensa doble.
- **Recompensas de cofre:** al completar una unidad, cofre con XP/gemas/cosméticos.

## 5. Pantallas / UX

1. **Splash + Onboarding** (elegir instrumento, nivel, objetivo, nombre).
2. **Home** (racha, XP, continuar, desafío diario, unidades).
3. **Ruta de aprendizaje** (skill tree por unidades).
4. **Lección** (pasos: demo → práctica → quiz → resumen).
5. **Afinador** (standalone + dentro de lecciones).
6. **Práctica libre** (acordes, escalas, metrónomo, canciones).
7. **Perfil** (stats, logros, ajustes).
8. **Tienda** (corazones, congeladores, cosméticos).

## 6. Plan de arranque (sprints)

**Sprint 0 (1–2 días):** scaffolding PWA, routing, tema visual, storage. ✅ (este prototipo)
**Sprint 1 (3–5 días):** afinador funcional (guitarra + ukelele), onboarding, home.
**Sprint 2 (1 semana):** motor de lecciones + 2 unidades de guitarra principiante (≈20 lecciones).
**Sprint 3 (1 semana):** gamificación completa (XP, racha, corazones, logros) + desafío diario.
**Sprint 4 (1 semana):** ukelele como segundo instrumento + práctica libre (acordes, escalas, metrónomo).
**Sprint 5 (1 semana):** PWA offline + notificaciones push + empaquetado Capacitor (Android primero).
**Sprint 6+:** backend, cuentas, sincronización, contenido premium, canciones licenciadas.

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Detección de pitch inexacta en móviles baratos | Usar autocorrelación + suavizado; ofrecer modo "tocar y comparar" con referencia |
| Permisos de micrófono denegados | Modo sin micrófono: práctica con botones + audio de referencia |
| Contenido caro (canciones) | Empezar con originales y dominio público; añadir licencias después |
| Retención baja | Rachas, notificaciones, desafíos diarios, ligas sociales |
| Latencia de audio en web | Usar AudioContext con baja latencia; evitar procesamiento pesado en main thread |

## 8. Recomendación de nombre y branding

Nombres candidatos: **Strumly**, **ChordQuest**, **Guitario**, **Playla**, **Acordeon (no)**, **FretFlow**, **Strumio**. Recomendado: **Strumio** (corto, sonoro, fácil de recordar) o **FretFlow**. Paleta: verde Duolingo-like (#58CC02) como acento de éxito, fondo oscuro (#131F24), tarjetas (#1F3040), acento secundario naranja (#FF9600) para fuego/racha.

## 9. Cómo empezar YA (pasos concretos)

1. Abrir `guitar-app/index.html` en el navegador (o servir con `python -m http.server`).
2. Probar el afinador (conceder permiso de micrófono).
3. Completar el onboarding y una lección de ejemplo.
4. Iterar contenido en `data/lessons.json`.
5. Cuando el prototipo valide la UX, migrar a un framework (React/Vue/Svelte) y añadir Capacitor.

## 10. Fuentes y referencias

- Duolingo: modelo de gamificación y repetición espaciada.
- Yousician / Fender Play / GuitarTuna: benchmarking de apps de guitarra.
- MDN Web Audio API y MediaDevices.getUserMedia: base técnica del afinador.
- Literatura de práctica deliberada (Ericsson) y micro-learning.
- Teoría musical: afinaciones estándar, acordes abiertos, escala pentatónica.

---
---

## 11. Problema central a resolver (validado)

El 90 % de los principiantes abandona la guitarra en el primer año (Fender). Las 4 causas:
1. Dolor en las yemas las primeras 2–3 semanas.
2. No sonar bien pronto (semanas de ejercicios sin canción).
3. No saber qué practicar ni si se avanza.
4. Sin feedback (no saben si el acorde suena bien).

**La app debe diseñarse contra estas 4 cosas.** Mensaje clave en semana 1–3: "Es normal que te duelan los dedos; en 2 semanas se forman callos."

## 12. Principios adicionales (JustinGuitar / Yousician)

- **Cambios de acorde de "un minuto"**: contar cuántos cambios limpios Em↔Am en 60 s, con récord superable.
- **Practicar lento con metrónomo** e ir subiendo el tempo al acertar.
- **Repetición espaciada**: acordes/conceptos vuelven a los 1, 3, 7 y 14 días.
- **Teoría solo cuando hace falta** (nunca como tema de entrada).
- **Grabación día 1 vs día 30** para motivar.
- **Encouraging messages** específicos para la semana 1–3.

## 13. Apartados para quien ya toca

- **Prueba de nivel** al entrar (práctica: toca ciertos acordes/ritmos; el micrófono escucha y coloca al usuario).
- **Rutas por estilo**: rock, blues, pop/acústico, flamenco y rumba (mercado hispano), fingerstyle, metal, jazz, clásica. Cada una con técnicas y canciones propias.

## 14. Herramientas (gratis siempre — es lo que hace descargar la app)

Afinador cromático y por instrumento · Metrónomo y caja de ritmos · Diccionario de acordes/escalas con sonido · Entrenador de oído (intervalos y tipos de acorde) · Grabadora · Trainer de acordes de canciones (ojo con licencias).

## 15. Licencias de canciones

Las canciones comerciales requieren licencia de editoriales (cara y lenta). Empezar con: dominio público, canciones originales para la app, progresiones genéricas (los acordes no se registran). Licencias más adelante con ingresos.

## 16. Niche competitivo

Pedagogía de JustinGuitar + adicción de Duolingo + feedback de Yousician, en español primero, con estilos hispanos (rumba, flamenco, reggaetón acústico).

## 17. Fases (validadas)

1. **Fase 1 — Afinador** (2–4 semanas): guitarra + ukelele, afinaciones alternativas. Publicable por sí solo.
2. **Fase 2 — MVP aprendizaje** (2–3 meses): Nivel 0 y 1 completos (30 días), XP, rachas, reto diario, detección de notas.
3. **Fase 3:** detección de acordes, prueba de nivel, niveles 2–3, metrónomo.
4. **Fase 4:** rutas por estilo, ligas, social, suscripción.
5. **Fase 5:** más instrumentos, avanzado, licencias.

**Paralelamente:** definir el currículo de los primeros 30 días lección a lección (es lo de mayor valor y no depende de la tecnología).

## 18. Migración tecnológica (cuando escale)

El prototipo PWA valida la UX. Para producción móvil: migrar a **Flutter** (recomendado por rendimiento en audio/animaciones) o React Native. Detección de pitch con YIN/MPM en código nativo (C++/Rust) para respuesta inmediata; detección de acordes con cromagrama + modelo ML pequeño on-device. Backend: Supabase/Firebase. Monetización freemium.

*Documento actualizado con las ideas adicionales.*
