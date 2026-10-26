// Strumio service worker — shell cache + media cache.
// - Código, HTML y datos: network-first (siempre lo último online; caché si no hay red).
// - Audio e imágenes: stale-while-revalidate (instantáneo y se actualiza en segundo plano).
// - El shell se precarga para que la app abra sin conexión desde la primera visita.

const SHELL_CACHE = "strumio-shell-v2";
const MEDIA_CACHE = "strumio-media-v1";

const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",

  "./data/chords.json",
  "./data/lessons.json",
  "./data/songs.json",
  "./data/videos.json",

  "./assets/audio/manifest.json",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/favicon-16.png",
  "./assets/icons/favicon-32.png",
  "./assets/icons/favicon.ico",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",

  "./js/app.js",
  "./js/audio.js",
  "./js/backend.js",
  "./js/backing-pro.js",
  "./js/backing.js",
  "./js/chord-voicings.js",
  "./js/fretboard.js",
  "./js/gamification.js",
  "./js/improvisation.js",
  "./js/instruments.js",
  "./js/pitch-worker.js",
  "./js/practice-advanced.js",
  "./js/practice-hub.js",
  "./js/practice-routines.js",
  "./js/sample-engine.js",
  "./js/sample-manager.js",
  "./js/scales.js",
  "./js/settings.js",
  "./js/storage.js",
  "./js/supabase-config.js",
  "./js/sync.js",
  "./js/tab-player.js",
  "./js/tablature.js",
  "./js/theory.js",
  "./js/video-player.js",
];

const INDEX_URL = new URL("./index.html", self.location).href;
const CODE_RE = /\.(?:js|css|webmanifest)$/;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(CORE.map(async (rel) => {
      const url = new URL(rel, self.location).href;
      try {
        const res = await fetch(url, { cache: "reload" });
        if (res && res.ok) await cache.put(url, res);
      } catch (e) {
        // Un recurso que falle no debe impedir que la app se instale.
        console.warn("SW: no se pudo precachear", url, e);
      }
    }));
    // Primera instalación: activar ya. Actualización: esperar al aviso.
    if (!self.registration.active) {
      try { await self.skipWaiting(); } catch (e) {}
    }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, MEDIA_CACHE]);
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith("strumio-") && !keep.has(k))
        .map((k) => caches.delete(k))
    );
    try { await self.clients.claim(); } catch (e) {}
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, Google, CDN…
  if (req.headers.has("range")) return;            // audio con rangos: que lo gestione el navegador

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, INDEX_URL));
    return;
  }

  const path = url.pathname;
  const isShell =
    CODE_RE.test(path) ||
    path.includes("/data/") ||
    path.endsWith("/assets/audio/manifest.json");

  if (isShell) {
    event.respondWith(networkFirst(req));
    return;
  }

  const { responsePromise, networkPromise } = mediaResponse(req);
  event.respondWith(responsePromise);
  event.waitUntil(networkPromise.catch(() => {}));
});

async function networkFirst(req, fallbackUrl) {
  const cache = await caches.open(SHELL_CACHE);
  const fromCache = async () => {
    const exact = await cache.match(req, { ignoreSearch: true });
    if (exact) return exact;
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl);
      if (fallback) return fallback;
    }
    return null;
  };

  try {
    const res = await fetch(req);
    if (res && res.ok) {
      try { await cache.put(req, res.clone()); } catch (e) {}
      return res;
    }
    // Si el servidor o un proxy responde 5xx (por ejemplo, sin conexión),
    // preferimos la copia cacheada antes que romper la app.
    if (res && res.status >= 500) {
      const cached = await fromCache();
      if (cached) return cached;
    }
    return res;
  } catch (e) {
    const cached = await fromCache();
    if (cached) return cached;
    return new Response("Sin conexión", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

function mediaResponse(req) {
  const cachePromise = caches.open(MEDIA_CACHE);
  const networkPromise = cachePromise.then((cache) =>
    fetch(req).then(async (res) => {
      if (res && res.ok) {
        try { await cache.put(req, res.clone()); } catch (e) {}
      }
      return res;
    })
  );
  const responsePromise = cachePromise
    .then((cache) => cache.match(req))
    .then((hit) => hit || networkPromise)
    .catch(() => new Response("", { status: 504 }));
  return { responsePromise, networkPromise };
}
