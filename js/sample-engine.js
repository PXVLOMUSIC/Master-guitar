/* ============================================================
   Strumio â€” Motor de samples reales (CC0)
   BaterÃ­a acÃºstica, bajo elÃ©ctrico, guitarra acÃºstica y
   percusiÃ³n corporal grabados de verdad, con capas de
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
};

const nearestCache = new Map();

function abs(file) {
  return new URL(file, BASE).href;
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
  manifestPromise = fetch(MANIFEST_URL)
    .then((r) => {
      if (!r.ok) throw new Error("No se pudo cargar el manifiesto de audio");
      return r.json();
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
    const res = await fetch(abs(file));
    if (!res.ok) throw new Error("HTTP " + res.status);
    const arr = await res.arrayBuffer();
    const buf = await ctx.decodeAudioData(arr);
    buffers.set(file, buf);
    return buf;
  } catch (e) {
    failed.add(file);
    return null;
  }
}

function groupFiles(group) {
  if (!manifest) return [];
  const files = [];
  if (group === "drums") {
    Object.values(manifest.drums || {}).forEach((layers) => layers.forEach((layer) => layer.forEach((f) => files.push(f))));
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

/** Precarga todo lo necesario para las backing tracks. */
export function preloadAll(ctx, onProgress) {
  return Promise.all([
    preloadGroup("drums", ctx, onProgress),
    preloadGroup("bass", ctx, onProgress),
    preloadGroup("guitar", ctx, onProgress),
    preloadGroup("perc", ctx, onProgress),
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
 * Reproduce un golpe de baterÃ­a real.
 * @returns {boolean} true si se ha programado (false => usar sÃ­ntesis)
 */
export function playDrum(id, when, destination, opts = {}) {
  if (!manifest || !groupState.drums.ready) return false;
  const layers = manifest.drums && manifest.drums[id];
  if (!layers || !layers.length) return false;
  const velocity = Math.max(0, Math.min(1, opts.velocity != null ? opts.velocity : 0.9));
  let idx = Math.floor(velocity * layers.length);
  if (idx >= layers.length) idx = layers.length - 1;
  let buf = null;
  // intenta la capa elegida y cae a otras si faltara
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[(idx - i + layers.length) % layers.length];
    buf = bufferFor(pick(layer));
    if (buf) break;
  }
  if (!buf) return false;

  const ctx = destination.context;
  const gain = ctx.createGain();
  const level = (opts.gain != null ? opts.gain : 1) * DRUM_VEL_GAIN;
  gain.gain.value = level;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(gain).connect(destination);
  try { src.start(when); } catch (e) { return false; }
  src.onended = () => { try { src.disconnect(); gain.disconnect(); } catch (e) {} };
  return true;
}

/** PercusiÃ³n corporal (palmas, chasquidos, pisadas). */
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
  src.connect(gain).connect(destination);
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
 * Reproduce una nota real de guitarra/bajo con pitch-shift mÃ­nimo.
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
  src.connect(gain).connect(destination);
  try { src.start(when); } catch (e) { return false; }
  const dur = opts.duration;
  if (dur && dur > 0.05) {
    const stopAt = when + dur;
    try { src.stop(stopAt); } catch (e) {}
    // pequeÃ±a cola para que no corte en seco
    try { gain.gain.setValueAtTime(gain.gain.value, Math.max(when, stopAt - 0.08)); gain.gain.linearRampToValueAtTime(0.0001, stopAt); } catch (e) {}
  }
  src.onended = () => { try { src.disconnect(); gain.disconnect(); } catch (e) {} };
  return true;
}
