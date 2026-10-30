/* ============================================================
   Strumio — Looper multipista profesional (rediseño)
   - Hasta 8 pistas con grabación cuantizada por BPM
   - Count-in, auto-stop por compás, overdub/replace
   - Visualización de onda (Canvas) por pista con playhead
   - Edición ligera: trim (arrastre de bordes), mover (offset),
     ganancia, mute/solo, reverse, undo
   - Export WAV (mezcla o pista), guardar/cargar (IndexedDB)
   ============================================================ */
import { getAudioContext, resumeContext, startMetronome, stopMetronome } from "./audio.js";
import { t } from "./i18n.js";
import { icon } from "./icons.js";

const MAX_TRACKS = 8;
const DEFAULT_TRACKS = 4;
const DB_NAME = "strumio_looper";
const DB_VERSION = 1;
const TRACK_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function toast(msg) {
  if (typeof window !== "undefined" && typeof window.toast === "function") {
    try { window.toast(msg); return; } catch (e) {}
  }
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1f2937;color:#fff;padding:10px 18px;border-radius:10px;z-index:9999;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,.4)";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function audioBufferToWav(buffer) {
  const numCh = buffer.numberOfChannels, sr = buffer.sampleRate, len = buffer.length;
  const bps = 2, blockAlign = numCh * bps, byteRate = sr * blockAlign, dataSize = len * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize); const view = new DataView(ab);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); view.setUint32(4, 36 + dataSize, true); ws(8, "WAVE"); ws(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true); view.setUint32(28, byteRate, true); view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); ws(36, "data"); view.setUint32(40, dataSize, true);
  let off = 44; const chs = [];
  for (let c = 0; c < numCh; c++) chs.push(buffer.getChannelData(c));
  for (let i = 0; i < len; i++) for (let c = 0; c < numCh; c++) {
    let s = Math.max(-1, Math.min(1, chs[c][i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2;
  }
  return new Blob([ab], { type: "audio/wav" });
}

/* ---------- IndexedDB ---------- */
function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB no disponible")); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ---------- Waveform helpers ---------- */
function computePeaks(buffer, width) {
  if (!buffer) return null;
  const ch = buffer.getChannelData(0);
  const len = ch.length;
  const peaks = new Float32Array(width * 2);
  const step = len / width;
  for (let i = 0; i < width; i++) {
    let mn = 1, mx = -1;
    const start = Math.floor(i * step);
    const end = Math.min(len, Math.floor((i + 1) * step));
    for (let j = start; j < end; j++) {
      const v = ch[j];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    peaks[i * 2] = mn;
    peaks[i * 2 + 1] = mx;
  }
  return peaks;
}

/* ---------- LooperTrack ---------- */
class LooperTrack {
  constructor(index) {
    this.id = index;
    this.name = `Pista ${index + 1}`;
    this.color = TRACK_COLORS[index % TRACK_COLORS.length];
    this.buffer = null;          // original recorded buffer
    this.rendered = null;        // final playable buffer (trim+offset applied)
    this.undoStack = [];
    this.muted = false;
    this.solo = false;
    this.mutedInstant = false;
    this.soloInstant = false;
    this.volume = 0.85;
    this.pan = 0;
    this.recording = false;
    this.playing = false;
    this.armed = false;
    this.trimStart = 0;
    this.trimEnd = 0;            // 0 = full
    this.offset = 0;            // seconds shift within loop
    this.loopMultiplier = 1;    // 0.25, 0.5, 1, 2 (relative to main loop)
    this.fx = { reverb: false, chorus: false, delay: false, distortion: false };
    this.fxAmount = { reverb: 0.3, chorus: 0.5, delay: 0.35, distortion: 0.6 };
    this.eq = { low: 0, mid: 0, high: 0 }; // 3-band EQ per track (dB)
    this.fadeIn = 0;
    this.fadeOut = 0;
    this.snapToBeats = true;
    this.monitoring = false; // input monitoring
    this.overdubMode = false; // overdub vs replace
    this.reversed = false;
    this.fadeIn = 0;
    this.fadeOut = 0;
    this.source = null;
    this.gain = null;
    this.panner = null;
    this.stream = null;
    this.mediaRecorder = null;
    this.chunks = [];
    this.pendingStop = false;
    this.recordStartCtx = 0;
    this.peaks = null;
    this.peaksWidth = 0;
  }
  get duration() { return this.buffer ? this.buffer.duration : 0; }
  get effectiveDuration() {
    if (!this.buffer) return 0;
    const end = this.trimEnd > 0 ? this.trimEnd : this.buffer.duration;
    return Math.max(0.01, end - this.trimStart);
  }
  clearBuffer() {
    if (this.buffer) this.undoStack.push(this.buffer);
    this.buffer = null; this.rendered = null; this.peaks = null;
    this.trimStart = 0; this.trimEnd = 0; this.offset = 0;
  }
  rebuildRendered(loopDuration, sampleRate) {
    if (!this.buffer) { this.rendered = null; this.peaks = null; return; }
    if (loopDuration <= 0) { this.rendered = this.buffer; this.peaks = null; return; }
    const ctx = getAudioContext();
    const sr = sampleRate || ctx.sampleRate;
    const mult = this.loopMultiplier || 1;
    const trackLoopDur = loopDuration * mult;
    const len = Math.ceil(sr * trackLoopDur);
    const rendered = ctx.createBuffer(this.buffer.numberOfChannels, len, sr);
    const trimEnd = this.trimEnd > 0 ? Math.min(this.trimEnd, this.buffer.duration) : this.buffer.duration;
    // clamp trim to track loop duration (ensure valid range)
    const clampedTrimStart = Math.max(0, Math.min(this.trimStart, trackLoopDur - 0.01));
    const clampedTrimEnd = Math.max(clampedTrimStart + 0.01, Math.min(trimEnd, trackLoopDur));
    const trimDur = Math.max(0.01, clampedTrimEnd - clampedTrimStart);
    const channels = [];
    for (let c = 0; c < rendered.numberOfChannels; c++) channels.push(rendered.getChannelData(c));
    // place audio at offset (with wraparound) - mono
    const startSample = Math.floor(this.offset * sr);
    const trimStartSample = Math.floor(clampedTrimStart * this.buffer.sampleRate);
    const trimLenSamples = Math.floor(trimDur * this.buffer.sampleRate);
    const srcData = this.buffer.getChannelData(0);
    for (let i = 0; i < trimLenSamples; i++) {
      const si = trimStartSample + i;
      if (si >= srcData.length) break;
      const di = (startSample + i) % len;
      channels[0][di] = this.reversed ? srcData[trimStartSample + (trimLenSamples - 1 - i)] : srcData[si];
    }
    // fade in/out
    if (this.fadeIn > 0 || this.fadeOut > 0) {
      const fi = Math.floor(this.fadeIn * sr);
      const fo = Math.floor(this.fadeOut * sr);
      const d = channels[0];
      for (let i = 0; i < Math.min(fi, len); i++) { if (fi > 0) d[i] *= (i / fi); }
      for (let i = 0; i < Math.min(fo, len); i++) { if (fo > 0) d[len - 1 - i] *= (i / fo); }
    }
    this.rendered = rendered;
    this.peaks = null;
  }
  getPeaks(width) {
    const buf = this.rendered || this.buffer;
    if (!buf) return null;
    if (this.peaks && this.peaksWidth === width) return this.peaks;
    this.peaks = computePeaks(buf, width);
    this.peaksWidth = width;
    return this.peaks;
  }
  invalidatePeaks() { this.peaks = null; }
}

/* ---------- Looper ---------- */
class Looper {
  constructor() {
    this.tracks = [];
    for (let i = 0; i < DEFAULT_TRACKS; i++) this.tracks.push(new LooperTrack(i));
    this.bpm = 120;
    this.beatsPerBar = 4;
    this.bars = 4;
    this.countInBars = 1;
    this.loopDuration = (60 / this.bpm) * this.beatsPerBar * this.bars;
    this.currentBeat = 0;
    this.currentBar = 0;
    this.loopPosition = 0; // 0..1 within loop
    this.metroRunning = false;
    this.metroStart = 0;
    this.loopStart = 0; // when the loop/recording actually starts (after count-in)
    this.playingAll = false;
    this.recordingTrack = null;
    this.recordState = "idle"; // idle | armed | countin | recording | processing
    this.countInRemaining = 0;
    this.recordStopAt = 0;
    this.container = null;
    this.rafId = null;
    this.masterVolume = 0.9;
    this.metronomeEnabled = true;
    this.metronomeVolume = 0.5;
    this.masterGain = null;
    this.masterCompressor = null;
    this.inputAnalyser = null;
    this.inputMonitorGain = null;
    this.inputMonitorStream = null;
    this.fxTrackIndex = -1;
    this.snapToBeats = true;
    this._mixTimer = null;
    this.playbackRate = 1; // 0.5, 1, 2
    this.latencyComp = 0; // ms, manual latency compensation
    this.metronomeAudible = true;
    this.metroAutoEnabled = false;
    // Load persisted settings
    this._loadSettings();
    this._metroTimer = null;
    this._metroNodes = [];
  }

  /* ---------- timing ---------- */
  spb() { return 60.0 / this.bpm; }
  barDuration() { return this.spb() * this.beatsPerBar; }
  recomputeLoop() { this.loopDuration = this.spb() * this.beatsPerBar * this.bars; }

  nextBarTime(from) {
    const ctx = getAudioContext();
    const now = from || ctx.currentTime;
    if (!this.metroRunning) return now + 0.05;
    const elapsed = now - this.metroStart;
    const barDur = this.barDuration();
    const n = Math.max(1, Math.ceil(elapsed / barDur));
    return this.metroStart + n * barDur;
  }
  nextBeatTime(from) {
    const ctx = getAudioContext();
    const now = from || ctx.currentTime;
    if (!this.metroRunning) return now + 0.05;
    const elapsed = now - this.metroStart;
    const spb = this.spb();
    const n = Math.max(1, Math.ceil(elapsed / spb));
    return this.metroStart + n * spb;
  }

  /* ---------- metronome ---------- */
  _loadSettings() {
    try {
      const raw = localStorage.getItem("strumio_looper_settings");
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.bpm === "number") this.bpm = s.bpm;
      if (typeof s.beatsPerBar === "number") this.beatsPerBar = s.beatsPerBar;
      if (typeof s.bars === "number") this.bars = s.bars;
      if (typeof s.latencyComp === "number") this.latencyComp = s.latencyComp;
      if (typeof s.metronomeVolume === "number") this.metronomeVolume = s.metronomeVolume;
      if (typeof s.playbackRate === "number") this.playbackRate = s.playbackRate;
      if (typeof s.countInBars === "number") this.countInBars = s.countInBars;
      this.recomputeLoop();
    } catch (e) {}
  }
  _saveSettings() {
    try {
      localStorage.setItem("strumio_looper_settings", JSON.stringify({
        bpm: this.bpm, beatsPerBar: this.beatsPerBar, bars: this.bars,
        latencyComp: this.latencyComp, metronomeVolume: this.metronomeVolume,
        playbackRate: this.playbackRate, countInBars: this.countInBars,
      }));
    } catch (e) {}
  }
  startClock() {
    if (this.metroRunning) return;
    const ctx = getAudioContext();
    resumeContext(ctx);
    this.metroStart = ctx.currentTime + 0.1;
    this.loopStart = this.metroStart;
    this.metroRunning = true;
    if (this.metronomeAudible) this._scheduleMetro();
    this._startLoopClock();
  }
  startMetronome() {
    if (!this.metroRunning) this.startClock();
    this.metronomeAudible = true;
    this.metroAutoEnabled = false;
    // clear any existing timer before scheduling
    if (this._metroTimer) { clearTimeout(this._metroTimer); this._metroTimer = null; }
    try { this._metroNodes.forEach((n) => { try { n.stop(); } catch (e) {} }); } catch (e) {}
    this._metroNodes = [];
    this._scheduleMetro();
    this.refreshUI();
  }
  async toggleMonitoring() {
    if (this.monitoring) {
      // stop monitoring
      if (this.inputMonitorGain) { try { this.inputMonitorGain.disconnect(); } catch (e) {} }
      if (this.inputMonitorStream) { try { this.inputMonitorStream.getTracks().forEach((t) => t.stop()); } catch (e) {} }
      this.inputMonitorGain = null;
      this.inputMonitorStream = null;
      this.monitoring = false;
      return;
    }
    // start monitoring
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const ctx = getAudioContext();
      resumeContext(ctx);
      const src = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = 0.5; // monitoring level
      src.connect(gain).connect(ctx.destination);
      this.inputMonitorStream = stream;
      this.inputMonitorGain = gain;
      this.monitoring = true;
    } catch (e) {
      toast("Micrófono no disponible");
      this.monitoring = false;
    }
  }
  toggleMetronome() {
    this.metronomeAudible = !this.metronomeAudible;
    this.metroAutoEnabled = false;
    if (this._metroTimer) { clearTimeout(this._metroTimer); this._metroTimer = null; }
    try { this._metroNodes.forEach((n) => { try { n.stop(); } catch (e) {} }); } catch (e) {}
    this._metroNodes = [];
    if (this.metronomeAudible && this.metroRunning) {
      this._scheduleMetro();
    }
    this.refreshUI();
  }
  _scheduleMetro() {
    if (!this.metroRunning || !this.metronomeAudible) return;
    const ctx = getAudioContext();
    const spb = this.spb();
    const barDur = this.barDuration();
    // schedule clicks for next 2 seconds
    const lookahead = 2.0;
    const now = ctx.currentTime;
    const startBeat = Math.floor((now - this.metroStart) / spb);
    const endBeat = Math.floor((now + lookahead - this.metroStart) / spb);
    for (let b = startBeat; b <= endBeat; b++) {
      const t = this.metroStart + b * spb;
      if (t < now - 0.05) continue;
      const isDownbeat = (b % this.beatsPerBar === 0);
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = isDownbeat ? 1000 : 600;
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(this.metronomeVolume * (isDownbeat ? 1 : 0.6), t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.connect(g).connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.1);
      this._metroNodes.push(osc);
    }
    this._metroTimer = setTimeout(() => this._scheduleMetro(), 500);
  }
  stopMetronome() {
    this.metroRunning = false;
    this.metronomeAudible = false;
    if (this._metroTimer) { clearTimeout(this._metroTimer); this._metroTimer = null; }
    try { this._metroNodes.forEach((n) => { try { n.stop(); } catch (e) {} }); } catch (e) {}
    this._metroNodes = [];
    try { stopMetronome(); } catch (e) {}
  }

  /* ---------- loop clock (playhead) ---------- */
  _startLoopClock() {
    if (this.rafId) return;
    const tick = () => {
      if (!this.metroRunning && !this.playingAll) { this.rafId = null; return; }
      const ctx = getAudioContext();
      if (this.metroRunning) {
        const now = ctx.currentTime;
        // only compute position after loopStart
        if (now >= this.loopStart) {
          const elapsed = now - this.loopStart;
          const pos = (elapsed % this.loopDuration) / this.loopDuration;
          this.loopPosition = isNaN(pos) ? 0 : pos;
          this.currentBeat = Math.floor((elapsed / this.spb()) % this.beatsPerBar);
          this.currentBar = Math.floor((elapsed / this.barDuration()) % this.bars);
        } else {
          // during count-in: show countdown
          this.loopPosition = 0;
          const elapsed = now - this.metroStart;
          this.currentBeat = Math.floor((elapsed / this.spb()) % this.beatsPerBar);
          this.currentBar = 0;
        }
      }
      this._updatePlayhead();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }
  _stopLoopClock() {
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
  }
  _updateLevelMeter() {
    if (!this.inputAnalyser || this.recordState !== "recording") {
      this._levelMeterRAF = null;
      return;
    }
    const data = new Uint8Array(this.inputAnalyser.frequencyBinCount);
    this.inputAnalyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const level = Math.min(100, (sum / data.length) * 2);
    const el = this.container?.querySelector("#lpLevelMeter");
    if (el) el.style.width = level + "%";
    this._levelMeterRAF = requestAnimationFrame(() => this._updateLevelMeter());
  }
  _updatePlayhead() {
    if (!this.container) return;
    // update beat dots
    const beatEl = this.container.querySelector("#lpBeat");
    if (beatEl) {
      const dots = Array.from({ length: this.beatsPerBar }, (_, i) => (i === this.currentBeat ? "●" : "○")).join(" ");
      beatEl.textContent = dots;
      // flash on downbeat
      if (this.currentBeat === 0) {
        beatEl.classList.add("lp-beat--flash");
        clearTimeout(this._beatFlashTimer);
        this._beatFlashTimer = setTimeout(() => beatEl.classList.remove("lp-beat--flash"), 120);
      }
    }
    const barEl = this.container.querySelector("#lpBar");
    if (barEl) barEl.textContent = `Compás ${this.currentBar + 1}/${this.bars}`;
    // update per-track playheads
    const wrap = this.container.querySelector("#lpTracks");
    if (wrap) {
      wrap.querySelectorAll(".lp-track").forEach((trackEl) => {
        const i = parseInt(trackEl.dataset.track, 10);
        const tr = this.tracks[i];
        const mult = tr?.loopMultiplier || 1;
        const ph = trackEl.querySelector(".lp-playhead");
        if (!ph) return;
        if (mult === 2) {
          const elapsed = this.metroRunning ? (getAudioContext().currentTime - this.loopStart) : 0;
          const cycle = elapsed >= 0 ? Math.floor(elapsed / this.loopDuration) % 2 : 0;
          ph.style.top = cycle === 0 ? "0px" : "32px";
          ph.style.height = "32px";
          ph.style.left = (this.loopPosition * 100) + "%";
        } else if (mult < 1) {
          // For 0.5x and 0.25x: playhead wraps around
          const repeats = Math.round(1 / mult);
          const pos = (this.loopPosition * repeats) % 1;
          ph.style.top = "0px";
          ph.style.height = "100%";
          ph.style.left = (pos * 100) + "%";
        } else {
          ph.style.top = "0px";
          ph.style.height = "100%";
          ph.style.left = (this.loopPosition * 100) + "%";
        }
      });
    }
    // update rec indicator
    const recInd = this.container.querySelector("#lpRecInd");
    if (recInd) recInd.hidden = !(this.recordState === "recording" || this.recordState === "countin");
    const metroBtn = this.container.querySelector("#lpMetroToggle");
    if (metroBtn) metroBtn.classList.toggle("active", this.metronomeAudible);
    const recText = this.container.querySelector("#lpRecText");
    if (recText) {
      if (this.recordState === "countin") recText.textContent = `Count-in… ${this.countInRemaining}`;
      else if (this.recordState === "recording") recText.textContent = "Grabando…";
      else recText.textContent = "";
    }
  }

  /* ---------- per-track FX chain ---------- */
  buildTrackChain(ctx, track) {
    // ensure master gain exists
    if (!this.masterGain) {
      this.masterCompressor = ctx.createDynamicsCompressor();
      this.masterCompressor.threshold.value = -24;
      this.masterCompressor.knee.value = 12;
      this.masterCompressor.ratio.value = 4;
      this.masterCompressor.attack.value = 0.003;
      this.masterCompressor.release.value = 0.25;
      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = this.masterVolume;
      this.masterGain.connect(this.masterCompressor);
      this.masterCompressor.connect(ctx.destination);
    }
    // reuse existing input if available
    if (!track.fxNodes) track.fxNodes = {};
    const nodes = track.fxNodes;
    if (nodes.input) {
      // update EQ gains
      const eq = track.eq || { low: 0, mid: 0, high: 0 };
      if (nodes.eq) { nodes.eq.low.gain.value = eq.low; nodes.eq.mid.gain.value = eq.mid; nodes.eq.high.gain.value = eq.high; }
      // update FX gains
      const amt = track.fxAmount || {};
      if (nodes.distortion) nodes.distortion.gain.gain.value = track.fx.distortion ? (0.3 + (amt.distortion || 0.6) * 0.6) : 0;
      if (nodes.chorus) nodes.chorus.gain.gain.value = track.fx.chorus ? (0.3 + (amt.chorus || 0.5) * 0.4) : 0;
      if (nodes.delay) nodes.delay.gain.gain.value = track.fx.delay ? (0.2 + (amt.delay || 0.35) * 0.3) : 0;
      if (nodes.reverb) {
        nodes.reverb.send.gain.value = track.fx.reverb ? (0.1 + (amt.reverb || 0.3) * 0.25) : 0;
        nodes.reverb.wet.gain.value = track.fx.reverb ? (0.08 + (amt.reverb || 0.3) * 0.2) : 0;
      }
      return nodes.input;
    }
    const input = ctx.createGain();
    input.gain.value = 1;
    nodes.input = input;
    const eq = track.eq || { low: 0, mid: 0, high: 0 };
    // 3-band EQ (per track)
    const lowShelf = ctx.createBiquadFilter();
    lowShelf.type = "lowshelf"; lowShelf.frequency.value = 200; lowShelf.gain.value = eq.low;
    const midPeak = ctx.createBiquadFilter();
    midPeak.type = "peaking"; midPeak.frequency.value = 1000; midPeak.Q.value = 1; midPeak.gain.value = eq.mid;
    const highShelf = ctx.createBiquadFilter();
    highShelf.type = "highshelf"; highShelf.frequency.value = 4000; highShelf.gain.value = eq.high;
    // chain: input -> lowShelf -> midPeak -> highShelf -> fxInput (reuse as eqOutput)
    input.connect(lowShelf);
    lowShelf.connect(midPeak);
    midPeak.connect(highShelf);
    // store EQ output as the FX input point
    const eqOutput = highShelf;
    nodes.eq = { low: lowShelf, mid: midPeak, high: highShelf };
    // effects now connect from eqOutput instead of input
    // We'll use eqOutput as the source for FX connections
    // But the existing code connects input -> effects. Let me redirect.
    // Actually, let me just store eqOutput and have FX connect from it.
    // For simplicity, reassign: the FX input point is now eqOutput
    // But the code below uses `input`. Let me create a variable for the FX input.
    const fxInputPoint = eqOutput;
    const amt = track.fxAmount || {};
    // Dry signal: input -> EQ -> masterGain
    if (!nodes._dryConnected) {
      eqOutput.connect(this.masterGain);
      nodes._dryConnected = true;
    }

    // Distortion
    if (!nodes.distortion) {
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i / 128) - 1;
        curve[i] = (Math.PI + 2) * x / (Math.PI + 2 * Math.abs(x));
      }
      shaper.curve = curve; shaper.oversample = "2x";
      const distGain = ctx.createGain();
      distGain.gain.value = track.fx.distortion ? (0.3 + (amt.distortion || 0.6) * 0.6) : 0;
      fxInputPoint.connect(shaper).connect(distGain).connect(this.masterGain);
      nodes.distortion = { shaper, gain: distGain };
    } else {
      nodes.distortion.gain.gain.value = track.fx.distortion ? (0.3 + (amt.distortion || 0.6) * 0.6) : 0;
      // reconnect if needed (should already be connected)
    }

    // Chorus
    if (!nodes.chorus) {
      const chorusDelay = ctx.createDelay(0.05); chorusDelay.delayTime.value = 0.01 + (amt.chorus || 0.5) * 0.02;
      const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 1.0 + (amt.chorus || 0.5) * 1.5;
      const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.001 + (amt.chorus || 0.5) * 0.003;
      lfo.connect(lfoGain).connect(chorusDelay.delayTime); lfo.start();
      const chorusGain = ctx.createGain(); chorusGain.gain.value = track.fx.chorus ? (0.3 + (amt.chorus || 0.5) * 0.4) : 0;
      fxInputPoint.connect(chorusDelay).connect(chorusGain).connect(this.masterGain);
      nodes.chorus = { delay: chorusDelay, lfo, lfoGain, gain: chorusGain };
    } else {
      nodes.chorus.gain.gain.value = track.fx.chorus ? (0.3 + (amt.chorus || 0.5) * 0.4) : 0;
    }

    // Delay
    if (!nodes.delay) {
      const delay = ctx.createDelay(0.5); delay.delayTime.value = 0.2 + (amt.delay || 0.35) * 0.2;
      const delayGain = ctx.createGain(); delayGain.gain.value = track.fx.delay ? (0.2 + (amt.delay || 0.35) * 0.3) : 0;
      const feedback = ctx.createGain(); feedback.gain.value = 0.2 + (amt.delay || 0.35) * 0.4;
      fxInputPoint.connect(delay);
      delay.connect(delayGain).connect(this.masterGain);
      delay.connect(feedback).connect(delay);
      nodes.delay = { delay, gain: delayGain, feedback };
    } else {
      nodes.delay.gain.gain.value = track.fx.delay ? (0.2 + (amt.delay || 0.35) * 0.3) : 0;
    }

    // Reverb
    if (!nodes.reverb) {
      const send = ctx.createGain(); send.gain.value = track.fx.reverb ? (0.1 + (amt.reverb || 0.3) * 0.25) : 0;
      const convolver = ctx.createConvolver();
      const irLen = ctx.sampleRate * (1 + (amt.reverb || 0.3) * 2);
      const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 1.5 + (amt.reverb || 0.3));
      }
      convolver.buffer = ir;
      const wet = ctx.createGain(); wet.gain.value = track.fx.reverb ? (0.08 + (amt.reverb || 0.3) * 0.2) : 0;
      fxInputPoint.connect(send).connect(convolver).connect(wet).connect(this.masterGain);
      nodes.reverb = { send, convolver, wet };
    } else {
      nodes.reverb.send.gain.value = track.fx.reverb ? (0.1 + (amt.reverb || 0.3) * 0.25) : 0;
      nodes.reverb.wet.gain.value = track.fx.reverb ? (0.08 + (amt.reverb || 0.3) * 0.2) : 0;
    }

    // Dry signal always (only connect once)
    if (!nodes._dryConnected) {
      input.connect(this.masterGain);
      nodes._dryConnected = true;
    }
    return input;
  }
  /* ---------- mix ---------- */
  anySolo() { return this.tracks.some((t) => t.solo); }
  trackAudible(track) {
    // instant mute/solo takes priority
    if (track.mutedInstant) return false;
    if (this.tracks.some((t) => t.soloInstant)) return !!track.soloInstant;
    if (track.muted) return false;
    if (this.anySolo()) return !!track.solo;
    return true;
  }
  applyMix() {
    const ctx = getAudioContext();
    if (this.masterGain) this.masterGain.gain.value = this.masterVolume;
    this.tracks.forEach((t) => {
      if (t.gain) t.gain.gain.value = this.trackAudible(t) ? t.volume : 0;
      if (t.panner) {
        try { t.panner.pan.setValueAtTime(t.pan, ctx.currentTime); } catch (e) { t.panner.pan.value = t.pan; }
      }
    });
  }

  /* ---------- recording ---------- */
  async startRecording(index) {
    const track = this.tracks[index];
    if (!track || track.recording) return;
    if (this.recordState !== "idle") { toast("Ya hay una grabación en curso"); return; }

    const isPlaying = this.playingAll || this.tracks.some((t) => t.playing);

    // Request mic access FIRST (before any timing) so we don't lose the loop boundary
    this.recordState = "arming";
    track.armed = true;
    this.refreshUI();

    let stream;
    try {
      // On iOS, autoGainControl helps with low mic volume
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const constraints = isIOS
        ? { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } }
        : { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } };
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      toast("Micrófono no disponible");
      this.recordState = "idle";
      track.armed = false;
      this.refreshUI();
      return;
    }
    track.stream = stream;

    // Start clock if not running
    if (!this.metroRunning) this.startClock();

    // auto-enable metronome audio for recording
    if (!this.metronomeAudible) {
      this.metroAutoEnabled = true;
      this.metronomeAudible = true;
      this._scheduleMetro();
    } else {
      this.metroAutoEnabled = false;
    }

    const barDur = this.barDuration();
    const now = getAudioContext().currentTime;

    if (isPlaying) {
      // No count-in: wait for next loop boundary, then record immediately
      let recordingStart;
      if (now < this.loopStart) {
        recordingStart = this.loopStart;
      } else {
        const elapsed = now - this.loopStart;
        const n = Math.max(1, Math.ceil(elapsed / this.loopDuration));
        recordingStart = this.loopStart + n * this.loopDuration;
      }
      const waitMs = Math.max(0, (recordingStart - getAudioContext().currentTime) * 1000);
      if (waitMs > 30) {
        toast("Esperando al inicio del loop…");
        await new Promise((r) => setTimeout(r, waitMs));
        if (this.recordState !== "arming") {
          try { stream.getTracks().forEach((tr) => tr.stop()); } catch (e) {}
          track.stream = null; track.armed = false;
          if (this.metroAutoEnabled) {
            this.metronomeAudible = false;
            this.metroAutoEnabled = false;
            try { this._metroNodes.forEach((n) => { try { n.stop(); } catch (e) {} }); } catch (e) {}
            this._metroNodes = [];
          }
          this.recordState = "idle";
          this.refreshUI();
          return;
        }
      }
      this._startCapture(track, index, stream, recordingStart, true);
    } else {
      // Count-in from stopped state
      const effectiveCountIn = this.countInBars;
      if (effectiveCountIn > 0) {
        this.recordState = "countin";
        this.countInRemaining = effectiveCountIn;
        this.refreshUI();

        let countStart;
        if (this.metroRunning && this.loopStart > 0) {
          countStart = Math.ceil((now - this.metroStart) / barDur) * barDur + this.metroStart;
        } else {
          countStart = this.metroStart;
        }
        const recordingStart = countStart + effectiveCountIn * barDur;
        const countInMs = (recordingStart - now) * 1000;

        for (let b = 0; b < effectiveCountIn; b++) {
          const t = countStart + b * barDur - now;
          setTimeout(() => { this.countInRemaining = effectiveCountIn - b - 1; this.refreshUI(); }, Math.max(0, t * 1000));
        }

        setTimeout(() => {
          if (this.recordState !== "countin") {
            try { stream.getTracks().forEach((tr) => tr.stop()); } catch (e) {}
            track.stream = null; track.armed = false;
            if (this.metroAutoEnabled) {
              this.metronomeAudible = false;
              this.metroAutoEnabled = false;
              try { this._metroNodes.forEach((n) => { try { n.stop(); } catch (e) {} }); } catch (e) {}
              this._metroNodes = [];
            }
            this.recordState = "idle";
            this.refreshUI();
            return;
          }
          this._startCapture(track, index, stream, recordingStart, false);
        }, Math.max(0, countInMs));
      } else {
        // No count-in: start at next loop boundary
        let recordingStart;
        if (this.loopStart > 0) {
          if (now < this.loopStart) {
            recordingStart = this.loopStart;
          } else {
            const elapsed = now - this.loopStart;
            const n = Math.max(1, Math.ceil(elapsed / this.loopDuration));
            recordingStart = this.loopStart + n * this.loopDuration;
          }
        } else {
          recordingStart = now + 0.1;
        }
        this._startCapture(track, index, stream, recordingStart, false);
      }
    }
  }

  _startCapture(track, index, stream, recordingStart, isPlaying) {
    track.chunks = [];
    track.pendingStop = false;
    track.recording = true;
    track.armed = false;
    this.recordingTrack = index;
    this.recordState = "recording";
    if (!isPlaying) this.loopStart = recordingStart;
    // input level meter
    try {
      const ctx = getAudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const src = ctx.createMediaStreamSource(stream);
      src.connect(analyser);
      this.inputAnalyser = analyser;
      this._levelMeterRAF = requestAnimationFrame(() => this._updateLevelMeter());
    } catch (e) {}
    this.refreshUI();

    const delay = Math.max(0, (recordingStart - getAudioContext().currentTime) * 1000);
    setTimeout(() => {
      if (track.pendingStop) {
        track.pendingStop = false; track.recording = false;
        this.recordingTrack = null; this.recordState = "idle";
        try { stream.getTracks().forEach((tr) => tr.stop()); } catch (e) {}
        track.stream = null; this.refreshUI(); return;
      }
      try {
        const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus"
          : (MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
          : (MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : ""));
        const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        track.mediaRecorder = mr;
        mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) track.chunks.push(e.data); };
        mr.onstop = async () => {
          const blob = new Blob(track.chunks, { type: mr.mimeType || "audio/webm" });
          track.chunks = []; track.mediaRecorder = null;
          if (track.stream) { try { track.stream.getTracks().forEach((tr) => tr.stop()); } catch (e) {} }
          track.stream = null;
          // cleanup level meter
          if (this._levelMeterRAF) { cancelAnimationFrame(this._levelMeterRAF); this._levelMeterRAF = null; }
          this.inputAnalyser = null;
          const lm = this.container?.querySelector("#lpLevelMeter");
          if (lm) lm.style.width = "0%";
          this.recordState = "processing";
          this.refreshUI();
          try {
            const ctx = getAudioContext();
            const ab = await ctx.decodeAudioData(await blob.arrayBuffer());
            const trackLoopDur = this.loopDuration * (track.loopMultiplier || 1);
            const loopDur = trackLoopDur;
            const sr = ab.sampleRate;
            // Convert to mono (mix all channels) to fix panning issues
            const monoLen = ab.length;
            const mono = ctx.createBuffer(1, monoLen, sr);
            const monoData = mono.getChannelData(0);
            for (let i = 0; i < monoLen; i++) {
              let sum = 0;
              for (let c = 0; c < ab.numberOfChannels; c++) sum += ab.getChannelData(c)[i];
              // Boost gain for iOS low mic volume (1.5x boost with soft clip)
              const raw = sum / ab.numberOfChannels;
              const boosted = raw * 1.5;
              monoData[i] = Math.max(-0.95, Math.min(0.95, boosted));
            }
            // Detect and trim leading silence (latency compensation)
            const threshold = 0.005;
            let firstSample = 0;
            for (let i = 0; i < monoLen; i++) {
              if (Math.abs(monoData[i]) > threshold) { firstSample = i; break; }
            }
            // Snap leading silence trim to nearest beat
            const spb = this.spb();
            const firstBeatSample = Math.round(firstSample / (sr * spb)) * (sr * spb);
            // apply manual latency compensation
            const compSamples = Math.round((this.latencyComp / 1000) * sr);
            let adjustedStart = Math.max(0, firstBeatSample + compSamples);
            // Safety: don't trim more than 25% of the audio
            const maxTrim = Math.floor(monoLen * 0.25);
            if (adjustedStart > maxTrim) adjustedStart = 0;
            // Safety: ensure at least 100ms of audio remains
            if (monoLen - adjustedStart < sr * 0.1) adjustedStart = 0;
            const trimStartSec = adjustedStart / sr;
            // Build output buffer (mono), trimmed to loopDur
            const outLen = Math.min(monoLen - adjustedStart, Math.floor(sr * loopDur));
            const out = ctx.createBuffer(1, Math.max(1, outLen), sr);
            const dst = out.getChannelData(0);
            for (let i = 0; i < outLen; i++) dst[i] = monoData[adjustedStart + i];
            // Store trim info
            track.undoStack.push(track.buffer); // push even if null (empty state)
            track.buffer = out;
            track.trimStart = 0;
            track.trimEnd = out.duration;
            track.offset = 0;
            track.rebuildRendered(this.loopDuration, sr);
            track.invalidatePeaks();
          } catch (e) {
            console.error("decode error", e);
            toast("Error decodificando audio");
          }
          track.recording = false;
          this.recordingTrack = null;
          this.recordState = "idle";
          // auto-disable metronome if it was auto-enabled for recording
          if (this.metroAutoEnabled) {
            this.metronomeAudible = false;
            this.metroAutoEnabled = false;
            try { this._metroNodes.forEach((n) => { try { n.stop(); } catch (e) {} }); } catch (e) {}
            this._metroNodes = [];
          }
          this.refreshUI();
          // auto-play the recorded track
          setTimeout(() => { this.playTrack(index); }, 100);
        };
        track.recordStartCtx = getAudioContext().currentTime;
        mr.start();
      } catch (e) {
        console.error(e);
        track.recording = false; this.recordingTrack = null; this.recordState = "idle";
        try { stream.getTracks().forEach((tr) => tr.stop()); } catch (err) {}
        track.stream = null; this.refreshUI();
      }
    }, delay);
  }

  stopRecording(index) {
    const track = this.tracks[index];
    if (!track || !track.recording) return;
    if (track.mediaRecorder) {
      // quantize stop to next bar boundary
      const stopAt = this.nextBarTime();
      const delay = Math.max(0, (stopAt - getAudioContext().currentTime) * 1000);
      setTimeout(() => {
        try { track.mediaRecorder.stop(); } catch (e) {}
      }, delay);
      track.pendingStop = true;
    } else {
      track.pendingStop = true;
    }
    track.recording = false;
    this.refreshUI();
  }

  toggleRecording(index) {
    const track = this.tracks[index];
    if (!track) return;
    if (track.recording) this.stopRecording(index);
    else this.startRecording(index);
  }

  cancelRecording() {
    if (this.recordState === "idle") return;
    const idx = this.recordingTrack;
    if (idx !== null && this.tracks[idx]) {
      const track = this.tracks[idx];
      track.pendingStop = true;
      if (track.mediaRecorder) { try { track.mediaRecorder.stop(); } catch (e) {} }
      track.recording = false; track.armed = false;
      if (track.stream) { try { track.stream.getTracks().forEach((tr) => tr.stop()); } catch (e) {} track.stream = null; }
    }
    this.recordState = "idle";
    this.recordingTrack = null;
    this.refreshUI();
  }

  /* ---------- playback ---------- */
  playTrack(index) {
    const track = this.tracks[index];
    if (!track || !track.buffer) { console.warn("playTrack: no track or buffer", index); return; }
    if (!this.metroRunning) this.startClock();
    this.stopTrack(index);
    try { track.rebuildRendered(this.loopDuration, track.buffer.sampleRate); } catch (e) { console.error("rebuildRendered error", e); }
    const buf = track.rendered || track.buffer;
    if (!buf || buf.length < 100) { console.warn("playTrack: buffer too short", buf ? buf.length : 0); return; }
    const ctx = getAudioContext();
    resumeContext(ctx);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = this.playbackRate;
    const gain = ctx.createGain();
    gain.gain.value = this.trackAudible(track) ? track.volume : 0;
    const panner = ctx.createStereoPanner();
    try { panner.pan.setValueAtTime(track.pan, ctx.currentTime); } catch (e) { panner.pan.value = track.pan; }
    const fxInput = this.buildTrackChain(ctx, track);
    src.connect(gain).connect(panner).connect(fxInput);
    track.source = src; track.gain = gain; track.panner = panner; track.fxInput = fxInput;
    // wait for next loop boundary so playback starts synchronized
    let startAt;
    const now = getAudioContext().currentTime;
    if (now < this.loopStart) {
      startAt = this.loopStart;
    } else {
      const elapsed = now - this.loopStart;
      const n = Math.max(1, Math.ceil(elapsed / this.loopDuration));
      startAt = this.loopStart + n * this.loopDuration;
    }
    if (startAt <= ctx.currentTime) startAt = ctx.currentTime + 0.05;
    try { src.start(startAt); } catch (e) { console.error("src.start error", e); try { src.start(); } catch (err) { console.error("src.start fallback error", err); } }
    track.playing = true;
    this.refreshUI();
  }
  stopTrack(index) {
    const track = this.tracks[index];
    if (!track) return;
    if (track.source) {
      try { track.source.stop(); } catch (e) {}
      try { track.source.disconnect(); } catch (e) {}
      track.source = null; track.gain = null; track.panner = null;
    }
    track.playing = false;
    this.refreshUI();
  }
  playAll() {
    if (!this.metroRunning) this.startClock();
    this.tracks.forEach((t, i) => { if (t.buffer) this.playTrack(i); });
    this.playingAll = true;
    this.refreshUI();
  }
  stopAll() {
    this.tracks.forEach((t, i) => this.stopTrack(i));
    this.stopMetronome();
    this.playingAll = false;
    this.refreshUI();
  }

  /* ---------- track ops ---------- */
  _scheduleMixAtLoopBoundary() {
    if (this._mixTimer) return; // already scheduled
    // if loop not running, apply immediately
    if (!this.metroRunning || this.loopStart <= 0) {
      this.applyMix();
      return;
    }
    const now = getAudioContext().currentTime;
    let waitMs = 0;
    if (now < this.loopStart) waitMs = (this.loopStart - now) * 1000;
    else {
      const elapsed = now - this.loopStart;
      const n = Math.max(1, Math.ceil(elapsed / this.loopDuration));
      waitMs = (this.loopStart + n * this.loopDuration - now) * 1000;
    }
    this._mixTimer = setTimeout(() => {
      this._mixTimer = null;
      this.applyMix();
    }, Math.max(0, waitMs));
  }
  muteTrack(i) {
    const t = this.tracks[i]; if (!t) return;
    t.muted = !t.muted;
    // update visual immediately
    this.refreshUI();
    // apply audio change at next loop boundary
    this._scheduleMixAtLoopBoundary();
  }
  soloTrack(i) {
    const t = this.tracks[i]; if (!t) return;
    t.solo = !t.solo;
    this.refreshUI();
    this._scheduleMixAtLoopBoundary();
  }
  muteInstantTrack(i) {
    const t = this.tracks[i]; if (!t) return;
    t.mutedInstant = !t.mutedInstant;
    this.applyMix();
    this.refreshUI();
  }
  soloInstantTrack(i) {
    const t = this.tracks[i]; if (!t) return;
    t.soloInstant = !t.soloInstant;
    this.applyMix();
    this.refreshUI();
  }
  reverseTrack(i) { const t = this.tracks[i]; if (!t || !t.buffer) return; t.reversed = !t.reversed; t.rebuildRendered(this.loopDuration, t.buffer.sampleRate); t.invalidatePeaks(); this._redrawTrackWave(i); }
  deleteTrack(i) {
    const t = this.tracks[i]; if (!t) return;
    this.stopTrack(i);
    if (t.buffer) t.undoStack.push(t.buffer);
    t.clearBuffer(); t.muted = false; t.solo = false; t.mutedInstant = false; t.soloInstant = false; t.volume = 0.85; t.pan = 0; t.reversed = false; t.loopMultiplier = 1;
    this.applyMix(); this.refreshUI();
  }
  undoTrack(i) {
    const t = this.tracks[i]; if (!t || !t.undoStack.length) { toast("Nada que deshacer"); return; }
    const prev = t.undoStack.pop();
    if (t.buffer) t.undoStack.push(t.buffer); // swap
    t.buffer = prev;
    if (t.buffer) {
      t.trimStart = 0; t.trimEnd = t.buffer.duration; t.offset = 0; t.reversed = false;
      t.rebuildRendered(this.loopDuration, t.buffer.sampleRate); t.invalidatePeaks();
    } else {
      t.trimStart = 0; t.trimEnd = 0; t.offset = 0; t.reversed = false;
      t.rendered = null; t.peaks = null;
    }
    t.stopTrack ? null : null;
    if (t.playing) { this.stopTrack(i); }
    this.refreshUI();
    toast("Deshacer");
  }
  trimTrack(i, start, end, snap) {
    const t = this.tracks[i]; if (!t || !t.buffer) return;
    if (snap && t.snapToBeats !== false) {
      const spb = this.spb();
      start = Math.round(start / spb) * spb;
      end = Math.round(end / spb) * spb;
    }
    t.trimStart = Math.max(0, Math.min(start, t.buffer.duration));
    t.trimEnd = Math.max(t.trimStart + 0.01, Math.min(end, t.buffer.duration));
    // ensure trimStart < trimEnd
    if (t.trimStart >= t.trimEnd) t.trimStart = Math.max(0, t.trimEnd - 0.01);
    t.rebuildRendered(this.loopDuration, t.buffer.sampleRate); t.invalidatePeaks();
    this._redrawTrackWave(i);
    // restart playback if playing so audio reacts to trim
    if (t.playing) {
      clearTimeout(t._trimTimer);
      t._trimTimer = setTimeout(() => { this.stopTrack(i); this.playTrack(i); }, 80);
    }
    // update duration display
    const durEl = this.container?.querySelector(`.lp-track[data-track="${i}"] .lp-track__dur`);
    if (durEl) durEl.textContent = `${t.effectiveDuration.toFixed(1)}s / ${t.duration.toFixed(1)}s`;
  }
  setLoopMultiplier(i, mult) {
    const t = this.tracks[i]; if (!t) return;
    t.loopMultiplier = mult;
    // reset trim to full buffer when changing multiplier
    if (t.buffer) {
      t.trimStart = 0;
      t.trimEnd = t.buffer.duration;
      t.offset = 0;
      try { t.rebuildRendered(this.loopDuration, t.buffer.sampleRate); } catch (e) { console.error("rebuildRendered error in setLoopMultiplier", e); }
      t.invalidatePeaks();
    }
    this._redrawTrackWave(i);
    // restart playback if playing so the new loop length takes effect
    if (t.playing) {
      this.stopTrack(i);
      // rebuild again and play
      setTimeout(() => {
        try {
          t.rebuildRendered(this.loopDuration, t.buffer.sampleRate);
          this.playTrack(i);
        } catch (e) {
          console.error("playTrack error after mult change", e);
          toast("Error al reproducir");
        }
      }, 100);
    }
    this.refreshUI();
    toast(`Loop ×${mult} aplicado`);
  }
  moveTrack(i, offset, snap) {
    const t = this.tracks[i]; if (!t || !t.buffer) return;
    if (snap && t.snapToBeats !== false) {
      const spb = this.spb();
      offset = Math.round(offset / spb) * spb;
    }
    t.offset = Math.max(0, Math.min(offset, this.loopDuration - 0.01));
    t.rebuildRendered(this.loopDuration, t.buffer.sampleRate); t.invalidatePeaks();
    this._redrawTrackWave(i);
  }
  setTrackGain(i, v) { const t = this.tracks[i]; if (!t) return; t.volume = Math.max(0, Math.min(1, v)); if (t.gain) t.gain.gain.value = this.trackAudible(t) ? t.volume : 0; }
  setTrackPan(i, v) { const t = this.tracks[i]; if (!t) return; t.pan = Math.max(-1, Math.min(1, v)); if (t.panner) t.panner.pan.value = t.pan; }
  toggleFx(i, fxName) {
    const t = this.tracks[i]; if (!t) return;
    t.fx[fxName] = !t.fx[fxName];
    // Ensure FX nodes exist (create if needed)
    const ctx = getAudioContext();
    if (!t.fxNodes) {
      this.buildTrackChain(ctx, t);
    }
    // Apply instantly via gain adjustment (no playback restart)
    const amt = t.fxAmount || {};
    const nodes = t.fxNodes;
    if (nodes && nodes[fxName]) {
      const n = nodes[fxName];
      if (fxName === "distortion") n.gain.gain.setValueAtTime(t.fx.distortion ? (0.3 + (amt.distortion || 0.6) * 0.6) : 0, ctx.currentTime);
      else if (fxName === "chorus") n.gain.gain.setValueAtTime(t.fx.chorus ? (0.3 + (amt.chorus || 0.5) * 0.4) : 0, ctx.currentTime);
      else if (fxName === "delay") n.gain.gain.setValueAtTime(t.fx.delay ? (0.2 + (amt.delay || 0.35) * 0.3) : 0, ctx.currentTime);
      else if (fxName === "reverb") {
        n.send.gain.setValueAtTime(t.fx.reverb ? (0.1 + (amt.reverb || 0.3) * 0.25) : 0, ctx.currentTime);
        n.wet.gain.setValueAtTime(t.fx.reverb ? (0.08 + (amt.reverb || 0.3) * 0.2) : 0, ctx.currentTime);
      }
    }
    this.refreshUI();
    this._syncFxPopup();
  }
  setEq(i, band, value) {
    const t = this.tracks[i]; if (!t) return;
    if (!t.eq) t.eq = { low: 0, mid: 0, high: 0 };
    t.eq[band] = Math.max(-12, Math.min(12, value));
    // Apply instantly
    const ctx = getAudioContext();
    if (!t.fxNodes) this.buildTrackChain(ctx, t);
    const nodes = t.fxNodes;
    if (nodes && nodes.eq) {
      if (band === "low") nodes.eq.low.gain.value = t.eq.low;
      else if (band === "mid") nodes.eq.mid.gain.value = t.eq.mid;
      else if (band === "high") nodes.eq.high.gain.value = t.eq.high;
    }
  }
  setFxAmount(i, fxName, amount) {
    const t = this.tracks[i]; if (!t) return;
    t.fxAmount[fxName] = Math.max(0, Math.min(1, amount));
    // Ensure FX nodes exist
    const ctx = getAudioContext();
    if (!t.fxNodes) {
      this.buildTrackChain(ctx, t);
    }
    // Apply instantly via gain adjustment
    const amt = t.fxAmount || {};
    const nodes = t.fxNodes;
    if (nodes && nodes[fxName]) {
      const n = nodes[fxName];
      if (fxName === "distortion") n.gain.gain.setValueAtTime(t.fx.distortion ? (0.3 + (amt.distortion || 0.6) * 0.6) : 0, ctx.currentTime);
      else if (fxName === "chorus") n.gain.gain.setValueAtTime(t.fx.chorus ? (0.3 + (amt.chorus || 0.5) * 0.4) : 0, ctx.currentTime);
      else if (fxName === "delay") n.gain.gain.setValueAtTime(t.fx.delay ? (0.2 + (amt.delay || 0.35) * 0.3) : 0, ctx.currentTime);
      else if (fxName === "reverb") {
        n.send.gain.setValueAtTime(t.fx.reverb ? (0.1 + (amt.reverb || 0.3) * 0.25) : 0, ctx.currentTime);
        n.wet.gain.setValueAtTime(t.fx.reverb ? (0.08 + (amt.reverb || 0.3) * 0.2) : 0, ctx.currentTime);
      }
    }
  }
  setFade(i, type, ms) {
    const t = this.tracks[i]; if (!t) return;
    if (type === "in") t.fadeIn = ms / 1000;
    else t.fadeOut = ms / 1000;
    if (t.buffer) { t.rebuildRendered(this.loopDuration, t.buffer.sampleRate); t.invalidatePeaks(); this._redrawTrackWave(i); }
    // restart playback if playing (fade requires buffer rebuild)
    if (t.playing) {
      clearTimeout(t._trimTimer);
      t._trimTimer = setTimeout(() => { this.stopTrack(i); this.playTrack(i); }, 80);
    }
  }
  setFade(i, type, ms) {
    const t = this.tracks[i]; if (!t) return;
    if (type === "in") t.fadeIn = ms / 1000;
    else t.fadeOut = ms / 1000;
    if (t.buffer) { t.rebuildRendered(this.loopDuration, t.buffer.sampleRate); t.invalidatePeaks(); this._redrawTrackWave(i); }
  }
  openFxPopup(i) {
    this.fxTrackIndex = i;
    const backdrop = this.container?.querySelector("#lpFxBackdrop");
    const popup = this.container?.querySelector("#lpFxPopup");
    if (!backdrop || !popup) return;
    const nameEl = this.container.querySelector("#lpFxTrackName");
    if (nameEl) nameEl.textContent = `Efectos — ${this.tracks[i]?.name || "Pista"}`;
    this._syncFxPopup();
    backdrop.hidden = false;
  }
  closeFxPopup() {
    this.fxTrackIndex = -1;
    const backdrop = this.container?.querySelector("#lpFxBackdrop");
    if (backdrop) backdrop.hidden = true;
  }
  _syncFxPopup() {
    if (this.fxTrackIndex < 0) return;
    const t = this.tracks[this.fxTrackIndex];
    if (!t) return;
    const popup = this.container?.querySelector("#lpFxPopup");
    if (!popup) return;
    // sync toggles
    popup.querySelectorAll(".lp-fx-toggle").forEach((btn) => {
      const fx = btn.dataset.fx;
      btn.classList.toggle("active", !!t.fx[fx]);
    });
    // sync amount sliders
    popup.querySelectorAll("[data-fx-amount]").forEach((sl) => {
      const fx = sl.dataset.fxAmount;
      sl.value = Math.round((t.fxAmount[fx] || 0) * 100);
    });
    // sync EQ sliders
    popup.querySelectorAll("[data-fx-eq]").forEach((sl) => {
      const band = sl.dataset.fxEq;
      sl.value = (t.eq && t.eq[band]) || 0;
    });
    popup.querySelectorAll("[data-fx-val]").forEach((sp) => {
      const fx = sp.dataset.fxVal;
      if (fx === "fadein") sp.textContent = Math.round(t.fadeIn * 1000) + "ms";
      else if (fx === "fadeout") sp.textContent = Math.round(t.fadeOut * 1000) + "ms";
      else if (fx.startsWith("eq-")) sp.textContent = ((t.eq && t.eq[fx.replace("eq-","")]) || 0) + "dB";
      else sp.textContent = Math.round((t.fxAmount[fx] || 0) * 100) + "%";
    });
    // sync fade sliders
    const fiSl = popup.querySelector('[data-fx-fade="in"]');
    if (fiSl) fiSl.value = Math.round(t.fadeIn * 1000);
    const foSl = popup.querySelector('[data-fx-fade="out"]');
    if (foSl) foSl.value = Math.round(t.fadeOut * 1000);
  }
  _redrawTrackWave(i) {
    if (!this.container) return;
    const cvs = this.container.querySelector(`#lpWave${i}`);
    const tr = this.tracks[i];
    if (cvs && tr) this._drawWaveform(cvs, tr, i);
  }

  addTrack() {
    if (this.tracks.length >= MAX_TRACKS) { toast("Máximo 8 pistas"); return; }
    this.tracks.push(new LooperTrack(this.tracks.length));
    this.refreshUI();
  }
  removeTrack(i) {
    if (this.tracks.length <= 1) { toast("Mínimo 1 pista"); return; }
    this.stopTrack(i);
    this.tracks.splice(i, 1);
    this.tracks.forEach((t, idx) => { t.id = idx; t.name = `Pista ${idx + 1}`; t.color = TRACK_COLORS[idx % TRACK_COLORS.length]; });
    this.refreshUI();
  }

  /* ---------- export ---------- */
  async exportTrack(i) {
    const t = this.tracks[i]; if (!t || !t.buffer) { toast("Pista vacía"); return; }
    t.rebuildRendered(this.loopDuration, t.buffer.sampleRate);
    const buf = t.rendered || t.buffer;
    const blob = audioBufferToWav(buf);
    downloadBlob(blob, `pista-${i + 1}.wav`);
    toast("Pista exportada");
  }
  async exportMix() {
    const audible = this.tracks.filter((t) => t.buffer && this.trackAudible(t));
    if (!audible.length) { toast("No hay pistas para exportar"); return; }
    audible.forEach((t) => t.rebuildRendered(this.loopDuration, t.buffer.sampleRate));
    const ctx = getAudioContext();
    const off = new OfflineAudioContext(2, Math.ceil(ctx.sampleRate * this.loopDuration), ctx.sampleRate);
    audible.forEach((t) => {
      const buf = t.rendered || t.buffer;
      const src = off.createBufferSource(); src.buffer = buf;
      const gain = off.createGain(); gain.gain.value = t.volume;
      const pan = off.createStereoPanner(); pan.pan.value = t.pan;
      src.connect(gain).connect(pan).connect(off.destination);
      try { src.start(0); } catch (e) {}
    });
    const rendered = await off.startRendering();
    const blob = audioBufferToWav(rendered);
    downloadBlob(blob, "looper-mix.wav");
    toast("Mezcla exportada");
  }

  /* ---------- IndexedDB ---------- */
  async saveSession(name) {
    try {
      const db = await openDB();
      const tx = db.transaction("sessions", "readwrite");
      const store = tx.objectStore("sessions");
      const tracks = this.tracks.map((tr) => {
        let wavBlob = null;
        if (tr.buffer) { tr.rebuildRendered(this.loopDuration, tr.buffer.sampleRate); wavBlob = audioBufferToWav(tr.rendered || tr.buffer); }
        return { index: tr.id, name: tr.name, color: tr.color, muted: tr.muted, solo: tr.solo, volume: tr.volume, pan: tr.pan, reversed: tr.reversed, trimStart: tr.trimStart, trimEnd: tr.trimEnd, offset: tr.offset, wavBlob };
      });
      store.add({ name: name || `Sesión ${new Date().toLocaleString()}`, bpm: this.bpm, beatsPerBar: this.beatsPerBar, bars: this.bars, trackCount: this.tracks.length, tracks, created: Date.now() });
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
      db.close();
      toast("Sesión guardada");
      await this.refreshSessions();
    } catch (e) { console.error(e); toast("Error guardando sesión"); }
  }
  async listSessions() {
    try {
      const db = await openDB();
      const tx = db.transaction("sessions", "readonly");
      const store = tx.objectStore("sessions");
      const req = store.getAll();
      const rows = await new Promise((res, rej) => { req.onsuccess = () => res(req.result || []); req.onerror = () => rej(req.error); });
      db.close();
      return rows;
    } catch (e) { return []; }
  }
  async loadSession(id) {
    try {
      const db = await openDB();
      const tx = db.transaction("sessions", "readonly");
      const store = tx.objectStore("sessions");
      const req = store.get(id);
      const session = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
      db.close();
      if (!session) { toast("Sesión no encontrada"); return; }
      this.stopAll();
      this.bpm = session.bpm || 120;
      this.beatsPerBar = session.beatsPerBar || 4;
      this.bars = session.bars || 4;
      this.recomputeLoop();
      this.tracks = [];
      for (let i = 0; i < (session.trackCount || (session.tracks || []).length || DEFAULT_TRACKS); i++) this.tracks.push(new LooperTrack(i));
      const ctx = getAudioContext();
      for (const td of (session.tracks || [])) {
        const track = this.tracks[td.index];
        if (!track) continue;
        track.name = td.name || track.name;
        track.color = td.color || track.color;
        track.muted = !!td.muted; track.solo = !!td.solo;
        track.volume = (typeof td.volume === "number") ? td.volume : 0.85;
        track.pan = (typeof td.pan === "number") ? td.pan : 0;
        track.reversed = !!td.reversed;
        track.trimStart = td.trimStart || 0;
        track.trimEnd = td.trimEnd || 0;
        track.offset = td.offset || 0;
        if (td.wavBlob) {
          try {
            const ab = await ctx.decodeAudioData(await td.wavBlob.arrayBuffer());
            track.buffer = ab;
            track.trimEnd = track.trimEnd || ab.duration;
            track.rebuildRendered(this.loopDuration, ab.sampleRate);
            track.invalidatePeaks();
          } catch (e) { console.error("decode session track", e); }
        }
      }
      this.refreshUI();
      toast("Sesión cargada");
    } catch (e) { console.error(e); toast("Error cargando sesión"); }
  }

  /* ---------- UI ---------- */
  setContainer(container) { this.container = container; }

  refreshUI() {
    if (!this.container) return;
    const bpmSlider = this.container.querySelector("#lpBpm");
    if (bpmSlider) bpmSlider.value = this.bpm;
    const bpmVal = this.container.querySelector("#lpBpmVal");
    if (bpmVal) bpmVal.textContent = this.bpm;
    const barsSel = this.container.querySelector("#lpBars");
    if (barsSel) barsSel.value = this.bars;
    const beatEl = this.container.querySelector("#lpBeat");
    if (beatEl) beatEl.textContent = Array.from({ length: this.beatsPerBar }, (_, i) => (i === this.currentBeat ? "●" : "○")).join(" ");
    const barEl = this.container.querySelector("#lpBar");
    if (barEl) barEl.textContent = `Compás ${this.currentBar + 1}/${this.bars}`;
    const recInd = this.container.querySelector("#lpRecInd");
    if (recInd) recInd.hidden = !(this.recordState === "recording" || this.recordState === "countin");
    const metroBtn = this.container.querySelector("#lpMetroToggle");
    if (metroBtn) metroBtn.classList.toggle("active", this.metronomeAudible);
    const recText = this.container.querySelector("#lpRecText");
    if (recText) {
      if (this.recordState === "countin") recText.textContent = `Count-in… ${this.countInRemaining}`;
      else if (this.recordState === "recording") recText.textContent = "● Grabando…";
      else if (this.recordState === "processing") recText.textContent = "Procesando…";
      else recText.textContent = "";
    }
    const masterVol = this.container.querySelector("#lpMasterVol");
    if (masterVol) masterVol.value = Math.round(this.masterVolume * 100);
    const tracksWrap = this.container.querySelector("#lpTracks");
    if (tracksWrap) {
      tracksWrap.innerHTML = this.tracks.map((tr, i) => this._trackHTML(tr, i)).join("");
      // draw waveforms
      this.tracks.forEach((tr, i) => {
        const cvs = tracksWrap.querySelector(`#lpWave${i}`);
        if (cvs) this._drawWaveform(cvs, tr, i);
      });
    }
    // update transport buttons
    const playAllBtn = this.container.querySelector("#lpPlayAll");
    if (playAllBtn) playAllBtn.classList.toggle("active", this.playingAll);
    const recCancel = this.container.querySelector("#lpCancelRec");
    if (recCancel) recCancel.hidden = (this.recordState === "idle");
  }

  _trackHTML(tr, i) {
    const dur = tr.buffer ? tr.buffer.duration.toFixed(1) : "—";
    const effDur = tr.buffer ? tr.effectiveDuration.toFixed(1) : "—";
    return `
      <div class="lp-track ${tr.recording ? "is-rec" : ""} ${tr.playing ? "is-play" : ""}" data-track="${i}" style="--tc:${tr.color}">
        <div class="lp-track__head">
          <span class="lp-track__color"></span>
          <input class="lp-track__name" data-i="${i}" data-act="rename" value="${escapeHtml(tr.name)}" />
          <span class="lp-track__dur">${effDur}s / ${dur}s</span>
          ${tr.loopMultiplier !== 1 ? `<span class="lp-track__mult-badge">×${tr.loopMultiplier}</span>` : ''}
          <div class="lp-track__actions">
            <button class="lp-btn lp-rec ${tr.recording ? "active" : ""} ${tr.armed ? "armed" : ""}" data-act="rec" data-i="${i}" title="Grabar (R)">●</button>
            <button class="lp-btn lp-play ${tr.playing ? "active" : ""}" data-act="play" data-i="${i}" title="Reproducir">▶</button>
            <button class="lp-btn" data-act="stop" data-i="${i}" title="Detener">■</button>
            <button class="lp-btn lp-mute ${tr.muted ? "active" : ""}" data-act="mute" data-i="${i}" title="Mute (M)">M</button>
            <button class="lp-btn lp-solo ${tr.solo ? "active" : ""}" data-act="solo" data-i="${i}" title="Solo (S)">S</button>
            <button class="lp-btn lp-mute-instant ${tr.mutedInstant ? "active" : ""}" data-act="mute-instant" data-i="${i}" title="Mute instantáneo (corte inmediato)">M⚡</button>
            <button class="lp-btn lp-solo-instant ${tr.soloInstant ? "active" : ""}" data-act="solo-instant" data-i="${i}" title="Solo instantáneo (corte inmediato)">S⚡</button>
            <button class="lp-btn lp-rev ${tr.reversed ? "active" : ""}" data-act="rev" data-i="${i}" title="Reverse">↔</button>
            <button class="lp-btn lp-fx-btn" data-act="fx-open" data-i="${i}" title="Efectos">FX</button>
            <button class="lp-btn lp-undo" data-act="undo" data-i="${i}" title="Deshacer">↩</button>
            <button class="lp-btn lp-del" data-act="del" data-i="${i}" title="Eliminar">✕</button>
          </div>
        </div>
        <div class="lp-track__wave-wrap">
          <canvas id="lpWave${i}" class="lp-wave" width="600" height="64" data-i="${i}"></canvas>
          <div class="lp-playhead" style="left:0%"></div>
        </div>
        <div class="lp-track__controls">
          <label class="lp-ctrl">Vol <input type="range" min="0" max="100" value="${Math.round(tr.volume * 100)}" data-act="vol" data-i="${i}" /></label>
          <label class="lp-ctrl">Pan <input type="range" min="-100" max="100" value="${Math.round(tr.pan * 100)}" data-act="pan" data-i="${i}" /></label>
          <label class="lp-ctrl">Trim L <input type="range" min="0" max="1000" value="${Math.round((tr.trimStart / Math.max(0.01, tr.duration || 1)) * 1000)}" data-act="trimL" data-i="${i}" /></label>
          <label class="lp-ctrl">Trim R <input type="range" min="0" max="1000" value="${Math.round(((tr.trimEnd > 0 ? tr.trimEnd : (tr.duration || 1)) / Math.max(0.01, tr.duration || 1)) * 1000)}" data-act="trimR" data-i="${i}" /></label>
          <label class="lp-ctrl">Offset <input type="range" min="0" max="1000" value="${Math.round((tr.offset / Math.max(0.01, this.loopDuration)) * 1000)}" data-act="offset" data-i="${i}" /></label>
          <label class="lp-ctrl">Loop <select data-act="mult" data-i="${i}" style="width:60px">
            <option value="0.25" ${tr.loopMultiplier===0.25?'selected':''}>×¼</option>
            <option value="0.5" ${tr.loopMultiplier===0.5?'selected':''}>×½</option>
            <option value="1" ${tr.loopMultiplier===1?'selected':''}>×1</option>
            <option value="2" ${tr.loopMultiplier===2?'selected':''}>×2</option>
          </select></label>
          <button class="lp-btn lp-sm lp-export" data-act="export" data-i="${i}" title="Exportar pista">⬇</button>
        </div>
      </div>
    `;
  }

  _drawWaveform(cvs, tr, i) {
    try {
    const ctx = cvs.getContext("2d");
    const w = cvs.width, h = cvs.height;
    ctx.clearRect(0, 0, w, h);
    // background
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    ctx.fillRect(0, 0, w, h);
    if (!tr.buffer) {
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.font = "12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Vac\u00eda \u2014 pulsa \u25CF para grabar", w / 2, h / 2 + 4);
      return;
    }
    const buf = tr.buffer;
    const dur = buf.duration;
    const trimStart = tr.trimStart;
    const trimEnd = tr.trimEnd > 0 ? tr.trimEnd : dur;
    const trimDur = Math.max(0.01, trimEnd - trimStart);
    const color = tr.color;
    const mult = tr.loopMultiplier || 1;
    const mid = h / 2;
    const srcData = buf.getChannelData(0);
    const sr = buf.sampleRate;

    // For x2: draw two stacked rows (top = first half, bottom = second half)
    if (mult === 2) {
      const halfH = h / 2;
      const peaks = computePeaks(buf, w * 2); // 2x resolution for 2x buffer
      const peakCount = peaks.length / 2;
      const halfPeaks = Math.floor(peakCount / 2);
      // Top row: first half of audio
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x < w; x++) {
        const srcX = Math.min(halfPeaks - 1, Math.floor(x * halfPeaks / w));
        const mn = peaks[srcX * 2];
        const mx = peaks[srcX * 2 + 1];
        const rowMid = halfH / 2;
        const y1 = rowMid + mn * (halfH / 2) * 0.9;
        const y2 = rowMid + mx * (halfH / 2) * 0.9;
        ctx.moveTo(x + 0.5, y1);
        ctx.lineTo(x + 0.5, y2);
      }
      ctx.stroke();
      // Bottom row: second half of audio
      ctx.beginPath();
      for (let x = 0; x < w; x++) {
        const srcX = Math.min(peakCount - 1, halfPeaks + Math.floor(x * halfPeaks / w));
        const mn = peaks[srcX * 2];
        const mx = peaks[srcX * 2 + 1];
        const rowMid = halfH + halfH / 2;
        const y1 = rowMid + mn * (halfH / 2) * 0.9;
        const y2 = rowMid + mx * (halfH / 2) * 0.9;
        ctx.moveTo(x + 0.5, y1);
        ctx.lineTo(x + 0.5, y2);
      }
      ctx.stroke();
      // Separator line
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, halfH); ctx.lineTo(w, halfH);
      ctx.stroke();
      // Labels
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "bold 9px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("1", 4, 10);
      ctx.fillText("2", 4, halfH + 10);
      // Multiplier badge
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(w - 42, 4, 38, 16);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px Inter, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("\u00D72", w - 6, 16);
      // Trim handles on both rows
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(0, h);
      ctx.moveTo(w, 0); ctx.lineTo(w, h);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fillRect(-4, halfH/2 - 8, 8, 16);
      ctx.fillRect(w - 4, halfH/2 - 8, 8, 16);
      ctx.fillRect(-4, halfH + halfH/2 - 8, 8, 16);
      ctx.fillRect(w - 4, halfH + halfH/2 - 8, 8, 16);
      return;
    }

    // For non-x2: use original buffer, show only trimmed portion
    const peaks = new Float32Array(w * 2);
    const startSample = Math.floor(trimStart * sr);
    const endSample = Math.min(srcData.length, Math.floor(trimEnd * sr));
    const trimmedLen = endSample - startSample;
    const step = trimmedLen / w;
    for (let x = 0; x < w; x++) {
      let mn = 1, mx = -1;
      const s0 = startSample + Math.floor(x * step);
      const s1 = Math.min(endSample, startSample + Math.floor((x + 1) * step));
      for (let j = s0; j < s1; j++) {
        const v = srcData[j];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      if (s0 >= s1) { mn = 0; mx = 0; }
      peaks[x * 2] = mn;
      peaks[x * 2 + 1] = mx;
    }

    // For mult < 1: show the waveform repeated to fill the canvas
    const repeats = mult < 1 ? Math.round(1 / mult) : 1;
    if (repeats > 1) {
      // Draw each repeat
      for (let r = 0; r < repeats; r++) {
        const xOffset = (r / repeats) * w;
        const sliceW = Math.floor(w / repeats);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = r === 0 ? 1 : 0.45;
        ctx.beginPath();
        for (let x = 0; x < sliceW; x++) {
          const mn = peaks[x * 2];
          const mx = peaks[x * 2 + 1];
          const y1 = mid + mn * mid * 0.9;
          const y2 = mid + mx * mid * 0.9;
          ctx.moveTo(xOffset + x + 0.5, y1);
          ctx.lineTo(xOffset + x + 0.5, y2);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // Separator lines between repeats
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      for (let r = 1; r < repeats; r++) {
        const x = (r / repeats) * w;
        ctx.beginPath();
        ctx.moveTo(x, 0); ctx.lineTo(x, h);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // Repeat labels
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "bold 8px Inter, sans-serif";
      ctx.textAlign = "center";
      for (let r = 0; r < repeats; r++) {
        const x = (r + 0.5) / repeats * w;
        ctx.fillText((r + 1).toString(), x, h - 3);
      }
    } else {
      // Single waveform (mult === 1)
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x < w; x++) {
        const mn = peaks[x * 2];
        const mx = peaks[x * 2 + 1];
        const y1 = mid + mn * mid * 0.9;
        const y2 = mid + mx * mid * 0.9;
        ctx.moveTo(x + 0.5, y1);
        ctx.lineTo(x + 0.5, y2);
      }
      ctx.stroke();
    }

    // multiplier badge (for non-1)
    if (mult !== 1) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(w - 42, 4, 38, 16);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px Inter, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("\u00D7" + mult, w - 6, 16);
    }
    // trim handles at edges
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(0, h);
    ctx.moveTo(w, 0); ctx.lineTo(w, h);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fillRect(-5, mid - 10, 10, 20);
    ctx.fillRect(w - 5, mid - 10, 10, 20);
    ctx.fillStyle = "#000";
    ctx.font = "bold 9px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("L", 5, mid + 3);
    ctx.fillText("R", w - 5, mid + 3);
    // trim handles at edges
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(0, h);
    ctx.moveTo(w, 0); ctx.lineTo(w, h);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fillRect(-5, mid - 10, 10, 20);
    ctx.fillRect(w - 5, mid - 10, 10, 20);
    ctx.fillStyle = "#000";
    ctx.font = "bold 9px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("L", 5, mid + 3);
    ctx.fillText("R", w - 5, mid + 3);
    // trim handles at edges (0% and 100%)
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(0, h);
    ctx.moveTo(w, 0); ctx.lineTo(w, h);
    ctx.stroke();
    // handle grips
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fillRect(-5, mid - 10, 10, 20);
    ctx.fillRect(w - 5, mid - 10, 10, 20);
    // handle labels
    ctx.fillStyle = "#000";
    ctx.font = "bold 9px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("L", 5, mid + 3);
    ctx.fillText("R", w - 5, mid + 3);
    } catch (e) { console.error("drawWaveform error", e); }
  }

  async refreshSessions() {
    if (!this.container) return;
    const sel = this.container.querySelector("#lpSession");
    if (!sel) return;
    const sessions = await this.listSessions();
    sel.innerHTML = sessions.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
  }
}

const looper = new Looper();

export function renderLooper(container) {
  looper.setContainer(container);
  // ensure master gain exists
  const _ctx = getAudioContext();
  resumeContext(_ctx);
  if (!looper.masterGain) {
    looper.masterCompressor = _ctx.createDynamicsCompressor();
    looper.masterCompressor.threshold.value = -24;
    looper.masterCompressor.knee.value = 12;
    looper.masterCompressor.ratio.value = 4;
    looper.masterCompressor.attack.value = 0.003;
    looper.masterCompressor.release.value = 0.25;
    looper.masterGain = _ctx.createGain();
    looper.masterGain.gain.value = looper.masterVolume;
    looper.masterGain.connect(looper.masterCompressor);
    looper.masterCompressor.connect(_ctx.destination);
  }
  container.innerHTML = `
    <div class="looper">
      <div class="looper__transport">
        <div class="looper__transport-left">
          <button id="lpPlayAll" class="lp-transport-btn lp-play" title="Play/Stop (Space)">▶ Play</button>
          <button id="lpStopAll" class="lp-transport-btn lp-del" title="Stop all">■ Stop</button>
          <button id="lpCancelRec" class="lp-transport-btn lp-rec" hidden title="Cancelar grabación">✕ Cancelar</button>
        </div>
        <div class="looper__transport-mid">
          <div class="lp-metro">
            <label>BPM <input id="lpBpm" type="range" min="40" max="240" value="${looper.bpm}" /><input id="lpBpmNum" type="number" min="40" max="240" value="${looper.bpm}" style="width:52px" /><span id="lpBpmVal">${looper.bpm}</span></label>
            <label>Compás <select id="lpTimeSig">
              <option value="4" ${looper.beatsPerBar===4?'selected':''}>4/4</option>
              <option value="3" ${looper.beatsPerBar===3?'selected':''}>3/4</option>
              <option value="6" ${looper.beatsPerBar===6?'selected':''}>6/8</option>
            </select></label>
            <label>Barras <select id="lpBars">
              <option ${looper.bars===1?'selected':''}>1</option>
              <option ${looper.bars===2?'selected':''}>2</option>
              <option ${looper.bars===4?'selected':''}>4</option>
              <option ${looper.bars===8?'selected':''}>8</option>
              <option ${looper.bars===16?'selected':''}>16</option>
            </select></label>
            <label>Count-in <select id="lpCountIn">
              <option value="0" ${looper.countInBars===0?'selected':''}>0</option>
              <option value="1" ${looper.countInBars===1?'selected':''}>1</option>
              <option value="2" ${looper.countInBars===2?'selected':''}>2</option>
            </select></label>
            <label>Velocidad <select id="lpSpeed">
              <option value="0.5" ${looper.playbackRate===0.5?'selected':''}>×0.5</option>
              <option value="1" ${looper.playbackRate===1?'selected':''}>×1</option>
              <option value="2" ${looper.playbackRate===2?'selected':''}>×2</option>
            </select></label>
            <label>Latencia <input id="lpLatency" type="range" min="-200" max="200" value="${looper.latencyComp}" /><span id="lpLatencyVal">${looper.latencyComp}ms</span></label>
            <label>Metro Vol <input id="lpMetroVol" type="range" min="0" max="100" value="${Math.round(looper.metronomeVolume * 100)}" /><span id="lpMetroVolVal">${Math.round(looper.metronomeVolume * 100)}%</span></label>
            <div class="lp-beat" id="lpBeat">● ○ ○ ○</div>
            <div class="lp-bar" id="lpBar">Compás 1/4</div>
          </div>
        </div>
        <div class="looper__transport-right">
          <button id="lpMetroToggle" class="lp-transport-btn" title="Metrónomo">🔔 Metro</button>
          <button id="lpMonitorToggle" class="lp-transport-btn" title="Monitor de entrada (oírte mientras grabas)">🎧 Monitor</button>
          <button id="lpExport" class="lp-transport-btn" title="Exportar mezcla">⬇ Export</button>
          <button id="lpSave" class="lp-transport-btn" title="Guardar sesión">💾 Guardar</button>
          <select id="lpSession"></select>
          <button id="lpLoad" class="lp-transport-btn" title="Cargar sesión">📂 Cargar</button>
          <button id="lpAddTrack" class="lp-transport-btn" title="Añadir pista">+ Pista</button>
        </div>
      </div>
      <div class="looper__rec-indicator" id="lpRecInd" hidden>
        <span id="lpRecText"></span>
        <div class="lp-level-meter"><div id="lpLevelMeter" class="lp-level-meter__fill"></div></div>
      </div>
      <div id="lpTracks" class="looper__tracks"></div>
      <div class="looper__master">
        <label>Master <input id="lpMasterVol" type="range" min="0" max="100" value="90" /></label>
        <span class="lp-hint">Atajos: Espacio=Play/Stop, R=Grabar, M=Mute, S=Solo, U=Undo</span>
      </div>
      <!-- FX Popup (centered modal) -->
      <div id="lpFxBackdrop" class="lp-fx-backdrop" hidden>
      <div id="lpFxPopup" class="lp-fx-popup">
        <div class="lp-fx-popup__head">
          <span id="lpFxTrackName">Efectos</span>
          <button id="lpFxClose" class="lp-btn lp-sm">✕</button>
        </div>
        <div class="lp-fx-popup__body">
          <div class="lp-fx-row">
            <button class="lp-fx-toggle" data-fx="reverb">R Reverb</button>
            <input type="range" min="0" max="100" value="30" data-fx-amount="reverb" class="lp-fx-slider" />
            <span class="lp-fx-val" data-fx-val="reverb">30%</span>
          </div>
          <div class="lp-fx-row">
            <button class="lp-fx-toggle" data-fx="chorus">C Chorus</button>
            <input type="range" min="0" max="100" value="50" data-fx-amount="chorus" class="lp-fx-slider" />
            <span class="lp-fx-val" data-fx-val="chorus">50%</span>
          </div>
          <div class="lp-fx-row">
            <button class="lp-fx-toggle" data-fx="delay">D Delay</button>
            <input type="range" min="0" max="100" value="35" data-fx-amount="delay" class="lp-fx-slider" />
            <span class="lp-fx-val" data-fx-val="delay">35%</span>
          </div>
          <div class="lp-fx-row">
            <button class="lp-fx-toggle" data-fx="distortion">X Distorsión</button>
            <input type="range" min="0" max="100" value="60" data-fx-amount="distortion" class="lp-fx-slider" />
            <span class="lp-fx-val" data-fx-val="distortion">60%</span>
          </div>
          <div class="lp-fx-row">
            <span class="lp-fx-label">Fade In</span>
            <input type="range" min="0" max="2000" value="0" data-fx-fade="in" class="lp-fx-slider" />
            <span class="lp-fx-val" data-fx-val="fadein">0ms</span>
          </div>
          <div class="lp-fx-row">
            <span class="lp-fx-label">Fade Out</span>
            <input type="range" min="0" max="2000" value="0" data-fx-fade="out" class="lp-fx-slider" />
            <span class="lp-fx-val" data-fx-val="fadeout">0ms</span>
          </div>
          <div class="lp-fx-divider">EQ (dB)</div>
          <div class="lp-fx-row">
            <span class="lp-fx-label">Bass</span>
            <input type="range" min="-12" max="12" value="0" data-fx-eq="low" class="lp-fx-slider" />
            <span class="lp-fx-val" data-fx-val="eq-low">0dB</span>
          </div>
          <div class="lp-fx-row">
            <span class="lp-fx-label">Mid</span>
            <input type="range" min="-12" max="12" value="0" data-fx-eq="mid" class="lp-fx-slider" />
            <span class="lp-fx-val" data-fx-val="eq-mid">0dB</span>
          </div>
          <div class="lp-fx-row">
            <span class="lp-fx-label">Treble</span>
            <input type="range" min="-12" max="12" value="0" data-fx-eq="high" class="lp-fx-slider" />
            <span class="lp-fx-val" data-fx-val="eq-high">0dB</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // time sig
  const tsSel = container.querySelector("#lpTimeSig");
  if (tsSel) {
    tsSel.value = looper.beatsPerBar;
    tsSel.onchange = () => {
      const v = parseInt(tsSel.value, 10);
      looper.beatsPerBar = v;
      looper.recomputeLoop();
      looper.refreshUI();
      looper._saveSettings();
    };
  }
  // bars
  const barsSel = container.querySelector("#lpBars");
  if (barsSel) {
    barsSel.value = looper.bars;
    barsSel.onchange = () => {
      looper.bars = parseInt(barsSel.value, 10) || 4;
      looper.recomputeLoop();
      looper.refreshUI();
      looper._saveSettings();
    };
  }
  const countInSel = container.querySelector("#lpCountIn");
  if (countInSel) {
    countInSel.value = looper.countInBars;
    countInSel.onchange = () => {
      looper.countInBars = parseInt(countInSel.value, 10) || 0;
      looper._saveSettings();
    };
  }
  const speedSel = container.querySelector("#lpSpeed");
  if (speedSel) {
    speedSel.value = looper.playbackRate;
    speedSel.onchange = () => {
      looper.playbackRate = parseFloat(speedSel.value) || 1;
      // update playing tracks
      looper.tracks.forEach((t, i) => {
        if (t.playing && t.source) {
          t.source.playbackRate.value = looper.playbackRate;
        }
      });
      looper._saveSettings();
    };
  }
  const latSlider = container.querySelector("#lpLatency");
  if (latSlider) {
    latSlider.addEventListener("input", (e) => {
      looper.latencyComp = parseInt(e.target.value, 10) || 0;
      const v = container.querySelector("#lpLatencyVal");
      if (v) v.textContent = looper.latencyComp + "ms";
      looper._saveSettings();
    });
  }
  const metroVolSlider = container.querySelector("#lpMetroVol");
  if (metroVolSlider) {
    metroVolSlider.addEventListener("input", (e) => {
      looper.metronomeVolume = parseInt(e.target.value, 10) / 100;
      const v = container.querySelector("#lpMetroVolVal");
      if (v) v.textContent = e.target.value + "%";
      looper._saveSettings();
      // re-schedule metronome with new volume
      if (looper.metronomeAudible && looper.metroRunning) {
        if (looper._metroTimer) { clearTimeout(looper._metroTimer); looper._metroTimer = null; }
        try { looper._metroNodes.forEach((n) => { try { n.stop(); } catch (e) {} }); } catch (e) {}
        looper._metroNodes = [];
        looper._scheduleMetro();
      }
    });
  }
  // bpm
  const bpmSlider = container.querySelector("#lpBpm");
  if (bpmSlider) {
    bpmSlider.addEventListener("input", (e) => {
      looper.bpm = parseInt(e.target.value, 10) || 120;
      const v = container.querySelector("#lpBpmVal");
      if (v) v.textContent = looper.bpm;
      looper.recomputeLoop();
      if (looper.metroRunning) { looper.stopMetronome(); looper.startMetronome(); }
      looper._saveSettings();
    });
  }
  // bpm number input
  const bpmNum = container.querySelector("#lpBpmNum");
  if (bpmNum) {
    bpmNum.addEventListener("change", (e) => {
      const v = parseInt(e.target.value, 10);
      if (isNaN(v) || v < 40 || v > 240) { e.target.value = looper.bpm; return; }
      looper.bpm = v;
      const slider = container.querySelector("#lpBpm");
      if (slider) slider.value = v;
      const val = container.querySelector("#lpBpmVal");
      if (val) val.textContent = v;
      looper.recomputeLoop();
      if (looper.metroRunning) { looper.stopMetronome(); looper.startMetronome(); }
      looper.refreshUI();
      looper._saveSettings();
    });
  }
  // metro toggle
  const metroBtn = container.querySelector("#lpMetroToggle");
  if (metroBtn) {
    metroBtn.onclick = () => {
      looper.toggleMetronome();
      metroBtn.classList.toggle("active", looper.metronomeAudible);
    };
  }
  const monitorBtn = container.querySelector("#lpMonitorToggle");
  if (monitorBtn) {
    monitorBtn.onclick = async () => {
      await looper.toggleMonitoring();
      monitorBtn.classList.toggle("active", looper.monitoring);
    };
  }
  // master vol
  const mv = container.querySelector("#lpMasterVol");
  if (mv) mv.addEventListener("input", (e) => { looper.masterVolume = parseInt(e.target.value, 10) / 100; looper.applyMix(); });

  // event delegation
  container.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]");
    if (btn) {
      const i = parseInt(btn.dataset.i, 10);
      const act = btn.dataset.act;
      if (act === "rec") looper.toggleRecording(i);
      else if (act === "play") looper.playTrack(i);
      else if (act === "fx-rev") looper.toggleFx(i, "reverb");
      else if (act === "fx-cho") looper.toggleFx(i, "chorus");
      else if (act === "fx-del") looper.toggleFx(i, "delay");
      else if (act === "fx-dis") looper.toggleFx(i, "distortion");
      else if (act === "fx-open") looper.openFxPopup(i);
      else if (act === "stop") looper.stopTrack(i);
      else if (act === "mute") looper.muteTrack(i);
      else if (act === "solo") looper.soloTrack(i);
      else if (act === "mute-instant") looper.muteInstantTrack(i);
      else if (act === "solo-instant") looper.soloInstantTrack(i);
      else if (act === "rev") looper.reverseTrack(i);
      else if (act === "undo") looper.undoTrack(i);
      else if (act === "del") looper.deleteTrack(i);
      else if (act === "export") looper.exportTrack(i);
      return;
    }
    if (e.target && e.target.id === "lpPlayAll") {
      if (looper.playingAll) { looper.stopAll(); } else { looper.playAll(); }
    } else if (e.target && e.target.id === "lpStopAll") {
      looper.stopAll();
    } else if (e.target && e.target.id === "lpCancelRec") {
      looper.cancelRecording();
    } else if (e.target && e.target.id === "lpExport") {
      looper.exportMix();
    } else if (e.target && e.target.id === "lpSave") {
      const name = window.prompt("Nombre de la sesión", `Sesión ${new Date().toLocaleTimeString()}`);
      if (name !== null) { await looper.saveSession(name); await looper.refreshSessions(); }
    } else if (e.target && e.target.id === "lpLoad") {
      const sel = container.querySelector("#lpSession");
      const id = sel ? sel.value : "";
      if (id) await looper.loadSession(Number(id));
    } else if (e.target && e.target.id === "lpAddTrack") {
      looper.addTrack();
    } else if (e.target && e.target.id === "lpFxClose") {
      looper.closeFxPopup();
    }
  });

  // input handlers for sliders
  container.addEventListener("input", (e) => {
    const t = e.target;
    if (!t || !t.dataset || !t.dataset.act) return;
    const i = parseInt(t.dataset.i, 10);
    const act = t.dataset.act;
    if (act === "vol") looper.setTrackGain(i, parseInt(t.value, 10) / 100);
    else if (act === "pan") looper.setTrackPan(i, parseInt(t.value, 10) / 100);
    else if (act === "trimL") {
      const tr = looper.tracks[i];
      if (tr && tr.buffer) {
        const v = parseInt(t.value, 10) / 1000;
        looper.trimTrack(i, v * tr.buffer.duration, tr.trimEnd > 0 ? tr.trimEnd : tr.buffer.duration, false);
      }
    } else if (act === "trimR") {
      const tr = looper.tracks[i];
      if (tr && tr.buffer) {
        const v = parseInt(t.value, 10) / 1000;
        looper.trimTrack(i, tr.trimStart, v * tr.buffer.duration, false);
      }
    } else if (act === "offset") {
      const v = parseInt(t.value, 10) / 1000;
      looper.moveTrack(i, v * looper.loopDuration, false);
    }
  });

  // rename
  container.addEventListener("change", (e) => {
    const t = e.target;
    if (t && t.dataset && t.dataset.act === "rename") {
      const i = parseInt(t.dataset.i, 10);
      const tr = looper.tracks[i];
      if (tr) tr.name = t.value || tr.name;
    } else if (t && t.dataset && t.dataset.act === "mult") {
      const i = parseInt(t.dataset.i, 10);
      const mult = parseFloat(t.value);
      looper.setLoopMultiplier(i, mult);
    }
  });

  // drag on waveforms for trim/offset (mouse + touch)
  let dragState = null;
  function getCanvasX(cvs, clientX) {
    const rect = cvs.getBoundingClientRect();
    const scaleX = cvs.width / rect.width;
    return Math.max(0, Math.min(cvs.width, (clientX - rect.left) * scaleX));
  }
  function startDrag(cvs, clientX) {
    const i = parseInt(cvs.dataset.i, 10);
    const tr = looper.tracks[i];
    if (!tr || !tr.buffer) return false;
    const x = getCanvasX(cvs, clientX);
    const dur = tr.buffer.duration;
    const trimStart = tr.trimStart;
    const trimEnd = tr.trimEnd > 0 ? tr.trimEnd : dur;
    const trimDur = trimEnd - trimStart;
    const HANDLE = 28;
    let mode;
    if (x < HANDLE) mode = "trimL";
    else if (x > cvs.width - HANDLE) mode = "trimR";
    else mode = "offset";
    dragState = { i, mode, cvs, startX: x, initTrimStart: trimStart, initTrimEnd: trimEnd, initTrimDur: trimDur, initOffset: tr.offset };
    return true;
  }
  function moveDrag(clientX) {
    if (!dragState) return;
    const { i, mode, cvs, startX, initTrimStart, initTrimEnd, initTrimDur, initOffset } = dragState;
    const tr = looper.tracks[i];
    if (!tr || !tr.buffer) return;
    const x = getCanvasX(cvs, clientX);
    const dur = tr.buffer.duration;
    const dx = x - startX;
    if (mode === "trimL") {
      const deltaSec = (dx / cvs.width) * initTrimDur;
      const newStart = Math.max(0, Math.min(initTrimEnd - 0.01, initTrimStart + deltaSec));
      looper.trimTrack(i, newStart, initTrimEnd, false);
    } else if (mode === "trimR") {
      const deltaSec = (dx / cvs.width) * initTrimDur;
      const newEnd = Math.max(initTrimStart + 0.01, Math.min(dur, initTrimEnd + deltaSec));
      looper.trimTrack(i, initTrimStart, newEnd, false);
    } else if (mode === "offset") {
      const frac = x / cvs.width;
      looper.moveTrack(i, frac * looper.loopDuration, false);
    }
  }
  function endDrag() { dragState = null; }

  // Mouse events
  container.addEventListener("mousedown", (e) => {
    const cvs = e.target.closest(".lp-wave");
    if (!cvs) return;
    if (startDrag(cvs, e.clientX)) e.preventDefault();
  });
  container.addEventListener("mousemove", (e) => {
    if (!dragState) return;
    moveDrag(e.clientX);
    e.preventDefault();
  });
  container.addEventListener("mouseup", endDrag);
  container.addEventListener("mouseleave", endDrag);

  // Touch events
  container.addEventListener("touchstart", (e) => {
    const touch = e.touches[0];
    if (!touch) return;
    const cvs = e.target.closest(".lp-wave");
    if (!cvs) return;
    if (startDrag(cvs, touch.clientX)) e.preventDefault();
  }, { passive: false });
  container.addEventListener("touchmove", (e) => {
    if (!dragState) return;
    const touch = e.touches[0];
    if (!touch) return;
    moveDrag(touch.clientX);
    e.preventDefault();
  }, { passive: false });
  container.addEventListener("touchend", endDrag);
  container.addEventListener("touchcancel", endDrag);

  // keyboard shortcuts
  const keyHandler = (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT")) return;
    if (e.code === "Space") { e.preventDefault(); if (looper.playingAll) looper.stopAll(); else looper.playAll(); }
    else if (e.key === "r" || e.key === "R") {
      // record on first non-empty? use armed track or track 0
      const idx = looper.tracks.findIndex((t) => t.armed) >= 0 ? looper.tracks.findIndex((t) => t.armed) : 0;
      looper.toggleRecording(idx);
    } else if (e.key === "m" || e.key === "M") {
      looper.muteTrack(0);
    } else if (e.key === "s" || e.key === "S") {
      looper.soloTrack(0);
    } else if (e.key === "u" || e.key === "U") {
      looper.undoTrack(0);
    } else if (e.key === "Escape") {
      if (looper.fxTrackIndex >= 0) looper.closeFxPopup();
      else looper.cancelRecording();
    }
  };
  if (looper._keyHandler) document.removeEventListener("keydown", looper._keyHandler);
  looper._keyHandler = keyHandler;
  document.addEventListener("keydown", keyHandler);

  // FX popup handlers
  const fxBackdrop = container.querySelector("#lpFxBackdrop");
  if (fxBackdrop) {
    fxBackdrop.addEventListener("click", (e) => {
      if (e.target === fxBackdrop) looper.closeFxPopup();
    });
  }
  const fxPopup = container.querySelector("#lpFxPopup");
  if (fxPopup) {
    fxPopup.addEventListener("click", (e) => {
      const toggle = e.target.closest(".lp-fx-toggle");
      if (toggle) {
        const fx = toggle.dataset.fx;
        if (looper.fxTrackIndex >= 0) looper.toggleFx(looper.fxTrackIndex, fx);
      }
    });
    fxPopup.addEventListener("input", (e) => {
      const t = e.target;
      if (t.dataset && t.dataset.fxAmount) {
        const fx = t.dataset.fxAmount;
        const amount = parseInt(t.value, 10) / 100;
        if (looper.fxTrackIndex >= 0) looper.setFxAmount(looper.fxTrackIndex, fx, amount);
        const valEl = fxPopup.querySelector(`[data-fx-val="${fx}"]`);
        if (valEl) valEl.textContent = t.value + "%";
      } else if (t.dataset && t.dataset.fxFade) {
        const type = t.dataset.fxFade;
        const ms = parseInt(t.value, 10);
        if (looper.fxTrackIndex >= 0) looper.setFade(looper.fxTrackIndex, type, ms);
        const valEl = fxPopup.querySelector(`[data-fx-val="fade${type}"]`);
        if (valEl) valEl.textContent = ms + "ms";
      } else if (t.dataset && t.dataset.fxEq) {
        const band = t.dataset.fxEq;
        const val = parseInt(t.value, 10);
        if (looper.fxTrackIndex >= 0) looper.setEq(looper.fxTrackIndex, band, val);
        const valEl = fxPopup.querySelector(`[data-fx-val="eq-${band}"]`);
        if (valEl) valEl.textContent = val + "dB";
      }
    });
  }

  looper.refreshUI();
  looper.refreshSessions();
}

export function stopLooper() {
  try { looper.stopAll(); } catch (e) {}
  if (looper._keyHandler) { document.removeEventListener("keydown", looper._keyHandler); looper._keyHandler = null; }
}
export function isLooperRunning() {
  return !!(looper.playingAll || looper.tracks.some((t) => t.playing || t.recording) || looper.metroRunning);
}
export default { renderLooper, stopLooper, isLooperRunning };