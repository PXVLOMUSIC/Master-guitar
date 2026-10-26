// improvisation.js — improvisation guide, capo calculator & chord transposition
import { renderFretboard } from "./fretboard.js";

const $ = (sel, root = document) => (root || document).querySelector(sel);
const $$ = (sel, root = document) => [...(root || document).querySelectorAll(sel)];

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}

/* ---------------- note helpers ---------------- */
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function noteIndex(note) {
  if (!note) return 0;
  const m = String(note).trim().match(/^([A-Ga-g])([#b]?)/);
  if (!m) return 0;
  const letter = m[1].toUpperCase();
  const acc = m[2] || "";
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter] ?? 0;
  let idx = base;
  if (acc === "#") idx = (idx + 1) % 12;
  if (acc === "b") idx = (idx + 11) % 12;
  return idx;
}

function idxToNote(idx) {
  return NOTE_NAMES[((idx % 12) + 12) % 12];
}

function transposeNote(note, semis) {
  return idxToNote(noteIndex(note) + semis);
}

function transposeChord(chord, semis) {
  if (!chord) return chord;
  const c = String(chord).trim();
  if (c === "N.C." || c === "-" || c === "") return c;
  let main = c;
  let bassPart = "";
  if (c.includes("/")) {
    const idx = c.indexOf("/");
    main = c.slice(0, idx);
    bassPart = "/" + transposeChord(c.slice(idx + 1), semis);
  }
  const m = main.match(/^([A-Ga-g])([#b]?)(.*)$/);
  if (!m) return c;
  const root = m[1].toUpperCase() + (m[2] || "");
  const suffix = m[3] || "";
  return transposeNote(root, semis) + suffix + bassPart;
}

/* ---------------- scales ---------------- */
const SCALES = {
  "Ionian (Major)": [0, 2, 4, 5, 7, 9, 11],
  "Natural Minor (Aeolian)": [0, 2, 3, 5, 7, 8, 10],
  "Dorian": [0, 2, 3, 5, 7, 9, 10],
  "Phrygian": [0, 1, 3, 5, 7, 8, 10],
  "Lydian": [0, 2, 4, 6, 7, 9, 11],
  "Mixolydian": [0, 2, 4, 5, 7, 9, 10],
  "Locrian": [0, 1, 3, 5, 6, 8, 10],
  "Harmonic Minor": [0, 2, 3, 5, 7, 8, 11],
  "Melodic Minor": [0, 2, 3, 5, 7, 9, 11],
  "Major Pentatonic": [0, 2, 4, 7, 9],
  "Minor Pentatonic": [0, 3, 5, 7, 10],
  "Blues": [0, 3, 5, 6, 7, 10],
  "Altered": [0, 1, 3, 4, 6, 8, 10],
  "Lydian Dominant": [0, 2, 4, 6, 7, 9, 10],
  "Diminished (H-W)": [0, 1, 3, 4, 6, 7, 9, 10],
  "Whole Tone": [0, 2, 4, 6, 8, 10],
};

function chordToScales(chordStr) {
  const c = String(chordStr).trim();
  const m = c.match(/^([A-Ga-g])([#b]?)(.*)$/);
  if (!m) return { root: c, scales: [] };
  const root = m[1].toUpperCase() + (m[2] || "");
  const q = (m[3] || "").toLowerCase();
  const scales = [];
  const isMinor = q.startsWith("m") && !q.startsWith("maj");
  const isDim = q.includes("dim") || q.includes("°") || q.includes("m7b5") || q.includes("ø") || q.includes("mb5");
  const isAug = q.includes("aug") || q.includes("+");
  const isDom = !isMinor && (q.includes("7") && !q.includes("maj7") && !q.includes("major7"));
  const isMaj7 = q.includes("maj7") || q.includes("major7") || q.includes("m7") === false && q.includes("maj");
  const isMin7 = isMinor && q.includes("7");
  const isSus = q.includes("sus");

  if (isDim) {
    scales.push({ name: "Locrian", reason: "acorde disminuido / m7♭5" });
    scales.push({ name: "Diminished (H-W)", reason: "escala disminuida simétrica" });
  } else if (isAug) {
    scales.push({ name: "Whole Tone", reason: "acorde aumentado" });
    scales.push({ name: "Lydian", reason: "mayor con 4ª aumentada" });
  } else if (isMinor) {
    if (q.includes("maj7")) {
      scales.push({ name: "Melodic Minor", reason: "menor con 7ª mayor" });
      scales.push({ name: "Harmonic Minor", reason: "menor armónica" });
    } else {
      scales.push({ name: "Dorian", reason: "ii7 / iv7 en tonalidad mayor" });
      scales.push({ name: "Natural Minor (Aeolian)", reason: "acorde menor diatónico" });
      scales.push({ name: "Minor Pentatonic", reason: "base de blues/rock" });
      if (isMin7) scales.push({ name: "Phrygian", reason: "color flamenco/exótico" });
    }
  } else if (isDom) {
    scales.push({ name: "Mixolydian", reason: "dominante diatónico (V7)" });
    scales.push({ name: "Altered", reason: "V7 que resuelve a I (tensiones alteradas)" });
    scales.push({ name: "Lydian Dominant", reason: "dominante no resolutivo" });
    scales.push({ name: "Blues", reason: "color blues" });
  } else if (isSus) {
    scales.push({ name: "Mixolydian", reason: "acorde suspendido" });
    scales.push({ name: "Major Pentatonic", reason: "melodía abierta" });
  } else {
    if (isMaj7) {
      scales.push({ name: "Ionian (Major)", reason: "acorde mayor con 7ª mayor" });
      scales.push({ name: "Lydian", reason: "4ª aumentada, color luminoso" });
    } else {
      scales.push({ name: "Ionian (Major)", reason: "acorde mayor diatónico" });
      scales.push({ name: "Lydian", reason: "sustitución modal" });
      scales.push({ name: "Major Pentatonic", reason: "melodía simple y cantable" });
    }
  }
  // attach intervals
  scales.forEach(s => { s.intervals = SCALES[s.name]; });
  return { root, scales };
}

/* ---------------- progressions ---------------- */
const PROGRESSIONS = [
  { id: "pop", name: "I–V–vi–IV (Pop/Rock)", key: "C", chords: ["C", "G", "Am", "F"], numerals: ["I", "V", "vi", "IV"], desc: "La progresión pop por excelencia. Mayoría de éxitos." },
  { id: "fifties", name: "I–vi–IV–V (Años 50)", key: "C", chords: ["C", "Am", "F", "G"], numerals: ["I", "vi", "IV", "V"], desc: "Doo-wop / rock clásico." },
  { id: "rock", name: "I–IV–V (Rock/Blues)", key: "E", chords: ["E", "A", "B"], numerals: ["I", "IV", "V"], desc: "Base del rock y blues." },
  { id: "iiVI", name: "ii–V–I (Jazz)", key: "C", chords: ["Dm7", "G7", "Cmaj7"], numerals: ["ii7", "V7", "Imaj7"], desc: "Cadencia jazz fundamental." },
  { id: "minorii", name: "iiø–V–i (Jazz menor)", key: "Am", chords: ["Bm7b5", "E7", "Am"], numerals: ["iiø7", "V7", "i"], desc: "Cadencia menor jazz." },
  { id: "minorPop", name: "i–VI–III–VII (Pop menor)", key: "Am", chords: ["Am", "F", "C", "G"], numerals: ["i", "VI", "III", "VII"], desc: "Pop/rock en tonalidad menor." },
  { id: "andalusian", name: "Cadencia andaluza i–VII–VI–V", key: "Am", chords: ["Am", "G", "F", "E"], numerals: ["i", "VII", "VI", "V"], desc: "Flamenco / rock español." },
  { id: "blues12", name: "12-bar Blues", key: "A", chords: ["A7", "A7", "A7", "A7", "D7", "D7", "A7", "A7", "E7", "D7", "A7", "E7"], numerals: ["I7", "I7", "I7", "I7", "IV7", "IV7", "I7", "I7", "V7", "IV7", "I7", "V7"], desc: "Blues de 12 compases." },
  { id: "axis", name: "vi–IV–I–V (Axis)", key: "C", chords: ["Am", "F", "C", "G"], numerals: ["vi", "IV", "I", "V"], desc: "Progresión 'Axis of Awesome'." },
];

const TIPS = [
  "Empieza tus frases en notas del acorde (1, 3, 5, 7) y resuelve en la tónica del acorde.",
  "Usa la pentatónica menor como base y añade la 2ª/6ª para un sonido más melódico.",
  "En un ii–V–I, usa Dorian sobre el ii, Altered/Lydian Dominant sobre el V y Ionian sobre el I.",
  "Sobre acordes mayores, la escala mayor pentatónica evita notas problemáticas.",
  "Escucha el bajo y la melodía: imita contornos, no solo escalas.",
  "Limita tu rango (una octava) y crea motivos repetibles.",
  "Usa el silencio: respira entre frases.",
  "Practica con backing track y graba para evaluar tu fraseo.",
];

/* ---------------- diatonic chords ---------------- */
function diatonicChords(keyRoot, minor) {
  const rootIdx = noteIndex(keyRoot);
  if (minor) {
    const iv = [0, 2, 3, 5, 7, 8, 10];
    const quals = ["m", "dim", "", "m", "m", "", ""];
    const romans = ["i", "ii°", "III", "iv", "v", "VI", "VII"];
    return iv.map((s, i) => ({ name: idxToNote(rootIdx + s) + (quals[i] === "dim" ? "dim" : quals[i]), roman: romans[i] }));
  }
  const iv = [0, 2, 4, 5, 7, 9, 11];
  const quals = ["", "m", "m", "", "7", "m", "dim"];
  const romans = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
  return iv.map((s, i) => ({ name: idxToNote(rootIdx + s) + (quals[i] === "dim" ? "dim" : quals[i]), roman: romans[i] }));
}

/* ---------------- renderImprovisationGuide ---------------- */
export function renderImprovisationGuide(container) {
  const root = (typeof container === "string") ? document.querySelector(container) : container;
  if (!root) return;
  root.innerHTML = `
    <div class="card">
      <h2>🎼 Guía de improvisación</h2>
      <p>Selecciona una progresión y una tonalidad. Toca cada acorde para ver las escalas sugeridas y la digitación en el mástil.</p>
    </div>
    <div class="card">
      <label style="font-weight:700">Progresión</label>
      <select id="impProg" style="width:100%;padding:8px;border-radius:8px;margin:6px 0;background:var(--card2);color:var(--text);border:1px solid var(--border)"></select>
      <label style="font-weight:700">Tonalidad</label>
      <select id="impKey" style="width:100%;padding:8px;border-radius:8px;margin:6px 0;background:var(--card2);color:var(--text);border:1px solid var(--border)"></select>
      <div id="impDesc" style="color:var(--muted);font-size:13px;margin-top:6px"></div>
    </div>
    <div id="impChords" style="padding:0 4px"></div>
    <div id="impScaleInfo" class="card" style="margin-top:10px"></div>
    <div class="card"><h3 style="margin:0 0 8px">Mástil</h3><div id="impFretboard"></div></div>
    <div class="card">
      <h3 style="margin:0 0 8px">💡 Consejos</h3>
      <ul style="margin:0;padding-left:18px">${TIPS.map(t => `<li style="margin:4px 0;font-size:14px">${t}</li>`).join("")}</ul>
    </div>
  `;

  const progSel = $("#impProg", root);
  PROGRESSIONS.forEach(p => {
    const o = document.createElement("option");
    o.value = p.id; o.textContent = p.name;
    progSel.appendChild(o);
  });

  const keySel = $("#impKey", root);
  NOTE_NAMES.forEach(n => {
    const o = document.createElement("option"); o.value = n; o.textContent = n;
    keySel.appendChild(o);
  });
  // minor keys too
  NOTE_NAMES.forEach(n => {
    const o = document.createElement("option"); o.value = n + "m"; o.textContent = n + "m";
    keySel.appendChild(o);
  });

  let selectedChordIdx = 0;

  function currentProg() {
    return PROGRESSIONS.find(p => p.id === progSel.value) || PROGRESSIONS[0];
  }

  function transposedChords() {
    const p = currentProg();
    const origKey = p.key;
    const newKey = keySel.value;
    // determine original root & mode
    const origMinor = origKey.endsWith("m");
    const origRoot = origKey.replace(/m$/, "");
    const newMinor = newKey.endsWith("m");
    const newRoot = newKey.replace(/m$/, "");
    const semis = noteIndex(newRoot) - noteIndex(origRoot);
    return {
      chords: p.chords.map(c => transposeChord(c, semis)),
      numerals: p.numerals,
      semis,
      minor: newMinor || origMinor,
    };
  }

  function renderChords() {
    const p = currentProg();
    const t = transposedChords();
    $("#impDesc", root).textContent = p.desc;
    const area = $("#impChords", root);
    area.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:8px;padding:8px 0">${t.chords.map((c, i) => `
      <button class="btn ${i === selectedChordIdx ? "btn-primary" : "btn-secondary"}" data-i="${i}" style="padding:8px 14px">
        <div style="font-size:12px;color:var(--muted)">${t.numerals[i] || ""}</div>
        <div style="font-weight:800">${c}</div>
      </button>`).join("")}</div>`;
    $$("button[data-i]", area).forEach(b => {
      b.onclick = () => { selectedChordIdx = parseInt(b.dataset.i, 10); renderChords(); renderScaleForSelected(); };
    });
    renderScaleForSelected();
  }

  function renderScaleForSelected() {
    const t = transposedChords();
    const chord = t.chords[selectedChordIdx];
    const cs = chordToScales(chord);
    const info = $("#impScaleInfo", root);
    info.innerHTML = `
      <h3 style="margin:0 0 8px">Acorde: ${chord}</h3>
      <p style="margin:0 0 8px;color:var(--muted);font-size:13px">Escalas y modos sugeridos:</p>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${cs.scales.map(s => `
          <div style="padding:8px;border-radius:8px;background:var(--card2);border:1px solid var(--border)">
            <strong>${s.name}</strong> <span style="color:var(--muted);font-size:12px">— ${s.reason}</span>
          </div>`).join("")}
      </div>
    `;
    const fb = $("#impFretboard", root);
    const primary = cs.scales[0];
    if (primary && primary.intervals) {
      renderFretboard(fb, { scale: primary.intervals, rootNote: cs.root, frets: 12, showNotes: true });
    } else {
      fb.innerHTML = "";
    }
  }

  progSel.onchange = () => { selectedChordIdx = 0; renderChords(); };
  keySel.onchange = () => { selectedChordIdx = 0; renderChords(); };

  // default key C
  keySel.value = "C";
  progSel.value = PROGRESSIONS[0].id;
  renderChords();
}

/* ---------------- renderCapoCalculator ---------------- */
export function renderCapoCalculator(container) {
  const root = (typeof container === "string") ? document.querySelector(container) : container;
  if (!root) return;
  root.innerHTML = `
    <div class="card">
      <h2>🧮 Calculadora de cejilla (capo)</h2>
      <p>Indica la tonalidad original de la canción y la tonalidad en la que quieres tocar (acordes abiertos). Se calcula el traste de la cejilla y la tabla de transposición.</p>
    </div>
    <div class="card">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:700">Tonalidad original (sonido)</label>
          <select id="capoOrig" style="width:100%;padding:8px;border-radius:8px;margin:6px 0;background:var(--card2);color:var(--text);border:1px solid var(--border)"></select>
        </div>
        <div>
          <label style="font-weight:700">Tonalidad a tocar (cejilla)</label>
          <select id="capoTarget" style="width:100%;padding:8px;border-radius:8px;margin:6px 0;background:var(--card2);color:var(--text);border:1px solid var(--border)"></select>
        </div>
      </div>
      <button class="btn btn-primary btn-block" id="capoCalcBtn" style="margin-top:8px">Calcular</button>
    </div>
    <div id="capoResult"></div>
  `;

  const origSel = $("#capoOrig", root);
  const tgtSel = $("#capoTarget", root);
  NOTE_NAMES.forEach(n => {
    const o = document.createElement("option"); o.value = n; o.textContent = n;
    origSel.appendChild(o); tgtSel.appendChild(o.cloneNode(true));
  });
  // minor
  NOTE_NAMES.forEach(n => {
    const o1 = document.createElement("option"); o1.value = n + "m"; o1.textContent = n + "m";
    const o2 = document.createElement("option"); o2.value = n + "m"; o2.textContent = n + "m";
    origSel.appendChild(o1); tgtSel.appendChild(o2);
  });
  origSel.value = "C";
  tgtSel.value = "G";

  function calc() {
    const orig = origSel.value;
    const tgt = tgtSel.value;
    const origMinor = orig.endsWith("m");
    const tgtMinor = tgt.endsWith("m");
    const origRoot = orig.replace(/m$/, "");
    const tgtRoot = tgt.replace(/m$/, "");
    const fret = (noteIndex(origRoot) - noteIndex(tgtRoot) + 12) % 12;
    // diatonic chords in target (played) key
    const played = diatonicChords(tgtRoot, tgtMinor);
    const sounded = played.map(c => transposeChord(c.name, fret));
    const res = $("#capoResult", root);
    res.innerHTML = `
      <div class="card" style="text-align:center">
        <div style="font-size:14px;color:var(--muted)">Cejilla en traste</div>
        <div style="font-size:48px;font-weight:900;color:var(--primary, #1cb0f6)">${fret}</div>
        <div style="font-size:13px;color:var(--muted)">${fret === 0 ? "Sin cejilla" : "Coloca la cejilla en el traste " + fret}</div>
      </div>
      <div class="card">
        <h3 style="margin:0 0 8px">Tabla de transposición</h3>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <thead><tr style="text-align:left;border-bottom:1px solid var(--border)"><th style="padding:6px">Acorde que tocas</th><th style="padding:6px">Sonido (con cejilla)</th></tr></thead>
          <tbody>
            ${played.map((c, i) => `<tr style="border-bottom:1px solid var(--border)"><td style="padding:6px;font-weight:700">${c.name} <span style="color:var(--muted);font-weight:400">(${c.roman})</span></td><td style="padding:6px;font-weight:700">${sounded[i]}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  $("#capoCalcBtn", root).onclick = calc;
  calc();
}

/* ---------------- renderTranspositionTool ---------------- */
export function renderTranspositionTool(container) {
  const root = (typeof container === "string") ? document.querySelector(container) : container;
  if (!root) return;
  root.innerHTML = `
    <div class="card">
      <h2>🔄 Transposición de acordes</h2>
      <p>Escribe una progresión (acordes separados por espacio o coma) y elige la nueva tonalidad.</p>
    </div>
    <div class="card">
      <label style="font-weight:700">Progresión original</label>
      <textarea id="trChords" rows="2" style="width:100%;padding:8px;border-radius:8px;margin:6px 0;background:var(--card2);color:var(--text);border:1px solid var(--border)" placeholder="C G Am F"></textarea>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-weight:700">Tonalidad original</label>
          <select id="trOrig" style="width:100%;padding:8px;border-radius:8px;margin:6px 0;background:var(--card2);color:var(--text);border:1px solid var(--border)"></select>
        </div>
        <div>
          <label style="font-weight:700">Nueva tonalidad</label>
          <select id="trNew" style="width:100%;padding:8px;border-radius:8px;margin:6px 0;background:var(--card2);color:var(--text);border:1px solid var(--border)"></select>
        </div>
      </div>
      <button class="btn btn-primary btn-block" id="trBtn" style="margin-top:8px">Transponer</button>
    </div>
    <div id="trResult"></div>
  `;

  const origSel = $("#trOrig", root);
  const newSel = $("#trNew", root);
  const autoOpt = document.createElement("option");
  autoOpt.value = "AUTO"; autoOpt.textContent = "Auto (primer acorde)";
  origSel.appendChild(autoOpt);
  NOTE_NAMES.forEach(n => {
    const o = document.createElement("option"); o.value = n; o.textContent = n;
    origSel.appendChild(o); newSel.appendChild(o.cloneNode(true));
  });
  NOTE_NAMES.forEach(n => {
    const o1 = document.createElement("option"); o1.value = n + "m"; o1.textContent = n + "m";
    const o2 = document.createElement("option"); o2.value = n + "m"; o2.textContent = n + "m";
    origSel.appendChild(o1); newSel.appendChild(o2);
  });
  origSel.value = "AUTO";
  newSel.value = "G";

  function parseChords(text) {
    return text.trim().split(/[\s,]+/).filter(Boolean);
  }

  function transpose() {
    const chords = parseChords($("#trChords", root).value);
    if (!chords.length) { toast("Introduce acordes"); return; }
    let orig = origSel.value;
    if (orig === "AUTO") {
      const m = chords[0].match(/^([A-Ga-g])([#b]?)/);
      orig = m ? (m[1].toUpperCase() + (m[2] || "")) : "C";
    }
    const origMinor = orig.endsWith("m");
    const newKey = newSel.value;
    const newMinor = newKey.endsWith("m");
    const origRoot = orig.replace(/m$/, "");
    const newRoot = newKey.replace(/m$/, "");
    const semis = noteIndex(newRoot) - noteIndex(origRoot);
    const transposed = chords.map(c => transposeChord(c, semis));
    const res = $("#trResult", root);
    res.innerHTML = `
      <div class="card">
        <h3 style="margin:0 0 8px">Resultado</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <div style="color:var(--muted);font-size:12px;margin-bottom:4px">Original</div>
            <div style="font-weight:700">${chords.join("  ")}</div>
          </div>
          <div>
            <div style="color:var(--muted);font-size:12px;margin-bottom:4px">Transpuesta (${semis >= 0 ? "+" : ""}${semis} semitonos)</div>
            <div style="font-weight:700;color:var(--primary,#1cb0f6)">${transposed.join("  ")}</div>
          </div>
        </div>
      </div>
    `;
  }

  $("#trBtn", root).onclick = transpose;
  // live
  $("#trChords", root).addEventListener("input", () => {});
}

/* ---------------- exports ---------------- */
export default {
  renderImprovisationGuide,
  renderCapoCalculator,
  renderTranspositionTool,
};