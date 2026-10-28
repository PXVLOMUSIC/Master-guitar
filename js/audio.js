// audio.js - upgraded audio engine for Strumio
// Provides mic capture + YIN pitch detection, chord detection, tone/chord playback,
// a Web-Audio lookahead metronome, note helpers, and recording helpers.
// Las notas de guitarra y bajo suenan con muestras reales (CC0 y CC BY 3.0, sample-engine.js);
// mientras cargan, o para ukelele, se usa síntesis Karplus-Strong.

import { midiToNote, midiToFreq, NOTE_NAMES } from "./instruments.js";
import { preloadGroup, preloadIds, isGroupReady, playPitched, playHand } from "./sample-engine.js";

/* ------------------------------------------------------------------ */
/* Shared state                                                       */
/* ------------------------------------------------------------------ */
let audioCtx = null;
let analyser = null;
let mediaStream = null;
let source = null;
let running = false;
let onPitch = null;
let raf = null;
let lastPitchMs = 0;

// Web Worker for off-main-thread pitch detection (lazy, optional).
let pitchWorker = null;
let pitchWorkerSeq = 0;
let pitchWorkerPending = null; // { id, callback }
function ensurePitchWorker() {
  if (pitchWorker) return pitchWorker;
  if (typeof Worker === "undefined") return null;
  try {
    pitchWorker = new Worker("./js/pitch-worker.js");
    pitchWorker.onmessage = (e) => {
      const data = (e && e.data) || {};
      if (data.type !== "pitch") return;
      const pending = pitchWorkerPending;
      if (pending && pending.id === data.id) {
        pitchWorkerPending = null;
        const cb = pending.callback;
        if (typeof cb === "function") {
          try { cb(data.pitch || null); } catch (err) { console.warn("pitch callback error", err); }
        }
      }
    };
    pitchWorker.onerror = (err) => {
      console.warn("pitch worker error, falling back to main thread", err);
      try { pitchWorker.terminate(); } catch (e) {}
      pitchWorker = null;
      if (pitchWorkerPending) {
        const pending = pitchWorkerPending;
        pitchWorkerPending = null;
        // Fallback synchronous detection is not possible here (buffer gone);
        // just notify no pitch.
        if (typeof pending.callback === "function") {
          try { pending.callback(null); } catch (e) {}
        }
      }
    };
  } catch (e) {
    pitchWorker = null;
  }
  return pitchWorker;
}

// Metronome state
let metroRunning = false;
let metroTimer = null;
let metroNextNoteTime = 0;
let metroBeat = 0;
let metroBpm = 120;
let metroBeatsPerBar = 4;
let metroOnBeat = null;

// Recording state
let mediaRecorder = null;
let recordedChunks = [];
let recordingStream = null;

// Sound bank state ('synth' = Karplus-Strong, 'samples' = recorded samples)
let soundBank = "synth";
let sampleBankBuffer = null;
let sampleBaseFreq = 440;
// Individual note samples: "instrument:noteName" -> AudioBuffer
let noteSamples = {};
let noteSamplesLoaded = {};
const NOTE_FILE_MAP = {
  guitar: { "E2": "E2", "A2": "A2", "D3": "D3", "G3": "G3", "B3": "B3", "E4": "E4" },
  ukulele: { "G4": "G4", "C4": "C4", "E4": "E4u", "A4": "A4" },
  bass: { "E1": "E1", "A1": "A1", "D2": "D2", "G2": "G2" },
  classical: { "E2": "E2", "A2": "A2", "D3": "D3", "G3": "G3", "B3": "B3", "E4": "E4" }
};

/* ------------------------------------------------------------------ */
/* AudioContext helpers                                               */
/* ------------------------------------------------------------------ */
export function getAudioContext() {
  // Use pre-created context from user gesture if available
  if (window.__audioCtx && window.__audioCtx.state !== "closed") {
    audioCtx = window.__audioCtx;
    return audioCtx;
  }
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

export async function resumeContext(ctx) {
  if (ctx && ctx.state === "suspended") {
    try { await ctx.resume(); } catch (e) { /* needs user gesture */ }
  }
}

/* ------------------------------------------------------------------ */
/* Mic capture                                                        */
/* ------------------------------------------------------------------ */
export async function startMic(callback) {
  if (running) { onPitch = callback; return true; }
  // Create AudioContext synchronously (before any await) to preserve user gesture
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (window.__audioCtx && window.__audioCtx.state !== "closed") {
    audioCtx = window.__audioCtx;
  }
  // Resume synchronously
  if (audioCtx.state === 'suspended') {
    try { await audioCtx.resume(); } catch (e) { console.warn('resume failed:', e); }
  }
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
  } catch (e) {
    console.warn("mic error with constraints, trying basic:", e);
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e2) {
      console.error("mic error (basic):", e2);
      return false;
    }
  }
  const ctx = audioCtx;
  // Resume again after getUserMedia (in case it got suspended)
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch (e) { console.warn('resume after getUserMedia failed:', e); }
  }
  analyser = ctx.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.0;

  source = ctx.createMediaStreamSource(stream);
  source.connect(analyser);

  mediaStream = stream;
  running = true;
  onPitch = callback;
  lastPitchMs = 0;
  loop();
  return true;
}

export function stopMic() {
  running = false;
  pitchWorkerPending = null;
  if (raf) { cancelAnimationFrame(raf); raf = null; }
  if (mediaStream) {
    try { mediaStream.getTracks().forEach(t => t.stop()); } catch (e) {}
  }
  mediaStream = null;
  try { if (source) source.disconnect(); } catch (e) {}
  try { if (analyser) analyser.disconnect(); } catch (e) {}
  source = null;
  analyser = null;
  onPitch = null;
  // Keep the AudioContext alive (suspended is fine) so playback/metronome still work.
}

export function isRunning() { return running; }

function loop() {
  if (!running) return;
  const now = performance.now();
  // Throttle pitch detection + callbacks to ~30 fps to reduce CPU.
  if (now - lastPitchMs >= 33) {
    lastPitchMs = now;
    if (analyser && audioCtx) {
      const buf = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(buf);
      const w = ensurePitchWorker();
      if (w && !pitchWorkerPending) {
        const id = ++pitchWorkerSeq;
        pitchWorkerPending = { id, callback: onPitch, ts: performance.now() };
        try {
          w.postMessage({ type: "detect", id, buffer: buf, sampleRate: audioCtx.sampleRate }, [buf.buffer]);
        } catch (e) {
          // Transfer failed -> fall back to main thread.
          pitchWorkerPending = null;
          const pitch = detectPitch(buf, audioCtx.sampleRate);
          if (onPitch) onPitch(pitch);
        }
      } else if (pitchWorkerPending && (performance.now() - pitchWorkerPending.ts > 500)) {
        console.warn('Pitch worker timeout, falling back to main thread');
        try { if (w) w.terminate(); } catch (e) {}
        pitchWorker = null;
        const pending = pitchWorkerPending;
        pitchWorkerPending = null;
        const pitch = detectPitch(buf, audioCtx.sampleRate);
        if (onPitch) onPitch(pitch);
      } else if (!w) {
        const pitch = detectPitch(buf, audioCtx.sampleRate);
        if (onPitch) onPitch(pitch);
      }
      // If a worker request is already pending, skip this frame (worker busy).
    }
  }
  raf = requestAnimationFrame(loop);
}

/* ------------------------------------------------------------------ */
/* Pitch detection: YIN (primary) + autocorrelation (fallback)        */
/* ------------------------------------------------------------------ */
function rms(buffer) {
  let s = 0;
  for (let i = 0; i < buffer.length; i++) s += buffer[i] * buffer[i];
  return Math.sqrt(s / buffer.length);
}

export function yinPitch(buffer, sampleRate, threshold = 0.12) {
  const SIZE = buffer.length;
  const half = Math.floor(SIZE / 2);
  // DC removal
  let mean = 0;
  for (let i = 0; i < SIZE; i++) mean += buffer[i];
  mean /= SIZE;
  // Hann window
  const w = new Float64Array(SIZE);
  for (let i = 0; i < SIZE; i++) w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (SIZE - 1)));
  const buf = new Float64Array(SIZE);
  for (let i = 0; i < SIZE; i++) buf[i] = (buffer[i] - mean) * w[i];
  if (rms(buf) < 0.002) return null;

  // 1. Difference function
  const d = new Float64Array(half);
  for (let tau = 0; tau < half; tau++) {
    let sum = 0;
    for (let i = 0; i < half; i++) {
      const delta = buf[i] - buf[i + tau];
      sum += delta * delta;
    }
    d[tau] = sum;
  }

  // 2. Cumulative mean normalized difference (CMND)
  const cmnd = new Float64Array(half);
  cmnd[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < half; tau++) {
    runningSum += d[tau];
    cmnd[tau] = runningSum > 0 ? (d[tau] * tau) / runningSum : 1;
  }

  // 3. Absolute threshold: first tau whose CMND dips below threshold
  let tauEstimate = -1;
  for (let tau = 2; tau < half; tau++) {
    if (cmnd[tau] < threshold) {
      while (tau + 1 < half && cmnd[tau + 1] < cmnd[tau]) tau++;
      tauEstimate = tau;
      break;
    }
  }

  // If no dip below threshold, take the global minimum (if confident enough)
  if (tauEstimate === -1) {
    let minVal = Infinity, minTau = -1;
    for (let tau = 2; tau < half; tau++) {
      if (cmnd[tau] < minVal) { minVal = cmnd[tau]; minTau = tau; }
    }
    if (minTau === -1 || minVal > 0.35) return null;
    tauEstimate = minTau;
  }

  // 4. Parabolic interpolation around the estimate
  const t = tauEstimate;
  const x0 = t > 1 ? cmnd[t - 1] : cmnd[t];
  const x1 = cmnd[t];
  const x2 = t + 1 < half ? cmnd[t + 1] : cmnd[t];
  const denom = 2 * (x0 - 2 * x1 + x2);
  const p = denom !== 0 ? (x0 - x2) / denom : 0;
  const refinedTau = t + p;

  const freq = sampleRate / refinedTau;
  if (!isFinite(freq) || freq < 50 || freq > 1300) return null;

  const confidence = Math.max(0, Math.min(1, 1 - cmnd[t]));
  const midi = 69 + 12 * Math.log2(freq / 440);
  const note = midiToNote(midi);
  return { freq, midi, note, confidence };
}

export function autocorrPitch(buffer, sampleRate) {
  const SIZE = buffer.length;
  let mean = 0;
  for (let i = 0; i < SIZE; i++) mean += buffer[i];
  mean /= SIZE;
  const w = new Float64Array(SIZE);
  for (let i = 0; i < SIZE; i++) w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (SIZE - 1)));
  const buf = new Float64Array(SIZE);
  for (let i = 0; i < SIZE; i++) buf[i] = (buffer[i] - mean) * w[i];
  let rmsVal = 0;
  for (let i = 0; i < SIZE; i++) rmsVal += buf[i] * buf[i];
  rmsVal = Math.sqrt(rmsVal / SIZE);
  if (rmsVal < 0.002) return null;

  let bestLag = -1;
  let bestCorr = 0;
  const minLag = Math.floor(sampleRate / 1000); // ~1000 Hz max
  const maxLag = Math.floor(sampleRate / 60);   // ~60 Hz min

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0, n1 = 0, n2 = 0;
    for (let i = 0; i < SIZE - lag; i++) {
      corr += buf[i] * buf[i + lag];
      n1 += buf[i] * buf[i];
      n2 += buf[i + lag] * buf[i + lag];
    }
    const denom = Math.sqrt(n1 * n2);
    const r = denom > 0 ? corr / denom : 0;
    if (r > bestCorr) { bestCorr = r; bestLag = lag; }
  }
  if (bestLag === -1 || bestCorr < 0.55) return null;

  const lags = [bestLag - 1, bestLag, bestLag + 1];
  const corrs = lags.map(lag => {
    let corr = 0, n1 = 0, n2 = 0;
    for (let i = 0; i < SIZE - lag; i++) {
      corr += buf[i] * buf[i + lag];
      n1 += buf[i] * buf[i];
      n2 += buf[i + lag] * buf[i + lag];
    }
    const d = Math.sqrt(n1 * n2);
    return d > 0 ? corr / d : 0;
  });
  const alpha = corrs[0], beta = corrs[1], gamma = corrs[2];
  const denom = alpha - 2 * beta + gamma;
  const p = denom !== 0 ? 0.5 * (alpha - gamma) / denom : 0;
  const refinedLag = bestLag + (isFinite(p) ? p : 0);
  const freq = sampleRate / refinedLag;
  if (freq < 60 || freq > 1200) return null;

  const midi = 69 + 12 * Math.log2(freq / 440);
  const note = midiToNote(midi);
  return { freq, midi, note, confidence: bestCorr };
}

export function detectPitch(buffer, sampleRate) {
  // Primary: YIN
  const y = yinPitch(buffer, sampleRate);
  if (y) return y;
  // Fallback: autocorrelation
  return autocorrPitch(buffer, sampleRate);
}

/* ------------------------------------------------------------------ */
/* Note helpers                                                       */
/* ------------------------------------------------------------------ */
export function frequencyToNote(freq) {
  if (!freq || freq <= 0) return null;
  const midi = 69 + 12 * Math.log2(freq / 440);
  const note = midiToNote(midi);
  return { ...note, midi, freq, cents: (midi - Math.round(midi)) * 100 };
}

export function noteToFrequency(note) {
  if (typeof note === "number") return midiToFreq(note);
  const s = String(note).trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return midiToFreq(parseFloat(s));

  const m = s.match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  if (!m) return NaN;

  let name = m[1].toUpperCase() + m[2];
  const flatMap = { Cb: "B", Db: "C#", Eb: "D#", Fb: "E", Gb: "F#", Ab: "G#", Bb: "A#" };
  if (m[2] === "b" && flatMap[name]) name = flatMap[name];

  const pc = NOTE_NAMES.indexOf(name);
  if (pc < 0) return NaN;
  const oct = parseInt(m[3], 10);
  const midi = pc + (oct + 1) * 12;
  return midiToFreq(midi);
}

export function centsBetween(freq1, freq2) {
  if (!freq1 || !freq2 || freq1 <= 0 || freq2 <= 0) return 0;
  return 1200 * Math.log2(freq1 / freq2);
}

/* ------------------------------------------------------------------ */
/* Karplus-Strong plucked-string synthesis                            */
/* ------------------------------------------------------------------ */
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Instrument timbre profiles. Distinct timbres per instrument.
const INSTRUMENT_PROFILES = {
  guitar: {
    feedback: 0.993, brightness: 0.55, smoothBase: 0.55, stiffness: 0.0015,
    bodyPeaks: [{ f: 100, Q: 1.2, gain: 5 }, { f: 200, Q: 1.5, gain: 4 }, { f: 400, Q: 2.0, gain: 3 }, { f: 800, Q: 2.5, gain: 2 }],
    decayFast: 0.03, decaySlow: 0.9, fretNoise: 0.003, hammer: 0.4
  },
  classical: {
    feedback: 0.995, brightness: 0.32, smoothBase: 0.72, stiffness: 0.0008,
    bodyPeaks: [{ f: 85, Q: 1.0, gain: 6 }, { f: 175, Q: 1.2, gain: 5 }, { f: 360, Q: 1.8, gain: 3 }, { f: 720, Q: 2.0, gain: 2 }],
    decayFast: 0.04, decaySlow: 1.1, fretNoise: 0.001, hammer: 0.25
  },
  ukulele: {
    feedback: 0.990, brightness: 0.72, smoothBase: 0.40, stiffness: 0.0022,
    bodyPeaks: [{ f: 220, Q: 1.6, gain: 5 }, { f: 440, Q: 2.0, gain: 4 }, { f: 880, Q: 2.5, gain: 3 }, { f: 1760, Q: 3.0, gain: 1.5 }],
    decayFast: 0.02, decaySlow: 0.6, fretNoise: 0.004, hammer: 0.5
  },
  bass: {
    feedback: 0.996, brightness: 0.25, smoothBase: 0.78, stiffness: 0.0005,
    bodyPeaks: [{ f: 55, Q: 0.9, gain: 6 }, { f: 110, Q: 1.1, gain: 5 }, { f: 220, Q: 1.4, gain: 3 }, { f: 440, Q: 2.0, gain: 2 }],
    decayFast: 0.05, decaySlow: 1.4, fretNoise: 0.002, hammer: 0.3
  },
  electric: {
    feedback: 0.992, brightness: 0.80, smoothBase: 0.30, stiffness: 0.0030,
    bodyPeaks: [{ f: 120, Q: 3.0, gain: 2 }, { f: 240, Q: 3.0, gain: 2 }, { f: 500, Q: 4.0, gain: 1.5 }, { f: 1000, Q: 5.0, gain: 1 }],
    decayFast: 0.015, decaySlow: 0.4, fretNoise: 0.005, hammer: 0.7
  }
};

// Backwards-compat alias (old shape-ish) for any external references.
const INSTRUMENT_PARAMS = INSTRUMENT_PROFILES;

// Buffer cache keyed by (freq, duration, instrument, pickPosition, ...).
const bufferCache = new Map();
function cacheKey(freq, duration, instrument, pickPosition, brightness, bodyGain) {
  return `${Number(freq).toFixed(4)}|${duration}|${instrument}|pp${Number(pickPosition).toFixed(2)}|br${brightness}|bg${bodyGain}`;
}

// Common notes to pre-generate (lazy, on first use).
const COMMON_FREQS = [
  82.41, 87.31, 92.50, 98.00, 103.83, 110.00, 116.54, 123.47, 130.81, 138.59, 146.83, 155.56,
  164.81, 174.61, 185.00, 196.00, 207.65, 220.00, 233.08, 246.94, 261.63, 277.18, 293.66, 311.13,
  329.63, 349.23, 369.99, 392.00, 415.30, 440.00, 466.16, 493.88, 523.25, 587.33, 659.25, 698.46,
  783.99, 880.00, 987.77, 1046.50
];
const prewarmed = new Set();

function prewarmCommonNotes(instrument) {
  if (prewarmed.has(instrument)) return;
  prewarmed.add(instrument);
  setTimeout(() => {
    try {
      for (const f of COMMON_FREQS) {
        generatePluckedString(f, 2.0, { instrument });
      }
    } catch (e) { /* ignore */ }
  }, 0);
}

// Biquad peaking filter coefficients.
function peakingCoeffs(freq, Q, gainDb, sampleRate) {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * freq) / sampleRate;
  const cosw = Math.cos(w0);
  const sinw = Math.sin(w0);
  const alpha = sinw / (2 * Q);
  const b0 = 1 + alpha * A;
  const b1 = -2 * cosw;
  const b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A;
  const a1 = -2 * cosw;
  const a2 = 1 - alpha / A;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function applyBiquad(input, coeffs) {
  const out = new Float32Array(input.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let n = 0; n < input.length; n++) {
    const x = input[n];
    const y = coeffs.b0 * x + coeffs.b1 * x1 + coeffs.b2 * x2 - coeffs.a1 * y1 - coeffs.a2 * y2;
    out[n] = y;
    x2 = x1; x1 = x;
    y2 = y1; y1 = y;
  }
  return out;
}

/**
 * Generate a plucked-string AudioBuffer using the Karplus-Strong algorithm.
 * @param {number} freq - fundamental frequency in Hz
 * @param {number} duration - duration in seconds
 * @param {object} options - { instrument, gain, bodyGain, brightness, pickPosition }
 * @returns {AudioBuffer}
 */
export function generatePluckedString(freq, duration, options) {
  const opts = options || {};
  if (!isFinite(freq) || freq <= 0) return null;
  const instrument = opts.instrument || "guitar";
  const dur = (duration != null) ? duration : 1.2;
  const pickPosition = clamp(opts.pickPosition != null ? opts.pickPosition : 0.3, 0, 1);

  // Cache lookup.
  const brightnessOpt = (opts.brightness != null) ? opts.brightness : null;
  const bodyGainOpt = (opts.bodyGain != null) ? opts.bodyGain : null;
  const key = cacheKey(freq, dur, instrument, pickPosition, brightnessOpt, bodyGainOpt);
  const cached = bufferCache.get(key);
  if (cached) return cached;

  const ctx = getAudioContext();
  const sampleRate = ctx.sampleRate;
  const profile = INSTRUMENT_PROFILES[instrument] || INSTRUMENT_PROFILES.guitar;

  const brightness = (opts.brightness != null) ? opts.brightness : profile.brightness;
  const bodyScale = (opts.bodyGain != null) ? opts.bodyGain : 1;

  // Feedback (decay length).
  const feedback = profile.feedback + (brightness - 0.5) * 0.004;

  const totalSamples = Math.max(1, Math.ceil(dur * sampleRate));

  // 1. Inharmonicity (string stiffness): higher notes slightly sharper.
  const stiffFreq = freq * (1 + profile.stiffness * Math.pow(freq / 1000, 2));
  const N = Math.max(2, Math.round(sampleRate / stiffFreq));

  // 2. Excitation noise.
  const noise = new Float32Array(N);
  for (let i = 0; i < N; i++) noise[i] = (Math.random() * 2 - 1);

  // 3. Pick position filtering: bridge brighter, neck warmer.
  const filteredNoise = new Float32Array(N);
  const alpha = 0.15 + pickPosition * 0.65; // smoothing
  let y = 0;
  for (let i = 0; i < N; i++) {
    y = y + (1 - alpha) * (noise[i] - y);
    filteredNoise[i] = y;
  }
  // Comb effect from pluck point.
  if (pickPosition > 0.05) {
    const d = Math.max(1, Math.round(N * pickPosition));
    const comb = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const prev = (i - d >= 0) ? filteredNoise[i - d] : 0;
      comb[i] = filteredNoise[i] - 0.45 * prev;
    }
    for (let i = 0; i < N; i++) filteredNoise[i] = comb[i];
  }

  // 4. Karplus-Strong iteration.
  const delay = new Float32Array(N);
  for (let i = 0; i < N; i++) delay[i] = filteredNoise[i];

  const raw = new Float32Array(totalSamples);
  let pos = 0;
  for (let n = 0; n < totalSamples; n++) {
    const cur = delay[pos];
    raw[n] = cur;
    const avg = (cur + delay[(pos + 1) % N]) * 0.5;
    delay[pos] = avg * feedback;
    pos = (pos + 1) % N;
  }

  // 5. Brightness lowpass.
  const smooth = clamp(profile.smoothBase + (1 - brightness) * 0.25 - brightness * 0.1, 0.05, 0.85);
  const lp = new Float32Array(totalSamples);
  let ylp = 0;
  for (let n = 0; n < totalSamples; n++) {
    ylp = ylp + (1 - smooth) * (raw[n] - ylp);
    lp[n] = ylp;
  }

  // 6. Hammer-on transient: brief high-frequency burst at start.
  const hammerSamples = Math.min(totalSamples, Math.ceil(0.012 * sampleRate));
  for (let n = 0; n < hammerSamples; n++) {
    const t = n / sampleRate;
    const burst = (Math.random() * 2 - 1) * Math.exp(-t / 0.003) * profile.hammer;
    lp[n] += burst;
  }

  // 7. Multiple body resonances.
  const bodySignal = new Float32Array(totalSamples);
  for (const peak of profile.bodyPeaks) {
    const gainDb = peak.gain * bodyScale;
    const coeffs = peakingCoeffs(peak.f, peak.Q, gainDb, sampleRate);
    const filtered = applyBiquad(lp, coeffs);
    const w = 0.22;
    for (let n = 0; n < totalSamples; n++) bodySignal[n] += filtered[n] * w;
  }

  // 8. Mix string + body.
  const final = new Float32Array(totalSamples);
  for (let n = 0; n < totalSamples; n++) {
    final[n] = lp[n] * 0.6 + bodySignal[n] * 0.5;
  }

  // 9. Fret noise: subtle buzz.
  for (let n = 0; n < totalSamples; n++) {
    const t = n / sampleRate;
    const buzz = (Math.random() * 2 - 1) * profile.fretNoise * Math.exp(-t / 0.05);
    final[n] += buzz;
  }

  // 10. Multi-stage decay envelope.
  for (let n = 0; n < totalSamples; n++) {
    const t = n / sampleRate;
    let env;
    if (t < 0.05) {
      env = Math.exp(-t / profile.decayFast);
    } else {
      env = Math.exp(-0.05 / profile.decayFast) * Math.exp(-(t - 0.05) / profile.decaySlow);
    }
    const attack = Math.min(1, t / 0.002 + 0.0001);
    final[n] *= attack * env;
  }

  // 11. Volume normalization.
  let peak = 0;
  for (let n = 0; n < totalSamples; n++) {
    const a = Math.abs(final[n]);
    if (a > peak) peak = a;
  }
  const scale = peak > 0 ? 0.8 / peak : 1;
  for (let n = 0; n < totalSamples; n++) final[n] *= scale;

  // Write to AudioBuffer.
  const buffer = ctx.createBuffer(1, totalSamples, sampleRate);
  buffer.copyToChannel(final, 0);

  bufferCache.set(key, buffer);
  return buffer;
}

/* ------------------------------------------------------------------ */
/* Sound bank abstraction                                             */
/* ------------------------------------------------------------------ */
export function setSoundBank(bank) {
  if (bank === "synth" || bank === "samples") soundBank = bank;
  return soundBank;
}

export function getSoundBank() { return soundBank; }

export async function loadSampleBank(url) {
  const ctx = getAudioContext();
  await resumeContext(ctx);
  const res = await fetch(url);
  const ab = await res.arrayBuffer();
  const decoded = await ctx.decodeAudioData(ab);
  sampleBankBuffer = decoded;
  soundBank = "samples";
  return decoded;
}

/* ------------------------------------------------------------------ */
/* Sample loading (real recorded notes)                               */
/* ------------------------------------------------------------------ */
export async function loadInstrumentSamples(instrument) {
  if (noteSamplesLoaded[instrument]) return true;
  const ctx = getAudioContext();
  await resumeContext(ctx);
  const notes = NOTE_FILE_MAP[instrument] || {};
  const promises = Object.entries(notes).map(async ([noteName, fileName]) => {
    try {
      const resp = await fetch(`assets/samples/${instrument}/${fileName}.wav`);
      if (!resp.ok) return;
      const arr = await resp.arrayBuffer();
      const buf = await ctx.decodeAudioData(arr);
      noteSamples[`${instrument}:${noteName}`] = buf;
    } catch (e) {
      console.warn("Failed to load sample", instrument, fileName, e);
    }
  });
  await Promise.all(promises);
  noteSamplesLoaded[instrument] = true;
  return true;
}

function getNoteSample(freq, instrument) {
  const note = frequencyToNote(freq);
  const key = `${instrument}:${note.name}${note.octave}`;
  if (noteSamples[key]) return noteSamples[key];
  return null;
}

/* ------------------------------------------------------------------ */
/* Reverb helper                                                      */
/* ------------------------------------------------------------------ */
let reverbBufferCache = null;
function getReverbIR(ctx) {
  if (reverbBufferCache && reverbBufferCache.sampleRate === ctx.sampleRate) return reverbBufferCache;
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * 1.2);
  const buf = ctx.createBuffer(2, length, sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t / 0.35);
      if (ch === 1) data[i] *= 0.9;
    }
  }
  reverbBufferCache = buf;
  return buf;
}

function playBufferSource(ctx, buffer, start, dur, gainLevel, pan, playbackRate) {
  if (!buffer) return;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = (playbackRate != null) ? playbackRate : 1;

  const panner = ctx.createStereoPanner();
  panner.pan.value = (pan != null) ? pan : 0;

  const dryGain = ctx.createGain();
  dryGain.gain.value = gainLevel;

  const sendGain = ctx.createGain();
  sendGain.gain.value = 0.3;

  const convolver = ctx.createConvolver();
  convolver.buffer = getReverbIR(ctx);

  const wetGain = ctx.createGain();
  wetGain.gain.value = 0.16;

  src.connect(panner);
  panner.connect(dryGain).connect(ctx.destination);
  panner.connect(sendGain).connect(convolver).connect(wetGain).connect(ctx.destination);

  src.start(start);
  try { src.stop(start + dur + 0.15); } catch (e) {}

  const cleanupDelay = (dur + 1.6) * 1000;
  setTimeout(() => {
    try { src.disconnect(); } catch (e) {}
    try { panner.disconnect(); } catch (e) {}
    try { dryGain.disconnect(); } catch (e) {}
    try { sendGain.disconnect(); } catch (e) {}
    try { convolver.disconnect(); } catch (e) {}
    try { wetGain.disconnect(); } catch (e) {}
  }, cleanupDelay);
}

/* ------------------------------------------------------------------ */
/* Muestras reales para guitarra y bajo                                */
/* ------------------------------------------------------------------ */
// Instrumento de la app -> grupo de muestras reales.
const REAL_GROUP = { guitar: "guitar", acoustic: "guitar", electric: "electric", classical: "nylon", nylon: "nylon", piano: "piano", bass: "bass" };
// Grupo concreto -> ajuste de volumen para igualar las librerías entre sí.
const GROUP_GAIN = { guitar: 1, electric: 1.3, nylon: 0.95, piano: 0.75, bass: 1 };
// "guitar" suena con el timbre elegido en Ajustes (acústica, eléctrica o nylon).
let guitarTone = "guitar";
let earInstrumentId = "guitar";

// Efectos de audio (chorus, delay, distorsión).
let fxChorus = false;
let fxDelay = false;
let fxDistortion = false;
let fxReverb = true;

export function setFxChorus(on) { fxChorus = !!on; realBus = null; }
export function setFxDelay(on) { fxDelay = !!on; realBus = null; }
export function setFxDistortion(on) { fxDistortion = !!on; realBus = null; }
export function setFxReverb(on) { fxReverb = !!on; realBus = null; }
export function getFxState() { return { chorus: fxChorus, delay: fxDelay, distortion: fxDistortion, reverb: fxReverb }; }

/** Timbre de guitarra: "acoustic" | "electric" | "nylon". */
export function setGuitarTone(tone) {
  guitarTone = { electric: "electric", nylon: "nylon" }[tone] || "guitar";
  try { return preloadGroup(guitarTone, getAudioContext()); } catch (e) { return Promise.resolve(false); }
}
/** Instrumento de los ejercicios de oído y teoría: "guitar" | "piano". */
export function setEarInstrument(id) { earInstrumentId = id === "piano" ? "piano" : "guitar"; }
export function earInstrument() { return earInstrumentId; }
/** Grupo de muestras que usa ahora la guitarra ("guitar" | "electric" | "nylon"). */
export function guitarGroup() { return guitarTone; }

// Perfil de síntesis cuando aún no hay muestras: respeta el timbre elegido.
function synthOpts(opts) {
  const instrument = (opts && opts.instrument) || "guitar";
  if (instrument !== "guitar" && instrument !== "acoustic") return opts;
  const profile = { electric: "electric", nylon: "classical" }[guitarTone];
  return profile ? Object.assign({}, opts, { instrument: profile }) : opts;
}

function groupFor(instrument) {
  if (instrument === "guitar" || instrument === "acoustic") return guitarTone;
  return REAL_GROUP[instrument];
}
// Iguala el volumen de las muestras con el de la síntesis anterior.
const REAL_GAIN = 0.45;

let realBus = null;
function getRealBus(ctx) {
  if (realBus && realBus.context === ctx) return realBus.input;
  const input = ctx.createGain();
  // Reverb (convolver) — opcional
  if (fxReverb) {
    const send = ctx.createGain();
    send.gain.value = 0.22;
    const convolver = ctx.createConvolver();
    convolver.buffer = getReverbIR(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.14;
    input.connect(send).connect(convolver).connect(wet).connect(ctx.destination);
  }
  // Delay
  if (fxDelay) {
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.3;
    const delayGain = ctx.createGain();
    delayGain.gain.value = 0.35;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.4;
    input.connect(delay);
    delay.connect(delayGain).connect(ctx.destination);
    delay.connect(feedback).connect(delay);
  }
  // Chorus (modulated delay)
  if (fxChorus) {
    const chorusDelay = ctx.createDelay(0.05);
    chorusDelay.delayTime.value = 0.02;
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 1.5;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.002;
    lfo.connect(lfoGain).connect(chorusDelay.delayTime);
    lfo.start();
    const chorusGain = ctx.createGain();
    chorusGain.gain.value = 0.5;
    input.connect(chorusDelay).connect(chorusGain).connect(ctx.destination);
  }
  // Distortion (waveshaper)
  if (fxDistortion) {
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1;
      curve[i] = (Math.PI + 2) * x / (Math.PI + 2 * Math.abs(x));
    }
    shaper.curve = curve;
    shaper.oversample = "2x";
    const distGain = ctx.createGain();
    distGain.gain.value = 0.6;
    input.connect(shaper).connect(distGain).connect(ctx.destination);
  }
  // Dry signal
  input.connect(ctx.destination);
  realBus = { context: ctx, input };
  return input;
}

/** Empieza a descargar las muestras reales (se puede llamar muchas veces). */
export function warmRealInstruments(instrument = "guitar") {
  const group = groupFor(instrument) || "guitar";
  const ctx = getAudioContext();
  preloadGroup(group, ctx);
  preloadIds("hand", ["woodblock"], ctx).then((ok) => { metroClickReady = ok; });
}

function freqToMidi(freq) {
  return 69 + 12 * Math.log2(freq / 440);
}

/** Intenta tocar la nota con una muestra real. false => usar síntesis. */
function playReal(freq, start, dur, gainLevel, opts) {
  if (opts && (opts.waveform || opts.synth)) return false;
  const instrument = (opts && opts.instrument) || "guitar";
  const group = groupFor(instrument);
  if (!group) return false;
  const ctx = getAudioContext();
  if (!isGroupReady(group)) { warmRealInstruments(instrument); return false; }
  return playPitched(group, freqToMidi(freq), start, getRealBus(ctx), {
    gain: gainLevel * REAL_GAIN * (GROUP_GAIN[group] || 1),
    velocity: (opts && opts.velocity != null) ? opts.velocity : 0.75,
    duration: dur + 0.35,
  });
}

/* ------------------------------------------------------------------ */
/* Playback: playTone / playChord                                      */
/* ------------------------------------------------------------------ */
function normalizePlayArgs(duration, options) {
  if (typeof duration === "object" && duration !== null) {
    options = duration;
    duration = (options && options.duration != null) ? options.duration : 1.2;
  }
  if (duration == null) duration = 1.2;
  if (!options) options = {};
  return { duration, options };
}

export function playTone(freq, duration = 1.2, options = {}) {
  if (!isFinite(freq) || freq <= 0) return;
  const { duration: dur, options: opts } = normalizePlayArgs(duration, options);
  const ctx = getAudioContext();
  resumeContext(ctx);
  const instrument = (opts && opts.instrument) ? opts.instrument : "guitar";
  prewarmCommonNotes(instrument);

  const gainLevel = (opts && opts.gain != null) ? opts.gain : 0.3;
  const start = ctx.currentTime;
  const pan = (opts && opts.pan != null) ? opts.pan : 0;

  // Muestras reales (guitarra y bajo; CC0 y CC BY 3.0).
  if (playReal(freq, start, dur, gainLevel, opts)) return;

  // Individual note samples path (real recorded notes).
  const noteSample = getNoteSample(freq, instrument);
  if (noteSample) {
    playBufferSource(ctx, noteSample, start, dur, gainLevel, pan, 1);
    return;
  }

  // Samples bank path (soundfont).
  if (soundBank === "samples" && sampleBankBuffer) {
    playBufferSource(ctx, sampleBankBuffer, start, dur, gainLevel, pan, freq / sampleBaseFreq);
    return;
  }

  // Synth (Karplus-Strong) path.
  const buffer = generatePluckedString(freq, dur, synthOpts(opts));
  playBufferSource(ctx, buffer, start, dur, gainLevel, pan, 1);
}

export function playChord(freqsArray, duration = 1.2, options = {}) {
  const { duration: dur, options: opts } = normalizePlayArgs(duration, options);
  const ctx = getAudioContext();
  resumeContext(ctx);
  const freqs = Array.isArray(freqsArray) ? freqsArray : [freqsArray];
  const instrument = (opts && opts.instrument) ? opts.instrument : "guitar";
  prewarmCommonNotes(instrument);

  const arpeggiate = !!(opts && (opts.arpeggiate || opts.arpeggiated));
  const stagger = (opts && opts.stagger != null)
    ? opts.stagger
    : (arpeggiate ? 0.08 : 0.025);
  const gainLevel = (opts && opts.gain != null) ? opts.gain : 0.25;
  const baseStart = ctx.currentTime;

  freqs.forEach((f, i) => {
    const stringGain = gainLevel * (0.9 + Math.random() * 0.2);
    const o = Object.assign({}, opts, { gain: stringGain });
    const start = baseStart + i * stagger;
    // Stereo spread: different strings slightly panned.
    const pan = (freqs.length > 1)
      ? ((i / (freqs.length - 1)) * 2 - 1) * 0.3
      : 0;
    if (playReal(f, start, dur, stringGain, o)) return;
    if (soundBank === "samples" && sampleBankBuffer) {
      playBufferSource(ctx, sampleBankBuffer, start, dur, stringGain, pan, f / sampleBaseFreq);
      return;
    }
    const buffer = generatePluckedString(f, dur, synthOpts(o));
    playBufferSource(ctx, buffer, start, dur, stringGain, pan, 1);
  });
}

/* ------------------------------------------------------------------ */
/* Metronome (Web Audio lookahead scheduler) - woodblock click         */
/* ------------------------------------------------------------------ */
let noiseBufferCache = null;
function getNoiseBuffer(ctx) {
  if (noiseBufferCache && noiseBufferCache.sampleRate === ctx.sampleRate) return noiseBufferCache;
  const len = Math.floor(ctx.sampleRate * 0.05);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBufferCache = buf;
  return buf;
}

let metroClickReady = false;

function scheduleMetroBeat(beatNumber, time) {
  const ctx = getAudioContext();
  const isDownbeat = (beatNumber % metroBeatsPerBar === 0);
  if (metroClickReady && playHand("woodblock", time, ctx.destination, { velocity: isDownbeat ? 1 : 0.2, gain: isDownbeat ? 0.9 : 0.75 })) {
    notifyMetroBeat(beatNumber, time);
    return;
  }
  const freq = isDownbeat ? 920 : 620;

  // Pitched woodblock body.
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, time);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.55), time + 0.05);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, time);
  gain.gain.exponentialRampToValueAtTime(isDownbeat ? 0.4 : 0.25, time + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.07);
  osc.connect(gain).connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.08);

  // Noise click transient.
  const noiseBuf = getNoiseBuffer(ctx);
  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = noiseBuf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 2500;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(isDownbeat ? 0.25 : 0.15, time);
  ng.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
  noiseSrc.connect(hp).connect(ng).connect(ctx.destination);
  noiseSrc.start(time);
  noiseSrc.stop(time + 0.025);

  notifyMetroBeat(beatNumber, time);
}

function notifyMetroBeat(beatNumber, time) {
  const ctx = getAudioContext();
  if (metroOnBeat) {
    const delay = Math.max(0, (time - ctx.currentTime) * 1000);
    setTimeout(() => {
      try { metroOnBeat(beatNumber % metroBeatsPerBar, beatNumber); } catch (e) {}
    }, delay);
  }
}

function metroScheduler() {
  if (!metroRunning) return;
  const ctx = getAudioContext();
  const horizon = ctx.currentTime + 0.1;
  while (metroNextNoteTime < horizon) {
    scheduleMetroBeat(metroBeat, metroNextNoteTime);
    metroNextNoteTime += 60.0 / metroBpm;
    metroBeat++;
  }
  metroTimer = setTimeout(metroScheduler, 25);
}

export function startMetronome(bpm, beatsPerBar, onBeat) {
  stopMetronome();
  metroBpm = (bpm && bpm > 0) ? bpm : 120;
  metroBeatsPerBar = (beatsPerBar && beatsPerBar > 0) ? beatsPerBar : 4;
  metroOnBeat = typeof onBeat === "function" ? onBeat : null;
  const ctx = getAudioContext();
  resumeContext(ctx);
  if (!metroClickReady) preloadIds("hand", ["woodblock"], ctx).then((ok) => { metroClickReady = ok; });
  metroRunning = true;
  metroBeat = 0;
  metroNextNoteTime = ctx.currentTime + 0.05;
  metroScheduler();
  return true;
}

export function stopMetronome() {
  metroRunning = false;
  if (metroTimer) { clearTimeout(metroTimer); metroTimer = null; }
}

export function isMetronomeRunning() { return metroRunning; }

/* ------------------------------------------------------------------ */
/* Chord detection                                                    */
/* ------------------------------------------------------------------ */
const FLAT_TO_SHARP = { Cb: "B", Db: "C#", Eb: "D#", Fb: "E", Gb: "F#", Ab: "G#", Bb: "A#" };

function computeChroma(analyser, sampleRate) {
  const fftSize = analyser.fftSize;
  const freqData = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(freqData);
  const chroma = new Float64Array(12);
  const binHz = sampleRate / fftSize;
  for (let i = 1; i < freqData.length; i++) {
    const hz = i * binHz;
    if (hz < 60 || hz > 2500) continue;
    const db = freqData[i];
    if (!isFinite(db)) continue;
    const mag = Math.pow(10, db / 20);
    if (mag <= 0) continue;
    const midi = 69 + 12 * Math.log2(hz / 440);
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    chroma[pc] += mag * mag;
  }
  return chroma;
}

const CHORD_INTERVALS = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
};

function buildTemplate(intervals) {
  const t = new Float64Array(12);
  for (const iv of intervals) t[((iv % 12) + 12) % 12] = 1;
  return t;
}

function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < 12; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const denom = Math.sqrt(na * nb);
  return denom > 0 ? dot / denom : 0;
}

function matchChordTemplate(chroma) {
  let best = { chord: "Unknown", root: "", quality: "", confidence: 0 };
  const normChroma = new Float64Array(12);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += chroma[i];
  if (sum > 0) for (let i = 0; i < 12; i++) normChroma[i] = chroma[i] / sum;
  else for (let i = 0; i < 12; i++) normChroma[i] = chroma[i];

  for (const [quality, ivs] of Object.entries(CHORD_INTERVALS)) {
    const tmpl = buildTemplate(ivs);
    for (let root = 0; root < 12; root++) {
      const shifted = new Float64Array(12);
      for (let i = 0; i < 12; i++) shifted[(i + root) % 12] = tmpl[i];
      const score = cosineSimilarity(normChroma, shifted);
      if (score > best.confidence) {
        let name = NOTE_NAMES[root];
        if (quality === "major") name += " major";
        else if (quality === "minor") name += " minor";
        else name += " " + quality;
        best = { chord: name, root: NOTE_NAMES[root], quality, confidence: score };
      }
    }
  }
  return best;
}

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

export async function detectChord(durationMs = 1500) {
  const ms = Math.max(200, durationMs || 1500);

  let stream = mediaStream;
  let ctx = audioCtx;
  let an = analyser;
  let owned = false;
  let sourceNode = null;

  if (!running || !an) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
    } catch (e) {
      console.error("detectChord mic error", e);
      return null;
    }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    await resumeContext(ctx);
    an = ctx.createAnalyser();
    an.fftSize = 4096;
    an.smoothingTimeConstant = 0.0;
    sourceNode = ctx.createMediaStreamSource(stream);
    sourceNode.connect(an);
    owned = true;
  }

  const chromaAcc = new Float64Array(12);
  let frames = 0;
  const start = performance.now();
  while (performance.now() - start < ms) {
    const c = computeChroma(an, ctx.sampleRate);
    for (let i = 0; i < 12; i++) chromaAcc[i] += c[i];
    frames++;
    await sleep(40);
  }

  const chroma = new Float64Array(12);
  if (frames > 0) for (let i = 0; i < 12; i++) chroma[i] = chromaAcc[i] / frames;

  const result = matchChordTemplate(chroma);

  if (owned) {
    try { stream.getTracks().forEach(t => t.stop()); } catch (e) {}
    try { if (sourceNode) sourceNode.disconnect(); } catch (e) {}
    try { await ctx.close(); } catch (e) {}
  }

  return { ...result, chroma: Array.from(chroma) };
}

/* ------------------------------------------------------------------ */
/* Recording helper (MediaRecorder)                                    */
/* ------------------------------------------------------------------ */
export function isRecordingSupported() {
  return typeof MediaRecorder !== "undefined";
}

export async function startRecording() {
  if (!isRecordingSupported()) return false;
  try {
    if (mediaStream && running) {
      recordingStream = mediaStream;
    } else {
      recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    recordedChunks = [];
    const mime = MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : (MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "");
    mediaRecorder = new MediaRecorder(recordingStream, mime ? { mimeType: mime } : undefined);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.start();
    return true;
  } catch (e) {
    console.error("recording error", e);
    return false;
  }
}

export function stopRecording() {
  return new Promise((resolve) => {
    if (!mediaRecorder) { resolve(null); return; }
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      if (recordingStream && recordingStream !== mediaStream) {
        try { recordingStream.getTracks().forEach(t => t.stop()); } catch (e) {}
      }
      recordingStream = null;
      mediaRecorder = null;
      recordedChunks = [];
      resolve(blob);
    };
    try { mediaRecorder.stop(); } catch (e) { resolve(null); }
  });
}
