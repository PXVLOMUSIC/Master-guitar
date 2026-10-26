# Acceso simplificado (Google, GitHub, Discord…)

La app ya incluye la pantalla nueva de acceso y detecta sola qué proveedores
tienes activados. Para que aparezca el botón de Google solo falta un trámite
**de una vez** en Google Cloud y Supabase.

> El consentimiento de Google (elegir cuenta) no se puede evitar: es un
> requisito de seguridad de Google. El usuario no crea nada ahí, solo pulsa su
> cuenta y vuelve a la app. No hay formularios ni páginas intermedias.

---

## 1. Google (10 minutos, una sola vez)

### 1.1 Crear el cliente OAuth en Google Cloud

1. Entra en <https://console.cloud.google.com/> con tu cuenta de Google.
2. Arriba, **Seleccionar proyecto → Proyecto nuevo**. Nombre: `Strumio`. Crear.
3. Menú **APIs y servicios → Pantalla de consentimiento de OAuth**.
   - Tipo: **Externo** → Crear.
   - Nombre de la app: `Strumio`.
   - Correo de asistencia y correo del desarrollador: tu email.
   - Guardar y continuar.
   - Permisos: deja los básicos (`email`, `profile`, `openid`). Guardar.
   - Usuarios de prueba: añade tu email mientras la app esté en modo *Testing*.
     Cuando quieras que entre cualquiera, pulsa **Publicar app**.
4. Menú **APIs y servicios → Credenciales → Crear credenciales →
   ID de cliente de OAuth**.
   - Tipo de aplicación: **Aplicación web**.
   - Nombre: `Strumio Web`.
   - **Orígenes de JavaScript autorizados**:
     - `http://127.0.0.1:9999`
     - `http://localhost:9999`
     - (y tu dominio de producción cuando lo tengas)
   - **URI de redirección autorizados** (importante, exacto):
     - `https://ljivvfvkdwecgblyepdg.supabase.co/auth/v1/callback`
   - Crear. Copia el **Client ID** y el **Client Secret**.

### 1.2 Activarlo en Supabase

1. <https://supabase.com/dashboard/project/ljivvfvkdwecgblyepdg>
2. **Authentication → Providers → Google**.
3. Activa el proveedor y pega el Client ID y el Client Secret. Guardar.

### 1.3 Autorizar las URLs de vuelta

En **Authentication → URL Configuration**:

- **Site URL**: `http://127.0.0.1:9999`
- **Redirect URLs** (añade una por línea):
  - `http://127.0.0.1:9999/**`
  - `http://localhost:9999/**`
  - tu dominio de producción, p. ej. `https://tudominio.com/**`

Guarda. Recarga la app con `Ctrl + Shift + R`.

El botón **Continuar con Google** aparecerá automáticamente en Inicio y en
**Perfil → Ajustes**. No hay que tocar código: la app lee
`/auth/v1/settings` y muestra solo los proveedores activos.

---

## 2. GitHub (opcional, 3 minutos)

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Homepage URL: `http://127.0.0.1:9999`
3. Authorization callback URL:
   `https://ljivvfvkdwecgblyepdg.supabase.co/auth/v1/callback`
4. Copia el Client ID y genera un Client Secret.
5. Supabase → **Authentication → Providers → GitHub** → activar y pegar.

## 3. Discord (opcional)

1. <https://discord.com/developers/applications> → New Application.
2. **OAuth2 → Redirects**: añade
   `https://ljivvfvkdwecgblyepdg.supabase.co/auth/v1/callback`
3. Copia Client ID y Client Secret.
4. Supabase → **Authentication → Providers → Discord** → activar.

> Apple exige el Apple Developer Program (99 $/año). No lo recomiendo de
> momento; el botón solo aparece si algún día lo activas.

---

## 4. Qué hace ya la app

- Botones sociales con el estilo de cada marca, solo para proveedores activos.
- **Enlace de acceso por email** (sin contraseña): un clic en el correo.
- Email + contraseña como alternativa clásica.
- **Probar sin cuenta**: perfil local inmediato, sin email ni páginas externas
  (no se sincroniza entre dispositivos).
- Al volver de Google, se crea el perfil local automáticamente y se descarga
  el progreso de la nube; ya no se vuelve a pedir el onboarding.
- Tarjeta discreta en Inicio: «Guarda tu progreso» con botón de Google
  (o «Iniciar sesión o crear cuenta» si aún no hay proveedores).

## 5. Límites reales

- **El enlace mágico depende del correo**. El SMTP integrado de Supabase tiene
  un límite bajo (unos pocos emails por hora) y puede caer en spam. Para uso
  real, configura SMTP propio en Supabase (Resend o Brevo tienen plan gratis).
- **El invitado local no sincroniza**. Si borra los datos del navegador,
  pierde el progreso. Para conservarlo, que cree cuenta con Google o email.
- **Google en modo Testing** solo deja entrar a los emails que añadas como
  usuarios de prueba. Pulsa «Publicar app» para abrirlo a todos.
