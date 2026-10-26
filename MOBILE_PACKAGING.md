# Empaquetado móvil (Capacitor)

## Prerrequisitos
- Node.js 18+ y npm
- Android Studio (para Android) / Xcode (para iOS, solo macOS)

## Pasos

1. Instalar Capacitor:
```bash
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap init Strumio com.strumio.app --web-dir .
```

2. Añadir plataformas:
```bash
npx cap add android
npx cap add ios
```

3. Copiar assets web:
```bash
npx cap sync
```

4. Abrir en IDE:
```bash
npx cap open android
npx cap open ios
```

5. Configurar permisos de micrófono:
   - Android: añadir en `AndroidManifest.xml`:
     `<uses-permission android:name="android.permission.RECORD_AUDIO" />`
   - iOS: añadir en `Info.plist`:
     `NSMicrophoneUsageDescription` = "Strumio necesita el micrófono para el afinador."

6. Build y publicar:
   - Android: Build > Generate Signed Bundle/APK
   - iOS: Product > Archive

## Plugins recomendados
- @capacitor/push-notifications (notificaciones push)
- @capacitor/local-notifications (recordatorios diarios)
- @capacitor/haptics (feedback háptico)
- @capacitor/share (compartir progreso)
- @capacitor/filesystem (guardar grabaciones)

## Notas
- El afinador requiere HTTPS o contexto seguro. Capacitor usa https:// por defecto.
- Las muestras de audio se cargan desde assets/samples/ - asegúrate de incluirlas en el build.
- El Service Worker funciona en Capacitor WebView.

## Alternativa: Flutter
Si se prefiere Flutter, la app web actual sirve como prototipo de UX. La migración a Flutter requeriría reescribir la UI pero reutilizaría la lógica de audio (via FFI a C++/Rust para YIN) y el contenido JSON.
