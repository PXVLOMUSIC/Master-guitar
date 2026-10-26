// tab-player.js — interactive tab player with audio, speed control, visual highlighting
import { playTone, noteToFrequency } from "./audio.js";
import { midiToFreq, midiToNote, freqToMidi } from "./instruments.js";

const $ = (sel, root = document) => (root || document).querySelector(sel);
const $$ = (sel, root = document) => [...(root || document).querySelectorAll(sel)];

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function stringNameToFreq(name, index, total) {
  const known = {
    "e": 329.63, "E": 82.41, "B": 246.94, "b": 246.94,
    "G": 196.00, "g": 196.00, "D": 146.83, "d": 146.83,
    "A": 110.00, "a": 110.00, "C": 261.63, "F": 349.23
  };
  if (known[name] != null) return known[name];
  for (const oct of [2, 3, 4, 5, 1, 6]) {
    const f = noteToFrequency(name + oct);
    if (isFinite(f)) return f;
  }
  const std = [329.63, 246.94, 196.00, 146.83, 110.00, 82.41];
  return std[Math.min(index, std.length - 1)];
}

// replace usage


function emptyTab() {
  return { title: "Untitled", artist: "", bpm: 120, tuning: ["e", "B", "G", "D", "A", "E"], tuningFreqs: [329.63, 246.94, 196.00, 146.83, 110.00, 82.41], steps: [] };
}

export function normalizeTab(tab) {
  if (!tab) return emptyTab();
  if (typeof tab === "string") tab = parseTab(tab);
  const t = { title: tab.title || "Tab", artist: tab.artist || "", bpm: tab.bpm || 120, tuning: [], tuningFreqs: [], steps: [], loop: tab.loop };
  if (Array.isArray(tab.tuning) && tab.tuning.length) t.tuning = [...tab.tuning];
  else t.tuning = ["e", "B", "G", "D", "A", "E"];
  if (Array.isArray(tab.tuningFreqs) && tab.tuningFreqs.length === t.tuning.length) t.tuningFreqs = [...tab.tuningFreqs];
  else t.tuningFreqs = t.tuning.map((n, i) => stringNameToFreq(n, i, t.tuning.length));
  if (Array.isArray(tab.steps)) {
    t.steps = tab.steps.map(st => ({ dur: (st.dur != null ? st.dur : (st.duration != null ? st.duration : 1)), notes: (st.notes || []).map(n => ({ s: (n.s != null ? n.s : n.string), f: (n.f != null ? n.f : n.fret), tech: n.tech || n.technique || "normal" })) }));
  } else if (Array.isArray(tab.lines)) {
    const maxLen = Math.max(...tab.lines.map(l => (l.notes || []).length), 0);
    for (let i = 0; i < maxLen; i++) {
      const notes = [];
      tab.lines.forEach((line, si) => {
        const n = (line.notes || [])[i];
        if (n && (n.fret != null || n.f != null)) notes.push({ s: si, f: (n.fret != null ? n.fret : n.f), tech: n.technique || n.tech || "normal" });
      });
      let dur = 1;
      tab.lines.forEach((line) => {
        const n = (line.notes || [])[i];
        if (n && (n.duration != null || n.dur != null)) dur = Math.max(dur, (n.duration != null ? n.duration : n.dur));
      });
      t.steps.push({ dur: dur || 1, notes });
    }
  } else if (tab.text || tab.ascii) {
    return normalizeTab(parseTab(tab.text || tab.ascii));
  }
  if (!Array.isArray(t.steps)) t.steps = [];
  t.steps = t.steps.map(st => ({ dur: (st.dur != null && isFinite(st.dur) && st.dur > 0) ? st.dur : 1, notes: (st.notes || []).map(n => ({ s: n.s, f: n.f, tech: n.tech || "normal" })) }));
  return t;
}

export function parseTab(text) {
  const lines = String(text || "").trim().split(/\r?\n/);
  const stringLines = [];
  for (const line of lines) {
    const m = line.match(/^([A-Za-z0-9#]+)\|(.*)\|?\s*$/);
    if (m) stringLines.push({ name: m[1], content: m[2] });
  }
  if (stringLines.length === 0) return emptyTab();
  const tuning = stringLines.map(s => s.name);
  const tuningFreqs = tuning.map((name, i) => stringNameToFreq(name, i, tuning.length));
  const notesByString = stringLines.map((sl) => {
    const positions = [];
    let i = 0;
    while (i < sl.content.length) {
      if (/\d/.test(sl.content[i])) {
        let j = i;
        while (j < sl.content.length && /\d/.test(sl.content[j])) j++;
        positions.push({ col: i, fret: parseInt(sl.content.slice(i, j), 10) });
        i = j;
      } else i++;
    }
    return positions;
  });
  const cols = [...new Set(notesByString.flatMap(ns => ns.map(n => n.col)))].sort((a, b) => a - b);
  const steps = [];
  cols.forEach((col, idx) => {
    const nextCol = (cols[idx + 1] != null) ? cols[idx + 1] : col + 4;
    const dist = Math.max(1, nextCol - col);
    const dur = Math.max(0.25, dist / 4);
    const notes = [];
    notesByString.forEach((ns, si) => {
      const n = ns.find(x => x.col === col);
      if (n) notes.push({ s: si, f: n.fret, tech: "normal" });
    });
    steps.push({ dur, notes });
  });
  return { title: "Custom Tab", artist: "User", bpm: 120, tuning, tuningFreqs, steps };
}

export function tabToAscii(tab) {
  const t = normalizeTab(tab);
  const lines = t.tuning.map(name => name + "|");
  t.steps.forEach(step => {
    const width = Math.max(3, Math.round((step.dur || 1) * 4));
    t.tuning.forEach((name, s) => {
      const note = (step.notes || []).find(n => n.s === s);
      const fretStr = note ? String(note.f) : "-";
      const cell = fretStr + "-".repeat(Math.max(0, width - fretStr.length));
      lines[s] += cell;
    });
  });
  t.tuning.forEach((name, s) => { lines[s] += "|"; });
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* TabPlayer class                                                    */
/* ------------------------------------------------------------------ */
export class TabPlayer {
  constructor(tab, options = {}) {
    this.options = options || {};
    this.status = "stopped";
    this.speed = 1;
    this.position = 0;
    this.currentStep = -1;
    this.loopEnabled = false;
    this.loopStart = 0;
    this.loopEnd = 0;
    this.metronomeEnabled = !!this.options.metronome;
    this.countInEnabled = this.options.countIn !== false;
    this._countedIn = false;
    this.stepTimer = null;
    this.countTimer = null;
    this.metroTimer = null;
    this.onStep = this.options.onStep || (() => {});
    this.onCount = this.options.onCount || (() => {});
    this.onStateChange = this.options.onStateChange || (() => {});
    this.onComplete = this.options.onComplete || (() => {});
    this.loadTab(tab);
  }

  loadTab(tab) {
    this.tab = normalizeTab(tab);
    this.stop();
    this.position = 0;
    this.currentStep = -1;
    this._countedIn = false;
    if (this.tab.steps.length) {
      this.loopEnd = this.tab.steps.length - 1;
    }
  }

  freqFor(s, f) {
    const open = this.tab.tuningFreqs[s];
    return midiToFreq(freqToMidi(open) + f);
  }

  clearTimers() {
    if (this.stepTimer) clearTimeout(this.stepTimer);
    if (this.countTimer) clearTimeout(this.countTimer);
    this.stepTimer = null;
    this.countTimer = null;
  }

  stopMetronomeLoop() {
    if (this.metroTimer) clearTimeout(this.metroTimer);
    this.metroTimer = null;
  }

  runCountIn() {
    let i = 1;
    const beatSec = 60 / (this.tab.bpm * this.speed);
    const tick = () => {
      if (this.status !== "playing") return;
      if (i > 4) { this.startPlayback(); return; }
      this.onCount(i);
      if (this.metronomeEnabled) playTone(i === 4 ? 1000 : 800, 0.08, { gain: 0.2 });
      i++;
      this.countTimer = setTimeout(tick, beatSec * 1000);
    };
    tick();
  }

  startPlayback() {
    if (this.status !== "playing") return;
    this.onCount(0);
    if (this.metronomeEnabled) this.startMetronomeLoop();
    this.scheduleStep(this.position);
  }

  startMetronomeLoop() {
    this.stopMetronomeLoop();
    const beatSec = 60 / (this.tab.bpm * this.speed);
    const tick = () => {
      if (this.status !== "playing" || !this.metronomeEnabled) return;
      playTone(600, 0.05, { gain: 0.12 });
      this.metroTimer = setTimeout(tick, beatSec * 1000);
    };
    tick();
  }

  scheduleStep(i) {
    if (this.status !== "playing") return;
    const steps = this.tab.steps;
    if (!steps || !steps.length) { this.stop(); return; }

    if (this.loopEnabled && this.loopStart >= 0 && this.loopEnd >= this.loopStart && this.loopEnd < steps.length) {
      if (i > this.loopEnd) i = this.loopStart;
      if (i < this.loopStart) i = this.loopStart;
    }
    if (i >= steps.length) {
      this.complete();
      return;
    }

    this.position = i;
    this.currentStep = i;
    this.onStep(i);

    const step = steps[i];
    const beatSec = 60 / (this.tab.bpm * this.speed);
    const stepSec = Math.max(0.05, (step.dur || 1) * beatSec);

    (step.notes || []).forEach(note => {
      if (note.f == null) return;
      const freq = this.freqFor(note.s, note.f);
      playTone(freq, Math.max(0.05, stepSec * 0.9), { gain: 0.3, instrument: "guitar" });
    });

    this.stepTimer = setTimeout(() => this.scheduleStep(i + 1), stepSec * 1000);
  }

  play() {
    if (this.status === "playing") return;
    const wasPaused = this.status === "paused";
    this.status = "playing";
    this.onStateChange();
    if (!wasPaused && this.countInEnabled && this.position === 0) {
      this.runCountIn();
    } else {
      this.startPlayback();
    }
  }

  pause() {
    if (this.status !== "playing") return;
    this.status = "paused";
    this.clearTimers();
    this.stopMetronomeLoop();
    this.onStateChange();
  }

  stop() {
    this.status = "stopped";
    this.clearTimers();
    this.stopMetronomeLoop();
    this.position = 0;
    this.currentStep = -1;
    this._countedIn = false;
    this.onStep(-1);
    this.onCount(0);
    this.onStateChange();
  }

  complete() {
    this.clearTimers();
    this.stopMetronomeLoop();
    this.status = "stopped";
    this.position = 0;
    this.currentStep = -1;
    this._countedIn = false;
    this.onStep(-1);
    this.onCount(0);
    this.onStateChange();
    this.onComplete();
  }

  setSpeed(v) {
    v = Math.max(0.25, Math.min(2, v));
    this.speed = v;
    if (this.status === "playing") {
      clearTimeout(this.stepTimer);
      this.stepTimer = null;
      this.stopMetronomeLoop();
      const cur = this.currentStep >= 0 ? this.currentStep : this.position;
      this.stepTimer = setTimeout(() => this.scheduleStep(cur), 0);
      if (this.metronomeEnabled) this.startMetronomeLoop();
    }
  }

  setLoop(start, end, enabled) {
    this.loopStart = Math.max(0, start || 0);
    this.loopEnd = (end != null ? end : this.tab.steps.length - 1);
    this.loopEnabled = !!enabled;
  }
}

/* ------------------------------------------------------------------ */
/* SAMPLE_TABS (10+)                                                  */
/* ------------------------------------------------------------------ */
export const SAMPLE_TABS = [
  {
    title: "Smoke on the Water",
    artist: "Deep Purple",
    bpm: 112,
    tuning: ["e", "B", "G", "D", "A", "E"],
    tuningFreqs: [329.63, 246.94, 196.00, 146.83, 110.00, 82.41],
    steps: [
      { dur: 1, notes: [{ s: 3, f: 0 }] },
      { dur: 1, notes: [{ s: 3, f: 3 }] },
      { dur: 1.5, notes: [{ s: 3, f: 5 }] },
      { dur: 0.5, notes: [] },
      { dur: 1, notes: [{ s: 3, f: 0 }] },
      { dur: 1, notes: [{ s: 3, f: 3 }] },
      { dur: 1, notes: [{ s: 3, f: 6 }] },
      { dur: 1, notes: [{ s: 3, f: 5 }] }
    ]
  },
  {
    title: "Seven Nation Army",
    artist: "The White Stripes",
    bpm: 120,
    tuning: ["e", "B", "G", "D", "A", "E"],
    tuningFreqs: [329.63, 246.94, 196.00, 146.83, 110.00, 82.41],
    steps: [
      { dur: 1, notes: [{ s: 4, f: 7 }] },
      { dur: 1, notes: [{ s: 4, f: 7 }] },
      { dur: 1, notes: [{ s: 4, f: 10 }] },
      { dur: 1, notes: [{ s: 4, f: 7 }] },
      { dur: 1, notes: [{ s: 4, f: 5 }] },
      { dur: 1, notes: [{ s: 4, f: 3 }] },
      { dur: 1, notes: [{ s: 4, f: 5 }] }
    ]
  },
  {
    title: "Come As You Are",
    artist: "Nirvana",
    bpm: 120,
    tuning: ["e", "B", "G", "D", "A", "E"],
    tuningFreqs: [329.63, 246.94, 196.00, 146.83, 110.00, 82.41],
    steps: [
      { dur: 1, notes: [{ s: 4, f: 0 }] },
      { dur: 0.5, notes: [{ s: 4, f: 0 }] },
      { dur: 0.5, notes: [{ s: 3, f: 2 }] },
      { dur: 1, notes: [{ s: 3, f: 0 }] },
      { dur: 1, notes: [{ s: 4, f: 0 }] },
      { dur: 0.5, notes: [{ s: 4, f: 0 }] },
      { dur: 0.5, notes: [{ s: 3, f: 4 }] },
      { dur: 1, notes: [{ s: 3, f: 2 }] }
    ]
  },
  {
    title: "Sunshine of Your Love",
    artist: "Cream",
    bpm: 112,
    tuning: ["e", "B", "G", "D", "A", "E"],
    tuningFreqs: [329.63, 246.94, 196.00, 146.83, 110.00, 82.41],
    steps: [
      { dur: 1, notes: [{ s: 3, f: 0 }] },
      { dur: 0.5, notes: [{ s: 3, f: 0 }] },
      { dur: 0.5, notes: [{ s: 3, f: 3 }] },
      { dur: 1, notes: [{ s: 3, f: 0 }] },
      { dur: 1, notes: [{ s: 4, f: 0 }] },
      { dur: 0.5, notes: [{ s: 4, f: 0 }] },
      { dur: 0.5, notes: [{ s: 4, f: 3 }] },
      { dur: 1, notes: [{ s: 4, f: 0 }] }
    ]
  },
  {
    title: "Iron Man",
    artist: "Black Sabbath",
    bpm: 75,
    tuning: ["e", "B", "G", "D", "A", "E"],
    tuningFreqs: [329.63, 246.94, 196.00, 146.83, 110.00, 82.41],
    steps: [
      { dur: 1.5, notes: [{ s: 3, f: 0 }] },
      { dur: 0.5, notes: [] },
      { dur: 1, notes: [{ s: 3, f: 0 }] },
      { dur: 1, notes: [{ s: 3, f: 3 }] },
      { dur: 1.5, notes: [{ s: 3, f: 0 }] },
      { dur: 0.5, notes: [] },
      { dur: 1, notes: [{ s: 3, f: 5 }] },
      { dur: 1, notes: [{ s: 3, f: 3 }] }
    ]
  },
  {
    title: "Day Tripper",
    artist: "The Beatles",
    bpm: 140,
    tuning: ["e", "B", "G", "D", "A", "E"],
    tuningFreqs: [329.63, 246.94, 196.00, 146.83, 110.00, 82.41],
    steps: [
      { dur: 0.5, notes: [{ s: 2, f: 0 }] },
      { dur: 0.5, notes: [{ s: 2, f: 2 }] },
      { dur: 0.5, notes: [{ s: 2, f: 4 }] },
      { dur: 0.5, notes: [{ s: 2, f: 5 }] },
      { dur: 1, notes: [{ s: 1, f: 0 }] },
      { dur: 0.5, notes: [{ s: 2, f: 5 }] },
      { dur: 0.5, notes: [{ s: 2, f: 4 }] },
      { dur: 0.5, notes: [{ s: 2, f: 2 }] },
      { dur: 0.5, notes: [{ s: 2, f: 0 }] }
    ]
  },
  {
    title: "Pipeline",
    artist: "The Chantays",
    bpm: 160,
    tuning: ["e", "B", "G", "D", "A", "E"],
    tuningFreqs: [329.63, 246.94, 196.00, 146.83, 110.00, 82.41],
    steps: [
      { dur: 0.5, notes: [{ s: 0, f: 0 }] },
      { dur: 0.5, notes: [{ s: 0, f: 2 }] },
      { dur: 0.5, notes: [{ s: 0, f: 3 }] },
      { dur: 0.5, notes: [{ s: 0, f: 5 }] },
      { dur: 0.5, notes: [{ s: 1, f: 0 }] },
      { dur: 0.5, notes: [{ s: 1, f: 2 }] },
      { dur: 0.5, notes: [{ s: 1, f: 3 }] },
      { dur: 0.5, notes: [{ s: 1, f: 5 }] }
    ]
  },
  {
    title: "Misirlou",
    artist: "Dick Dale",
    bpm: 175,
    tuning: ["e", "B", "G", "D", "A", "E"],
    tuningFreqs: [329.63, 246.94, 196.00, 146.83, 110.00, 82.41],
    steps: [
      { dur: 0.5, notes: [{ s: 0, f: 0 }] },
      { dur: 0.5, notes: [{ s: 0, f: 1 }] },
      { dur: 0.5, notes: [{ s: 0, f: 3 }] },
      { dur: 0.5, notes: [{ s: 0, f: 5 }] },
      { dur: 0.5, notes: [{ s: 0, f: 3 }] },
      { dur: 0.5, notes: [{ s: 0, f: 1 }] },
      { dur: 0.5, notes: [{ s: 0, f: 0 }] },
      { dur: 0.5, notes: [{ s: 1, f: 0 }] }
    ]
  },
  {
    title: "Sweet Child O' Mine (intro)",
    artist: "Guns N' Roses",
    bpm: 124,
    tuning: ["e", "B", "G", "D", "A", "E"],
    tuningFreqs: [329.63, 246.94, 196.00, 146.83, 110.00, 82.41],
    steps: [
      { dur: 0.5, notes: [{ s: 2, f: 0 }] },
      { dur: 0.5, notes: [{ s: 0, f: 12 }] },
      { dur: 0.5, notes: [{ s: 2, f: 2 }] },
      { dur: 0.5, notes: [{ s: 0, f: 12 }] },
      { dur: 0.5, notes: [{ s: 2, f: 4 }] },
      { dur: 0.5, notes: [{ s: 0, f: 10 }] },
      { dur: 0.5, notes: [{ s: 2, f: 5 }] },
      { dur: 0.5, notes: [{ s: 0, f: 9 }] }
    ]
  },
  {
    title: "Stairway to Heaven (intro)",
    artist: "Led Zeppelin",
    bpm: 82,
    tuning: ["e", "B", "G", "D", "A", "E"],
    tuningFreqs: [329.63, 246.94, 196.00, 146.83, 110.00, 82.41],
    steps: [
      { dur: 1, notes: [{ s: 5, f: 0 }] },
      { dur: 0.5, notes: [{ s: 3, f: 2 }] },
      { dur: 0.5, notes: [{ s: 2, f: 0 }] },
      { dur: 0.5, notes: [{ s: 1, f: 1 }] },
      { dur: 0.5, notes: [{ s: 0, f: 0 }] },
      { dur: 1, notes: [{ s: 5, f: 0 }] },
      { dur: 0.5, notes: [{ s: 3, f: 2 }] },
      { dur: 0.5, notes: [{ s: 2, f: 1 }] },
      { dur: 0.5, notes: [{ s: 1, f: 3 }] },
      { dur: 0.5, notes: [{ s: 0, f: 0 }] }
    ]
  }
];

/* ------------------------------------------------------------------ */
/* renderTabPlayer                                                    */
/* ------------------------------------------------------------------ */
export function renderTabPlayer(container, tab = null) {
  if (!tab) {
    container.innerHTML = `
      <div class="card"><h2>🎵 Tab Player</h2><p>Selecciona una tablatura o pega la tuya.</p></div>
      <div id="tp-lib" style="display:grid;gap:8px;padding:0 16px"></div>
    `;
    const lib = container.querySelector("#tp-lib");
    SAMPLE_TABS.forEach((t) => {
      const b = document.createElement("button");
      b.className = "btn btn-secondary btn-block";
      b.textContent = t.title + (t.artist ? " — " + t.artist : "");
      b.onclick = () => renderTabPlayer(container, t);
      lib.appendChild(b);
    });
    const edCard = document.createElement("div");
    edCard.className = "card";
    edCard.innerHTML = `<h3>Editor de tabs</h3><textarea id="tp-ed0" style="width:100%;min-height:120px;font-family:monospace"></textarea><button class="btn btn-primary btn-block" id="tp-load0">Cargar tab</button>`;
    container.appendChild(edCard);
    const ta = edCard.querySelector("#tp-ed0");
    ta.value = tabToAscii(SAMPLE_TABS[0]);
    edCard.querySelector("#tp-load0").onclick = () => {
      const parsed = parseTab(ta.value);
      if (!parsed.steps || !parsed.steps.length) { toast("No se pudo parsear el tab"); return; }
      renderTabPlayer(container, parsed);
    };
    return;
  }

  const player = new TabPlayer(tab, { countIn: true });
  let currentTab = player.tab;

  container.innerHTML = `
    <div class="card"><h2 id="tp-title">🎵 Tab Player</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        <select id="tp-sample" style="flex:1;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--card2);color:var(--text)"><option value="">— Elegir tab de muestra —</option></select>
        <button class="btn btn-secondary" id="tp-libBtn" style="padding:8px 12px">📚 Biblioteca</button>
      </div>
    </div>
    <div class="card"><h3>Tab (ASCII)</h3><div id="tp-tab" style="overflow-x:auto"></div></div>
    <div class="card">
      <h3>Transporte</h3>
      <div style="display:flex;gap:8px;justify-content:center;margin-bottom:10px">
        <button class="btn btn-primary" id="tp-play">▶ Play</button>
        <button class="btn btn-secondary" id="tp-pause">⏸ Pausa</button>
        <button class="btn btn-secondary" id="tp-stop">⏹ Stop</button>
      </div>
      <div id="tp-count" style="text-align:center;font-weight:800;min-height:22px;margin-bottom:8px;color:var(--gold)"></div>
      <div style="margin-bottom:8px">
        <label>Velocidad: <span id="tp-speedVal">1x</span></label>
        <input type="range" id="tp-speed" min="0.25" max="2" step="0.25" value="1" style="width:100%">
      </div>
      <div style="margin-bottom:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <label><input type="checkbox" id="tp-loopToggle"> Loop</label>
        <label>Inicio <input type="number" id="tp-loopStart" value="0" min="0" style="width:56px"></label>
        <label>Fin <input type="number" id="tp-loopEnd" value="0" min="0" style="width:56px"></label>
        <button class="btn btn-secondary" id="tp-setLoopStart" style="padding:4px 8px">Set ini</button>
        <button class="btn btn-secondary" id="tp-setLoopEnd" style="padding:4px 8px">Set fin</button>
      </div>
      <div style="margin-bottom:8px;display:flex;gap:12px;flex-wrap:wrap">
        <label><input type="checkbox" id="tp-metro"> Metrónomo</label>
        <label><input type="checkbox" id="tp-countin" checked> Count-in</label>
      </div>
      <div style="margin-top:8px">
        <div class="progress"><div id="tp-progress" style="width:0%"></div></div>
        <div style="text-align:right;font-size:12px;color:var(--muted)" id="tp-pos">0/0</div>
      </div>
    </div>
    <div class="card"><h3>Mástil</h3><div id="tp-fretboard"></div></div>
    <div class="card"><h3>Nota actual</h3><div id="tp-noteinfo">—</div></div>
    <div class="card">
      <h3>Editor de tabs</h3>
      <textarea id="tp-editor" style="width:100%;min-height:140px;font-family:monospace;font-size:12px"></textarea>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-primary" id="tp-loadEditor" style="flex:1">Cargar</button>
        <button class="btn btn-secondary" id="tp-export" style="flex:1">Exportar .txt</button>
      </div>
    </div>
  `;

  const titleEl = container.querySelector("#tp-title");
  const tabEl = container.querySelector("#tp-tab");
  const fretboardEl = container.querySelector("#tp-fretboard");
  const noteInfoEl = container.querySelector("#tp-noteinfo");
  const progressEl = container.querySelector("#tp-progress");
  const posEl = container.querySelector("#tp-pos");
  const countEl = container.querySelector("#tp-count");
  const playBtn = container.querySelector("#tp-play");
  const pauseBtn = container.querySelector("#tp-pause");
  const stopBtn = container.querySelector("#tp-stop");
  const speedSlider = container.querySelector("#tp-speed");
  const speedVal = container.querySelector("#tp-speedVal");
  const loopToggle = container.querySelector("#tp-loopToggle");
  const loopStartInput = container.querySelector("#tp-loopStart");
  const loopEndInput = container.querySelector("#tp-loopEnd");
  const setLoopStartBtn = container.querySelector("#tp-setLoopStart");
  const setLoopEndBtn = container.querySelector("#tp-setLoopEnd");
  const metroCheckbox = container.querySelector("#tp-metro");
  const countinCheckbox = container.querySelector("#tp-countin");
  const editor = container.querySelector("#tp-editor");
  const loadEditorBtn = container.querySelector("#tp-loadEditor");
  const exportBtn = container.querySelector("#tp-export");
  const libBtn = container.querySelector("#tp-libBtn");
  const sampleSel = container.querySelector("#tp-sample");

  titleEl.textContent = player.tab.title + (player.tab.artist ? " — " + player.tab.artist : "");

  function renderTabDisplay() {
    const t = player.tab;
    const linesHtml = t.tuning.map((name, s) => {
      const cells = (t.steps || []).map((step, i) => {
        const width = Math.max(3, Math.round((step.dur || 1) * 4));
        const note = (step.notes || []).find(n => n.s === s);
        const fretStr = note ? String(note.f) : "-";
        const cell = fretStr + "-".repeat(Math.max(0, width - fretStr.length));
        return `<span class="tp-step" data-step="${i}" data-string="${s}">${cell}</span>`;
      }).join("");
      return `<div><span class="tp-str" style="color:var(--muted);font-weight:700">${name}</span>|${cells}|</div>`;
    }).join("");
    tabEl.innerHTML = `<div style="font-family:monospace;white-space:pre;overflow-x:auto;line-height:1.6;font-size:13px">${linesHtml}</div>`;
  }

  function renderFretboard() {
    const t = player.tab;
    const strings = t.tuning.length;
    const frets = 13;
    let html = `<div style="display:grid;grid-template-columns:32px repeat(${frets},1fr);gap:2px;font-size:11px">`;
    html += `<div></div>`;
    for (let f = 0; f < frets; f++) html += `<div style="text-align:center;color:var(--muted)">${f}</div>`;
    for (let s = 0; s < strings; s++) {
      html += `<div style="font-weight:700">${t.tuning[s]}</div>`;
      for (let f = 0; f < frets; f++) {
        html += `<div class="tp-fc" data-s="${s}" data-f="${f}" style="height:16px;border:1px solid var(--border);border-radius:3px;background:var(--card2)"></div>`;
      }
    }
    html += `</div>`;
    fretboardEl.innerHTML = html;
  }

  function updateFretboard(i) {
    fretboardEl.querySelectorAll(".tp-fc").forEach(c => c.style.background = "var(--card2)");
    if (i < 0) return;
    const step = player.tab.steps[i];
    (step.notes || []).forEach(n => {
      const cell = fretboardEl.querySelector(`.tp-fc[data-s="${n.s}"][data-f="${n.f}"]`);
      if (cell) cell.style.background = "var(--green)";
    });
  }

  function updateNoteInfo(i) {
    if (i < 0) { noteInfoEl.innerHTML = "—"; return; }
    const step = player.tab.steps[i];
    const parts = (step.notes || []).map(n => {
      const open = player.tab.tuningFreqs[n.s];
      const noteName = midiToNote(freqToMidi(open) + n.f).full;
      return `${player.tab.tuning[n.s]} str · fret ${n.f} · ${noteName} · ${n.tech || "normal"}`;
    });
    noteInfoEl.innerHTML = `<b>Step ${i + 1}/${player.tab.steps.length}</b> · dur ${step.dur} beats<br>${parts.length ? parts.join("<br>") : "rest"}`;
  }

  function updateProgress(i) {
    const total = player.tab.steps.length;
    const pct = (i < 0) ? 0 : ((i + 1) / (total || 1)) * 100;
    progressEl.style.width = pct + "%";
    posEl.textContent = `${i < 0 ? 0 : i + 1}/${total}`;
  }

  player.onStep = (i) => {
    tabEl.querySelectorAll(".tp-step").forEach(el => {
      const active = i >= 0 && parseInt(el.dataset.step, 10) === i;
      el.classList.toggle("active", active);
      el.style.background = active ? "var(--green)" : "";
      el.style.color = active ? "#000" : "";
      el.style.borderRadius = active ? "3px" : "";
    });
    updateFretboard(i);
    updateNoteInfo(i);
    updateProgress(i);
  };
  player.onCount = (n) => {
    countEl.textContent = n > 0 ? `Count-in: ${n}` : "";
  };
  player.onStateChange = () => {
    playBtn.textContent = player.status === "playing" ? "⏸ Playing" : "▶ Play";
  };
  player.onComplete = () => { toast("Tab finished"); };

  renderTabDisplay();
  renderFretboard();
  updateProgress(-1);

  // sample selector
  SAMPLE_TABS.forEach((t, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = t.title;
    sampleSel.appendChild(opt);
  });
  sampleSel.onchange = () => {
    const idx = parseInt(sampleSel.value, 10);
    if (!isNaN(idx) && SAMPLE_TABS[idx]) renderTabPlayer(container, SAMPLE_TABS[idx]);
  };

  playBtn.onclick = () => player.play();
  pauseBtn.onclick = () => player.pause();
  stopBtn.onclick = () => player.stop();
  speedSlider.oninput = () => {
    const v = parseFloat(speedSlider.value);
    speedVal.textContent = v + "x";
    player.setSpeed(v);
  };
  loopToggle.onchange = () => {
    player.loopEnabled = loopToggle.checked;
    if (loopToggle.checked) {
      player.loopStart = parseInt(loopStartInput.value, 10) || 0;
      player.loopEnd = parseInt(loopEndInput.value, 10) || (player.tab.steps.length - 1);
    }
  };
  loopStartInput.onchange = () => { if (loopToggle.checked) player.loopStart = parseInt(loopStartInput.value, 10) || 0; };
  loopEndInput.onchange = () => { if (loopToggle.checked) player.loopEnd = parseInt(loopEndInput.value, 10) || (player.tab.steps.length - 1); };
  setLoopStartBtn.onclick = () => {
    const v = player.currentStep >= 0 ? player.currentStep : 0;
    loopStartInput.value = v;
    if (loopToggle.checked) player.loopStart = v;
  };
  setLoopEndBtn.onclick = () => {
    const v = player.currentStep >= 0 ? player.currentStep : (player.tab.steps.length - 1);
    loopEndInput.value = v;
    if (loopToggle.checked) player.loopEnd = v;
  };
  metroCheckbox.onchange = () => { player.metronomeEnabled = metroCheckbox.checked; };
  countinCheckbox.onchange = () => { player.countInEnabled = countinCheckbox.checked; };
  libBtn.onclick = () => renderTabPlayer(container);

  editor.value = tabToAscii(player.tab);
  loadEditorBtn.onclick = () => {
    const parsed = parseTab(editor.value);
    if (!parsed.steps || !parsed.steps.length) { toast("No se pudo parsear el tab"); return; }
    player.loadTab(parsed);
    currentTab = parsed;
    titleEl.textContent = parsed.title + (parsed.artist ? " — " + parsed.artist : "");
    renderTabDisplay();
    renderFretboard();
    updateProgress(-1);
    updateNoteInfo(-1);
    editor.value = tabToAscii(parsed);
    toast("Tab cargado");
  };
  exportBtn.onclick = () => {
    const text = tabToAscii(player.tab);
    const full = `# ${player.tab.title}${player.tab.artist ? " - " + player.tab.artist : ""}\n# BPM: ${player.tab.bpm}\n\n` + text + "\n";
    const blob = new Blob([full], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = (player.tab.title || "tab").replace(/\s+/g, "_") + ".txt";
    a.click();
    URL.revokeObjectURL(url);
    toast("Exportado");
  };

  // initialize loop end input
  loopEndInput.value = player.tab.steps.length ? player.tab.steps.length - 1 : 0;
  loopStartInput.value = 0;
}

export default { TabPlayer, renderTabPlayer, SAMPLE_TABS, parseTab, tabToAscii, normalizeTab };
