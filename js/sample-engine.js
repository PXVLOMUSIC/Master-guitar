/* ============================================================
   Strumio — Motor de samples reales (CC0 y CC BY 3.0)
   Batería acústica, bajo eléctrico, guitarra acústica y
   percusión corporal grabados de verdad, con capas de
   intensidad y round-robin.
   ============================================================ */

const BASE = new URL("../assets/audio/", import.meta.url);
const MANIFEST_URL = new URL("manifest.json", BASE).href;

let manifest = null;
let manifestPromise = null;

const buffers = new Map();       // file -> AudioBuffer
const failed = new Set();
const groupState = {
  drums: { ready: false, loading: null, total: 0, loaded: 0 },
  bass: { ready: false, loading: null, total: 0, loaded: 0 },
  guitar: { ready: false, loading: null, total: 0, loaded: 0 },
  perc: { ready: false, loading: null, total: 0, loaded: 0 },
  hand: { ready: false, loading: null, total: 0, loaded: 0 },
  electric: { ready: false, loading: null, total: 0, loaded: 0 },
  nylon: { ready: false, loading: null, total: 0, loaded: 0 },
  piano: { ready: false, loading: null, total: 0, loaded: 0 },
};

const nearestCache = new Map();

function abs(file) {
  const url = new URL(file, BASE).href;
  // En app nativa, intentar convertir la ruta para el WebView de Capacitor.
  try {
    const cap = window.Capacitor;
    if (cap && typeof cap.convertFileSrc === "function" && cap.isNativePlatform && cap.isNativePlatform()) {
      // Si la URL es capacitor:// o http://localhost, devolverla tal cual.
      if (url.startsWith("capacitor://") || url.startsWith("http://localhost")) return url;
    }
  } catch (e) {}
  return url;
}

export function getSamplesManifest() {
  return manifest;
}

export function isGroupReady(group) {
  return !!(groupState[group] && groupState[group].ready);
}

export function getSampleState() {
  return {
    ready: !!(manifest && groupState.drums.ready && groupState.bass.ready),
    groups: Object.fromEntries(
      Object.entries(groupState).map(([k, v]) => [k, { ready: v.ready, loaded: v.loaded, total: v.total }])
    ),
    license: manifest ? manifest.license : null,
    sources: manifest ? manifest.sources : [],
  };
}

export async function loadManifest() {
  if (manifest) return manifest;
  if (manifestPromise) return manifestPromise;
  manifestPromise = (async () => {
    const urls = [MANIFEST_URL];
    // En app nativa, intentar rutas alternativas.
    try {
      if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
        urls.push("assets/audio/manifest.json");
        urls.push("/assets/audio/manifest.json");
      }
    } catch (e) {}
    for (const u of urls) {
      try {
        const r = await fetch(u);
        if (r.ok) {
          const m = await r.json();
          manifest = m;
          return m;
        }
      } catch (e) {
        console.warn("[samples] fetch failed for", u, e);
      }
    }
    throw new Error("No se pudo cargar el manifiesto de audio");
  })().catch((e) => {
    console.warn("[samples]", e);
    manifestPromise = null;
    throw e;
  })
    .then((m) => {
      manifest = m;
      return m;
    })
    .catch((e) => {
      console.warn("[samples]", e);
      manifestPromise = null;
      throw e;
    });
  return manifestPromise;
}

async function loadBuffer(ctx, file) {
  if (buffers.has(file)) return buffers.get(file);
  if (failed.has(file)) return null;
  try {
    const urls = [abs(file)];
    try {
      if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
        urls.push(file);
        urls.push("/assets/audio/" + file);
      }
    } catch (e) {}
    for (const u of urls) {
      try {
        const res = await fetch(u);
        if (!res.ok) continue;
        const arr = await res.arrayBuffer();
        const buf = await ctx.decodeAudioData(arr);
        buffers.set(file, buf);
        return buf;
      } catch (e) {
        console.warn("[samples] fetch failed for", u, e);
      }
    }
    failed.add(file);
    return null;
  } catch (e) {
    failed.add(file);
    return null;
  }
}

function groupFiles(group) {
  if (!manifest) return [];
  const files = [];
  if (group === "drums" || group === "hand") {
    Object.values(manifest[group] || {}).forEach((layers) => layers.forEach((layer) => layer.forEach((f) => files.push(f))));
  } else if (group === "perc") {
    Object.values(manifest.perc || {}).forEach((list) => list.forEach((f) => files.push(f)));
  } else {
    (manifest[group] || []).forEach((entry) => files.push(entry.file));
  }
  return [...new Set(files)];
}

/**
 * Precarga un grupo ("drums" | "bass" | "guitar" | "perc").
 * Devuelve una promesa que resuelve cuando termina (nunca rechaza).
 */
export function preloadGroup(group, ctx, onProgress) {
  if (!groupState[group]) return Promise.resolve(false);
  if (groupState[group].ready) return Promise.resolve(true);
  if (groupState[group].loading) {
    if (onProgress) groupState[group].onProgress = onProgress;
    return groupState[group].loading;
  }

  const state = groupState[group];
  state.onProgress = onProgress;
  state.loading = loadManifest()
    .then(async () => {
      const files = groupFiles(group);
      state.total = files.length;
      state.loaded = 0;
      if (!files.length) {
        state.ready = true;
        return true;
      }
      const queue = files.slice();
      const workers = new Array(Math.min(6, queue.length)).fill(0).map(async () => {
        while (queue.length) {
          const file = queue.shift();
          await loadBuffer(ctx, file);
          state.loaded++;
          if (state.onProgress) {
            try { state.onProgress(state.loaded, state.total); } catch (e) {}
          }
        }
      });
      await Promise.all(workers);
      state.ready = true;
      return true;
    })
    .catch(() => false)
    .finally(() => { state.loading = null; });

  return state.loading;
}

/**
 * Precarga solo algunos sonidos de un grupo por capas (p. ej. el click del
 * metrónomo), sin bajar el grupo entero. Nunca rechaza.
 */
export async function preloadIds(group, ids, ctx) {
  try {
    await loadManifest();
    const files = [];
    ids.forEach((id) => ((manifest[group] || {})[id] || []).forEach((layer) => layer.forEach((f) => files.push(f))));
    await Promise.all(files.map((f) => loadBuffer(ctx, f)));
    return files.every((f) => buffers.has(f));
  } catch (e) {
    return false;
  }
}

/** Precarga todo lo necesario para las backing tracks. */
export function preloadAll(ctx, onProgress) {
  return Promise.all([
    preloadGroup("drums", ctx, onProgress),
    preloadGroup("bass", ctx, onProgress),
    preloadGroup("guitar", ctx, onProgress),
    preloadGroup("perc", ctx, onProgress),
    preloadGroup("hand", ctx, onProgress),
  ]);
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function bufferFor(file) {
  return buffers.get(file) || null;
}

const DRUM_VEL_GAIN = 0.9;

/**
 * Reproduce un sonido real por capas de intensidad ("drums" o "hand").
 * No exige el grupo entero: basta con que estén cargadas sus muestras.
 * @returns {boolean} true si se ha programado (false => usar síntesis)
 */
export function playLayered(group, id, when, destination, opts = {}) {
  if (!manifest) return false;
  const layers = manifest[group] && manifest[group][id];
  if (!layers || !layers.length) return false;
  const velocity = Math.max(0, Math.min(1, opts.velocity != null ? opts.velocity : 0.9));
  let idx = Math.floor(velocity * layers.length);
  if (idx >= layers.length) idx = layers.length - 1;
  let buf = null;
  // intenta la capa elegida y cae a otras si faltara
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[(idx - i + layers.length) % layers.length];
    buf = bufferFor(pick(layer)) || layer.map(bufferFor).find(Boolean) || null;
    if (buf) break;
  }
  if (!buf) return false;

  const ctx = destination.context;
  const gain = ctx.createGain();
  const level = (opts.gain != null ? opts.gain : 1) * DRUM_VEL_GAIN;
  gain.gain.value = level;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  if (instrument === "electric") {
    try {
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 220;
      hp.Q.value = 0.7;
      src.connect(gain).connect(hp).connect(destination);
    } catch (e) {
      src.connect(gain).connect(destination);
    }
  } else {
    src.connect(gain).connect(destination);
  }
  try { src.start(when); } catch (e) { return false; }
  src.onended = () => { try { src.disconnect(); gain.disconnect(); } catch (e) {} };
  return true;
}

/** Golpe de batería real. */
export function playDrum(id, when, destination, opts = {}) {
  if (!groupState.drums.ready) return false;
  return playLayered("drums", id, when, destination, opts);
}

/** Percusión de mano real (cajón, shaker, pandereta, congas, bongos…). */
export function playHand(id, when, destination, opts = {}) {
  return playLayered("hand", id, when, destination, opts);
}

/** Percusión corporal (palmas, chasquidos, pisadas). */
export function playPerc(id, when, destination, opts = {}) {
  if (!manifest || !groupState.perc.ready) return false;
  const list = manifest.perc && manifest.perc[id];
  if (!list || !list.length) return false;
  const buf = bufferFor(pick(list));
  if (!buf) return false;
  const ctx = destination.context;
  const gain = ctx.createGain();
  gain.gain.value = (opts.gain != null ? opts.gain : 0.7);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  if (instrument === "electric") {
    try {
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 220;
      hp.Q.value = 0.7;
      src.connect(gain).connect(hp).connect(destination);
    } catch (e) {
      src.connect(gain).connect(destination);
    }
  } else {
    src.connect(gain).connect(destination);
  }
  try { src.start(when); } catch (e) { return false; }
  src.onended = () => { try { src.disconnect(); gain.disconnect(); } catch (e) {} };
  return true;
}

function nearestEntry(instrument, midi) {
  const key = instrument + ":" + midi;
  if (nearestCache.has(key)) return nearestCache.get(key);
  const list = (manifest && manifest[instrument]) || [];
  if (!list.length) return null;
  let best = list[0];
  let bestDist = Infinity;
  for (const e of list) {
    const d = Math.abs(e.midi - midi);
    if (d < bestDist) { bestDist = d; best = e; }
  }
  const rr = list.filter((e) => e.note === best.note && e.midi === best.midi);
  const result = { entry: best, options: rr, distance: bestDist };
  nearestCache.set(key, result);
  return result;
}

/**
 * Reproduce una nota real de guitarra/bajo con pitch-shift mínimo.
 * @returns {boolean}
 */
export function playPitched(instrument, midi, when, destination, opts = {}) {
  if (!manifest || !groupState[instrument] || !groupState[instrument].ready) return false;
  const near = nearestEntry(instrument, midi);
  if (!near) return false;
  const entry = pick(near.options && near.options.length ? near.options : [near.entry]);
  const buf = bufferFor(entry.file);
  if (!buf) return false;

  const ctx = destination.context;
  const rate = Math.pow(2, (midi - entry.midi) / 12);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const gain = ctx.createGain();
  const base = opts.gain != null ? opts.gain : 0.55;
  const vel = opts.velocity != null ? opts.velocity : 0.75;
  const comp = Math.pow(1 / rate, 0.35);
  gain.gain.value = base * (0.45 + vel * 0.55) * comp;
  if (instrument === "electric") {
    try {
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 220;
      hp.Q.value = 0.7;
      src.connect(gain).connect(hp).connect(destination);
    } catch (e) {
      src.connect(gain).connect(destination);
    }
  } else {
    src.connect(gain).connect(destination);
  }
  try { src.start(when); } catch (e) { return false; }
  const dur = opts.duration;
  if (dur && dur > 0.05) {
    const stopAt = when + dur;
    try { src.stop(stopAt); } catch (e) {}
    // pequeña cola para que no corte en seco
    try { gain.gain.setValueAtTime(gain.gain.value, Math.max(when, stopAt - 0.08)); gain.gain.linearRampToValueAtTime(0.0001, stopAt); } catch (e) {}
  }
  src.onended = () => { try { src.disconnect(); gain.disconnect(); } catch (e) {} };
  return true;
}
