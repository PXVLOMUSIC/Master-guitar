// sample-manager.js - Sample loading framework for Strumio
// Manages real guitar samples with progress tracking, quality settings,
// memory + IndexedDB caching, and a fallback chain:
//   real samples -> Karplus-Strong synthesis -> sine wave.

/* ------------------------------------------------------------------ */
/* Configuration                                                      */
/* ------------------------------------------------------------------ */
export const QUALITY_LEVELS = ["low", "medium", "high"];

export const QUALITY_PRESETS = {
  low:    { sampleRate: 22050, bitDepth: 8,  maxPolyphony: 4,  preload: false },
  medium: { sampleRate: 44100, bitDepth: 16, maxPolyphony: 8,  preload: true  },
  high:   { sampleRate: 48000, bitDepth: 24, maxPolyphony: 16, preload: true  }
};

const NOTE_FILE_MAP = {
  guitar:     { "E2": "E2", "A2": "A2", "D3": "D3", "G3": "G3", "B3": "B3", "E4": "E4" },
  ukulele:    { "G4": "G4", "C4": "C4", "E4": "E4u", "A4": "A4" },
  bass:       { "E1": "E1", "A1": "A1", "D2": "D2", "G2": "G2" },
  classical:  { "E2": "E2", "A2": "A2", "D3": "D3", "G3": "G3", "B3": "B3", "E4": "E4" }
};

const COMMON_NOTES = {
  guitar:    ["E2", "A2", "D3", "G3", "B3", "E4"],
  ukulele:   ["G4", "C4", "E4", "A4"],
  bass:      ["E1", "A1", "D2", "G2"],
  classical: ["E2", "A2", "D3", "G3", "B3", "E4"]
};

const DB_NAME = "strumio-samples";
const DB_VERSION = 1;
const STORE_NAME = "samples";

/* ------------------------------------------------------------------ */
/* State                                                              */
/* ------------------------------------------------------------------ */
let quality = (typeof localStorage !== "undefined" && localStorage.getItem("strumio:sampleQuality")) || "medium";
if (!QUALITY_PRESETS[quality]) quality = "medium";

let audioQuality = { ...QUALITY_PRESETS[quality] };

// Memory cache: key -> AudioBuffer
const memoryCache = new Map();

// Progress tracking: instrument -> { loaded, total, status, errors }
const loadProgress = {};

// IndexedDB handle
let dbPromise = null;

/* ------------------------------------------------------------------ */
/* Note helpers                                                       */
/* ------------------------------------------------------------------ */
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function freqToMidi(freq) {
  return 69 + 12 * Math.log2(freq / 440);
}

export function midiToNote(midi) {
  const n = Math.round(midi);
  const name = NOTE_NAMES[((n % 12) + 12) % 12];
  const octave = Math.floor(n / 12) - 1;
  return { name, octave, full: name + octave };
}

export function frequencyToNote(freq) {
  return midiToNote(freqToMidi(freq));
}

function noteKey(instrument, noteName) {
  return `${instrument}:${noteName}`;
}

/* ------------------------------------------------------------------ */
/* Quality                                                            */
/* ------------------------------------------------------------------ */
export function getQuality() {
  return quality;
}

export function setQuality(level) {
  if (!QUALITY_PRESETS[level]) return quality;
  quality = level;
  audioQuality = { ...QUALITY_PRESETS[level] };
  try { if (typeof localStorage !== "undefined") localStorage.setItem("strumio:sampleQuality", level); } catch (e) {}
  return quality;
}

export function getAudioQuality() {
  return { ...audioQuality };
}

export function setAudioQuality(opts = {}) {
  if (opts.sampleRate) audioQuality.sampleRate = opts.sampleRate;
  if (opts.bitDepth) audioQuality.bitDepth = opts.bitDepth;
  if (opts.maxPolyphony) audioQuality.maxPolyphony = opts.maxPolyphony;
  if (opts.preload != null) audioQuality.preload = !!opts.preload;
  return { ...audioQuality };
}

/* ------------------------------------------------------------------ */
/* IndexedDB cache                                                    */
/* ------------------------------------------------------------------ */
function openDB() {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === "undefined") {
    dbPromise = Promise.resolve(null);
    return dbPromise;
  }
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
          store.createIndex("instrument", "instrument", { unique: false });
          store.createIndex("timestamp", "timestamp", { unique: false });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
  return dbPromise;
}

export async function getCachedRaw(key) {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

export async function putCachedRaw(key, instrument, data) {
  const db = await openDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put({ key, instrument, data, quality, timestamp: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

export async function clearCache(instrument = null) {
  const db = await openDB();
  if (!db) { memoryCache.clear(); return true; }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      if (instrument) {
        const idx = store.index("instrument");
        const req = idx.openCursor(IDBKeyRange.only(instrument));
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) { cursor.delete(); cursor.continue(); }
        };
      } else {
        store.clear();
      }
      tx.oncomplete = () => {
        if (!instrument) memoryCache.clear();
        else {
          for (const k of [...memoryCache.keys()]) {
            if (k.startsWith(instrument + ":")) memoryCache.delete(k);
          }
        }
        resolve(true);
      };
      tx.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

/* ------------------------------------------------------------------ */
/* AudioContext helper (lazy)                                         */
/* ------------------------------------------------------------------ */
function getCtx(provided) {
  if (provided) return provided;
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  // Reuse a global if present
  if (!window.__strumioCtx) window.__strumioCtx = new AC();
  return window.__strumioCtx;
}

/* ------------------------------------------------------------------ */
/* Sample loading                                                     */
/* ------------------------------------------------------------------ */
export function getLoadProgress(instrument = null) {
  if (instrument) return loadProgress[instrument] || null;
  return { ...loadProgress };
}

export function getSample(key) {
  return memoryCache.get(key) || null;
}

export async function getSampleAsync(key, instrumentHint = null) {
  const mem = memoryCache.get(key);
  if (mem) return mem;
  const raw = await getCachedRaw(key);
  if (raw && raw.data) {
    const ctx = getCtx();
    if (!ctx) return null;
    try {
      const buf = await ctx.decodeAudioData(raw.data.slice(0));
      memoryCache.set(key, buf);
      return buf;
    } catch (e) {
      return null;
    }
  }
  return null;
}

export async function loadSamples(instrument, notes = null, options = {}) {
  const ctx = getCtx(options.audioContext);
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
  const baseUrl = options.baseUrl || `assets/samples/${instrument}/`;
  const fileMap = options.fileMap || NOTE_FILE_MAP[instrument] || {};

  const noteList = Array.isArray(notes) && notes.length
    ? notes
    : (COMMON_NOTES[instrument] || Object.keys(fileMap));

  if (!loadProgress[instrument]) {
    loadProgress[instrument] = { loaded: 0, total: noteList.length, status: "loading", errors: 0 };
  } else {
    loadProgress[instrument].total = noteList.length;
    loadProgress[instrument].loaded = 0;
    loadProgress[instrument].status = "loading";
    loadProgress[instrument].errors = 0;
  }
  const prog = loadProgress[instrument];

  onProgress({ instrument, loaded: 0, total: noteList.length, status: "loading" });

  const tasks = noteList.map(async (noteName) => {
    const key = noteKey(instrument, noteName);
    // Already in memory?
    if (memoryCache.has(key)) {
      prog.loaded++;
      onProgress({ instrument, loaded: prog.loaded, total: prog.total, status: "loading", note: noteName });
      return key;
    }
    const fileName = (typeof noteName === "string" && fileMap[noteName]) ? fileMap[noteName] : noteName;
    // Try IndexedDB cache first
    try {
      const cached = await getCachedRaw(key);
      if (cached && cached.data) {
        if (ctx) {
          try {
            const buf = await ctx.decodeAudioData(cached.data.slice(0));
            memoryCache.set(key, buf);
            prog.loaded++;
            onProgress({ instrument, loaded: prog.loaded, total: prog.total, status: "loading", note: noteName, source: "cache" });
            return key;
          } catch (e) { /* fall through to fetch */ }
        }
      }
    } catch (e) { /* ignore */ }

    // Fetch from network
    try {
      const url = `${baseUrl}${fileName}.wav`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const arr = await resp.arrayBuffer();
      // Store raw in IndexedDB
      try { await putCachedRaw(key, instrument, arr); } catch (e) {}
      if (ctx) {
        try {
          const buf = await ctx.decodeAudioData(arr.slice(0));
          memoryCache.set(key, buf);
        } catch (e) {
          // decode failed; keep raw? store nothing decodable
        }
      }
      prog.loaded++;
      onProgress({ instrument, loaded: prog.loaded, total: prog.total, status: "loading", note: noteName, source: "network" });
      return key;
    } catch (e) {
      prog.errors++;
      prog.loaded++;
      onProgress({ instrument, loaded: prog.loaded, total: prog.total, status: "loading", note: noteName, error: String(e) });
      return null;
    }
  });

  await Promise.all(tasks);
  prog.status = prog.errors === prog.total ? "failed" : (prog.errors > 0 ? "partial" : "loaded");
  const result = {
    instrument,
    loaded: prog.loaded - prog.errors,
    total: prog.total,
    errors: prog.errors,
    status: prog.status
  };
  onProgress({ instrument, loaded: result.loaded, total: result.total, status: result.status });
  return result;
}

/* ------------------------------------------------------------------ */
/* Fallback synthesis                                                 */
/* ------------------------------------------------------------------ */
export function synthesizeSine(ctx, freq, duration = 1.0, options = {}) {
  if (!ctx) return null;
  const sampleRate = ctx.sampleRate;
  const total = Math.max(1, Math.ceil(duration * sampleRate));
  const buf = ctx.createBuffer(1, total, sampleRate);
  const data = buf.getChannelData(0);
  const decay = (options.decay != null) ? options.decay : 1.2;
  for (let n = 0; n < total; n++) {
    const t = n / sampleRate;
    data[n] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t / decay) * 0.4;
  }
  return buf;
}

export function synthesizeKarplus(ctx, freq, duration = 1.2, options = {}) {
  if (!ctx) return null;
  const sampleRate = ctx.sampleRate;
  const total = Math.max(1, Math.ceil(duration * sampleRate));
  const buf = ctx.createBuffer(1, total, sampleRate);
  const data = buf.getChannelData(0);
  const period = Math.max(2, Math.round(sampleRate / freq));
  const ring = new Float32Array(period);
  for (let i = 0; i < period; i++) ring[i] = (Math.random() * 2 - 1) * 0.6;
  const decay = (options.decay != null) ? options.decay : 0.996;
  let idx = 0;
  for (let n = 0; n < total; n++) {
    const prev = ring[(idx + period - 1) % period];
    const cur = ring[idx];
    const next = (cur + prev) * 0.5 * decay;
    ring[idx] = next;
    data[n] = next;
    idx = (idx + 1) % period;
  }
  // simple lowpass fade
  let lp = 0;
  for (let n = 0; n < total; n++) {
    lp = lp * 0.85 + data[n] * 0.15;
    data[n] = data[n] * 0.7 + lp * 0.3;
  }
  return buf;
}

export function getFallbackBuffer(ctx, freq, duration = 1.0, mode = "auto") {
  if (mode === "sine") return synthesizeSine(ctx, freq, duration);
  if (mode === "karplus") return synthesizeKarplus(ctx, freq, duration);
  // auto: try karplus then sine
  try {
    const ks = synthesizeKarplus(ctx, freq, duration);
    if (ks) return ks;
  } catch (e) {}
  return synthesizeSine(ctx, freq, duration);
}

/* ------------------------------------------------------------------ */
/* Fallback chain resolver                                            */
/* ------------------------------------------------------------------ */
export async function getSampleWithFallback(ctx, freq, instrument = "guitar", duration = 1.0) {
  const note = frequencyToNote(freq);
  const key = noteKey(instrument, `${note.name}${note.octave}`);

  // 1. Real sample (memory)
  let buf = memoryCache.get(key);
  if (buf) return { buffer: buf, source: "sample", key };

  // 1b. Try IndexedDB
  buf = await getSampleAsync(key);
  if (buf) return { buffer: buf, source: "sample", key };

  // 1c. Try loading that single note
  try {
    await loadSamples(instrument, [`${note.name}${note.octave}`], { audioContext: ctx });
    buf = memoryCache.get(key);
    if (buf) return { buffer: buf, source: "sample", key };
  } catch (e) {}

  // 2. Karplus-Strong
  try {
    buf = synthesizeKarplus(ctx, freq, duration);
    if (buf) return { buffer: buf, source: "karplus", key };
  } catch (e) {}

  // 3. Sine wave
  buf = synthesizeSine(ctx, freq, duration);
  return { buffer: buf, source: "sine", key };
}

/* ------------------------------------------------------------------ */
/* Preload common notes on startup                                    */
/* ------------------------------------------------------------------ */
let preloadPromise = null;
export function preloadCommon(options = {}) {
  if (preloadPromise) return preloadPromise;
  const ctx = getCtx(options.audioContext);
  const instruments = options.instruments || Object.keys(COMMON_NOTES);
  preloadPromise = (async () => {
    const results = [];
    for (const ins of instruments) {
      try {
        const r = await loadSamples(ins, COMMON_NOTES[ins], { audioContext: ctx, onProgress: options.onProgress });
        results.push(r);
      } catch (e) {
        results.push({ instrument: ins, error: String(e) });
      }
    }
    // Respect quality preload flag
    if (!audioQuality.preload) {
      // Still keep progress but skip heavy? Already loaded; nothing to undo.
    }
    return results;
  })();
  return preloadPromise;
}

// Auto-preload on module load if quality allows (idle)
try {
  if (typeof window !== "undefined") {
    const start = () => {
      if (audioQuality.preload) {
        preloadCommon().catch(() => {});
      }
    };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(start, { timeout: 3000 });
    } else {
      setTimeout(start, 1500);
    }
  }
} catch (e) {}

/* ------------------------------------------------------------------ */
/* Cache info / stats                                                 */
/* ------------------------------------------------------------------ */
export function getCacheStats() {
  return {
    memoryEntries: memoryCache.size,
    memoryKeys: [...memoryCache.keys()],
    quality,
    audioQuality: { ...audioQuality }
  };
}

export { memoryCache, loadProgress, COMMON_NOTES, NOTE_FILE_MAP };