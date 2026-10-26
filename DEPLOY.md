# Publicación en GitHub Pages

Repositorio: <https://github.com/PXVLOMUSIC/Master-guitar>

URL de la app: <https://pxvlomusic.github.io/Master-guitar/>

---

## 1. Activar GitHub Pages (una vez)

1. Abre el repo en GitHub → **Settings → Pages**.
2. En **Build and deployment → Source**, elige **Deploy from a branch**.
3. Branch: **main** · Folder: **/ (root)** → **Save**.
4. Espera 1–2 minutos. La URL aparecerá arriba.

No hay build: se publica tal cual.

## 2. Autorizar la URL en Supabase

Abre directamente:
<https://supabase.com/dashboard/project/ljivvfvkdwecgblyepdg/auth/url-configuration>

En **Authentication → URL Configuration**:

1. **Site URL**: `https://pxvlomusic.github.io/Master-guitar/`
2. En **Redirect URLs** añade:
   - `https://pxvlomusic.github.io/Master-guitar/**`
   - `http://localhost:9999/**`
   - `http://127.0.0.1:9999/**`
3. Si aparece el interruptor **Allow all redirect URLs**, desactívalo.
   Si no aparece, elimina cualquier entrada comodín suelta (`*` o `**`).
4. Pulsa **Save**.

Sin esto, Google login y los enlaces de email fallarán con
`redirect_to` no permitido. Con la lista abierta, cualquier web podría
usar tu proyecto para iniciar sesión.

## 3. Google Cloud

No cambies la redirect URI: sigue siendo
`https://ljivvfvkdwecgblyepdg.supabase.co/auth/v1/callback`.

Opcional: en **Authorized JavaScript origins** añade
`https://pxvlomusic.github.io`.

## 4. Probar en el móvil

1. Abre `https://pxvlomusic.github.io/Master-guitar/` en el móvil.
2. Inicia sesión con Google.
3. Menú del navegador → **Añadir a pantalla de inicio**.
4. Prueba el afinador: el micrófono solo funciona en **HTTPS**, y Pages ya lo da.

## 5. Actualizar la app

```powershell
git add -A
git commit -m "descripción del cambio"
git push
```

GitHub Pages reconstruye en ~1 minuto.

### Caché offline y actualizaciones

- La primera visita guarda el shell (HTML, CSS, JS, datos e iconos) para abrir
  sin conexión. El audio se guarda la primera vez que se reproduce.
- Si cambias `sw.js`, la app mostrará **Nueva versión disponible → Recargar**.
- Si no ves un cambio, cierra todas las pestañas de la app (o la PWA) y vuelve
  a abrirla. Para forzar una actualización del service worker, sube la versión
  de `SHELL_CACHE` en `sw.js` (`strumio-shell-v1` → `v2`).

## Notas

- Se excluyen `tools/.sample_cache/` (98 MB), `tools/_pylibs/` y las copias de
  seguridad locales. El audio real de `assets/audio/` sí se publica.
- `sw.js` es un service worker de paso (sin caché offline todavía). La PWA es
  instalable, pero necesita internet para cargar.
- `serve.py` es solo para desarrollo local; no se usa en Pages.
