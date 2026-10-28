/* ============================================================
   Strumio — Looper multipista (Fase 1 + Fase 2)
   Grabación (MediaRecorder), reproducción (AudioBufferSourceNode),
   mute/solo, undo, quantize con metrónomo, overdub, export WAV,
   guardar/cargar en IndexedDB.
   ============================================================ */
import { getAudioContext, resumeContext, startMetronome, stopMetronome } from "./audio.js";
import { t } from "./i18n.js";
import { icon } from "./icons.js";

const MAX_TRACKS = 8;
const DEFAULT_TRACKS = 4;
const DB_NAME = "strumio_looper";
const DB_VERSION = 1;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function toast(msg) {
  if (typeof window !== "undefined" && typeof window.toast === "function") {
    try { window.toast(msg); return; } catch (e) {}
  }
  const tEl = document.createElement("div");
  tEl.textContent = msg;
  tEl.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:8px 14px;border-radius:8px;z-index:9999";
  document.body.appendChild(tEl);
  setTimeout(() => tEl.remove(), 2000);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function audioBufferToWav(buffer) {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const byteRate = sr * blockAlign;
  const dataSize = len * blockAlign;
  const bufSize = 44 + dataSize;
  const ab = new ArrayBuffer(bufSize);
  const view = new DataView(ab);
  function writeStr(off, s) { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); }
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  let off = 44;
  const channels = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = channels[c][i];
      s = Math.max(-1, Math.min(1, s));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

/* ----------------------------- IndexedDB helpers ----------------------------- */
function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB no disponible")); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("sessions")) {
        db.createObjectStore("sessions", { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ----------------------------- Classes ----------------------------- */
export class LooperTrack {
  constructor(index) {
    this.id = index;
    this.name = `Pista ${index + 1}`;
    this.buffer = null;
    this.undoStack = [];
    this.muted = false;
    this.solo = false;
    this.volume = 1;
    this.recording = false;
    this.playing = false;
    this.pendingStop = false;
    this.source = null;
    this.gain = null;
    this.stream = null;
    this.mediaRecorder = null;
    this.chunks = [];
    this.recordStartCtx = 0;
  }

  clearBuffer() {
    if (this.buffer) this.undoStack.push(this.buffer);
    this.buffer = null;
  }
}

export class Looper {
  constructor() {
    this.tracks = [];
    for (let i = 0; i < DEFAULT_TRACKS; i++) this.tracks.push(new LooperTrack(i));
    this.bpm = 120;
    this.beatsPerBar = 4;
    this.currentBeat = 0;
    this.metroRunning = false;
    this.metroStart = 0;
    this.playingAll = false;
    this.recordingTrack = null;
    this.container = null;
  }

  /* ---------- metronome ---------- */
  startMetronome() {
    if (this.metroRunning) return;
    const ctx = getAudioContext();
    resumeContext(ctx);
    this.metroStart = ctx.currentTime + 0.05;
    this.metroRunning = true;
    startMetronome(this.bpm, this.beatsPerBar, (beat) => {
      this.currentBeat = (beat || 0) % this.beatsPerBar;
      this.refreshUI();
    });
  }

  stopMetronome() {
    this.metroRunning = false;
    try { stopMetronome(); } catch (e) {}
  }

  nextBeatTime() {
    const ctx = getAudioContext();
    if (!this.metroRunning) return ctx.currentTime + 0.05;
    const spb = 60.0 / this.bpm;
    const elapsed = ctx.currentTime - this.metroStart;
    const n = Math.max(1, Math.ceil(elapsed / spb));
    return this.metroStart + n * spb;
  }

  /* ---------- mix ---------- */
  anySolo() { return this.tracks.some((t) => t.solo); }

  trackAudible(track) {
    if (track.muted) return false;
    if (this.anySolo()) return !!track.solo;
    return true;
  }

  applyMix() {
    this.tracks.forEach((t) => {
      if (t.gain) t.gain.gain.value = this.trackAudible(t) ? t.volume : 0;
    });
  }

  /* ---------- recording ---------- */
  async startRecording(index) {
    const track = this.tracks[index];
    if (!track || track.recording) return;
    if (!this.metroRunning) this.startMetronome();

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      toast("Micrófono no disponible");
      return;
    }
    track.stream = stream;
    track.chunks = [];
    track.pendingStop = false;
    track.recording = true;
    this.recordingTrack = index;
    this.refreshUI();

    const startAt = this.nextBeatTime();
    const delay = Math.max(0, (startAt - getAudioContext().currentTime) * 1000);

    setTimeout(() => {
      if (track.pendingStop) {
        track.pendingStop = false;
        track.recording = false;
        this.recordingTrack = null;
        try { stream.getTracks().forEach((tr) => tr.stop()); } catch (e) {}
        track.stream = null;
        this.refreshUI();
        return;
      }
      try {
        const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : (MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : (MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : ""));
        const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        track.mediaRecorder = mr;
        mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) track.chunks.push(e.data); };
        mr.onstop = async () => {
          const blob = new Blob(track.chunks, { type: mr.mimeType || "audio/webm" });
          track.chunks = [];
          track.mediaRecorder = null;
          if (track.stream) {
            try { track.stream.getTracks().forEach((tr) => tr.stop()); } catch (e) {}
          }
          track.stream = null;
          try {
            const ctx = getAudioContext();
            const ab = await ctx.decodeAudioData(await blob.arrayBuffer());
            if (track.buffer) track.undoStack.push(track.buffer);
            track.buffer = ab;
          } catch (e) {
            console.error("decode error", e);
            toast("Error decodificando audio");
          }
          track.recording = false;
          this.recordingTrack = null;
          this.refreshUI();
        };
        mr.start();
      } catch (e) {
        console.error(e);
        track.recording = false;
        this.recordingTrack = null;
        try { stream.getTracks().forEach((tr) => tr.stop()); } catch (err) {}
        track.stream = null;
        this.refreshUI();
      }
    }, delay);
  }

  stopRecording(index) {
    const track = this.tracks[index];
    if (!track || !track.recording) return;
    if (track.mediaRecorder) {
      try { track.mediaRecorder.stop(); } catch (e) {}
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

  /* ---------- playback ---------- */
  playTrack(index) {
    const track = this.tracks[index];
    if (!track || !track.buffer) return;
    this.stopTrack(index);
    const ctx = getAudioContext();
    const src = ctx.createBufferSource();
    src.buffer = track.buffer;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = this.trackAudible(track) ? track.volume : 0;
    src.connect(gain).connect(ctx.destination);
    track.source = src;
    track.gain = gain;
    const startAt = this.nextBeatTime();
    try { src.start(startAt); } catch (e) { try { src.start(); } catch (err) {} }
    track.playing = true;
    this.refreshUI();
  }

  stopTrack(index) {
    const track = this.tracks[index];
    if (!track) return;
    if (track.source) {
      try { track.source.stop(); } catch (e) {}
      try { track.source.disconnect(); } catch (e) {}
      track.source = null;
      track.gain = null;
    }
    track.playing = false;
    this.refreshUI();
  }

  playAll() {
    if (!this.metroRunning) this.startMetronome();
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
  muteTrack(index) {
    const track = this.tracks[index];
    if (!track) return;
    track.muted = !track.muted;
    this.applyMix();
    this.refreshUI();
  }

  soloTrack(index) {
    const track = this.tracks[index];
    if (!track) return;
    track.solo = !track.solo;
    this.applyMix();
    this.refreshUI();
  }

  deleteTrack(index) {
    const track = this.tracks[index];
    if (!track) return;
    this.stopTrack(index);
    if (track.buffer) track.undoStack.push(track.buffer);
    track.buffer = null;
    track.muted = false;
    track.solo = false;
    this.applyMix();
    this.refreshUI();
  }

  undoTrack(index) {
    const track = this.tracks[index];
    if (!track || !track.undoStack.length) { toast("Nada que deshacer"); return; }
    const prev = track.undoStack.pop();
    track.buffer = prev;
    this.refreshUI();
  }

  /* ---------- add track ---------- */
  addTrack() {
    if (this.tracks.length >= MAX_TRACKS) { toast("Máximo 8 pistas"); return; }
    this.tracks.push(new LooperTrack(this.tracks.length));
    this.refreshUI();
  }

  /* ---------- export ---------- */
  async exportMix() {
    const audible = this.tracks.filter((t) => t.buffer && this.trackAudible(t));
    if (!audible.length) { toast("No hay pistas para exportar"); return; }
    const ctx = getAudioContext();
    const duration = Math.max(...audible.map((t) => t.buffer.duration));
    const off = new OfflineAudioContext(2, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    audible.forEach((t) => {
      const src = off.createBufferSource();
      src.buffer = t.buffer;
      const gain = off.createGain();
      gain.gain.value = t.volume;
      src.connect(gain).connect(off.destination);
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
        if (tr.buffer) wavBlob = audioBufferToWav(tr.buffer);
        return { index: tr.id, name: tr.name, muted: tr.muted, solo: tr.solo, volume: tr.volume, wavBlob };
      });
      store.add({ name: name || `Sesión ${new Date().toLocaleString()}`, bpm: this.bpm, beatsPerBar: this.beatsPerBar, trackCount: this.tracks.length, tracks, created: Date.now() });
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
      db.close();
      toast("Sesión guardada");
      await this.refreshSessions();
    } catch (e) {
      console.error(e);
      toast("Error guardando sesión");
    }
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
    } catch (e) {
      return [];
    }
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
      this.tracks = [];
      for (let i = 0; i < (session.trackCount || (session.tracks || []).length || DEFAULT_TRACKS); i++) this.tracks.push(new LooperTrack(i));
      const ctx = getAudioContext();
      for (const td of (session.tracks || [])) {
        const track = this.tracks[td.index];
        if (!track) continue;
        track.name = td.name || track.name;
        track.muted = !!td.muted;
        track.solo = !!td.solo;
        track.volume = (typeof td.volume === "number") ? td.volume : 1;
        if (td.wavBlob) {
          try {
            const ab = await ctx.decodeAudioData(await td.wavBlob.arrayBuffer());
            track.buffer = ab;
          } catch (e) {
            console.error("decode session track", e);
          }
        }
      }
      this.refreshUI();
      toast("Sesión cargada");
    } catch (e) {
      console.error(e);
      toast("Error cargando sesión");
    }
  }

  /* ---------- UI ---------- */
  setContainer(container) {
    this.container = container;
  }

  refreshUI() {
    if (!this.container) return;
    // update bpm slider
    const bpmSlider = this.container.querySelector("#lpBpm");
    if (bpmSlider) bpmSlider.value = this.bpm;
    const bpmVal = this.container.querySelector("#lpBpmVal");
    if (bpmVal) bpmVal.textContent = this.bpm;
    // beat indicator
    const beatEl = this.container.querySelector("#lpBeat");
    if (beatEl) {
      const dots = Array.from({ length: this.beatsPerBar }, (_, i) => (i === this.currentBeat ? "●" : "○")).join(" ");
      beatEl.textContent = dots;
    }
    const recInd = this.container.querySelector("#lpRecInd");
    if (recInd) recInd.hidden = !this.tracks.some((t) => t.recording);
    // tracks
    const wrap = this.container.querySelector("#lpTracks");
    if (wrap) {
      wrap.innerHTML = this.tracks.map((tr, i) => `
        <div class="looper-track ${tr.recording ? "is-rec" : ""}" data-track="${i}">
          <div class="looper-track__name">${escapeHtml(tr.name)}</div>
          <div class="looper-track__wave">${tr.buffer ? (tr.buffer.duration.toFixed(1) + "s") : "—"}</div>
          <div class="looper-track__btns">
            <button class="lp-btn lp-rec ${tr.recording ? "active" : ""}" data-act="rec" data-i="${i}" title="Record">●</button>
            <button class="lp-btn lp-play ${tr.playing ? "active" : ""}" data-act="play" data-i="${i}" title="Play">▶</button>
            <button class="lp-btn" data-act="stop" data-i="${i}" title="Stop">■</button>
            <button class="lp-btn ${tr.muted ? "active" : ""}" data-act="mute" data-i="${i}" title="Mute">M</button>
            <button class="lp-btn ${tr.solo ? "active" : ""}" data-act="solo" data-i="${i}" title="Solo">S</button>
            <button class="lp-btn" data-act="delete" data-i="${i}" title="Delete">✕</button>
            <button class="lp-btn" data-act="undo" data-i="${i}" title="Undo">↩</button>
          </div>
        </div>
      `).join("");
    }
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
  container.innerHTML = `
    <div class="looper">
      <div class="looper__head">
        <h2>Looper multipista</h2>
        <div class="looper__global">
          <button id="lpPlayAll" class="btn btn-primary">Play All</button>
          <button id="lpStopAll" class="btn btn-danger">Stop All</button>
          <button id="lpExport" class="btn">Export WAV</button>
          <button id="lpSave" class="btn">Guardar</button>
          <select id="lpSession"></select>
          <button id="lpLoad" class="btn">Cargar</button>
          <button id="lpAddTrack" class="btn">+ Pista</button>
        </div>
        <div class="looper__metro">
          <label>BPM <input id="lpBpm" type="range" min="40" max="240" value="${looper.bpm}"><span id="lpBpmVal">${looper.bpm}</span></label>
          <div class="looper__beat" id="lpBeat">● ○ ○ ○</div>
        </div>
        <div class="looper__rec-indicator" id="lpRecInd" hidden>Grabando…</div>
      </div>
      <div id="lpTracks" class="looper__tracks"></div>
    </div>
  `;

  // event delegation
  container.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]");
    if (btn) {
      const i = parseInt(btn.dataset.i, 10);
      const act = btn.dataset.act;
      if (act === "rec") looper.toggleRecording(i);
      else if (act === "play") looper.playTrack(i);
      else if (act === "stop") looper.stopTrack(i);
      else if (act === "mute") looper.muteTrack(i);
      else if (act === "solo") looper.soloTrack(i);
      else if (act === "delete") looper.deleteTrack(i);
      else if (act === "undo") looper.undoTrack(i);
      return;
    }
    if (e.target && e.target.id === "lpPlayAll") looper.playAll();
    else if (e.target && e.target.id === "lpStopAll") looper.stopAll();
    else if (e.target && e.target.id === "lpExport") looper.exportMix();
    else if (e.target && e.target.id === "lpSave") {
      const name = window.prompt("Nombre de la sesión", `Sesión ${new Date().toLocaleTimeString()}`);
      if (name !== null) { await looper.saveSession(name); await looper.refreshSessions(); }
    } else if (e.target && e.target.id === "lpLoad") {
      const sel = container.querySelector("#lpSession");
      const id = sel ? sel.value : "";
      if (id) await looper.loadSession(Number(id));
    } else if (e.target && e.target.id === "lpAddTrack") {
      looper.addTrack();
    }
  });

  const bpmSlider = container.querySelector("#lpBpm");
  if (bpmSlider) {
    bpmSlider.addEventListener("input", (e) => {
      looper.bpm = parseInt(e.target.value, 10) || 120;
      const v = container.querySelector("#lpBpmVal");
      if (v) v.textContent = looper.bpm;
      if (looper.metroRunning) {
        looper.stopMetronome();
        looper.startMetronome();
      }
    });
  }

  looper.refreshUI();
  looper.refreshSessions();
}

export function stopLooper() {
  try { looper.stopAll(); } catch (e) {}
}

export function isLooperRunning() {
  return !!(looper.playingAll || looper.tracks.some((t) => t.playing || t.recording) || looper.metroRunning);
}

export default { renderLooper, stopLooper, isLooperRunning };
