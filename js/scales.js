// scales.js — comprehensive scales module for Strumio
// Exports: SCALES, renderScaleExplorer, renderScaleWheel, playScale,
//          getScalePositions, renderScaleQuiz

import { playTone, startMetronome, stopMetronome } from "./audio.js";
import { midiToFreq, midiToNote, NOTE_NAMES } from "./instruments.js";
import { renderFretboard as fbRenderFretboard, getScalePositions as fbGetScalePositions } from "./fretboard.js";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const $ = (sel, root = document) => (root || document).querySelector(sel);
const $$ = (sel, root = document) => [...(root || document).querySelectorAll(sel)];

function noteIndex(n) {
  const i = NOTE_NAMES.indexOf(String(n).trim());
  return i >= 0 ? i : 0;
}

const DEGREE_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e",
  "#14b8a6", "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6",
  "#a855f7", "#ec4899"
];

function degreeColor(i) { return DEGREE_COLORS[i % DEGREE_COLORS.length]; }

const INSTRUMENT_TUNING = [82.41, 110.00, 146.83, 196.00, 246.94, 329.63];

/* ------------------------------------------------------------------ */
/* SCALES database                                                     */
/* ------------------------------------------------------------------ */
function sc(name, category, intervals, formula, description, commonUses, mood, color) {
  return { name, category, intervals: intervals.slice(), formula, description, commonUses, mood, color };
}

export const SCALES = {
  Basic: {
    major: sc("Major", "Basic", [0,2,4,5,7,9,11], "W-W-H-W-W-W-H",
      "The fundamental diatonic scale; bright and stable.",
      "Pop, rock, classical, country; the basis of most Western harmony.",
      "Happy, bright, resolved", "#3b82f6"),
    naturalMinor: sc("Natural Minor", "Basic", [0,2,3,5,7,8,10], "W-H-W-W-H-W-W",
      "The relative minor; darker than major.",
      "Rock, metal, folk, emotional ballads.",
      "Sad, dark, melancholic", "#6366f1"),
    majorPentatonic: sc("Major Pentatonic", "Basic", [0,2,4,7,9], "W-W-3-W-3",
      "Five-note scale without half steps; very singable.",
      "Country, folk, rock solos, Asian folk.",
      "Open, cheerful, simple", "#22c55e"),
    minorPentatonic: sc("Minor Pentatonic", "Basic", [0,3,5,7,10], "3-W-W-3-W",
      "The most common scale for guitar solos.",
      "Blues, rock, metal, jazz improvisation.",
      "Bluesy, gritty, versatile", "#f97316"),
    blues: sc("Blues", "Basic", [0,3,5,6,7,10], "3-W-H-H-3-W",
      "Minor pentatonic plus the blue note (b5).",
      "Blues, rock, jazz-blues.",
      "Gritty, expressive, soulful", "#ef4444"),
    majorBlues: sc("Major Blues", "Basic", [0,2,3,4,7,9], "W-H-H-3-W-3",
      "Major pentatonic plus the blue note (b3).",
      "Country blues, jazz, fusion.",
      "Bright yet bluesy", "#eab308")
  },
  Modes: {
    ionian: sc("Ionian", "Modes", [0,2,4,5,7,9,11], "W-W-H-W-W-W-H",
      "First mode of the major scale (same as Major).",
      "Pop, classical, folk.",
      "Bright, stable", "#3b82f6"),
    dorian: sc("Dorian", "Modes", [0,2,3,5,7,9,10], "W-H-W-W-W-H-W",
      "Minor with a raised 6th; jazzy minor.",
      "Jazz, funk, modal rock (So What).",
      "Cool, jazzy, minor", "#14b8a6"),
    phrygian: sc("Phrygian", "Modes", [0,1,3,5,7,8,10], "H-W-W-W-H-W-W",
      "Minor with a flat 2nd; Spanish/Flamenco flavor.",
      "Flamenco, metal, Middle-Eastern.",
      "Dark, exotic, tense", "#a855f7"),
    lydian: sc("Lydian", "Modes", [0,2,4,6,7,9,11], "W-W-W-H-W-W-H",
      "Major with a raised 4th; dreamy.",
      "Film scores, fusion, progressive rock.",
      "Dreamy, floating, bright", "#06b6d4"),
    mixolydian: sc("Mixolydian", "Modes", [0,2,4,5,7,9,10], "W-W-H-W-W-H-W",
      "Major with a flat 7th; dominant sound.",
      "Blues, rock, country, Celtic.",
      "Bluesy, dominant, warm", "#f97316"),
    aeolian: sc("Aeolian", "Modes", [0,2,3,5,7,8,10], "W-H-W-W-H-W-W",
      "Sixth mode (same as Natural Minor).",
      "Rock, metal, pop ballads.",
      "Sad, dark", "#6366f1"),
    locrian: sc("Locrian", "Modes", [0,1,3,5,6,8,10], "H-W-W-H-W-W-W",
      "Diminished mode; unstable tonic.",
      "Jazz (half-diminished), metal.",
      "Tense, unstable, dissonant", "#ef4444")
  },
  Jazz: {
    melodicMinor: sc("Melodic Minor", "Jazz", [0,2,3,5,7,9,11], "W-H-W-W-W-W-H",
      "Minor with raised 6th and 7th (ascending).",
      "Jazz, fusion, classical.",
      "Sophisticated, minor", "#8b5cf6"),
    harmonicMinor: sc("Harmonic Minor", "Jazz", [0,2,3,5,7,8,11], "W-H-W-W-H-3-H",
      "Minor with raised 7th; exotic/Arabic feel.",
      "Classical, jazz, metal, neoclassical.",
      "Dramatic, exotic", "#ec4899"),
    harmonicMajor: sc("Harmonic Major", "Jazz", [0,2,4,5,7,8,11], "W-W-H-W-H-3-H",
      "Major with lowered 6th.",
      "Jazz, modern classical.",
      "Bright yet tense", "#f43f5e"),
    diminishedWH: sc("Diminished (W-H)", "Jazz", [0,2,3,5,6,8,9,11], "W-H-W-H-W-H-W-H",
      "Symmetric whole-half diminished.",
      "Jazz (diminished chords), 20th-century.",
      "Dissonant, symmetric", "#a855f7"),
    diminishedHW: sc("Diminished (H-W)", "Jazz", [0,1,3,4,6,7,9,10], "H-W-H-W-H-W-H-W",
      "Symmetric half-whole diminished.",
      "Jazz, fusion.",
      "Dissonant, symmetric", "#a855f7"),
    wholeTone: sc("Whole Tone", "Jazz", [0,2,4,6,8,10], "W-W-W-W-W-W",
      "Six-note symmetric scale; no semitones.",
      "Impressionism, jazz (augmented chords).",
      "Dreamy, floating, ambiguous", "#06b6d4"),
    altered: sc("Altered", "Jazz", [0,1,3,4,6,8,10], "H-W-H-W-W-W-W",
      "Melodic minor 7th mode; all tensions altered.",
      "Jazz (V7alt chords).",
      "Tense, jazzy, dissonant", "#ef4444"),
    lydianDominant: sc("Lydian Dominant", "Jazz", [0,2,4,6,7,9,10], "W-W-W-H-W-H-W",
      "Lydian with flat 7th; tritone sub.",
      "Jazz (Lydian dominant chords).",
      "Bright dominant", "#eab308"),
    phrygianDominant: sc("Phrygian Dominant", "Jazz", [0,1,4,5,7,8,10], "H-3-H-W-H-W-W",
      "Phrygian with major 3rd; Spanish/Arabic.",
      "Flamenco, metal, jazz.",
      "Exotic, dominant", "#f97316"),
    mixolydianB6: sc("Mixolydian b6", "Jazz", [0,2,4,5,7,8,10], "W-W-H-W-H-W-W",
      "Mixolydian with flat 6th.",
      "Jazz (minor ii-V), rock.",
      "Dark dominant", "#fb7185"),
    dorianB2: sc("Dorian b2", "Jazz", [0,1,3,5,7,9,10], "H-W-W-W-W-H-W",
      "Dorian with flat 2nd.",
      "Jazz, fusion.",
      "Dark, exotic", "#a78bfa"),
    superLocrian: sc("Super Locrian", "Jazz", [0,1,3,4,6,8,10], "H-W-H-W-W-W-W",
      "Same as Altered; Locrian with b4.",
      "Jazz (altered dominants).",
      "Tense, dissonant", "#ef4444"),
    bebopMajor: sc("Bebop Major", "Jazz", [0,2,4,5,7,8,9,11], "W-W-H-W-H-H-W-H",
      "Major plus chromatic passing tone.",
      "Jazz (bebop lines).",
      "Swinging, chromatic", "#22c55e"),
    bebopMinor: sc("Bebop Minor", "Jazz", [0,2,3,4,5,7,9,10], "W-H-H-H-W-W-H-W",
      "Minor with chromatic passing tone.",
      "Jazz (bebop lines).",
      "Swinging, chromatic", "#3b82f6"),
    bebopDominant: sc("Bebop Dominant", "Jazz", [0,2,4,5,7,9,10,11], "W-W-H-W-W-H-H-H",
      "Mixolydian plus chromatic passing tone.",
      "Jazz (bebop lines).",
      "Swinging, dominant", "#f97316"),
    chromatic: sc("Chromatic", "Jazz", [0,1,2,3,4,5,6,7,8,9,10,11], "H-H-H-H-H-H-H-H-H-H-H-H",
      "All twelve notes.",
      "Passing tones, atonal, exercises.",
      "Neutral, all-encompassing", "#94a3b8")
  },
  Exotic: {
    hungarianMinor: sc("Hungarian Minor", "Exotic", [0,2,3,6,7,8,11], "W-H-3-H-H-3-H",
      "Minor with raised 4th and 7th.",
      "Eastern European, gypsy jazz, metal.",
      "Exotic, dramatic", "#a855f7"),
    hungarianMajor: sc("Hungarian Major", "Exotic", [0,3,4,6,7,9,10], "3-H-W-H-W-W-H",
      "Major with raised 2nd and 3rd.",
      "Eastern European, folk.",
      "Bright, exotic", "#eab308"),
    doubleHarmonicMajor: sc("Double Harmonic Major", "Exotic", [0,1,4,5,7,8,11], "H-3-H-W-H-3-H",
      "Major with flat 2nd and flat 6th.",
      "Middle-Eastern, flamenco, film.",
      "Exotic, mystical", "#ec4899"),
    doubleHarmonicMinor: sc("Double Harmonic Minor", "Exotic", [0,1,4,5,7,8,10], "H-3-H-W-H-W-W",
      "Minor variant of double harmonic.",
      "Middle-Eastern, fusion.",
      "Dark, exotic", "#f43f5e"),
    neapolitanMajor: sc("Neapolitan Major", "Exotic", [0,1,3,5,7,9,11], "H-W-W-W-W-W-H",
      "Major with flat 2nd.",
      "Classical, jazz.",
      "Bright, tense", "#06b6d4"),
    neapolitanMinor: sc("Neapolitan Minor", "Exotic", [0,1,3,5,7,8,11], "H-W-W-W-H-3-H",
      "Harmonic minor with flat 2nd.",
      "Classical, jazz.",
      "Dark, tense", "#6366f1"),
    enigmatic: sc("Enigmatic", "Exotic", [0,1,4,6,8,10,11], "H-3-W-W-W-H-H",
      "Mysterious scale used by Verdi.",
      "Classical, film.",
      "Mysterious, ambiguous", "#94a3b8"),
    persian: sc("Persian", "Exotic", [0,1,4,5,6,8,11], "H-3-H-H-W-3-H",
      "Persian/Arabic flavor.",
      "Middle-Eastern, fusion.",
      "Exotic, mystical", "#a855f7"),
    hirajoshi: sc("Hirajoshi", "Exotic", [0,2,3,7,8], "W-H-4-H-4",
      "Japanese pentatonic.",
      "Japanese folk, film, ambient.",
      "Serene, Eastern", "#22c55e"),
    inSen: sc("In-Sen", "Exotic", [0,1,5,7,10], "H-4-W-3-W",
      "Japanese pentatonic (dark).",
      "Japanese folk, ambient.",
      "Dark, Eastern", "#3b82f6"),
    iwato: sc("Iwato", "Exotic", [0,1,5,6,10], "H-4-H-4-W",
      "Japanese pentatonic.",
      "Japanese folk, ambient.",
      "Mystical, Eastern", "#8b5cf6"),
    kumoi: sc("Kumoi", "Exotic", [0,2,3,7,9], "W-H-4-W-3",
      "Japanese pentatonic (bright).",
      "Japanese folk.",
      "Bright, Eastern", "#eab308"),
    yo: sc("Yo", "Exotic", [0,2,5,7,9], "W-3-W-W-3",
      "Japanese pentatonic.",
      "Japanese folk, children's songs.",
      "Cheerful, Eastern", "#22c55e"),
    pelog: sc("Pelog", "Exotic", [0,1,3,7,8], "H-W-4-H-4",
      "Indonesian pentatonic.",
      "Gamelan, world music.",
      "Exotic, gamelan", "#f97316"),
    slendro: sc("Slendro", "Exotic", [0,2,4,7,9], "W-W-3-W-3",
      "Indonesian pentatonic (equidistant).",
      "Gamelan, world music.",
      "Open, gamelan", "#14b8a6"),
    arabic: sc("Arabic", "Exotic", [0,1,4,5,7,8,10], "H-3-H-W-H-W-W",
      "Arabic/Hijaz flavor.",
      "Middle-Eastern, fusion.",
      "Exotic, dramatic", "#f43f5e"),
    gypsy: sc("Gypsy", "Exotic", [0,2,3,6,7,8,11], "W-H-3-H-H-3-H",
      "Gypsy/Eastern European.",
      "Gypsy jazz, folk.",
      "Exotic, fiery", "#ef4444"),
    flamenco: sc("Flamenco", "Exotic", [0,1,4,5,7,8,10], "H-3-H-W-H-W-W",
      "Flamenco (Spanish phrygian).",
      "Flamenco, fusion.",
      "Passionate, Spanish", "#f97316"),
    ukrainianDorian: sc("Ukrainian Dorian", "Exotic", [0,2,3,6,7,9,10], "W-H-3-W-W-H-W",
      "Dorian with raised 4th.",
      "Eastern European, folk, jazz.",
      "Bright minor", "#a78bfa"),
    romanianMinor: sc("Romanian Minor", "Exotic", [0,2,3,6,7,8,10], "W-H-3-W-H-W-W",
      "Minor with raised 4th.",
      "Romanian folk, jazz.",
      "Exotic, minor", "#fb7185"),
    prometheus: sc("Prometheus", "Exotic", [0,2,4,6,9,10], "W-W-W-3-H-H",
      "Scriabin's mystic scale.",
      "Modern classical, fusion.",
      "Mystical, ambiguous", "#8b5cf6"),
    tritone: sc("Tritone", "Exotic", [0,1,4,6,7,10], "H-3-W-H-3-W",
      "Symmetric tritone scale.",
      "Jazz, fusion.",
      "Dissonant, symmetric", "#ec4899"),
    augmented: sc("Augmented", "Exotic", [0,3,4,7,8,11], "3-H-3-H-3-H",
      "Symmetric augmented scale.",
      "Jazz, modern classical.",
      "Dissonant, symmetric", "#a855f7")
  }
};

export const SCALE_CATEGORIES = Object.keys(SCALES);

export function getAllScales() {
  const out = [];
  for (const cat of SCALE_CATEGORIES) {
    for (const key of Object.keys(SCALES[cat])) {
      out.push({ key, ...SCALES[cat][key] });
    }
  }
  return out;
}

export function getScaleByKey(key) {
  for (const cat of SCALE_CATEGORIES) {
    if (SCALES[cat][key]) return { key, ...SCALES[cat][key] };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* getScalePositions                                                    */
/* ------------------------------------------------------------------ */
export function getScalePositions(rootMidi, scale, tuning, numFrets) {
  const intervals = Array.isArray(scale)
    ? scale
    : (scale && Array.isArray(scale.intervals)) ? scale.intervals : [];
  return fbGetScalePositions(rootMidi, intervals, tuning, numFrets);
}

/* ------------------------------------------------------------------ */
/* renderScaleWheel                                                    */
/* ------------------------------------------------------------------ */
export function renderScaleWheel(container, scale, rootMidi) {
  const root = (typeof container === "string") ? document.querySelector(container) : container;
  if (!root) return null;
  const scaleObj = (scale && Array.isArray(scale.intervals)) ? scale : { intervals: Array.isArray(scale) ? scale : [], name: "Scale" };
  const intervals = scaleObj.intervals || [];
  const rm = (rootMidi != null) ? rootMidi : 60;
  const name = scaleObj.name || "Scale";

  const size = 280;
  const cx = size / 2, cy = size / 2, r = 105;
  const degreeByPc = {};
  intervals.forEach((iv, i) => { degreeByPc[((rm + iv) % 12 + 12) % 12] = i; });

  // scale pcs sorted
  const scalePcs = intervals.map(iv => ((rm + iv) % 12 + 12) % 12);
  const sortedScalePcs = [...new Set(scalePcs)].sort((a, b) => a - b);

  let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="max-width:100%">`;
  // background
  svg += `<circle cx="${cx}" cy="${cy}" r="${r + 18}" fill="rgba(0,0,0,0.25)" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>`;
  // polygon connecting scale notes
  if (sortedScalePcs.length > 2) {
    const pts = sortedScalePcs.map(pc => {
      const ang = (pc / 12) * Math.PI * 2 - Math.PI / 2;
      const x = cx + (r - 18) * Math.cos(ang);
      const y = cy + (r - 18) * Math.sin(ang);
      return `${x},${y}`;
    }).join(" ");
    svg += `<polygon points="${pts}" fill="rgba(99,102,241,0.12)" stroke="rgba(99,102,241,0.5)" stroke-width="1.5"/>`;
  }
  // degree dots
  for (let pc = 0; pc < 12; pc++) {
    const ang = (pc / 12) * Math.PI * 2 - Math.PI / 2;
    const x = cx + r * Math.cos(ang);
    const y = cy + r * Math.sin(ang);
    const isIn = Object.prototype.hasOwnProperty.call(degreeByPc, pc);
    const deg = isIn ? degreeByPc[pc] : -1;
    const col = isIn ? degreeColor(deg) : "rgba(255,255,255,0.15)";
    const radius = isIn ? 15 : 9;
    svg += `<circle cx="${x}" cy="${y}" r="${radius}" fill="${col}" stroke="#0b1218" stroke-width="1.5" opacity="${isIn ? 1 : 0.6}"/>`;
    svg += `<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="${isIn ? 10 : 9}" font-weight="800" fill="${isIn ? "#0b1218" : "#cbd5e1"}" font-family="sans-serif">${NOTE_NAMES[pc]}</text>`;
    if (isIn) {
      // degree number outside
      const x2 = cx + (r + 26) * Math.cos(ang);
      const y2 = cy + (r + 26) * Math.sin(ang);
      svg += `<text x="${x2}" y="${y2 + 3}" text-anchor="middle" font-size="9" font-weight="700" fill="${degreeColor(deg)}" font-family="sans-serif">${deg + 1}</text>`;
    }
  }
  // center label
  svg += `<text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="13" font-weight="800" fill="#e2e8f0" font-family="sans-serif">${name}</text>`;
  svg += `<text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="10" fill="#94a3b8" font-family="sans-serif">${intervals.length} notes</text>`;
  svg += `</svg>`;
  root.innerHTML = svg;
  return root.querySelector("svg");
}

/* ------------------------------------------------------------------ */
/* playScale                                                            */
/* ------------------------------------------------------------------ */
let playbackToken = 0;

export function stopScalePlayback() {
  playbackToken++;
  try { stopMetronome(); } catch (e) {}
}

export function playScale(scale, rootMidi, options) {
  const opts = options || {};
  const intervals = Array.isArray(scale)
    ? scale
    : (scale && Array.isArray(scale.intervals)) ? scale.intervals : [];
  const rm = (rootMidi != null) ? rootMidi : 60;
  const direction = opts.direction || "up"; // up | down | both
  const tempo = opts.tempo || opts.bpm || 100;
  const intervalMs = Math.max(60, 60000 / tempo);
  const noteDur = Math.min(0.6, 60 / tempo);
  const instrument = opts.instrument || "guitar";

  const mids = intervals.map(iv => rm + iv);
  const seq = [];
  if (direction === "up" || direction === "both") seq.push(...mids);
  if (direction === "down" || direction === "both") {
    const desc = [...mids].reverse();
    seq.push(...desc);
  }

  const token = ++playbackToken;
  if (opts.metronome) {
    try { startMetronome(tempo, 4, null); } catch (e) {}
  }

  let i = 0;
  const step = () => {
    if (token !== playbackToken) return;
    if (i >= seq.length) {
      if (opts.metronome) { try { stopMetronome(); } catch (e) {} }
      if (typeof opts.onComplete === "function") opts.onComplete();
      return;
    }
    const midi = seq[i++];
    try { playTone(midiToFreq(midi), noteDur, { instrument, gain: 0.3 }); } catch (e) {}
    setTimeout(step, intervalMs);
  };
  setTimeout(step, 50);
  return { stop: () => { if (token === playbackToken) stopScalePlayback(); } };
}

/* ------------------------------------------------------------------ */
/* Pattern (tab) builder                                               */
/* ------------------------------------------------------------------ */
function buildTabPattern(positions) {
  const byString = Array.from({ length: 6 }, () => []);
  for (const p of positions) {
    if (p.string >= 0 && p.string < 6) byString[p.string].push(p.fret);
  }
  for (let s = 0; s < 6; s++) {
    byString[s] = [...new Set(byString[s])].sort((a, b) => a - b);
  }
  const names = ["E", "A", "D", "G", "B", "e"];
  // high e on top in tab, so reverse string order
  const lines = [];
  for (let si = 5; si >= 0; si--) {
    const frets = byString[si];
    let line = names[si] + "|";
    if (frets.length === 0) {
      line += "----------------|";
    } else {
      let cur = 0;
      const parts = [];
      for (const f of frets) {
        const gap = Math.max(1, f - cur + 1);
        parts.push("-".repeat(gap) + (f === 0 ? "0" : String(f)));
        cur = f;
      }
      line += parts.join("") + "----|";
    }
    lines.push(line);
  }
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* renderScaleExplorer                                                 */
/* ------------------------------------------------------------------ */
export async function renderScaleExplorer(container) {
  const root = (typeof container === "string") ? document.querySelector(container) : container;
  if (!root) return;

  let currentCategory = "Basic";
  let currentKey = Object.keys(SCALES[currentCategory])[0];
  let rootNote = "C";
  let tempo = 100;
  let direction = "up";
  let position = 0; // 0..4
  let isPlaying = false;

  const positionWindows = [
    { label: "Pos 1", start: 0, end: 4 },
    { label: "Pos 2", start: 2, end: 6 },
    { label: "Pos 3", start: 4, end: 8 },
    { label: "Pos 4", start: 6, end: 10 },
    { label: "Pos 5", start: 8, end: 12 }
  ];

  root.innerHTML = `
    <div class="card" style="background:linear-gradient(135deg,#0f172a,#1e293b);border:1px solid rgba(255,255,255,0.08)">
      <h2 style="margin:0 0 4px">🎼 Explorador de escalas</h2>
      <p style="color:var(--muted);font-size:13px;margin:0 0 12px">Explora todas las escalas, visualiza, escucha y practica.</p>

      <div id="catTabs" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px"></div>

      <div id="scaleCards" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-bottom:12px"></div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
        <label style="font-weight:700;font-size:13px">Fundamental:</label>
        <select id="rootSel" style="padding:8px;border-radius:8px;border:2px solid var(--border);background:var(--card2);color:var(--text);font-weight:700"></select>
        <label style="font-weight:700;font-size:13px;margin-left:8px">Posición:</label>
        <select id="posSel" style="padding:8px;border-radius:8px;border:2px solid var(--border);background:var(--card2);color:var(--text);font-weight:700"></select>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
        <button class="btn btn-primary" id="playUp">▶ Ascendente</button>
        <button class="btn btn-primary" id="playDown">▼ Descendente</button>
        <button class="btn btn-primary" id="playBoth">⇅ Ambas</button>
        <button class="btn btn-secondary" id="playArp">🎵 Arpegio</button>
        <button class="btn btn-ghost" id="stopPlay">⏹ Stop</button>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
        <label style="font-weight:700;font-size:13px">Tempo:</label>
        <input type="range" id="tempoSlider" min="40" max="220" value="${tempo}" style="flex:1;min-width:120px">
        <span id="tempoVal" style="font-weight:800;min-width:60px">${tempo} BPM</span>
        <label style="font-weight:700;font-size:13px;margin-left:8px">Dirección:</label>
        <select id="dirSel" style="padding:6px;border-radius:8px;border:2px solid var(--border);background:var(--card2);color:var(--text);font-weight:700">
          <option value="up">Ascendente</option>
          <option value="down">Descendente</option>
          <option value="both">Ambas</option>
        </select>
      </div>

      <div id="infoPanel" style="margin-bottom:12px"></div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div>
          <div class="section-title" style="margin-left:0">Mástil</div>
          <div id="fbContainer"></div>
        </div>
        <div>
          <div class="section-title" style="margin-left:0">Rueda de escala</div>
          <div id="wheelContainer" style="text-align:center"></div>
        </div>
      </div>

      <div class="section-title" style="margin-left:0">Patrón (tab)</div>
      <pre id="tabPattern" style="background:var(--card2);padding:12px;border-radius:10px;font-size:12px;overflow:auto;color:#cbd5e1"></pre>

      <div id="degreeLegend" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px"></div>

      <div style="margin-top:12px">
        <button class="btn btn-secondary btn-block" id="openQuiz">🎯 Quiz de escalas</button>
        <div id="quizHost" style="margin-top:12px"></div>
      </div>
    </div>`;

  // populate root selector
  const rootSel = $("#rootSel", root);
  rootSel.innerHTML = NOTE_NAMES.map(n => `<option value="${n}">${n}</option>`).join("");
  rootSel.value = rootNote;
  rootSel.onchange = () => { rootNote = rootSel.value; draw(); };

  // position selector
  const posSel = $("#posSel", root);
  posSel.innerHTML = positionWindows.map((w, i) => `<option value="${i}">${w.label} (trastes ${w.start}-${w.end})</option>`).join("");
  posSel.value = String(position);
  posSel.onchange = () => { position = parseInt(posSel.value, 10); draw(); };

  // category tabs
  const catTabs = $("#catTabs", root);
  function renderCatTabs() {
    catTabs.innerHTML = SCALE_CATEGORIES.map(c =>
      `<button class="btn ${c === currentCategory ? "btn-primary" : "btn-secondary"}" data-cat="${c}" style="padding:6px 12px;font-size:13px">${c}</button>`
    ).join("");
    catTabs.querySelectorAll("button").forEach(b => {
      b.onclick = () => {
        currentCategory = b.dataset.cat;
        currentKey = Object.keys(SCALES[currentCategory])[0];
        renderCatTabs();
        renderScaleCards();
        draw();
      };
    });
  }

  function renderScaleCards() {
    const cards = $("#scaleCards", root);
    const keys = Object.keys(SCALES[currentCategory]);
    cards.innerHTML = keys.map(k => {
      const s = SCALES[currentCategory][k];
      const sel = (k === currentKey) ? "outline:2px solid " + s.color + ";" : "";
      return `<button data-key="${k}" style="text-align:left;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);cursor:pointer;${sel}">
        <div style="font-weight:800;font-size:13px;color:${s.color}">${s.name}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">${s.mood}</div>
      </button>`;
    }).join("");
    cards.querySelectorAll("button").forEach(b => {
      b.onclick = () => {
        currentKey = b.dataset.key;
        renderScaleCards();
        draw();
      };
    });
  }

  // tempo
  const tempoSlider = $("#tempoSlider", root);
  const tempoVal = $("#tempoVal", root);
  tempoSlider.oninput = () => {
    tempo = parseInt(tempoSlider.value, 10);
    tempoVal.textContent = tempo + " BPM";
  };

  const dirSel = $("#dirSel", root);
  dirSel.onchange = () => { direction = dirSel.value; };

  const fbContainer = $("#fbContainer", root);
  const wheelContainer = $("#wheelContainer", root);

  function currentScale() { return SCALES[currentCategory][currentKey]; }

  function draw() {
    const scale = currentScale();
    const rm = 60 + noteIndex(rootNote);
    const intervals = scale.intervals;
    const notes = intervals.map(iv => NOTE_NAMES[(noteIndex(rootNote) + iv) % 12]);

    // info panel
    const info = $("#infoPanel", root);
    info.innerHTML = `
      <div class="card" style="border-left:4px solid ${scale.color};padding:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-size:18px;font-weight:900;color:${scale.color}">${scale.name}</div>
            <div style="font-size:12px;color:var(--muted)">${scale.category} · ${scale.mood}</div>
          </div>
          <div style="font-size:12px;color:var(--muted);max-width:360px">${scale.description}</div>
        </div>
        <div style="margin-top:8px;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:6px;font-size:12px">
          <div><b>Fórmula:</b> ${scale.formula}</div>
          <div><b>Intervalos:</b> ${intervals.join(", ")}</div>
          <div><b>Notas:</b> ${notes.join(" – ")}</div>
          <div><b>Usos:</b> ${scale.commonUses}</div>
        </div>
      </div>`;

    // degree legend
    const legend = $("#degreeLegend", root);
    legend.innerHTML = intervals.map((iv, i) =>
      `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:${degreeColor(i)}22;border:1px solid ${degreeColor(i)}55;font-size:11px;font-weight:700;color:${degreeColor(i)}">
        ${i + 1}. ${notes[i]}
      </span>`).join("");

    // fretboard
    const tuning = INSTRUMENT_TUNING;
    const allPos = getScalePositions(rm, intervals, tuning, 12);
    const pw = positionWindows[position];
    const posPos = allPos.filter(p => p.fret >= pw.start && p.fret <= pw.end);

    function degIndex(midi) {
      const pc = ((midi % 12) + 12) % 12;
      for (let i = 0; i < intervals.length; i++) {
        if (((rm + intervals[i]) % 12 + 12) % 12 === pc) return i;
      }
      return -1;
    }
    const highlights = posPos.map(p => ({
      string: p.string,
      fret: p.fret,
      color: degreeColor(degIndex(p.midi)),
      label: String(p.note).replace(/\d+$/, "")
    }));
    fbRenderFretboard(fbContainer, {
      strings: 6, frets: 12, tuning, showNotes: false, highlights
    });

    // wheel
    renderScaleWheel(wheelContainer, scale, rm);

    // tab pattern
    const tab = $("#tabPattern", root);
    tab.textContent = buildTabPattern(posPos.length ? posPos : allPos);
  }

  // playback buttons
  $("#playUp", root).onclick = () => {
    if (isPlaying) return;
    isPlaying = true;
    playScale(currentScale(), 60 + noteIndex(rootNote), {
      direction: "up", tempo, metronome: false, instrument: "guitar",
      onComplete: () => { isPlaying = false; }
    });
  };
  $("#playDown", root).onclick = () => {
    if (isPlaying) return;
    isPlaying = true;
    playScale(currentScale(), 60 + noteIndex(rootNote), {
      direction: "down", tempo, metronome: false, instrument: "guitar",
      onComplete: () => { isPlaying = false; }
    });
  };
  $("#playBoth", root).onclick = () => {
    if (isPlaying) return;
    isPlaying = true;
    playScale(currentScale(), 60 + noteIndex(rootNote), {
      direction: "both", tempo, metronome: false, instrument: "guitar",
      onComplete: () => { isPlaying = false; }
    });
  };
  $("#playArp", root).onclick = () => {
    if (isPlaying) return;
    isPlaying = true;
    playScale(currentScale(), 60 + noteIndex(rootNote), {
      direction: "up", tempo: tempo * 1.2, metronome: false, instrument: "guitar",
      onComplete: () => { isPlaying = false; }
    });
  };
  $("#stopPlay", root).onclick = () => {
    stopScalePlayback();
    isPlaying = false;
  };

  $("#openQuiz", root).onclick = () => {
    renderScaleQuiz($("#quizHost", root));
  };

  renderCatTabs();
  renderScaleCards();
  draw();
}

/* ------------------------------------------------------------------ */
/* renderScaleQuiz                                                     */
/* ------------------------------------------------------------------ */
export function renderScaleQuiz(container) {
  const root = (typeof container === "string") ? document.querySelector(container) : container;
  if (!root) return;

  let score = 0, total = 0;
  let currentScale = null;
  let currentRoot = "C";
  let options = [];
  let answerIndex = -1;
  let answered = false;

  root.innerHTML = `
    <div class="card">
      <h2>🎯 Quiz de escalas</h2>
      <p style="color:var(--muted);font-size:13px">Escucha la escala y elige cuál es.</p>
      <div style="display:flex;gap:8px;align-items:center;margin:12px 0;flex-wrap:wrap">
        <button class="btn btn-primary" id="playQ">🔊 Reproducir escala</button>
        <button class="btn btn-secondary" id="nextQ">Siguiente</button>
        <span id="scoreQ" style="font-weight:800">Aciertos: 0/0</span>
      </div>
      <div id="qOpts" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px"></div>
      <div id="qFeedback" style="margin-top:12px;font-weight:700"></div>
    </div>`;

  const allScales = getAllScales();

  function newQuestion() {
    answered = false;
    const ans = allScales[Math.floor(Math.random() * allScales.length)];
    const distractors = [];
    while (distractors.length < 3) {
      const s = allScales[Math.floor(Math.random() * allScales.length)];
      if (s.key !== ans.key && !distractors.find(d => d.key === s.key)) distractors.push(s);
    }
    options = [ans, ...distractors].sort(() => Math.random() - 0.5);
    answerIndex = options.findIndex(o => o.key === ans.key);
    currentScale = ans;
    currentRoot = NOTE_NAMES[Math.floor(Math.random() * 12)];

    const opts = $("#qOpts", root);
    opts.innerHTML = options.map((o, i) =>
      `<button data-i="${i}" style="padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);cursor:pointer;text-align:left">
        <div style="font-weight:800;color:${o.color}">${o.name}</div>
        <div style="font-size:11px;color:var(--muted)">${o.category}</div>
      </button>`).join("");
    opts.querySelectorAll("button").forEach(b => {
      b.onclick = () => {
        if (answered) return;
        answered = true;
        const i = parseInt(b.dataset.i, 10);
        total++;
        if (i === answerIndex) {
          score++;
          b.style.outline = "2px solid #22c55e";
          $("#qFeedback", root).textContent = "✅ ¡Correcto!";
          $("#qFeedback", root).style.color = "#22c55e";
        } else {
          b.style.outline = "2px solid #ef4444";
          opts.querySelectorAll("button")[answerIndex].style.outline = "2px solid #22c55e";
          $("#qFeedback", root).textContent = "❌ Era: " + options[answerIndex].name;
          $("#qFeedback", root).style.color = "#ef4444";
        }
        $("#scoreQ", root).textContent = `Aciertos: ${score}/${total}`;
      };
    });
    $("#qFeedback", root).textContent = "";
  }

  $("#playQ", root).onclick = () => {
    if (!currentScale) newQuestion();
    playScale(currentScale, 60 + noteIndex(currentRoot), { direction: "up", tempo: 100, metronome: false });
  };
  $("#nextQ", root).onclick = () => newQuestion();

  newQuestion();
}

export default { SCALES, renderScaleExplorer, renderScaleWheel, playScale, getScalePositions, renderScaleQuiz };