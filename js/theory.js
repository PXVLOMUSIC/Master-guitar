// theory.js — interactive music theory for Strumio
// Exports: renderTheory, renderCircleOfFifths, renderProgressionBuilder,
//          renderScaleExplorer, generateTheoryQuiz

import { playTone, playChord, startMetronome, stopMetronome, earInstrument } from "./audio.js";
import { midiToFreq, NOTE_NAMES } from "./instruments.js";

const $ = (sel, root = document) => (root || document).querySelector(sel);
const $$ = (sel, root = document) => [...(root || document).querySelectorAll(sel)];

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}

const NOTES = [...NOTE_NAMES];
const FLAT_TO_SHARP = { "Cb": "B", "Db": "C#", "Eb": "D#", "Fb": "E", "Gb": "F#", "Ab": "G#", "Bb": "A#" };
function normalizeNote(n) { n = String(n).trim(); return FLAT_TO_SHARP[n] || n; }
function noteIndex(n) { return NOTES.indexOf(normalizeNote(n)); }

const INTERVALS = [
  { name: "Unísono", semis: 0 },
  { name: "2ª menor (m2)", semis: 1 },
  { name: "2ª mayor (M2)", semis: 2 },
  { name: "3ª menor (m3)", semis: 3 },
  { name: "3ª mayor (M3)", semis: 4 },
  { name: "4ª justa (P4)", semis: 5 },
  { name: "Tritono", semis: 6 },
  { name: "5ª justa (P5)", semis: 7 },
  { name: "6ª menor (m6)", semis: 8 },
  { name: "6ª mayor (M6)", semis: 9 },
  { name: "7ª menor (m7)", semis: 10 },
  { name: "7ª mayor (M7)", semis: 11 },
  { name: "Octava (P8)", semis: 12 },
];

const SCALES = {
  "Mayor (jónico)": [0, 2, 4, 5, 7, 9, 11],
  "Menor natural (eólico)": [0, 2, 3, 5, 7, 8, 10],
  "Pentatónica menor": [0, 3, 5, 7, 10],
  "Pentatónica mayor": [0, 2, 4, 7, 9],
  "Blues": [0, 3, 5, 6, 7, 10],
  "Dórico": [0, 2, 3, 5, 7, 9, 10],
  "Mixolidio": [0, 2, 4, 5, 7, 9, 10],
  "Lidio": [0, 2, 4, 6, 7, 9, 11],
  "Frigio": [0, 1, 3, 5, 7, 8, 10],
  "Locrio": [0, 1, 3, 5, 6, 8, 10],
  "Armónica menor": [0, 2, 3, 5, 7, 8, 11],
  "Melódica menor": [0, 2, 3, 5, 7, 9, 11],
  "Cromática": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

const CHORD_FORMULAS = {
  "Mayor": [0, 4, 7],
  "Menor": [0, 3, 7],
  "Disminuido": [0, 3, 6],
  "Aumentado": [0, 4, 8],
  "Mayor 7": [0, 4, 7, 11],
  "Menor 7": [0, 3, 7, 10],
  "Dominante 7": [0, 4, 7, 10],
  "Menor 7 b5": [0, 3, 6, 10],
  "Mayor 9": [0, 4, 7, 11, 14],
  "Menor 9": [0, 3, 7, 10, 14],
};

const COMMON_PROGRESSIONS = [
  { name: "I–V–vi–IV (pop)", chords: ["C", "G", "Am", "F"] },
  { name: "I–IV–V–I", chords: ["C", "F", "G", "C"] },
  { name: "ii–V–I (jazz)", chords: ["Dm", "G", "C"] },
  { name: "I–vi–IV–V (50s)", chords: ["C", "Am", "F", "G"] },
  { name: "Blues 12 compases", chords: ["C", "C", "C", "C", "F", "F", "C", "C", "G", "F", "C", "G"] },
  { name: "Andaluza", chords: ["Am", "G", "F", "E"] },
  { name: "I–V–vi–iii–IV", chords: ["C", "G", "Am", "Em", "F"] },
  { name: "Canon (Pachelbel)", chords: ["C", "G", "Am", "Em", "F", "C", "F", "G"] },
];

const CHORD_NOTES = {
  "Em": [82.41, 123.47, 164.81, 196.00, 246.94, 329.63],
  "Am": [110.00, 130.81, 164.81, 196.00, 220.00, 261.63],
  "C": [130.81, 164.81, 196.00, 261.63, 329.63, 392.00],
  "G": [98.00, 123.47, 146.83, 196.00, 246.94, 392.00],
  "D": [146.83, 185.00, 220.00, 293.66, 369.99, 440.00],
  "F": [87.31, 130.81, 174.61, 219.99, 261.63, 349.23],
  "A": [110.00, 138.59, 164.81, 220.00, 277.18, 329.63],
  "E": [82.41, 103.83, 123.47, 164.81, 207.65, 246.94],
  "Dm": [146.83, 174.61, 220.00, 293.66, 349.23, 440.00],
  "Bm": [123.47, 146.83, 185.00, 246.94, 308.68, 369.99],
  "Asus2": [110.00, 138.59, 164.81, 220.00, 293.66, 329.63],
  "Dsus2": [146.83, 185.00, 220.00, 293.66, 329.63, 440.00],
  "G7": [98.00, 123.47, 146.83, 196.00, 246.94, 349.23],
  "Cadd9": [130.81, 164.81, 196.00, 220.00, 261.63, 392.00],
  "Dm7": [146.83, 174.61, 220.00, 261.63, 349.23, 440.00],
  "G7b": [98.00, 123.47, 146.83, 196.00, 246.94, 349.23],
  "Cmaj7": [130.81, 164.81, 196.00, 246.94, 329.63, 392.00],
  "Em7": [82.41, 123.47, 164.81, 196.00, 246.94, 293.66],
  "A7": [110.00, 138.59, 164.81, 207.65, 277.18, 329.63],
  "B7": [123.47, 146.83, 185.00, 220.00, 277.18, 369.99],
  "E7": [82.41, 103.83, 123.47, 146.83, 207.65, 246.94],
  "F7": [87.31, 130.81, 174.61, 219.99, 261.63, 311.13],
};

// ---------------- helpers ----------------
function diatonicChords(key) {
  const ri = noteIndex(key);
  const scale = [0, 2, 4, 5, 7, 9, 11];
  const quals = ["maj", "min", "min", "maj", "maj", "min", "dim"];
  const suffix = { maj: "", min: "m", dim: "dim" };
  return scale.map((s, i) => NOTES[(ri + s) % 12] + (suffix[quals[i]] || ""));
}

function romanNumerals() {
  return ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
}

// ---------------- renderTheory ----------------
export function renderTheory(container) {
  container.innerHTML = `
    <div class="card">
      <h2>🎼 Teoría musical</h2>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0" id="theoryTabs">
        ${["Intervalos", "Escalas", "Acordes", "Armonía", "Ritmo", "Quiz"].map((t, i) =>
          `<button class="btn btn-secondary theory-tab" data-tab="${i}" style="padding:6px 10px;font-size:13px">${t}</button>`).join("")}
      </div>
      <div id="theoryArea"></div>
    </div>`;
  const area = $("#theoryArea", container);
  const tabs = $$(".theory-tab", container);
  const renderers = [renderIntervals, renderScalesSection, renderChordsSection, renderHarmonySection, renderRhythmSection, renderQuizSection];
  function activate(i) {
    tabs.forEach((b, j) => b.classList.toggle("active", j === i));
    area.innerHTML = "";
    renderers[i](area);
  }
  tabs.forEach((b, i) => b.onclick = () => activate(i));
  activate(0);
}

function renderIntervals(area) {
  area.innerHTML = `
    <h3>Intervalos</h3>
    <p style="color:var(--muted);font-size:13px">Distancia entre dos notas. Escucha cada intervalo.</p>
    <div id="intList"></div>
    <div class="card" style="margin-top:12px">
      <h4>Practicar</h4>
      <select id="intSel" style="width:100%;padding:8px;border-radius:8px;border:2px solid var(--border);background:var(--card2);color:var(--text);font-weight:700"></select>
      <button class="btn btn-primary btn-block" style="margin-top:8px" id="playInt">🔊 Reproducir intervalo</button>
    </div>`;
  const list = $("#intList", area);
  list.innerHTML = INTERVALS.map(iv =>
    `<div class="ach"><span class="ico">🎵</span><div class="info"><div class="name">${iv.name}</div><div class="desc">${iv.semis} semitonos</div></div><button class="btn btn-secondary" data-iv="${iv.name}" style="padding:6px 10px">▶</button></div>`).join("");
  list.querySelectorAll("button").forEach(b => {
    b.onclick = () => {
      const iv = INTERVALS.find(x => x.name === b.dataset.iv);
      const root = 60;
      playTone(midiToFreq(root), 0.6, { instrument: earInstrument() });
      setTimeout(() => playTone(midiToFreq(root + iv.semis), 0.6, { instrument: earInstrument() }), 700);
    };
  });
  const sel = $("#intSel", area);
  sel.innerHTML = INTERVALS.map(iv => `<option value="${iv.name}">${iv.name}</option>`).join("");
  $("#playInt", area).onclick = () => {
    const iv = INTERVALS.find(x => x.name === sel.value);
    const root = 60 + Math.floor(Math.random() * 6);
    playTone(midiToFreq(root), 0.6, { instrument: earInstrument() });
    setTimeout(() => playTone(midiToFreq(root + iv.semis), 0.6, { instrument: earInstrument() }), 700);
  };
}

function renderScalesSection(area) {
  area.innerHTML = `
    <h3>Escalas</h3>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">
      <select id="scRoot" style="padding:8px;border-radius:8px;border:2px solid var(--border);background:var(--card2);color:var(--text);font-weight:700">
        ${NOTES.map(n => `<option value="${n}">${n}</option>`).join("")}
      </select>
      <select id="scScale" style="padding:8px;border-radius:8px;border:2px solid var(--border);background:var(--card2);color:var(--text);font-weight:700">
        ${Object.keys(SCALES).map(s => `<option value="${s}">${s}</option>`).join("")}
      </select>
      <button class="btn btn-primary" id="playScale">▶ Escuchar</button>
      <button class="btn btn-secondary" id="showFb">🎸 Mástil</button>
    </div>
    <div id="scNotes"></div>
    <div id="scFb" style="margin-top:12px"></div>`;
  const rootSel = $("#scRoot", area);
  const scaleSel = $("#scScale", area);
  function updateNotes() {
    const root = rootSel.value;
    const scale = SCALES[scaleSel.value];
    const ri = noteIndex(root);
    const notes = scale.map(s => NOTES[(ri + s) % 12]);
    $("#scNotes", area).innerHTML = `<div class="card" style="padding:8px"><b>Notas:</b> ${notes.join(" – ")}</div>`;
  }
  updateNotes();
  rootSel.onchange = updateNotes;
  scaleSel.onchange = updateNotes;
  $("#playScale", area).onclick = () => {
    const root = rootSel.value;
    const scale = SCALES[scaleSel.value];
    const ri = noteIndex(root);
    const base = 60 + ri;
    let t = 0;
    scale.forEach(s => { setTimeout(() => playTone(midiToFreq(base + s), 0.35, { instrument: earInstrument() }), t); t += 320; });
    // descend
    const desc = [...scale].reverse();
    desc.forEach(s => { setTimeout(() => playTone(midiToFreq(base + s), 0.35, { instrument: earInstrument() }), t); t += 320; });
  };
  $("#showFb", area).onclick = async () => {
    const fb = await import("./fretboard.js");
    const container = $("#scFb", area);
    const root = rootSel.value;
    const scaleName = scaleSel.value;
    // map to fretboard scale key if possible
    const fbKeys = Object.keys(fb.SCALES);
    let match = fbKeys.find(k => k.toLowerCase().replace(/\s+/g, "") === scaleName.toLowerCase().replace(/\s+/g, "").replace(/[()]/g, ""));
    if (!match) {
      // try common aliases
      const alias = {
        "Mayor(jónico)": "major",
        "Menornatural(eólico)": "minor",
        "Pentatónicamenor": "pentatonicMinor",
        "Pentatónicamayor": "pentatonicMajor",
        "Blues": "blues",
        "Dórico": "dorian",
        "Mixolidio": "mixolydian",
        "Lidio": "lydian",
        "Frigio": "phrygian",
        "Locrio": "locrian",
        "Armónicamenor": "harmonicMinor",
        "Melódicamenor": "melodicMinor",
        "Cromática": "chromatic",
      };
      const clean = scaleName.replace(/\s+/g, "");
      match = alias[clean] || "major";
      if (!fb.SCALES[match]) match = fbKeys[0];
    }
    const opts = {
      strings: 6, frets: 12,
      tuning: [82.41, 110.00, 146.83, 196.00, 246.94, 329.63],
      showNotes: true, rootNote: root, scale: fb.SCALES[match],
    };
    fb.renderFretboard(container, opts);
  };
}

function renderChordsSection(area) {
  area.innerHTML = `
    <h3>Acordes</h3>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">
      <select id="chRoot" style="padding:8px;border-radius:8px;border:2px solid var(--border);background:var(--card2);color:var(--text);font-weight:700">
        ${NOTES.map(n => `<option value="${n}">${n}</option>`).join("")}
      </select>
      <select id="chType" style="padding:8px;border-radius:8px;border:2px solid var(--border);background:var(--card2);color:var(--text);font-weight:700">
        ${Object.keys(CHORD_FORMULAS).map(t => `<option value="${t}">${t}</option>`).join("")}
      </select>
      <button class="btn btn-primary" id="playChordBtn">▶ Escuchar</button>
    </div>
    <div id="chInfo"></div>
    <div class="card" style="margin-top:12px">
      <h4>Fórmulas (intervalos desde la fundamental)</h4>
      <div id="chFormula" style="font-family:monospace;font-size:13px;line-height:1.6"></div>
    </div>`;
  const rootSel = $("#chRoot", area);
  const typeSel = $("#chType", area);
  function update() {
    const root = rootSel.value;
    const type = typeSel.value;
    const formula = CHORD_FORMULAS[type];
    const notes = formula.map(s => NOTES[(noteIndex(root) + s) % 12]);
    $("#chInfo", area).innerHTML = `<div class="card" style="padding:8px"><b>${root} ${type}</b> → ${notes.join(" – ")}</div>`;
    $("#chFormula", area).innerHTML = Object.entries(CHORD_FORMULAS).map(([t, f]) =>
      `<div>${t}: ${f.join("–")} semitonos</div>`).join("");
  }
  update();
  rootSel.onchange = update;
  typeSel.onchange = update;
  $("#playChordBtn", area).onclick = () => {
    const root = rootSel.value;
    const type = typeSel.value;
    const formula = CHORD_FORMULAS[type];
    const base = 60 + noteIndex(root);
    const freqs = formula.map(s => midiToFreq(base + s));
    playChord(freqs, 1.2, { arpeggiate: true, stagger: 0.06 });
  };
}

function renderHarmonySection(area) {
  area.innerHTML = `
    <h3>Armonía</h3>
    <p style="color:var(--muted);font-size:13px">Acordes diatónicos de una tonalidad mayor (I–VII).</p>
    <div style="margin:8px 0">
      <label style="font-weight:700">Tonalidad: </label>
      <select id="hKey" style="padding:8px;border-radius:8px;border:2px solid var(--border);background:var(--card2);color:var(--text);font-weight:700">
        ${NOTES.map(n => `<option value="${n}">${n}</option>`).join("")}
      </select>
    </div>
    <div id="hChords"></div>
    <div class="card" style="margin-top:12px">
      <h4>Progresiones comunes</h4>
      <div id="hProg"></div>
    </div>`;
  const keySel = $("#hKey", area);
  function update() {
    const key = keySel.value;
    const chords = diatonicChords(key);
    const romans = romanNumerals();
    $("#hChords", area).innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px;margin-top:8px">
      ${chords.map((c, i) => `<div class="card" style="padding:8px;text-align:center"><div style="font-size:12px;color:var(--muted)">${romans[i]}</div><div style="font-weight:800;font-size:16px">${c}</div></div>`).join("")}
    </div>`;
  }
  update();
  keySel.onchange = update;
  $("#hProg", area).innerHTML = COMMON_PROGRESSIONS.map(p =>
    `<div class="ach"><span class="ico">🎼</span><div class="info"><div class="name">${p.name}</div><div class="desc">${p.chords.join(" – ")}</div></div>
      <button class="btn btn-secondary" data-pn="${p.name}" style="padding:6px 10px">▶</button></div>`).join("");
  $("#hProg", area).querySelectorAll("button").forEach(b => {
    b.onclick = () => {
      const p = COMMON_PROGRESSIONS.find(x => x.name === b.dataset.pn);
      let t = 0;
      p.chords.forEach(ch => {
        setTimeout(() => {
          const notes = CHORD_NOTES[ch];
          if (notes) playChord(notes, 0.9, { arpeggiate: true, stagger: 0.05 });
          else playTone(261.63, 0.9);
        }, t);
        t += 700;
      });
    };
  });
}

function renderRhythmSection(area) {
  area.innerHTML = `
    <h3>Ritmo</h3>
    <div class="card" style="margin-bottom:12px">
      <p style="margin:0 0 8px;font-weight:700">Valores de nota (en compás de 4/4)</p>
      <div style="font-family:monospace;line-height:1.8;font-size:13px">
        Redonda = 4 tiempos<br>
        Blanca = 2 tiempos<br>
        Negra = 1 tiempo<br>
        Corchea = 1/2 tiempo<br>
        Semicorchea = 1/4 tiempo
      </div>
    </div>
    <div class="card" style="margin-bottom:12px">
      <p style="margin:0 0 8px;font-weight:700">Compases comunes</p>
      <div style="font-size:13px;line-height:1.6;color:var(--muted)">
        4/4 (común) · 3/4 (vals) · 6/8 (compuesto) · 2/4 (marcha)
      </div>
    </div>
    <div class="card" style="text-align:center">
      <h4>⏱ Metrónomo</h4>
      <div style="font-size:32px;font-weight:900;margin:12px 0" id="bpm">100 BPM</div>
      <input type="range" min="40" max="220" value="100" id="bpmSlider" style="width:100%">
      <div class="metro" id="beats"></div>
      <button class="btn btn-primary btn-block" id="metroToggle">▶ Iniciar</button>
    </div>`;
  const beatsContainer = $("#beats", area);
  for (let i = 0; i < 4; i++) { const b = document.createElement("div"); b.className = "beat"; beatsContainer.appendChild(b); }
  const beatEls = $$(".beat", area);
  let running = false;
  function setBeatActive(i) { beatEls.forEach((b, idx) => b.classList.toggle("active", idx === (i % beatEls.length))); }
  $("#metroToggle", area).onclick = () => {
    if (running) { stopMetronome(); running = false; $("#metroToggle", area).textContent = "▶ Iniciar"; beatEls.forEach(b => b.classList.remove("active")); return; }
    running = true; $("#metroToggle", area).textContent = "⏹ Detener";
    const bpm = parseInt($("#bpmSlider", area).value);
    startMetronome(bpm, 4, (bi) => setBeatActive(bi));
  };
  $("#bpmSlider", area).oninput = () => {
    const bpm = parseInt($("#bpmSlider", area).value);
    $("#bpm", area).textContent = bpm + " BPM";
    if (running) { stopMetronome(); startMetronome(bpm, 4, (bi) => setBeatActive(bi)); }
  };
}

function renderQuizSection(area) {
  const questions = generateTheoryQuiz(8);
  let qi = 0, score = 0;
  function drawQ() {
    if (qi >= questions.length) {
      area.innerHTML = `<div class="card" style="text-align:center;padding:24px">
        <div style="font-size:48px">🎉</div>
        <h3>Resultado: ${score}/${questions.length}</h3>
        <button class="btn btn-primary btn-block" id="retryQuiz">Reintentar</button>
      </div>`;
      $("#retryQuiz", area).onclick = () => renderQuizSection(area);
      return;
    }
    const q = questions[qi];
    area.innerHTML = `<h3>Quiz de teoría</h3>
      <div class="qcard"><div class="prompt">${q.prompt}</div></div>
      <div class="options">${q.options.map((o, i) => `<div class="opt" data-i="${i}">${o}</div>`).join("")}</div>
      <div style="margin-top:12px;color:var(--muted)">Pregunta ${qi + 1} de ${questions.length} · Aciertos: ${score}</div>`;
    area.querySelectorAll(".opt").forEach(o => {
      o.onclick = () => {
        const i = parseInt(o.dataset.i);
        if (i === q.answer) { o.classList.add("correct"); score++; toast("¡Correcto!"); }
        else { o.classList.add("wrong"); area.querySelectorAll(".opt")[q.answer].classList.add("correct"); toast("Incorrecto"); }
        qi++;
        setTimeout(drawQ, 900);
      };
    });
  }
  drawQ();
}

// ---------------- Circle of fifths ----------------
export function renderCircleOfFifths(container) {
  container.innerHTML = `
    <div class="card">
      <h2>⭕ Círculo de quintas</h2>
      <div id="cofSvg" style="text-align:center"></div>
      <p style="color:var(--muted);font-size:13px;margin-top:8px">Toca una tonalidad para escucharla. Exterior: mayores. Interior: menores relativos.</p>
    </div>`;
  const keys = ["C", "G", "D", "A", "E", "B", "F#", "C#", "G#", "D#", "A#", "F"];
  const minors = ["Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "A#m", "Fm", "Cm", "Gm", "Dm"];
  const cx = 160, cy = 160, r = 120;
  let svg = `<svg width="320" height="320" viewBox="0 0 320 320" style="max-width:100%">`;
  svg += `<circle cx="${cx}" cy="${cy}" r="${r + 24}" fill="none" stroke="#3a4a52" stroke-width="2"/>`;
  svg += `<circle cx="${cx}" cy="${cy}" r="${r - 30}" fill="none" stroke="#3a4a52" stroke-width="1" stroke-dasharray="4 4"/>`;
  keys.forEach((k, i) => {
    const ang = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const x = cx + r * Math.cos(ang);
    const y = cy + r * Math.sin(ang);
    svg += `<g style="cursor:pointer" data-key="${k}"><circle cx="${x}" cy="${y}" r="20" fill="#1e2a30" stroke="#4a5a62"/><text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="13" font-weight="bold" fill="#e8e8e8">${k}</text></g>`;
    const x2 = cx + (r - 52) * Math.cos(ang);
    const y2 = cy + (r - 52) * Math.sin(ang);
    svg += `<text x="${x2}" y="${y2}" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="#9aa">${minors[i]}</text>`;
  });
  svg += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="#9aa">Círculo de quintas</text>`;
  svg += `</svg>`;
  const wrap = $("#cofSvg", container);
  wrap.innerHTML = svg;
  wrap.querySelectorAll("g[data-key]").forEach(g => {
    g.addEventListener("click", () => {
      const k = g.getAttribute("data-key");
      playTone(midiToFreq(60 + noteIndex(k)), 0.9);
      toast("Tonalidad: " + k);
    });
  });
}

// ---------------- Progression builder ----------------
export function renderProgressionBuilder(container) {
  container.innerHTML = `
    <div class="card">
      <h2>🎼 Constructor de progresiones</h2>
      <div style="margin:8px 0">
        <label style="font-weight:700">Tonalidad: </label>
        <select id="pbKey" style="padding:8px;border-radius:8px;border:2px solid var(--border);background:var(--card2);color:var(--text);font-weight:700">
          ${NOTES.map(n => `<option value="${n}">${n}</option>`).join("")}
        </select>
      </div>
      <div class="section-title" style="margin-left:0">Acordes disponibles (clic o arrastrar)</div>
      <div id="pbPalette" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px"></div>
      <div class="section-title" style="margin-left:0">Progresión (arrastra para reordenar, doble clic para quitar)</div>
      <div id="pbDrop" style="min-height:64px;border:2px dashed var(--border);border-radius:12px;padding:8px;display:flex;flex-wrap:wrap;gap:6px;align-items:center"></div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button class="btn btn-primary" id="pbPlay">▶ Reproducir</button>
        <button class="btn btn-secondary" id="pbClear">Limpiar</button>
      </div>
      <div class="section-title" style="margin-left:0;margin-top:12px">Progresiones comunes</div>
      <div id="pbCommon"></div>
    </div>`;
  let progression = [];
  const pbKey = $("#pbKey", container);
  function renderPalette() {
    const key = pbKey.value;
    const chords = diatonicChords(key);
    const palette = $("#pbPalette", container);
    palette.innerHTML = "";
    chords.forEach(ch => {
      const chip = document.createElement("div");
      chip.className = "btn btn-secondary";
      chip.style.cssText = "padding:6px 10px;cursor:grab";
      chip.textContent = ch;
      chip.draggable = true;
      chip.addEventListener("dragstart", e => e.dataTransfer.setData("text/plain", ch));
      chip.onclick = () => { progression.push(ch); renderDrop(); };
      palette.appendChild(chip);
    });
    ["C", "G", "Am", "F", "Dm", "Em"].forEach(ch => {
      if (!chords.includes(ch)) {
        const chip = document.createElement("div");
        chip.className = "btn btn-ghost";
        chip.style.cssText = "padding:6px 10px;cursor:grab;border:1px dashed var(--border)";
        chip.textContent = ch;
        chip.draggable = true;
        chip.addEventListener("dragstart", e => e.dataTransfer.setData("text/plain", ch));
        chip.onclick = () => { progression.push(ch); renderDrop(); };
        palette.appendChild(chip);
      }
    });
  }
  function renderDrop() {
    const drop = $("#pbDrop", container);
    drop.innerHTML = "";
    if (progression.length === 0) {
      drop.innerHTML = `<span style="color:var(--muted)">Arrastra o haz clic en acordes</span>`;
      return;
    }
    progression.forEach((ch, i) => {
      const chip = document.createElement("div");
      chip.className = "btn btn-primary";
      chip.style.cssText = "padding:6px 10px;cursor:grab";
      chip.textContent = ch;
      chip.draggable = true;
      chip.addEventListener("dragstart", e => e.dataTransfer.setData("text/plain", "idx:" + i));
      chip.addEventListener("dragover", e => e.preventDefault());
      chip.addEventListener("drop", e => {
        e.preventDefault();
        const data = e.dataTransfer.getData("text/plain");
        if (data.startsWith("idx:")) {
          const from = parseInt(data.split(":")[1], 10);
          const [moved] = progression.splice(from, 1);
          progression.splice(i, 0, moved);
          renderDrop();
        } else {
          progression.splice(i, 0, data);
          renderDrop();
        }
      });
      chip.ondblclick = () => { progression.splice(i, 1); renderDrop(); };
      drop.appendChild(chip);
    });
  }
  const dropZone = $("#pbDrop", container);
  dropZone.addEventListener("dragover", e => e.preventDefault());
  dropZone.addEventListener("drop", e => {
    e.preventDefault();
    const data = e.dataTransfer.getData("text/plain");
    if (data.startsWith("idx:")) return;
    progression.push(data);
    renderDrop();
  });
  pbKey.onchange = renderPalette;
  $("#pbPlay", container).onclick = () => {
    progression.forEach((ch, i) => {
      setTimeout(() => {
        const notes = CHORD_NOTES[ch];
        if (notes) playChord(notes, 0.9, { arpeggiate: true, stagger: 0.04 });
        else playTone(261.63, 0.9);
      }, i * 700);
    });
  };
  $("#pbClear", container).onclick = () => { progression = []; renderDrop(); };
  const commonDiv = $("#pbCommon", container);
  commonDiv.innerHTML = COMMON_PROGRESSIONS.map(p =>
    `<div class="ach"><span class="ico">🎼</span><div class="info"><div class="name">${p.name}</div><div class="desc">${p.chords.join(" – ")}</div></div>
      <button class="btn btn-secondary" data-cp="${p.name}" style="padding:6px 10px">Cargar</button></div>`).join("");
  commonDiv.querySelectorAll("button").forEach(b => {
    b.onclick = () => {
      const p = COMMON_PROGRESSIONS.find(x => x.name === b.dataset.cp);
      progression = [...p.chords];
      renderDrop();
    };
  });
  renderPalette();
  renderDrop();
}

// ---------------- Scale explorer ----------------
export async function renderScaleExplorer(container) {
  const fb = await import("./fretboard.js");
  container.innerHTML = `
    <div class="card">
      <h2>🎸 Explorador de escalas</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">
        <select id="seRoot" style="padding:8px;border-radius:8px;border:2px solid var(--border);background:var(--card2);color:var(--text);font-weight:700">
          ${NOTES.map(n => `<option value="${n}">${n}</option>`).join("")}
        </select>
        <select id="seScale" style="padding:8px;border-radius:8px;border:2px solid var(--border);background:var(--card2);color:var(--text);font-weight:700">
          ${Object.keys(SCALES).map(s => `<option value="${s}">${s}</option>`).join("")}
        </select>
      </div>
      <div id="seFb"></div>
    </div>`;
  const rootSel = $("#seRoot", container);
  const scaleSel = $("#seScale", container);
  const fbContainer = $("#seFb", container);
  function draw() {
    const root = rootSel.value;
    const scaleName = scaleSel.value;
    const fbKeys = Object.keys(fb.SCALES);
    let match = fbKeys.find(k => k.toLowerCase().replace(/\s+/g, "") === scaleName.toLowerCase().replace(/\s+/g, "").replace(/[()]/g, ""));
    if (!match) {
      const alias = { "Mayor(jónico)": "major", "Menornatural(eólico)": "minor", "Pentatónicamenor": "pentatonicMinor", "Pentatónicamayor": "pentatonicMajor", "Blues": "blues", "Dórico": "dorian", "Mixolidio": "mixolydian", "Lidio": "lydian", "Frigio": "phrygian", "Locrio": "locrian", "Armónicamenor": "harmonicMinor", "Melódicamenor": "melodicMinor", "Cromática": "chromatic" };
      const clean = scaleName.replace(/\s+/g, "");
      match = alias[clean] || "major";
      if (!fb.SCALES[match]) match = fbKeys[0];
    }
    const opts = { strings: 6, frets: 12, tuning: [82.41, 110.00, 146.83, 196.00, 246.94, 329.63], showNotes: true, rootNote: root, scale: fb.SCALES[match] };
    fb.renderFretboard(fbContainer, opts);
  }
  draw();
  rootSel.onchange = draw;
  scaleSel.onchange = draw;
}

// ---------------- Quiz generator ----------------
export function generateTheoryQuiz(count = 5) {
  const questions = [];
  const scaleNames = Object.keys(SCALES);
  const chordTypes = Object.keys(CHORD_FORMULAS);
  const majCircle = ["C", "G", "D", "A", "E", "B", "F#", "C#", "G#", "D#", "A#", "F"];

  function qInterval() {
    const iv = INTERVALS[1 + Math.floor(Math.random() * (INTERVALS.length - 1))];
    const opts = INTERVALS.map(x => String(x.semis));
    return { prompt: `¿Cuántos semitonos tiene el intervalo "${iv.name}"?`, options: opts, answer: opts.indexOf(String(iv.semis)) };
  }
  function qScaleNote() {
    const sn = scaleNames[Math.floor(Math.random() * scaleNames.length)];
    const root = NOTES[Math.floor(Math.random() * NOTES.length)];
    const scale = SCALES[sn];
    const scaleNotes = scale.map(s => NOTES[(noteIndex(root) + s) % 12]);
    // pick a note not in scale
    let wrong;
    do { wrong = NOTES[Math.floor(Math.random() * NOTES.length)]; } while (scaleNotes.includes(wrong));
    const correct = scaleNotes[Math.floor(Math.random() * scaleNotes.length)];
    const opts = [correct, wrong, NOTES[Math.floor(Math.random() * NOTES.length)], NOTES[Math.floor(Math.random() * NOTES.length)]];
    // dedup
    const uniq = [...new Set(opts)].slice(0, 4);
    while (uniq.length < 4) uniq.push(NOTES[Math.floor(Math.random() * NOTES.length)]);
    const answer = uniq.indexOf(correct);
    return { prompt: `¿Cuál de estas notas pertenece a la escala ${sn} de ${root}?`, options: uniq, answer: answer >= 0 ? answer : 0 };
  }
  function qChordThird() {
    const ct = chordTypes[Math.floor(Math.random() * chordTypes.length)];
    const formula = CHORD_FORMULAS[ct];
    const opts = ["2", "3", "4", "5"].map(() => null);
    const vals = [formula[1], formula[1] + 1, formula[1] - 1, formula[1] + 2].map(v => String(v));
    const uniq = [...new Set(vals)].slice(0, 4);
    const answer = uniq.indexOf(String(formula[1]));
    return { prompt: `En un acorde "${ct}", ¿cuántos semitonos hay entre la fundamental y la tercera?`, options: uniq, answer: answer >= 0 ? answer : 0 };
  }
  function qCircle() {
    const i = Math.floor(Math.random() * majCircle.length);
    const key = majCircle[i];
    const next = majCircle[(i + 1) % majCircle.length];
    const opts = [next, majCircle[(i + 2) % majCircle.length], majCircle[(i - 1 + majCircle.length) % majCircle.length], majCircle[(i + 3) % majCircle.length]];
    const uniq = [...new Set(opts)].slice(0, 4);
    const answer = uniq.indexOf(next);
    return { prompt: `En el círculo de quintas, ¿qué tonalidad está una quinta justa por encima de ${key}?`, options: uniq, answer: answer >= 0 ? answer : 0 };
  }
  function qHarmony() {
    const root = NOTES[Math.floor(Math.random() * NOTES.length)];
    const chords = diatonicChords(root);
    const degree = Math.floor(Math.random() * 7);
    const romans = romanNumerals();
    const correct = chords[degree];
    const opts = [correct, chords[(degree + 1) % 7], chords[(degree + 2) % 7], chords[(degree + 3) % 7]];
    const uniq = [...new Set(opts)].slice(0, 4);
    const answer = uniq.indexOf(correct);
    return { prompt: `En la tonalidad de ${root} mayor, ¿qué acorde corresponde al grado ${romans[degree]}?`, options: uniq, answer: answer >= 0 ? answer : 0 };
  }

  const generators = [qInterval, qScaleNote, qChordThird, qCircle, qHarmony];
  for (let i = 0; i < count; i++) {
    const g = generators[Math.floor(Math.random() * generators.length)];
    questions.push(g());
  }
  return questions;
}