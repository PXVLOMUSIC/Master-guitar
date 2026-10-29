// chord-wheel.js — Interactive Circle of Fifths (Rueda de acordes) for Strumio
import { playChord } from "./audio.js";
import { midiToFreq, NOTE_NAMES } from "./instruments.js";
import { t } from "./i18n.js";

const $ = (sel, root = document) => (root || document).querySelector(sel);

const NOTES = [...NOTE_NAMES];
const KEYS = ["C", "G", "D", "A", "E", "B", "F#", "C#", "G#", "D#", "A#", "F"];
const MINORS = ["Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "A#m", "Fm", "Cm", "Gm", "Dm"];

const ROMANS = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];

const PROGRESSIONS = [
  { genre: "Pop", name: "I–V–vi–IV", romans: ["I", "V", "vi", "IV"] },
  { genre: "Pop", name: "I–vi–IV–V (años 50)", romans: ["I", "vi", "IV", "V"] },
  { genre: "Rock", name: "I–IV–V", romans: ["I", "IV", "V"] },
  { genre: "Rock", name: "I–V–vi–iii–IV", romans: ["I", "V", "vi", "iii", "IV"] },
  { genre: "Blues", name: "Blues 12 compases", romans: ["I", "I", "I", "I", "IV", "IV", "I", "I", "V", "IV", "I", "V"] },
  { genre: "Jazz", name: "ii–V–I", romans: ["ii", "V", "I"] },
  { genre: "Jazz", name: "I–vi–ii–V", romans: ["I", "vi", "ii", "V"] },
  { genre: "Clásico", name: "Canon (Pachelbel)", romans: ["I", "V", "vi", "iii", "IV", "I", "IV", "V"] },
];

function normalizeNote(n) { return String(n).trim(); }
function noteIndex(n) { return NOTES.indexOf(normalizeNote(n)); }

function diatonicChords(key) {
  const ri = noteIndex(key);
  const scale = [0, 2, 4, 5, 7, 9, 11];
  const quals = ["maj", "min", "min", "maj", "maj", "min", "dim"];
  const suffix = { maj: "", min: "m", dim: "dim" };
  return scale.map((s, i) => NOTES[(ri + s) % 12] + (suffix[quals[i]] || ""));
}

function romanIndex(roman) {
  const r = String(roman).replace(/[0-9°]/g, "").toLowerCase();
  const map = { i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6 };
  if (map[r] != null) return map[r];
  return 0;
}

function chordQuality(name) {
  if (/dim$/i.test(name)) return "dim";
  if (/m(?!aj)/i.test(name) && !/maj/i.test(name)) return "min";
  return "maj";
}

function chordFreqs(name) {
  const m = String(name).match(/^([A-G]#?)(.*)$/);
  if (!m) return [261.63];
  const root = m[1];
  const ri = noteIndex(root);
  const qual = chordQuality(name);
  let intervals = [0, 4, 7];
  if (qual === "min") intervals = [0, 3, 7];
  else if (qual === "dim") intervals = [0, 3, 6];
  // 7ths for jazz-ish names
  if (/7$/.test(name)) {
    if (qual === "min") intervals = [0, 3, 7, 10];
    else if (/maj7$/i.test(name)) intervals = [0, 4, 7, 11];
    else intervals = [0, 4, 7, 10];
  }
  const baseMidi = 12 * 5 + ri; // octave 4
  return intervals.map((s) => midiToFreq(baseMidi + s));
}

function sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }

function sectorPath(cx, cy, rOuter, rInner, startDeg, endDeg) {
  const s = (startDeg * Math.PI) / 180;
  const e = (endDeg * Math.PI) / 180;
  const x1o = cx + rOuter * Math.cos(s);
  const y1o = cy + rOuter * Math.sin(s);
  const x2o = cx + rOuter * Math.cos(e);
  const y2o = cy + rOuter * Math.sin(e);
  const x1i = cx + rInner * Math.cos(e);
  const y1i = cy + rInner * Math.sin(e);
  const x2i = cx + rInner * Math.cos(s);
  const y2i = cy + rInner * Math.sin(s);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1o} ${y1o} A ${rOuter} ${rOuter} 0 ${large} 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${rInner} ${rInner} 0 ${large} 0 ${x2i} ${y2i} Z`;
}

export function renderChordWheel(container) {
  if (!container) return;
  container.innerHTML = `
    <div class="chord-wheel">
      <div class="cw-head">
        <h2>⭕ ${t("chordWheel.title")}</h2>
        <p class="cw-subtitle">${t("chordWheel.subtitle")}</p>
      </div>
      <div class="cw-wheel-wrap">
        <svg class="cw-svg" viewBox="0 0 420 420" width="420" height="420" role="img" aria-label="Circle of Fifths">
          <g class="cw-sectors"></g>
          <circle cx="210" cy="210" r="80" fill="var(--card)" stroke="var(--card-3)" stroke-width="2"/>
          <text x="210" y="205" text-anchor="middle" class="cw-center-title">Circle of</text>
          <text x="210" y="225" text-anchor="middle" class="cw-center-title">Fifths</text>
        </svg>
      </div>
      <div class="cw-panel"></div>
    </div>`;

  const svg = container.querySelector(".cw-svg");
  const sectorsG = container.querySelector(".cw-sectors");
  const panel = container.querySelector(".cw-panel");

  const cx = 210, cy = 210, rOuter = 190, rInner = 95;

  KEYS.forEach((key, i) => {
    const centerDeg = i * 30 - 90;
    const startDeg = centerDeg - 15;
    const endDeg = centerDeg + 15;
    const path = sectorPath(cx, cy, rOuter, rInner, startDeg, endDeg);
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "cw-sector");
    g.setAttribute("data-key", key);
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", path);
    p.setAttribute("class", "cw-sector__path");
    g.appendChild(p);

    // major label
    const rad = ((centerDeg) * Math.PI) / 180;
    const mx = cx + 150 * Math.cos(rad);
    const my = cy + 150 * Math.sin(rad);
    const majorText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    majorText.setAttribute("x", mx);
    majorText.setAttribute("y", my - 6);
    majorText.setAttribute("text-anchor", "middle");
    majorText.setAttribute("class", "cw-sector__major");
    majorText.textContent = key;
    g.appendChild(majorText);

    const minorText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    const mix = cx + 118 * Math.cos(rad);
    const miy = cy + 118 * Math.sin(rad);
    minorText.setAttribute("x", mix);
    minorText.setAttribute("y", miy + 4);
    minorText.setAttribute("text-anchor", "middle");
    minorText.setAttribute("class", "cw-sector__minor");
    minorText.textContent = MINORS[i];
    g.appendChild(minorText);

    g.addEventListener("click", () => selectKey(key));
    sectorsG.appendChild(g);
  });

  let selected = "C";

  function selectKey(key) {
    selected = key;
    sectorsG.querySelectorAll(".cw-sector").forEach((sec) => {
      sec.classList.toggle("is-selected", sec.dataset.key === key);
    });
    renderPanel(key);
  }

  async function playProgression(romans, diatonic) {
    for (const r of romans) {
      const idx = romanIndex(r);
      const chord = diatonic[idx];
      playChord(chordFreqs(chord), 1.1);
      await sleep(950);
    }
  }

  function renderPanel(key) {
    const idx = KEYS.indexOf(key);
    const minor = MINORS[idx >= 0 ? idx : 0];
    const diatonic = diatonicChords(key);
    panel.innerHTML = `
      <div class="cw-keycard">
        <div class="cw-keytitle">${key} mayor <span class="cw-rel">${t("chordWheel.relativeMinor")}: ${minor}</span></div>
        <div class="cw-section-title">${t("chordWheel.diatonic")}</div>
        <div class="cw-chords">
          ${diatonic.map((c, i) => `
            <button class="cw-chord" data-chord="${c}">
              <span class="cw-roman">${ROMANS[i]}</span>
              <span class="cw-name">${c}</span>
            </button>`).join("")}
        </div>
        <div class="cw-section-title">${t("chordWheel.progressions")}</div>
        <div class="cw-progs">
          ${PROGRESSIONS.map((p, pi) => `
            <div class="cw-prog">
              <div class="cw-prog__head">
                <strong>${p.name}</strong>
                <span class="cw-genre">${p.genre}</span>
                <button class="cw-playprog" data-prog="${pi}">▶ ${t("chordWheel.play")}</button>
              </div>
              <div class="cw-prog__chords">
                ${p.romans.map((r) => `<span class="cw-chip">${r} → ${diatonic[romanIndex(r)]}</span>`).join("")}
              </div>
            </div>`).join("")}
        </div>
      </div>`;

    panel.querySelectorAll(".cw-chord").forEach((btn) => {
      btn.addEventListener("click", () => playChord(chordFreqs(btn.dataset.chord), 1.8));
    });
    panel.querySelectorAll(".cw-playprog").forEach((btn) => {
      const p = PROGRESSIONS[+btn.dataset.prog];
      btn.addEventListener("click", () => playProgression(p.romans, diatonic));
    });
  }

  selectKey(selected);
}