# Strumio - Guia de configuracion completa

Esta guia explica como configurar, extender y empaquetar la app de guitarra (Strumio).

## 1. Requisitos

- Navegador moderno (Chrome/Edge/Safari/Firefox) con Web Audio API.
- Servidor HTTP local (no abrir `index.html` directamente con `file://`).
- Python 3 (opcional, para generar samples).
- Node.js 18+ (opcional, para herramientas).
- Cuenta de Supabase (opcional, para sincronizacion).
- Android Studio / Xcode (opcional, para empaquetado movil).

Arranque rapido:

```bash
cd guitar-app
python -m http.server 8080
# abrir http://localhost:8080
```

## 2. Estructura del proyecto

```
guitar-app/
  index.html
  manifest.webmanifest
  sw.js
  capacitor.config.json
  css/styles.css
  data/
    chords.json
    lessons.json
    songs.json
    videos.json
  js/
    app.js
    audio.js
    sample-manager.js
    ...
  assets/samples/
    guitar/ ukulele/ bass/ classical/
  backend/schema.sql
```

## 3. Anadir samples reales de guitarra

### 3.1 Fuentes recomendadas (dominio publico / CC0)

- Freesound.org (filtrar por licencia CC0).
- University of Iowa Musical Instrument Samples (dominio publico para uso educativo).
- Philharmonia Orchestra sound samples (CC).
- Grabaciones propias (recomendado para control total).

### 3.2 Formato

- Formato: WAV (PCM) o OGG/MP3 para web.
- Sample rate: 44.1 kHz (o 48 kHz).
- Bit depth: 16-bit (o 24-bit para calidad alta).
- Canales: mono preferido (menor tamano).
- Duracion: 1 a 3 segundos por nota (con cola de sustain).
- Normalizacion: -6 dB a -3 dB, sin clipping.
- Sin silencio inicial largo (trim al inicio).

### 3.3 Nomenclatura

Los samples se guardan en `assets/samples/<instrumento>/` con el nombre de la nota:

```
assets/samples/guitar/E2.wav
assets/samples/guitar/A2.wav
assets/samples/guitar/D3.wav
assets/samples/guitar/G3.wav
assets/samples/guitar/B3.wav
assets/samples/guitar/E4.wav
```

Instrumentos soportados: `guitar`, `ukulele`, `bass`, `classical`.

Notas por instrumento:

- guitar / classical: E2 A2 D3 G3 B3 E4
- ukulele: G4 C4 E4 (archivo E4u.wav) A4
- bass: E1 A1 D2 G2

Si una nota no existe, el sistema usa el fallback: Karplus-Strong -> onda senoidal.

### 3.4 Registrar nuevos samples

1. Copiar los `.wav` a la carpeta correspondiente.
2. Si el nombre de archivo difiere del nombre de nota, editar `NOTE_FILE_MAP` en `js/audio.js` y `js/sample-manager.js`.
3. Probar en el afinador o en "Canciones".

### 3.5 Calidad de samples

Usar `sample-manager.js`:

```js
import { setQuality, setAudioQuality, preloadCommon, loadSamples } from "./sample-manager.js";

setQuality("high"); // low | medium | high
setAudioQuality({ sampleRate: 48000, bitDepth: 24 });

await preloadCommon(); // precarga notas comunes al inicio
await loadSamples("guitar", ["E2","A2"], { onProgress: (p) => console.log(p) });
```

### 3.6 Cache (memoria + IndexedDB)

- Los samples decodificados se guardan en memoria (Map).
- Los archivos crudos se guardan en IndexedDB (`strumio-samples`) para no volver a descargar.
- Limpiar cache:

```js
import { clearCache } from "./sample-manager.js";
await clearCache();          // todo
await clearCache("guitar");  // solo un instrumento
```

## 4. Configurar Supabase

### 4.1 Crear proyecto

1. Ir a https://supabase.com y crear una cuenta.
2. "New project" -> elegir nombre, password de DB y region.
3. Esperar a que se aprovisione.

### 4.2 Crear tablas

1. Abrir el SQL Editor en el dashboard.
2. Copiar el contenido de `backend/schema.sql`.
3. Ejecutar (Run). Esto crea tablas de usuarios, progreso, canciones, etc.

### 4.3 Obtener credenciales

1. Settings -> API.
2. Copiar `Project URL` y `anon public key`.
3. En la app, abrir Ajustes -> Conexion/Backend e ingresar URL y anon key.
   O editar `js/backend.js` con los valores por defecto.

### 4.4 Configurar autenticacion

1. Authentication -> Providers -> habilitar Email (y Google/GitHub si se desea).
2. Authentication -> URL Configuration -> agregar la URL de la app (http://localhost:8080 o dominio de produccion) a "Redirect URLs".
3. (Opcional) Desactivar confirmacion de email para desarrollo: Authentication -> Email -> "Confirm email" off.

### 4.5 Realtime

1. Database -> Replication -> habilitar realtime para las tablas necesarias (progress, leaderboard).
2. En la app activar "Tiempo real" en Ajustes.

### 4.6 Row Level Security (RLS)

- Asegurarse de que las politicas en `schema.sql` esten aplicadas.
- Cada usuario solo puede leer/escribir su propio progreso.
- Canciones y lecciones son de lectura publica.

### 4.7 Probar conexion

- Abrir la app, ir a Perfil -> iniciar sesion.
- Practicar una leccion y verificar que el progreso se sincroniza (Ajustes -> Sincronizar ahora).

## 5. Empaquetar para movil (Capacitor)

### 5.1 Instalacion

```bash
npm install @capacitor/core @capacitor/cli
npx cap init Strumio com.strumio.app --web-dir .
```

El archivo `capacitor.config.json` ya esta configurado:

```json
{
  "appId": "com.strumio.app",
  "appName": "Strumio",
  "webDir": ".",
  "server": { "androidScheme": "https" }
}
```

### 5.2 Android

```bash
npm install @capacitor/android
npx cap add android
npx cap sync
npx cap open android
```

En Android Studio:
- Conectar dispositivo o crear emulador.
- Build -> Run.

Generar APK de release:

```bash
cd android
./gradlew assembleRelease
```

El APK queda en `android/app/build/outputs/apk/release/`.

### 5.3 iOS

```bash
npm install @capacitor/ios
npx cap add ios
npx cap sync
npx cap open ios
```

En Xcode:
- Seleccionar equipo de desarrollo (Signing & Capabilities).
- Elegir dispositivo/simulador y Run.

Para publicar en App Store se necesita cuenta Apple Developer.

### 5.4 Consideraciones moviles

- Solicitar permisos de microfono en `AndroidManifest.xml` / `Info.plist` (`NSMicrophoneUsageDescription`).
- Los samples grandes deben estar en `assets/` y se incluyen en el bundle.
- Para notificaciones push, configurar Firebase (Android) y APNs (iOS).
- Probar audio con auriculares (latencia).

### 5.5 Actualizar la app

Despues de cambios en el codigo web:

```bash
npx cap sync
npx cap copy
```

## 6. Anadir videos

### 6.1 Archivo de datos

Los videos se definen en `data/videos.json`. Estructura:

```json
{
  "id": "v1",
  "title": "Como tocar acordes basicos",
  "url": "https://www.youtube.com/embed/XXXX",
  "category": "beginner",
  "duration": 300,
  "description": "Tutorial de acordes abiertos"
}
```

### 6.2 Fuentes

- YouTube (embed): `https://www.youtube.com/embed/<ID>`.
- Videos propios: subir a un CDN y usar URL directa (mp4).
- Almacenamiento local: colocar en `assets/videos/` y referenciar `./assets/videos/clip.mp4`.

### 6.3 Anadir un video

1. Agregar entrada a `data/videos.json`.
2. (Opcional) Agregar miniatura en `assets/thumbs/`.
3. Recargar la app; aparece en la seccion de Videos.

### 6.4 Reproduccion

El reproductor esta en `js/video-player.js`. Soporta YouTube embed y HTML5 video. Para autoplay en movil, el usuario debe interactuar primero.

## 7. Anadir nuevas lecciones

### 7.1 Estructura

Lecciones en `data/lessons.json`:

```json
{
  "units": [
    {
      "id": "u1",
      "title": "Unidad 1 - Primeros sonidos",
      "color": "green",
      "lessons": [
        {
          "id": "l1",
          "title": "Anatomia de la guitarra",
          "icon": "guitar",
          "xp": 10,
          "steps": [
            { "type": "info", "title": "Bienvenido", "text": "..." },
            { "type": "quiz", "prompt": "Pregunta", "options": ["a","b"], "answer": 0 }
          ]
        }
      ]
    }
  ]
}
```

### 7.2 Tipos de paso soportados

- `info`: texto informativo.
- `quiz`: pregunta de opcion multiple (`options`, `answer`).
- `chord`: practica de acorde.
- `listen`: identificar sonido.
- `play`: tocar junto al metronomo.

### 7.3 Anadir una leccion

1. Elegir o crear una unidad en `data/lessons.json`.
2. Agregar objeto de leccion con `id` unico.
3. Definir `xp` (recompensa) y `steps`.
4. Guardar y recargar.

### 7.4 Anadir canciones

Editar `data/songs.json`. Campos requeridos:

```json
{
  "name": "Nombre",
  "artist": "Artista",
  "bpm": 120,
  "key": "C",
  "progression": ["C", "G", "Am", "F"],
  "strumming": "D DU UDU",
  "strummingPattern": "D DU UDU",
  "difficulty": 2,
  "style": "pop",
  "description": "Descripcion breve"
}
```

- `difficulty`: 1 (muy facil) a 5 (experto).
- Solo usar progresiones originales o de dominio publico.
- No incluir letras con copyright.

## 8. Troubleshooting

### 8.1 No suena audio

- Verificar que se uso un servidor HTTP (no `file://`).
- Hacer clic en la pagina antes de reproducir (politica de autoplay).
- Revisar la consola del navegador.
- Comprobar que el AudioContext no este suspendido (llamar a resume).

### 8.2 Microfono no funciona

- Permitir permisos de microfono en el navegador.
- En movil, verificar permisos en ajustes del SO.
- Usar HTTPS o localhost (getUserMedia requiere contexto seguro).

### 8.3 Samples no cargan

- Verificar rutas en `assets/samples/`.
- Comprobar nombres de archivo (sensible a mayusculas).
- Revisar la red (pestaña Network) por 404.
- Limpiar cache de IndexedDB y recargar.

### 8.4 Supabase: error de conexion

- Verificar URL y anon key.
- Confirmar que las tablas existen (ejecutar `schema.sql`).
- Revisar politicas RLS.
- Verificar CORS / Redirect URLs.

### 8.5 Empaquetado movil: pantalla blanca

- Ejecutar `npx cap sync` despues de cambios.
- Verificar `webDir` en `capacitor.config.json`.
- Revisar la consola remota (Chrome inspect / Safari Web Inspector).

### 8.6 Service Worker desactualizado

- Desregistrar el SW en DevTools -> Application -> Service Workers.
- Borrar cache del sitio.
- Recargar con Ctrl+F5.

### 8.7 Rendimiento bajo

- Bajar calidad de samples a "low" o "medium".
- Reducir polifonia.
- Desactivar efectos (reverb) si es necesario.

### 8.8 Errores de JSON

- Validar con `python -m json.tool data/songs.json`.
- Revisar comas finales y comillas.

## 9. Recursos adicionales

- Web Audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- Capacitor: https://capacitorjs.com/docs
- Supabase: https://supabase.com/docs
- Freesound: https://freesound.org

---
Ultima actualizacion: 2026