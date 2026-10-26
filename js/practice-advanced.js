// practice-advanced.js — advanced practice features for Strumio
// Interval ear training, chord-type ear training, technique library,
// practice mode (loop & speed) with mic accuracy, rhythm trainer.

import { playTone, playChord, startMetronome, stopMetronome, startMic, stopMic } from "./audio.js";
import { midiToFreq, midiToNote, NOTE_NAMES } from "./instruments.js";

const $ = (sel, root = document) => (root || document).querySelector(sel);
const $$ = (sel, root = document) => [...(root || document).querySelectorAll(sel)];

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}

function clear(container) { container.innerHTML = ""; }

/* ============================================================
   1. Interval ear training
   ============================================================ */
const INTERVALS = [
  { name: "Unísono", semis: 0 },
  { name: "m2", semis: 1 },
  { name: "M2", semis: 2 },
  { name: "m3", semis: 3 },
  { name: "M3", semis: 4 },
  { name: "P4", semis: 5 },
  { name: "Tritono", semis: 6 },
  { name: "P5", semis: 7 },
  { name: "m6", semis: 8 },
  { name: "M6", semis: 9 },
  { name: "m7", semis: 10 },
  { name: "M7", semis: 11 },
  { name: "Octava", semis: 12 },
];

export function renderIntervalTrainer(container) {
  const state = { score: 0, total: 0, current: null, answered: false };

  function newQuestion() {
    const rootMidi = 48 + Math.floor(Math.random() * 13); // C3..E4ish
    const iv = INTERVALS[Math.floor(Math.random() * INTERVALS.length)];
    const second = rootMidi + iv.semis;
    state.current = { rootMidi, iv, second };
    state.answered = false;
    playTone(midiToFreq(rootMidi), 0.6);
    setTimeout(() => playTone(midiToFreq(second), 0.6), 700);
    draw();
  }

  function answer(name) {
    if (state.answered || !state.current) return;
    state.answered = true;
    state.total++;
    const correct = name === state.current.iv.name;
    if (correct) { state.score++; toast("¡Correcto! 🎯"); }
    else toast("Incorrecto. Era " + state.current.iv.name);
    draw();
    setTimeout(newQuestion, 1100);
  }

  function draw() {
    const iv = state.current ? state.current.iv : null;
    container.innerHTML = `
      <div class="card" style="text-align:center">
        <h2>👂 Entrenador de intervalos</h2>
        <p>Escucha las dos notas y elige el intervalo.</p>
        <div style="font-size:22px;font-weight:900;margin:12px 0" id="ivStatus">
          ${state.answered ? (iv ? "Era: " + iv.name : "—") : "Reproduciendo..."}
        </div>
        <button class="btn btn-secondary btn-sm" id="replayBtn">🔊 Reproducir de nuevo</button>
        <div style="margin-top:12px;color:var(--muted)" id="ivScore">Aciertos: ${state.score}/${state.total}</div>
      </div>
      <div class="card">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
          ${INTERVALS.map(iv => `<button class="btn btn-secondary btn-sm ivBtn" data-name="${iv.name}" ${state.answered ? "disabled" : ""}>${iv.name}</button>`).join("")}
        </div>
      </div>`;
    const replay = $("#replayBtn", container);
    if (replay) replay.onclick = () => {
      if (!state.current) return;
      playTone(midiToFreq(state.current.rootMidi), 0.6);
      setTimeout(() => playTone(midiToFreq(state.current.second), 0.6), 700);
    };
    $$(".ivBtn", container).forEach(b => {
      b.onclick = () => answer(b.dataset.name);
    });
  }

  newQuestion();
}

/* ============================================================
   2. Chord type ear training
   ============================================================ */
const CHORD_TYPES = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus: [0, 5, 7],
};

export function renderChordTypeTrainer(container) {
  const state = { score: 0, total: 0, current: null, answered: false };

  function chordFreqs(rootMidi, type) {
    return CHORD_TYPES[type].map(iv => midiToFreq(rootMidi + iv));
  }

  function newQuestion() {
    const types = Object.keys(CHORD_TYPES);
    const type = types[Math.floor(Math.random() * types.length)];
    const rootMidi = 48 + Math.floor(Math.random() * 8) * 1; // vary root
    const root = 48 + Math.floor(Math.random() * 12);
    state.current = { type, rootMidi: root };
    state.answered = false;
    playChord(chordFreqs(root, type), 1.6);
    draw();
  }

  function answer(type) {
    if (state.answered || !state.current) return;
    state.answered = true;
    state.total++;
    const correct = type === state.current.type;
    if (correct) { state.score++; toast("¡Correcto! 🎸"); }
    else toast("Incorrecto. Era " + state.current.type);
    draw();
    setTimeout(newQuestion, 1200);
  }

  function draw() {
    container.innerHTML = `
      <div class="card" style="text-align:center">
        <h2>🎼 Entrenador de tipos de acorde</h2>
        <p>Escucha el acorde y elige su tipo.</p>
        <div style="font-size:22px;font-weight:900;margin:12px 0">
          ${state.answered ? "Era: " + state.current.type : "¿Qué tipo es?"}
        </div>
        <button class="btn btn-secondary btn-sm" id="replayChord">🔊 Reproducir</button>
        <div style="margin-top:12px;color:var(--muted)">Aciertos: ${state.score}/${state.total}</div>
      </div>
      <div class="card">
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">
          ${Object.keys(CHORD_TYPES).map(t => `<button class="btn btn-secondary btn-sm ctBtn" data-type="${t}" ${state.answered ? "disabled" : ""}>${t}</button>`).join("")}
        </div>
        <div style="margin-top:10px">
          <button class="btn btn-secondary btn-block btn-sm" id="replayChord2">🔊 Volver a escuchar</button>
        </div>
      </div>`;
    const replay = () => { if (state.current) playChord(chordFreqs(state.current.rootMidi, state.current.type), 1.6); };
    $("#replayChord", container).onclick = replay;
    $("#replayChord2", container).onclick = replay;
    $$(".ctBtn", container).forEach(b => b.onclick = () => answer(b.dataset.type));
  }

  newQuestion();
}

/* ============================================================
   3. Technique library
   ============================================================ */
export const TECHNIQUES = [
  {
    id: "hammer-on",
    name: "Hammer-on",
    icon: "🔨",
    description: "Tocar una nota y, sin volver a pulsar la cuerda, golpear un traste más alto con otro dedo para que suene.",
    steps: [
      "Toca una nota en un traste (ej. cuerda 3, traste 5) con el dedo 1.",
      "Sin volver a pulsar con la púa, golpea con el dedo 3 el traste 7 de la misma cuerda.",
      "Asegúrate de golpear con suficiente fuerza y cerca del traste.",
      "Practica despacio y sube la velocidad.",
    ],
    tips: ["Mantén el dedo inicial presionando para que la nota inicial suene.", "Golpea justo detrás del traste, no encima."],
    mistakes: ["Golpear demasiado lejos del traste (sonido opaco).", "Soltar la nota anterior antes del golpe."],
  },
  {
    id: "pull-off",
    name: "Pull-off",
    icon: "🪝",
    description: "Inverso del hammer-on: se toca una nota alta y se 'tira' del dedo hacia abajo para que suene la nota inferior.",
    steps: [
      "Coloca dos dedos en la misma cuerda (ej. traste 7 y 5).",
      "Toca la nota del traste 7.",
      "Tira del dedo (hacia abajo) para que suene la nota del traste 5.",
      "Practica alternando hammer-on y pull-off.",
    ],
    tips: ["El movimiento es de 'tirar', no de levantar.", "Mantén la presión del dedo inferior."],
    mistakes: ["Levantar el dedo sin tirar (no suena la nota inferior).", "Tirar demasiado fuerte (ruido)."],
  },
  {
    id: "bend",
    name: "Bend (estirar)",
    icon: "↗️",
    description: "Empujar la cuerda lateralmente para subir la afinación de la nota.",
    steps: [
      "Toca una nota en una cuerda (preferiblemente 2ª o 3ª).",
      "Empuja la cuerda hacia arriba (o hacia abajo en cuerdas graves) con los dedos.",
      "Apoya con varios dedos para tener fuerza.",
      "Lleva la nota hasta la altura deseada (medio tono, tono, etc.).",
    ],
    tips: ["Usa el pulgar por detrás del mástil como palanca.", "Escucha la nota objetivo antes de hacer el bend."],
    mistakes: ["Bend insuficiente o excesivo (desafinado).", "No apoyar con los dedos auxiliares."],
  },
  {
    id: "slide",
    name: "Slide (deslizamiento)",
    icon: "➡️",
    description: "Deslizar el dedo por el mástil manteniendo presión para pasar de un traste a otro sin volver a pulsar.",
    steps: [
      "Toca una nota en un traste.",
      "Manteniendo presión, desliza el dedo hasta el traste destino.",
      "El dedo debe mantener contacto con la cuerda todo el tiempo.",
      "Practica slides ascendentes y descendentes.",
    ],
    tips: ["Mantén presión constante; no dejes de tocar la cuerda.", "Usa un dedo fuerte (índice o medio)."],
    mistakes: ["Levantar el dedo a mitad del deslizamiento (nota cortada).", "Deslizar con poca presión (zumbido)."],
  },
  {
    id: "vibrato",
    name: "Vibrato",
    icon: "〰️",
    description: "Oscilar la altura de una nota para darle expresión y vida.",
    steps: [
      "Toca una nota y mantenla presionada.",
      "Oscila la cuerda rápidamente con el dedo (movimiento de muñeca).",
      "El movimiento es pequeño y controlado.",
      "Varía la velocidad y la amplitud según el estilo.",
    ],
    tips: ["El movimiento viene de la muñeca, no del brazo entero.", "Escucha y ajusta la amplitud."],
    mistakes: ["Vibrato demasiado ancho o rápido (sonido nervioso).", "Mover el brazo en lugar de la muñeca."],
  },
  {
    id: "palm-mute",
    name: "Palm mute",
    icon: "✋",
    description: "Apoyar el borde de la mano derecha sobre las cuerdas cerca del puente para amortiguar el sonido.",
    steps: [
      "Coloca el borde de la mano derecha sobre las cuerdas, cerca del puente.",
      "Toca las cuerdas con la púa manteniendo la mano apoyada.",
      "Ajusta la posición: más cerca del puente = menos mute.",
      "Practica ritmos con y sin palm mute.",
    ],
    tips: ["La presión debe ser suave, no bloquear las cuerdas.", "Experimenta con la posición para distintos tonos."],
    mistakes: ["Apoyar demasiado fuerte (sin sonido).", "Apoyar lejos del puente (sonido sordo)."],
  },
  {
    id: "alternate-picking",
    name: "Alternate picking",
    icon: "↔️",
    description: "Alternar golpes de púa hacia abajo y hacia arriba de forma continua.",
    steps: [
      "Toca una secuencia de notas usando púa hacia abajo, luego hacia arriba, etc.",
      "Mantén el movimiento de muñeca pequeño y relajado.",
      "Empieza lento con metrónomo.",
      "Aumenta la velocidad manteniendo la precisión.",
    ],
    tips: ["El movimiento debe ser mínimo; usa la muñeca.", "Mantén la púa a 45° aproximadamente."],
    mistakes: ["Usar el brazo en lugar de la muñeca.", "Perder la alternancia en velocidades altas."],
  },
  {
    id: "sweep-picking",
    name: "Sweep picking",
    icon: "🧹",
    description: "Barrer las cuerdas con la púa en un solo movimiento continuo para arpegios rápidos.",
    steps: [
      "Toca un arpegio (ej. Am) usando un barrido hacia abajo.",
      "Cada nota se toca por separado mientras la púa se mueve.",
      "La mano izquierda debe preparar cada nota a tiempo.",
      "Practica barridos ascendentes y descendentes.",
    ],
    tips: ["El movimiento es de 'barrido', no de golpes individuales.", "Sincroniza ambas manos."],
    mistakes: ["Tocar varias cuerdas a la vez (acorde).", "Desincronización entre manos."],
  },
  {
    id: "tapping",
    name: "Tapping",
    icon: "👆",
    description: "Golpear las cuerdas con los dedos de la mano derecha (o izquierda) sobre el mástil.",
    steps: [
      "Coloca un dedo de la mano derecha sobre un traste alto.",
      "Golpea la cuerda para que suene.",
      "Combina con hammer-ons y pull-offs de la mano izquierda.",
      "Practica patrones de tapping sencillos.",
    ],
    tips: ["Golpea con la yema del dedo, cerca del traste.", "Mantén la mano izquierda relajada."],
    mistakes: ["Golpear demasiado fuerte (ruido).", "No limpiar las cuerdas no deseadas."],
  },
  {
    id: "legato",
    name: "Legato",
    icon: "🎶",
    description: "Tocar notas de forma fluida y conectada, sin silencios entre ellas.",
    steps: [
      "Toca una secuencia de notas usando hammer-ons y pull-offs.",
      "Minimiza el uso de la púa; deja que las notas fluyan.",
      "Mantén un volumen uniforme.",
      "Practica escalas en legato.",
    ],
    tips: ["El sonido debe ser continuo, sin ataques fuertes.", "Controla la dinámica."],
    mistakes: ["Usar demasiada púa (pierde el carácter legato).", "Notas con volumen desigual."],
  },
];

export function renderTechniqueLibrary(container) {
  container.innerHTML = `
    <div class="card">
      <h2>📚 Biblioteca de técnicas</h2>
      <p>${TECHNIQUES.length} técnicas con descripción, pasos, consejos y errores comunes.</p>
    </div>
    <div id="techList" style="padding:0 16px"></div>`;
  const list = $("#techList", container);
  TECHNIQUES.forEach(t => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;cursor:pointer" class="techHeader">
        <span style="font-size:28px">${t.icon}</span>
        <div style="flex:1">
          <div style="font-weight:800;font-size:16px">${t.name}</div>
          <div style="color:var(--muted);font-size:13px">${t.description}</div>
        </div>
        <span class="techToggle" style="color:var(--muted)">▼</span>
      </div>
      <div class="techBody" style="display:none;margin-top:12px">
        <div class="section-title" style="margin-left:0">Pasos</div>
        <ol style="color:var(--text);font-size:14px;line-height:1.6;padding-left:18px">
          ${t.steps.map(s => `<li>${s}</li>`).join("")}
        </ol>
        <div class="section-title" style="margin-left:0">Consejos</div>
        <ul style="color:var(--muted);font-size:13px;line-height:1.6;padding-left:18px">
          ${t.tips.map(s => `<li>${s}</li>`).join("")}
        </ul>
        <div class="section-title" style="margin-left:0">Errores comunes</div>
        <ul style="color:var(--red);font-size:13px;line-height:1.6;padding-left:18px">
          ${t.mistakes.map(s => `<li>${s}</li>`).join("")}
        </ul>
      </div>`;
    const header = $(".techHeader", card);
    const body = $(".techBody", card);
    const toggle = $(".techToggle", card);
    header.onclick = () => {
      const open = body.style.display === "block";
      body.style.display = open ? "none" : "block";
      toggle.textContent = open ? "▼" : "▲";
    };
    list.appendChild(card);
  });
}

/* ============================================================
   4. Practice mode (loop & speed)
   ============================================================ */
const PRACTICE_EXERCISES = {
  scaleRun: {
    name: "Escala (pentatónica menor, La)",
    notes: [57, 60, 62, 64, 67, 69, 67, 64, 62, 60], // A minor pentatonic-ish
  },
  chordChanges: {
    name: "Cambios de nota (arpegio C-G-Am-F)",
    notes: [60, 64, 67, 55, 59, 62, 57, 60, 64, 53, 57, 60],
  },
  riff: {
    name: "Riff sencillo",
    notes: [40, 40, 43, 45, 45, 43, 40, 38],
  },
};

export function renderPracticeMode(container) {
  const state = {
    exercise: "scaleRun",
    bpm: 90,
    running: false,
    micOk: false,
    windowPitch: null,
    prevExpected: null,
    expectedIdx: 0,
    hits: 0,
    evaluated: 0,
    totalBeats: 0,
  };

  function noteName(midi) {
    const n = midiToNote(midi);
    return n.name + n.octave;
  }

  function draw() {
    const ex = PRACTICE_EXERCISES[state.exercise];
    const acc = state.evaluated > 0 ? Math.round((state.hits / state.evaluated) * 100) : 0;
    container.innerHTML = `
      <div class="card" style="text-align:center">
        <h2>🎯 Práctica con bucle y velocidad</h2>
        <p>Toca la nota indicada al ritmo del metrónomo. Se mide la precisión con el micrófono.</p>
      </div>
      <div class="card">
        <label style="font-weight:800;font-size:13px;color:var(--muted)">Ejercicio</label>
        <select id="pmExercise" style="width:100%;padding:10px;border-radius:10px;border:2px solid var(--border);background:var(--card2);color:var(--text);font-weight:700;margin:6px 0 12px">
          ${Object.entries(PRACTICE_EXERCISES).map(([k, v]) => `<option value="${k}" ${k === state.exercise ? "selected" : ""}>${v.name}</option>`).join("")}
        </select>
        <label style="font-weight:800;font-size:13px;color:var(--muted)">BPM: <span id="pmBpmVal">${state.bpm}</span></label>
        <input type="range" min="40" max="180" value="${state.bpm}" id="pmBpm" style="width:100%;margin:6px 0 12px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
          <button class="btn btn-primary btn-block" id="pmToggle">${state.running ? "⏹ Detener" : "▶ Iniciar"}</button>
          <button class="btn btn-secondary btn-block" id="pmReset">Reiniciar</button>
        </div>
        <div style="text-align:center;margin:12px 0">
          <div style="font-size:14px;color:var(--muted)">Nota esperada</div>
          <div class="note-big" id="pmNote">${state.prevExpected != null ? noteName(state.prevExpected) : "—"}</div>
          <div class="cents" id="pmInfo">${state.running ? "Toca ahora..." : "Pulsa iniciar"}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center">
          <div class="card" style="margin:0;padding:8px"><div style="font-size:20px;font-weight:900">${state.hits}</div><div style="font-size:11px;color:var(--muted)">Aciertos</div></div>
          <div class="card" style="margin:0;padding:8px"><div style="font-size:20px;font-weight:900">${state.evaluated}</div><div style="font-size:11px;color:var(--muted)">Notas</div></div>
          <div class="card" style="margin:0;padding:8px"><div style="font-size:20px;font-weight:900">${acc}%</div><div style="font-size:11px;color:var(--muted)">Precisión</div></div>
        </div>
      </div>`;

    $("#pmExercise", container).onchange = (e) => {
      if (state.running) return;
      state.exercise = e.target.value;
      resetStats();
      draw();
    };
    $("#pmBpm", container).oninput = (e) => {
      state.bpm = parseInt(e.target.value);
      $("#pmBpmVal", container).textContent = state.bpm;
      if (state.running) {
        stopMetronome();
        startMetronome(state.bpm, 4, onBeat);
      }
    };
    $("#pmToggle", container).onclick = () => toggleRun();
    $("#pmReset", container).onclick = () => { resetStats(); draw(); };

    function resetStats() {
      state.hits = 0; state.evaluated = 0; state.expectedIdx = 0;
      state.prevExpected = null; state.windowPitch = null;
    }

    async function toggleRun() {
      if (state.running) {
        // evaluate last pending
        if (state.prevExpected != null) {
          state.evaluated++;
          if (state.windowPitch && Math.round(state.windowPitch.midi) === state.prevExpected) state.hits++;
        }
        stopMetronome();
        stopMic();
        state.running = false;
        state.prevExpected = null;
        toast("Práctica detenida");
        draw();
        return;
      }
      const ok = await startMic((p) => { state.windowPitch = p; });
      if (!ok) { toast("No se pudo acceder al micrófono"); return; }
      state.micOk = true;
      resetStats();
      state.running = true;
      startMetronome(state.bpm, 4, onBeat);
      toast("Práctica iniciada");
      draw();
    }

    function onBeat() {
      if (!state.running) return;
      // evaluate previous note
      if (state.prevExpected != null) {
        state.evaluated++;
        if (state.windowPitch && Math.round(state.windowPitch.midi) === state.prevExpected) state.hits++;
      }
      const ex = PRACTICE_EXERCISES[state.exercise];
      const notes = ex.notes;
      state.prevExpected = notes[state.expectedIdx % notes.length];
      state.expectedIdx++;
      state.windowPitch = null;
      draw();
    }
  }

  draw();
}

/* ============================================================
   5. Rhythm trainer
   ============================================================ */
const RHYTHM_PATTERNS = [
  { name: "Básico", beats: [1, 1, 1, 1] },
  { name: "Síncopa", beats: [0.5, 0.5, 1, 0.5, 0.5, 1] },
  { name: "Tresillos", beats: [0.333, 0.333, 0.333, 1, 1] },
  { name: "Mixto", beats: [0.5, 0.5, 0.5, 0.5, 2] },
];

export function renderRhythmTrainer(container) {
  const state = {
    patternIdx: 0,
    bpm: 80,
    running: false,
    taps: [],
    startTime: 0,
    expected: [], // ms times
    finished: false,
    result: null,
  };

  function pattern() { return RHYTHM_PATTERNS[state.patternIdx]; }

  function buildExpected() {
    const beatMs = 60000 / state.bpm;
    const beats = pattern().beats;
    const times = [];
    let t = 0;
    // first tap at first beat
    times.push(0);
    for (let i = 0; i < beats.length - 1; i++) {
      t += beats[i] * beatMs;
      times.push(t);
    }
    state.expected = times;
  }

  function draw() {
    const p = pattern();
    const totalMs = state.expected.length ? state.expected[state.expected.length - 1] + (60000 / state.bpm) : 0;
    container.innerHTML = `
      <div class="card" style="text-align:center">
        <h2>🥁 Entrenador de ritmo</h2>
        <p>Toca al ritmo del patrón mostrado. Pulsa "Tocar" a tiempo.</p>
      </div>
      <div class="card">
        <label style="font-weight:800;font-size:13px;color:var(--muted)">Patrón</label>
        <select id="rtPattern" style="width:100%;padding:10px;border-radius:10px;border:2px solid var(--border);background:var(--card2);color:var(--text);font-weight:700;margin:6px 0 12px" ${state.running ? "disabled" : ""}>
          ${RHYTHM_PATTERNS.map((pt, i) => `<option value="${i}" ${i === state.patternIdx ? "selected" : ""}>${pt.name}</option>`).join("")}
        </select>
        <label style="font-weight:800;font-size:13px;color:var(--muted)">BPM: <span id="rtBpmVal">${state.bpm}</span></label>
        <input type="range" min="50" max="140" value="${state.bpm}" id="rtBpm" style="width:100%;margin:6px 0 12px" ${state.running ? "disabled" : ""}>
        <div id="rtPatternView" style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin:12px 0">
          ${p.beats.map((b, i) => {
            const w = Math.max(24, Math.round(b * 40));
            return `<div style="width:${w}px;height:40px;border-radius:8px;background:var(--card-2);border:2px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:var(--muted)">${b >= 1 ? "♩" : (b >= 0.5 ? "♪" : "♬")}</div>`;
          }).join("")}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
          <button class="btn btn-primary btn-block" id="rtStart">${state.running ? "Corriendo..." : "▶ Iniciar"}</button>
          <button class="btn btn-secondary btn-block" id="rtTap" ${state.running ? "" : "disabled"}>TAP</button>
        </div>
        <div id="rtStatus" style="text-align:center;font-weight:800;margin:8px 0">${state.running ? "Toca ahora... (" + state.taps.length + "/" + state.expected.length + ")" : (state.result ? state.result : "Pulsa iniciar")}</div>
      </div>`;

    $("#rtPattern", container).onchange = (e) => {
      if (state.running) return;
      state.patternIdx = parseInt(e.target.value);
      draw();
    };
    $("#rtBpm", container).oninput = (e) => {
      if (state.running) return;
      state.bpm = parseInt(e.target.value);
      $("#rtBpmVal", container).textContent = state.bpm;
    };
    $("#rtStart", container).onclick = () => startRun();
    $("#rtTap", container).onclick = () => tap();

    function startRun() {
      if (state.running) return;
      buildExpected();
      state.taps = [];
      state.finished = false;
      state.result = null;
      state.running = true;
      state.startTime = performance.now();
      draw();
      // metronome quarter clicks
      startMetronome(state.bpm, 4, () => {});
      // auto finish after total duration + 1s
      const totalMs = state.expected[state.expected.length - 1] + (60000 / state.bpm) * 1.5;
      setTimeout(() => finishRun(), totalMs);
    }

    function tap() {
      if (!state.running || state.finished) return;
      const t = performance.now() - state.startTime;
      state.taps.push(t);
      $("#rtStatus", container).textContent = "Toca ahora... (" + state.taps.length + "/" + state.expected.length + ")";
      if (state.taps.length >= state.expected.length) {
        // small delay then finish
        setTimeout(() => finishRun(), 300);
      }
    }

    function finishRun() {
      if (state.finished) return;
      state.finished = true;
      state.running = false;
      stopMetronome();
      // score
      const tol = (60000 / state.bpm) * 0.25; // 25% of beat
      let hits = 0;
      const used = new Set();
      let totalErr = 0;
      state.expected.forEach(exp => {
        let best = null, bestErr = Infinity, bestIdx = -1;
        state.taps.forEach((tap, idx) => {
          if (used.has(idx)) return;
          const err = Math.abs(tap - exp);
          if (err < bestErr) { bestErr = err; best = tap; bestIdx = idx; }
        });
        if (bestIdx >= 0 && bestErr <= tol) {
          hits++;
          used.add(bestIdx);
          totalErr += bestErr;
        }
      });
      const acc = state.expected.length > 0 ? Math.round((hits / state.expected.length) * 100) : 0;
      const avgErr = hits > 0 ? Math.round(totalErr / hits) : 0;
      state.result = `Precisión: ${acc}% (${hits}/${state.expected.length}) · error medio ${avgErr} ms`;
      toast(state.result);
      draw();
    }
  }

  draw();
}
