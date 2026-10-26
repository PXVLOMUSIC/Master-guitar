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

En **Authentication → URL Configuration**:

- **Site URL**: `https://pxvlomusic.github.io/Master-guitar/`
- **Redirect URLs** (añade):
  - `https://pxvlomusic.github.io/Master-guitar/**`
  - deja también `http://127.0.0.1:9999/**` para desarrollo

Sin esto, Google login y los enlaces de email fallarán con
`redirect_to` no permitido.

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

GitHub Pages reconstruye en ~1 minuto. Si no ves el cambio, recarga forzando
caché o cierra y abre la PWA.

## Notas

- Se excluyen `tools/.sample_cache/` (98 MB), `tools/_pylibs/` y las copias de
  seguridad locales. El audio real de `assets/audio/` sí se publica.
- `sw.js` es un service worker de paso (sin caché offline todavía). La PWA es
  instalable, pero necesita internet para cargar.
- `serve.py` es solo para desarrollo local; no se usa en Pages.
