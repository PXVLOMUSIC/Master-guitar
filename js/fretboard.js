// fretboard.js — interactive SVG fretboard visualization for Strumio
import { NOTE_NAMES, midiToNote, midiToFreq, freqToMidi } from "./instruments.js";
import { noteToFrequency, playTone } from "./audio.js";

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */
export const CHROMATIC = [...NOTE_NAMES];

export const SCALES = (function buildScales() {
  const base = {
    major: [0, 2, 4, 5, 7, 9, 11],
    ionian: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    "natural minor": [0, 2, 3, 5, 7, 8, 10],
    "naturalMinor": [0, 2, 3, 5, 7, 8, 10],
    harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
    "harmonic minor": [0, 2, 3, 5, 7, 8, 11],
    melodicMinor: [0, 2, 3, 5, 7, 9, 11],
    "melodic minor": [0, 2, 3, 5, 7, 9, 11],
    "pentatonic minor": [0, 3, 5, 7, 10],
    pentatonicMinor: [0, 3, 5, 7, 10],
    minorPentatonic: [0, 3, 5, 7, 10],
    "pentatonic major": [0, 2, 4, 7, 9],
    pentatonicMajor: [0, 2, 4, 7, 9],
    majorPentatonic: [0, 2, 4, 7, 9],
    blues: [0, 3, 5, 6, 7, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    locrian: [0, 1, 3, 5, 6, 8, 10],
    "whole tone": [0, 2, 4, 6, 8, 10],
    wholeTone: [0, 2, 4, 6, 8, 10],
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    "major triad": [0, 4, 7],
    "minor triad": [0, 3, 7],
  };
  // aliases
  base.ionian = base.major;
  base.aeolian = base.minor;
  return base;
})();

export const CHORD_SHAPES = {
  // fret arrays low E -> high e (6 strings). -1 = muted, 0 = open
  E:  [0, 2, 2, 1, 0, 0],
  Em: [0, 2, 2, 0, 0, 0],
  E7: [0, 2, 0, 1, 0, 0],
  A:  [-1, 0, 2, 2, 2, 0],
  Am: [-1, 0, 2, 2, 1, 0],
  D:  [-1, -1, 0, 2, 3, 2],
  Dm: [-1, -1, 0, 2, 3, 1],
  G:  [3, 2, 0, 0, 0, 3],
  C:  [-1, 3, 2, 0, 1, 0],
  F:  [1, 3, 3, 2, 1, 1],
  B7: [-1, 2, 1, 2, 0, 2],
  "A5": [-1, 0, 2, 2, -1, -1],
  "E5": [0, 2, 2, -1, -1, -1],
  // ukulele (4 strings)
  uke: {
    C: [0, 0, 0, 3],
    G: [0, 2, 3, 2],
    Am: [2, 0, 0, 0],
    F: [2, 0, 1, 0],
  },
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const DEFAULT_TUNINGS = {
  4: ["G4", "C4", "E4", "A4"],
  5: ["B1", "E2", "A2", "D3", "G3"],
  6: ["E2", "A2", "D3", "G3", "B3", "E4"],
  7: ["B1", "E2", "A2", "D3", "G3", "B3", "E4"],
};

function defaultTuning(n) {
  return (DEFAULT_TUNINGS[n] || DEFAULT_TUNINGS[6]).slice(0, n);
}

function toMidi(value) {
  if (value == null) return 0;
  if (typeof value === "number") {
    // Treat numbers as frequencies (consistent with instruments.js tunings).
    return Math.round(freqToMidi(value));
  }
  const s = String(value).trim();
  if (s === "") return 0;
  // If it looks like a note name with a letter, parse via audio helper.
  if (/[A-Ga-g]/.test(s)) {
    try {
      const f = noteToFrequency(s);
      if (isFinite(f) && f > 0) return Math.round(freqToMidi(f));
    } catch (e) { /* fall through */ }
  }
  // Pure numeric string: mirror audio.noteToFrequency (treat as MIDI).
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    return Math.round(parseFloat(s));
  }
  try {
    const f = noteToFrequency(s);
    if (isFinite(f) && f > 0) return Math.round(freqToMidi(f));
  } catch (e) { /* fall through */ }
  return 0;
}

export function getNoteAt(stringIndex, fret, tuning) {
  const t = (tuning && tuning.length) ? tuning : defaultTuning(6);
  const baseMidi = toMidi(t[stringIndex]);
  const midi = baseMidi + (fret || 0);
  return midiToNote(midi).full;
}

export function getScalePositions(rootMidi, scale, tuning, numFrets) {
  const frets = (numFrets != null) ? numFrets : 12;
  const t = (tuning && tuning.length) ? tuning : defaultTuning((tuning && tuning.length) || 6);
  const pcs = new Set((scale || []).map((s) => (((rootMidi + s) % 12) + 12) % 12));
  const result = [];
  const nStr = t.length;
  for (let s = 0; s < nStr; s++) {
    const openMidi = toMidi(t[s]);
    for (let f = 0; f <= frets; f++) {
      const midi = openMidi + f;
      const pc = ((midi % 12) + 12) % 12;
      if (pcs.has(pc)) {
        const note = midiToNote(midi).full;
        result.push({
          string: s,
          fret: f,
          midi: midi,
          note: note,
          noteName: note,
          name: note,
        });
      }
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* SVG rendering                                                       */
/* ------------------------------------------------------------------ */
const SVG_NS = "http://www.w3.org/2000/svg";

function el(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const k in attrs) {
      if (attrs[k] != null) node.setAttribute(k, attrs[k]);
    }
  }
  return node;
}

function noteNameOf(value) {
  if (typeof value === "number") {
    // frequency -> note name
    try {
      const midi = Math.round(freqToMidi(value));
      return midiToNote(midi).full;
    } catch (e) {
      return String(value);
    }
  }
  const s = String(value).trim();
  if (/[A-Ga-g]/.test(s)) return s;
  // numeric string -> midi note name
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    try { return midiToNote(Math.round(parseFloat(s))).full; } catch (e) {}
  }
  return s;
}

export function renderFretboard(container, options) {
  options = options || {};
  const root = (typeof container === "string")
    ? document.querySelector(container)
    : container;
  if (!root) return null;

  const numStrings = (options.strings != null)
    ? options.strings
    : ((options.tuning && options.tuning.length) ? options.tuning.length : 6);
  const tuning = (options.tuning && options.tuning.length)
    ? options.tuning
    : defaultTuning(numStrings);
  const nStr = tuning.length || numStrings;
  const frets = (options.frets != null) ? options.frets : 12;
  const showNotes = !!options.showNotes;
  const highlights = Array.isArray(options.highlights) ? options.highlights : [];
  const onFretClick = (typeof options.onFretClick === "function") ? options.onFretClick : null;

  const rootColor = "#ffc800";
  const scaleColor = "#1cb0f6";
  const highlightColor = "#22c55e";

  // Layout
  const width = 920;
  const left = 74;
  const right = 34;
  const top = 52;
  const bottom = 52;
  const stringSpacing = 46;
  const height = top + bottom + (nStr - 1) * stringSpacing;
  const fretWidth = (width - left - right) / frets;

  // Build posMap of highlighted positions
  const posMap = new Map();
  if (options.scale && options.rootNote) {
    let rootMidi;
    try {
      const rn = (String(options.rootNote).match(/\d/))
        ? options.rootNote
        : (options.rootNote + "2");
      rootMidi = Math.round(freqToMidi(noteToFrequency(rn)));
    } catch (e) {
      rootMidi = 0;
    }
    const positions = getScalePositions(rootMidi, options.scale, tuning, frets);
    for (const p of positions) {
      const isRoot = (p.midi % 12 === rootMidi % 12);
      posMap.set(`${p.string}:${p.fret}`, {
        color: isRoot ? rootColor : scaleColor,
        label: p.note,
        root: isRoot,
      });
    }
  }
  for (const h of highlights) {
    posMap.set(`${h.string}:${h.fret}`, {
      color: h.color || highlightColor,
      label: h.label,
      root: false,
    });
  }

  function posXY(s, f) {
    const y = top + s * stringSpacing;
    let x;
    if (f === 0) x = left - 20;
    else x = left + (f - 0.5) * fretWidth;
    return { x, y };
  }

  // Clear container
  root.innerHTML = "";

  const svg = el("svg", {
    viewBox: `0 0 ${width} ${height}`,
    width: "100%",
    height: "100%",
    xmlns: SVG_NS,
    role: "img",
    "aria-label": "Fretboard",
  });
  svg.style.maxWidth = "100%";
  svg.style.display = "block";

  // Background (dark wood)
  const bg = el("rect", { x: 0, y: 0, width, height, fill: "#2a1a0e", rx: 10 });
  svg.appendChild(bg);
  // Fretboard wood surface
  const fbX = left - 26;
  const fbW = (width - right) - fbX + 10;
  const fb = el("rect", { x: fbX, y: top - 18, width: fbW, height: (nStr - 1) * stringSpacing + 36, fill: "#3b2414", rx: 6, stroke: "#1a0e06", "stroke-width": 1 });
  svg.appendChild(fb);

  // Fret markers
  const markerFrets = [3, 5, 7, 9].filter((f) => f <= frets);
  const doubleFrets = [12, 24].filter((f) => f <= frets);
  const centerY = top + ((nStr - 1) / 2) * stringSpacing;
  for (const f of markerFrets) {
    const x = left + (f - 0.5) * fretWidth;
    const c = el("circle", { cx: x, cy: centerY, r: 6, fill: "#d4c4a8", opacity: 0.85 });
    svg.appendChild(c);
  }
  for (const f of doubleFrets) {
    const x = left + (f - 0.5) * fretWidth;
    const off = stringSpacing * 0.9;
    const c1 = el("circle", { cx: x, cy: centerY - off / 2, r: 6, fill: "#d4c4a8", opacity: 0.85 });
    const c2 = el("circle", { cx: x, cy: centerY + off / 2, r: 6, fill: "#d4c4a8", opacity: 0.85 });
    svg.appendChild(c1);
    svg.appendChild(c2);
  }

  // Strings
  for (let s = 0; s < nStr; s++) {
    const y = top + s * stringSpacing;
    const thickness = Math.max(1.0, 3.2 - s * 0.35);
    const line = el("line", {
      x1: left, y1: y, x2: width - right, y2: y,
      stroke: "#c9c9c9", "stroke-width": thickness, "stroke-linecap": "round",
    });
    svg.appendChild(line);
  }

  // Frets (vertical)
  // Nut
  const nut = el("rect", {
    x: left - 4, y: top - 18, width: 8, height: (nStr - 1) * stringSpacing + 36,
    fill: "#e8e2d6", stroke: "#999", "stroke-width": 0.5, rx: 2,
  });
  svg.appendChild(nut);

  for (let i = 1; i <= frets; i++) {
    const x = left + i * fretWidth;
    const line = el("line", {
      x1: x, y1: top - 18, x2: x, y2: top + (nStr - 1) * stringSpacing + 18,
      stroke: "#9aa0a6", "stroke-width": 1.6,
    });
    svg.appendChild(line);
  }

  // Fret numbers
  for (let i = 1; i <= frets; i++) {
    if ([3, 5, 7, 9, 12].includes(i)) {
      const x = left + (i - 0.5) * fretWidth;
      const t = el("text", {
        x, y: height - 12, "text-anchor": "middle",
        fill: "#94a3b8", "font-size": 11, "font-family": "sans-serif",
      });
      t.textContent = String(i);
      svg.appendChild(t);
    }
  }

  // String labels (open note names)
  for (let s = 0; s < nStr; s++) {
    const y = top + s * stringSpacing;
    const t = el("text", {
      x: 14, y: y + 4, "text-anchor": "start",
      fill: "#cbd5e1", "font-size": 13, "font-weight": "700", "font-family": "sans-serif",
    });
    t.textContent = noteNameOf(tuning[s]);
    svg.appendChild(t);
  }

  // showNotes: muted labels at every position
  if (showNotes) {
    for (let s = 0; s < nStr; s++) {
      for (let f = 0; f <= frets; f++) {
        if (posMap.has(`${s}:${f}`)) continue; // highlighted gets its own
        const { x, y } = posXY(s, f);
        const note = getNoteAt(s, f, tuning);
        const t = el("text", {
          x, y: y - 15, "text-anchor": "middle",
          fill: "#94a3b8", "font-size": 9, "font-family": "sans-serif", opacity: 0.7,
        });
        t.textContent = note.replace(/\d/, "");
        svg.appendChild(t);
      }
    }
  }

  // Highlighted note dots
  for (const [key, info] of posMap.entries()) {
    const [sStr, fStr] = key.split(":");
    const s = parseInt(sStr, 10);
    const f = parseInt(fStr, 10);
    const { x, y } = posXY(s, f);
    const r = info.root ? 13 : 11;
    const circle = el("circle", {
      cx: x, cy: y, r: r,
      fill: info.color, stroke: "#0b1218", "stroke-width": 2,
      opacity: 0.95,
    });
    svg.appendChild(circle);
    const noteLabel = (info.label != null) ? info.label : getNoteAt(s, f, tuning);
    const labelText = (typeof noteLabel === "string") ? noteLabel.replace(/\d+$/, "") : String(noteLabel);
    const text = el("text", {
      x, y: y + 4, "text-anchor": "middle",
      fill: "#0b1218", "font-size": 10, "font-weight": "800", "font-family": "sans-serif",
    });
    text.textContent = labelText;
    svg.appendChild(text);
  }

  // Click targets (invisible circles) for all positions
  for (let s = 0; s < nStr; s++) {
    for (let f = 0; f <= frets; f++) {
      const { x, y } = posXY(s, f);
      const target = el("circle", {
        cx: x, cy: y, r: 15,
        fill: "transparent", stroke: "none",
        style: "cursor:pointer;",
      });
      target.style.cursor = "pointer";
      const note = getNoteAt(s, f, tuning);
      target.addEventListener("click", () => {
        try {
          const freq = noteToFrequency(note);
          if (isFinite(freq)) playTone(freq, 0.9);
        } catch (e) { /* ignore */ }
        if (onFretClick) {
          try { onFretClick({ string: s, fret: f, note: note }); } catch (e) {}
        }
      });
      svg.appendChild(target);
    }
  }

  root.appendChild(svg);
  return svg;
}

/* ------------------------------------------------------------------ */
/* Default export (optional)                                           */
/* ------------------------------------------------------------------ */
export default renderFretboard;
