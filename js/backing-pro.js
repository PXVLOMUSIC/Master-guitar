// backing-pro.js - professional backing track system with mixer controls
import { getAudioContext, resumeContext, setFxChorus, setFxDelay, setFxDistortion, setFxReverb } from "./audio.js";
import { midiToFreq } from "./instruments.js";
import { state as appState, saveState } from "./storage.js";
import { preloadGroup, isGroupReady, getSampleState, playDrum, playHand, playPitched } from "./sample-engine.js";
import { t } from "./i18n.js";

/* ----------------------------- Instrument list ----------------------------- */
const INSTRUMENTS = [
  { id: "kick", name: "Kick", color: "#e74c3c" },
  { id: "snare", name: "Snare", color: "#e67e22" },
  { id: "hihat", name: "Hi-Hat", color: "#f1c40f" },
  { id: "crash", name: "Crash", color: "#f39c12" },
  { id: "ride", name: "Ride", color: "#d35400" },
  { id: "tom", name: "Tom", color: "#c0392b" },
  { id: "cajon", name: "Cajón", color: "#b7743b" },
  { id: "shaker", name: "Shaker", color: "#c9a227" },
  { id: "bass", name: "Bass", color: "#2ecc71" },
  { id: "piano", name: "Piano", color: "#3498db" },
  { id: "guitar", name: "Guitar", color: "#9b59b6" },
  { id: "strings", name: "Strings", color: "#1abc9c" },
  { id: "synth", name: "Synth Lead", color: "#e91e63" }
];

const QUALITY_INTERVALS = {
  maj: [0, 4, 7], min: [0, 3, 7], dom7: [0, 4, 7, 10],
  maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], sus2: [0, 2, 7],
  sus4: [0, 5, 7], dim: [0, 3, 6], aug: [0, 4, 8]
};

/* ----------------------------- Patterns ----------------------------- */
const PATTERNS = {
  rock: {
    name: "Rock", bpm: 120, bassType: "electric",
    progression: [{ root: 48, q: "maj" }, { root: 48, q: "maj" }, { root: 53, q: "maj" }, { root: 55, q: "maj" }],
    steps: {
      kick:   [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      snare:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      hihat:  [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
      crash:  [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      ride:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      tom:    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      bass:   [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0],
      piano:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      guitar: [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      strings:[0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      synth:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]
    }
  },
  blues: {
    name: "Blues", bpm: 90, bassType: "upright",
    progression: [{ root: 48, q: "maj" }, { root: 53, q: "maj" }, { root: 48, q: "maj" }, { root: 55, q: "dom7" }],
    steps: {
      kick:   [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      snare:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      hihat:  [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
      crash:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      ride:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      tom:    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      bass:   [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      piano:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      guitar: [1,0,1,0, 0,0,1,0, 1,0,1,0, 0,0,1,0],
      strings:[0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      synth:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]
    }
  },
  funk: {
    name: "Funk", bpm: 100, bassType: "electric",
    progression: [{ root: 48, q: "min" }, { root: 48, q: "min" }, { root: 51, q: "maj" }, { root: 53, q: "maj" }],
    steps: {
      kick:   [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0],
      snare:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1],
      hihat:  [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
      crash:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      ride:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      tom:    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      bass:   [1,0,1,0, 0,1,0,0, 1,0,0,1, 0,0,1,0],
      piano:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      guitar: [1,0,0,1, 0,1,0,0, 1,0,0,1, 0,1,0,0],
      strings:[0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      synth:  [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0]
    }
  },
  jazz: {
    name: "Jazz", bpm: 140, bassType: "upright",
    progression: [{ root: 48, q: "maj7" }, { root: 53, q: "dom7" }, { root: 58, q: "min7" }, { root: 51, q: "dom7" }],
    steps: {
      kick:   [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      snare:  [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0],
      hihat:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      crash:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      ride:   [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
      tom:    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      bass:   [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0],
      piano:  [1,0,0,1, 0,1,0,0, 1,0,0,1, 0,1,0,0],
      guitar: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      strings:[1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      synth:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]
    }
  },
  latin: {
    name: "Latin", bpm: 110, bassType: "electric",
    progression: [{ root: 48, q: "min" }, { root: 53, q: "maj" }, { root: 48, q: "min" }, { root: 55, q: "maj" }],
    steps: {
      kick:   [1,0,0,0, 0,0,0,1, 0,0,1,0, 0,0,0,0],
      snare:  [0,0,1,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
      hihat:  [1,1,0,1, 1,1,0,1, 1,1,0,1, 1,1,0,1],
      crash:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      ride:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      tom:    [0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0],
      shaker: [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
      bass:   [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,0,1,0],
      piano:  [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,0,1,0],
      guitar: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
      strings:[0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      synth:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]
    }
  },
  reggae: {
    name: "Reggae", bpm: 80, bassType: "sub",
    progression: [{ root: 48, q: "maj" }, { root: 53, q: "maj" }, { root: 55, q: "maj" }, { root: 48, q: "maj" }],
    steps: {
      kick:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      snare:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0],
      hihat:  [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
      crash:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      ride:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      tom:    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      bass:   [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      piano:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      guitar: [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,1],
      strings:[1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      synth:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]
    }
  },
  metal: {
    name: "Metal", bpm: 160, bassType: "electric",
    progression: [{ root: 40, q: "min" }, { root: 40, q: "min" }, { root: 43, q: "min" }, { root: 45, q: "min" }],
    steps: {
      kick:   [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
      snare:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      hihat:  [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
      crash:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      ride:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      tom:    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,1,1],
      bass:   [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
      piano:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      guitar: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
      strings:[0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      synth:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]
    }
  },
  country: {
    name: "Country", bpm: 120, bassType: "upright",
    progression: [{ root: 48, q: "maj" }, { root: 50, q: "min" }, { root: 53, q: "maj" }, { root: 48, q: "maj" }],
    steps: {
      kick:   [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      snare:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      hihat:  [1,1,0,1, 1,1,0,1, 1,1,0,1, 1,1,0,1],
      crash:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      ride:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      tom:    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      bass:   [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0],
      piano:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      guitar: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
      strings:[0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      synth:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]
    }
  },
  bossa: {
    name: "Bossa Nova", bpm: 130, bassType: "upright",
    progression: [{ root: 48, q: "maj7" }, { root: 53, q: "dom7" }, { root: 51, q: "maj7" }, { root: 58, q: "min7" }],
    steps: {
      kick:   [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
      snare:  [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0],
      hihat:  [0,0,1,0, 0,1,0,0, 0,0,1,0, 0,1,0,0],
      crash:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      ride:   [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,0,1,0],
      tom:    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      shaker: [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
      bass:   [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0],
      piano:  [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,0,1,0],
      guitar: [1,0,1,0, 0,1,0,0, 1,0,1,0, 0,1,0,0],
      strings:[0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      synth:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]
    }
  },
  rumba: {
    name: "Rumba flamenca", bpm: 104, bassType: "electric",
    progression: [{ root: 45, q: "min" }, { root: 43, q: "maj" }, { root: 41, q: "maj" }, { root: 40, q: "maj" }],
    steps: {
      kick:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      snare:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      hihat:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      crash:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      ride:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      tom:    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      cajon:  [1,0,0,1, 1,0,1,0, 1,0,0,1, 1,0,1,1],
      shaker: [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
      bass:   [1,0,0,1, 0,0,0,0, 1,0,0,1, 0,0,0,0],
      piano:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      guitar: [1,0,0,1, 1,0,1,0, 1,0,0,1, 1,0,1,0],
      strings:[0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      synth:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]
    }
  },
  acoustic: {
    name: "Pop acústico", bpm: 92, bassType: "electric",
    progression: [{ root: 48, q: "maj" }, { root: 43, q: "maj" }, { root: 45, q: "min" }, { root: 41, q: "maj" }],
    steps: {
      kick:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      snare:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      hihat:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      crash:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      ride:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      tom:    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      cajon:  [1,0,0,0, 1,0,0,1, 1,0,1,0, 1,0,0,0],
      shaker: [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
      bass:   [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0],
      piano:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      guitar: [1,0,1,0, 0,0,1,0, 1,0,1,0, 0,0,1,0],
      strings:[0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      synth:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]
    }
  },
  hiphop: {
    name: "Hip-Hop", bpm: 90, bassType: "sub",
    progression: [{ root: 43, q: "min" }, { root: 43, q: "min" }, { root: 48, q: "min" }, { root: 46, q: "min" }],
    steps: {
      kick:   [1,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0],
      snare:  [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      hihat:  [1,0,1,0, 1,0,1,1, 1,0,1,0, 1,0,1,1],
      crash:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      ride:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      tom:    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      bass:   [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
      piano:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      guitar: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      strings:[1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      synth:  [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0]
    }
  }
};

/* ----------------------------- State ----------------------------- */
const state = {
  pattern: "rock",
  bpm: 120,
  userGrid: null,
  mixer: {},
  fxTrack: "guitar",
  metronome: { enabled: false, volume: 0.5 },
  loopBars: 4,
  bassType: "electric",
  tapTimes: [],
  progression: null,
  // Piano roll: notas propias por pista ({ step, midi, len } en semicorcheas).
  roll: { track: "synth", bars: 2, len: 2, notes: {}, on: {} }
};

// Efectos por pista: envíos de reverb/delay (0-100) y EQ de 3 bandas (dB).
const FX_DEFAULT = { reverb: 0, delay: 0, low: 0, mid: 0, high: 0 };
INSTRUMENTS.forEach((inst) => {
  state.mixer[inst.id] = { volume: defaultVolume(inst.id), pan: 0, muted: false, solo: false, fx: { ...FX_DEFAULT } };
});

// Pistas melódicas que admiten piano roll y su rango (2 octavas).
const ROLL_TRACKS = ["synth", "piano", "guitar", "strings", "bass"];
const ROLL_RANGE = { bass: [36, 59], guitar: [48, 71], piano: [60, 83], strings: [60, 83], synth: [60, 83] };
ROLL_TRACKS.forEach((id) => { state.roll.notes[id] = []; state.roll.on[id] = false; });

function defaultVolume(id) {
  if (id === "kick") return 0.9;
  if (id === "bass") return 0.7;
  if (id === "strings") return 0.5;
  return 0.6;
}

function ensureGrid() {
  const pat = PATTERNS[state.pattern];
  if (!state.userGrid) state.userGrid = {};
  INSTRUMENTS.forEach((inst) => {
    if (!state.userGrid[inst.id] || state.userGrid[inst.id].length !== 16) {
      state.userGrid[inst.id] = [...(pat.steps[inst.id] || new Array(16).fill(0))];
    }
  });
  // Solo la primera vez: después manda lo que elija el usuario (BPM, bajo).
  if (!state.progression) {
    state.progression = pat.progression;
    state.bpm = pat.bpm;
    state.bassType = pat.bassType;
  }
}

ensureGrid();

/* ----------------------------- Audio graph ----------------------------- */
let graph = null;
let isPlaying = false;
let schedulerTimer = null;
let nextStepTime = 0;
let stepCounter = 0;
let vuRaf = null;

function makeReverbIR(ctx) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 1.5);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t / 0.4);
      if (ch === 1) data[i] *= 0.85;
    }
  }
  return buf;
}

function createNoiseBuffer(ctx, dur) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function delayTimeFor(bpm) {
  // Corchea con puntillo, sincronizada con el tempo.
  return Math.min(1.9, (60 / bpm) * 0.75);
}

function createGraph(ctx) {
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.9;
  masterGain.connect(ctx.destination);

  // Reverb y delay compartidos; cada pista decide cuánto les envía.
  const convolver = ctx.createConvolver();
  convolver.buffer = makeReverbIR(ctx);
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.9;
  convolver.connect(reverbReturn);
  reverbReturn.connect(masterGain);

  const delayNode = ctx.createDelay(2);
  delayNode.delayTime.value = delayTimeFor(state.bpm);
  const delayTone = ctx.createBiquadFilter();
  delayTone.type = "lowpass";
  delayTone.frequency.value = 3500;
  const delayFeedback = ctx.createGain();
  delayFeedback.gain.value = 0.35;
  const delayReturn = ctx.createGain();
  delayReturn.gain.value = 0.8;
  delayNode.connect(delayTone);
  delayTone.connect(delayFeedback);
  delayFeedback.connect(delayNode);
  delayTone.connect(delayReturn);
  delayReturn.connect(masterGain);

  // Canal: volumen -> EQ -> medidor -> panorama -> master (+ envíos post-fader)
  const channels = {};
  INSTRUMENTS.forEach((inst) => {
    const gain = ctx.createGain();
    const eqLow = ctx.createBiquadFilter();
    eqLow.type = "lowshelf";
    eqLow.frequency.value = 250;
    const eqMid = ctx.createBiquadFilter();
    eqMid.type = "peaking";
    eqMid.frequency.value = 1000;
    eqMid.Q.value = 0.9;
    const eqHigh = ctx.createBiquadFilter();
    eqHigh.type = "highshelf";
    eqHigh.frequency.value = 4000;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    const panner = ctx.createStereoPanner();
    const reverbSend = ctx.createGain();
    const delaySend = ctx.createGain();
    gain.connect(eqLow);
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    eqHigh.connect(analyser);
    analyser.connect(panner);
    panner.connect(masterGain);
    panner.connect(reverbSend);
    reverbSend.connect(convolver);
    panner.connect(delaySend);
    delaySend.connect(delayNode);
    channels[inst.id] = { gain, eqLow, eqMid, eqHigh, analyser, panner, reverbSend, delaySend };
  });

  // Metronome
  const metroGain = ctx.createGain();
  metroGain.connect(ctx.destination);

  const g = { masterGain, channels, convolver, reverbReturn, delayNode, delayTone, delayFeedback, delayReturn, metroGain };
  applyMixerGains(g, true);
  return g;
}

/** Aplica volumen, panorama y efectos de cada pista. immediate: sin rampa (exportación). */
function applyMixerGains(g = graph, immediate = false) {
  if (!g) return;
  const now = g.masterGain.context.currentTime;
  const set = (param, v) => {
    if (immediate) { param.value = v; return; }
    try { param.setTargetAtTime(v, now, 0.01); } catch (e) { param.value = v; }
  };
  const anySolo = Object.values(state.mixer).some((m) => m.solo);
  INSTRUMENTS.forEach((inst) => {
    const m = state.mixer[inst.id];
    const ch = g.channels[inst.id];
    if (!ch) return;
    let gain = m.volume;
    if (m.muted) gain = 0;
    if (anySolo && !m.solo) gain = 0;
    const fx = m.fx || FX_DEFAULT;
    set(ch.gain.gain, gain);
    set(ch.panner.pan, m.pan);
    set(ch.reverbSend.gain, fx.reverb / 100);
    set(ch.delaySend.gain, fx.delay / 100);
    set(ch.eqLow.gain, fx.low);
    set(ch.eqMid.gain, fx.mid);
    set(ch.eqHigh.gain, fx.high);
  });
  set(g.metroGain.gain, state.metronome.enabled ? state.metronome.volume : 0);
  set(g.delayNode.delayTime, delayTimeFor(state.bpm));
}

/* ----------------------------- Note helpers ----------------------------- */
function chordForBar(barIndex) {
  const prog = state.progression || PATTERNS[state.pattern].progression;
  return prog[barIndex % prog.length];
}

function chordNotes(chord, octaveShift = 0) {
  const root = chord.root + octaveShift * 12;
  const ivs = QUALITY_INTERVALS[chord.q] || [0, 4, 7];
  return ivs.map((i) => root + i);
}

/* ----------------------------- Voices (real samples + synth fallback) ----------------------------- */
function scheduleKick(ctx, ch, time, stepIndex = 0) {
  if (playDrum("kick", time, ch.gain, { velocity: stepIndex % 8 === 0 ? 1 : 0.78 })) return;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(160, time);
  osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.9, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
  osc.connect(gain).connect(ch.gain);
  osc.start(time);
  osc.stop(time + 0.35);
  const click = ctx.createOscillator();
  click.type = "square";
  click.frequency.value = 900;
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.15, time);
  cg.gain.exponentialRampToValueAtTime(0.001, time + 0.012);
  click.connect(cg).connect(ch.gain);
  click.start(time);
  click.stop(time + 0.02);
}

function scheduleSnare(ctx, ch, time, stepIndex = 0) {
  const accent = stepIndex % 8 === 4 ? 0.95 : 0.72;
  if (playDrum("snare", time, ch.gain, { velocity: accent })) return;
  const buf = createNoiseBuffer(ctx, 0.15);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1200;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.6, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
  src.connect(hp).connect(gain).connect(ch.gain);
  src.start(time);
  src.stop(time + 0.16);
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = 200;
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.4, time);
  og.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
  osc.connect(og).connect(ch.gain);
  osc.start(time);
  osc.stop(time + 0.1);
}

function scheduleHihat(ctx, ch, time, open, stepIndex = 0) {
  const useOpen = !!open || (stepIndex % 8 === 7 && state.pattern !== "metal");
  const vel = useOpen ? 0.55 : (stepIndex % 2 ? 0.6 : 0.9);
  if (playDrum(useOpen ? "hihat_open" : "hihat", time, ch.gain, { velocity: vel, gain: useOpen ? 0.62 : 0.9 })) return;
  const buf = createNoiseBuffer(ctx, open ? 0.25 : 0.05);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 6000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.25, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + (open ? 0.25 : 0.05));
  src.connect(hp).connect(gain).connect(ch.gain);
  src.start(time);
  src.stop(time + (open ? 0.26 : 0.06));
}

function scheduleCrash(ctx, ch, time) {
  if (playDrum("crash", time, ch.gain, { velocity: 0.9, gain: 0.75 })) return;
  const buf = createNoiseBuffer(ctx, 1.8);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 3000;
  bp.Q.value = 0.8;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.5, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 1.6);
  src.connect(bp).connect(gain).connect(ch.gain);
  src.start(time);
  src.stop(time + 1.8);
  // metallic partials
  [3.1, 4.3, 5.7].forEach((mult) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = 440 * mult;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.08, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 1.2);
    o.connect(g).connect(ch.gain);
    o.start(time);
    o.stop(time + 1.3);
  });
}

function scheduleRide(ctx, ch, time, stepIndex = 0) {
  if (playDrum("ride", time, ch.gain, { velocity: stepIndex % 2 ? 0.6 : 0.85, gain: 0.85 })) return;
  const buf = createNoiseBuffer(ctx, 0.4);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 4000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.2, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
  src.connect(hp).connect(gain).connect(ch.gain);
  src.start(time);
  src.stop(time + 0.42);
  const bell = ctx.createOscillator();
  bell.type = "sine";
  bell.frequency.value = 1200;
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.15, time);
  bg.gain.exponentialRampToValueAtTime(0.001, time + 0.6);
  bell.connect(bg).connect(ch.gain);
  bell.start(time);
  bell.stop(time + 0.65);
}

// Cajón: graves en los tiempos fuertes, slap en el resto (más suave a contratiempo).
function scheduleCajon(ctx, ch, time, stepIndex = 0) {
  const pos = stepIndex % 8;
  const bassHit = pos === 0 || pos === 3;
  const velocity = bassHit ? (pos === 0 ? 0.95 : 0.7) : (stepIndex % 2 ? 0.35 : 0.8);
  playHand(bassHit ? "cajon_bass" : "cajon_slap", time, ch.gain, { velocity, gain: bassHit ? 1 : 0.8 });
}

// Shaker: acento en las corcheas, más suave en las semicorcheas.
function scheduleShaker(ctx, ch, time, stepIndex = 0) {
  playHand("shaker", time, ch.gain, { velocity: stepIndex % 2 ? 0.2 : 0.8, gain: stepIndex % 2 ? 0.35 : 0.5 });
}

function scheduleTom(ctx, ch, time, stepIndex = 0) {
  if (playDrum(stepIndex % 8 === 0 ? "tom_high" : "tom_mid", time, ch.gain, { velocity: 0.8, gain: 0.85 })) return;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(220, time);
  osc.frequency.exponentialRampToValueAtTime(120, time + 0.15);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.6, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
  osc.connect(gain).connect(ch.gain);
  osc.start(time);
  osc.stop(time + 0.3);
  const noise = createNoiseBuffer(ctx, 0.08);
  const ns = ctx.createBufferSource();
  ns.buffer = noise;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.15, time);
  ng.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
  ns.connect(ng).connect(ch.gain);
  ns.start(time);
  ns.stop(time + 0.09);
}

function scheduleBass(ctx, ch, time, barIndex, stepIndex, bassType) {
  const chord = chordForBar(barIndex);
  let bassMidi = chord.root - 12;
  while (bassMidi < 40) bassMidi += 12;
  if (playPitched("bass", bassMidi, time, ch.gain, {
    gain: bassType === "sub" ? 0.72 : 0.85,
    velocity: bassType === "sub" ? 0.55 : 0.9,
    duration: 0.55
  })) return;
  const freq = midiToFreq(chord.root - 12);
  const dur = 0.35;
  if (bassType === "sub") {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
    osc.connect(gain).connect(ch.gain);
    osc.start(time);
    osc.stop(time + 0.45);
  } else if (bassType === "upright") {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.7, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
    osc.connect(filter).connect(gain).connect(ch.gain);
    osc.start(time);
    osc.stop(time + 0.45);
    // pluck click
    const click = ctx.createOscillator();
    click.type = "square";
    click.frequency.value = freq * 2;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.08, time);
    cg.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
    click.connect(cg).connect(ch.gain);
    click.start(time);
    click.stop(time + 0.03);
  } else {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1200, time);
    filter.frequency.exponentialRampToValueAtTime(400, time + 0.2);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
    osc.connect(filter).connect(gain).connect(ch.gain);
    osc.start(time);
    osc.stop(time + 0.4);
  }
}

function schedulePiano(ctx, ch, time, barIndex, stepIndex) {
  const chord = chordForBar(barIndex);
  const notes = chordNotes(chord, 1);
  const dur = 0.4;
  notes.forEach((midi, i) => {
    const freq = midiToFreq(midi);
    [1, 2, 3].forEach((p, pi) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * p;
      const gain = ctx.createGain();
      const amp = (0.35 / (pi + 1)) * (pi === 0 ? 1 : 0.6);
      gain.gain.setValueAtTime(amp, time + i * 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, time + i * 0.012 + dur);
      osc.connect(gain).connect(ch.gain);
      osc.start(time + i * 0.012);
      osc.stop(time + i * 0.012 + dur + 0.05);
    });
  });
  // hammer noise
  const buf = createNoiseBuffer(ctx, 0.02);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 2000;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.12, time);
  ng.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
  src.connect(hp).connect(ng).connect(ch.gain);
  src.start(time);
  src.stop(time + 0.025);
}

function karplusBuffer(ctx, freq, dur) {
  const sr = ctx.sampleRate;
  const N = Math.max(2, Math.round(sr / freq));
  const total = Math.max(1, Math.ceil(dur * sr));
  const delay = new Float32Array(N);
  for (let i = 0; i < N; i++) delay[i] = Math.random() * 2 - 1;
  const raw = new Float32Array(total);
  let pos = 0;
  const fb = 0.993;
  for (let n = 0; n < total; n++) {
    const cur = delay[pos];
    raw[n] = cur;
    const avg = (cur + delay[(pos + 1) % N]) * 0.5;
    delay[pos] = avg * fb;
    pos = (pos + 1) % N;
  }
  const out = new Float32Array(total);
  let y = 0;
  const a = 0.45;
  for (let n = 0; n < total; n++) {
    y = y + (1 - a) * (raw[n] - y);
    out[n] = y;
  }
  for (let n = 0; n < total; n++) {
    const t = n / sr;
    out[n] *= Math.exp(-t / 1.1);
  }
  let peak = 0;
  for (let n = 0; n < total; n++) peak = Math.max(peak, Math.abs(out[n]));
  const scale = peak > 0 ? 0.7 / peak : 1;
  for (let n = 0; n < total; n++) out[n] *= scale;
  const buf = ctx.createBuffer(1, total, sr);
  buf.copyToChannel(out, 0);
  return buf;
}

function scheduleGuitar(ctx, ch, time, barIndex, stepIndex) {
  const chord = chordForBar(barIndex);
  const notes = chordNotes(chord, 1);
  const dur = 0.55;
  if (isGroupReady("guitar")) {
    notes.forEach((midi, i) => {
      playPitched("guitar", midi, time + i * 0.018, ch.gain, {
        gain: 0.72, velocity: 0.82, duration: dur
      });
    });
    return;
  }
  notes.forEach((midi, i) => {
    const freq = midiToFreq(midi);
    const buf = karplusBuffer(ctx, freq, dur);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = 0.35;
    const panner = ctx.createStereoPanner();
    panner.pan.value = (i / Math.max(1, notes.length - 1)) * 0.4 - 0.2;
    src.connect(gain).connect(panner).connect(ch.gain);
    src.start(time + i * 0.018);
    try { src.stop(time + i * 0.018 + dur + 0.1); } catch (e) {}
  });
}

function scheduleStrings(ctx, ch, time, barIndex, stepIndex) {
  const chord = chordForBar(barIndex);
  const notes = chordNotes(chord, 2);
  const dur = 1.2;
  notes.forEach((midi) => {
    const freq = midiToFreq(midi);
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1800;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.25, time + 0.15);
    gain.gain.setValueAtTime(0.25, time + dur - 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(filter).connect(gain).connect(ch.gain);
    osc.start(time);
    osc.stop(time + dur + 0.05);
  });
}

function scheduleSynth(ctx, ch, time, barIndex, stepIndex) {
  const chord = chordForBar(barIndex);
  const notes = chordNotes(chord, 1);
  const note = notes[stepIndex % notes.length];
  const freq = midiToFreq(note);
  const dur = 0.25;
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = freq;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(2500, time);
  filter.frequency.exponentialRampToValueAtTime(600, time + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.4, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
  osc.connect(filter).connect(gain).connect(ch.gain);
  osc.start(time);
  osc.stop(time + dur + 0.05);
  // vibrato
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 5;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 8;
  lfo.connect(lfoGain).connect(osc.frequency);
  lfo.start(time);
  lfo.stop(time + dur + 0.05);
}

/** Una nota suelta del piano roll con la duración indicada (segundos). */
function voiceNote(ctx, ch, id, time, midi, dur) {
  if (!ch) return;
  dur = Math.max(0.1, dur);
  const group = { bass: "bass", guitar: "guitar", piano: "piano" }[id];
  if (group && playPitched(group, midi, time, ch.gain, {
    gain: id === "piano" ? 0.6 : 0.8, velocity: 0.85, duration: dur + 0.1
  })) return;
  const freq = midiToFreq(midi);
  if (id === "guitar") {
    const src = ctx.createBufferSource();
    src.buffer = karplusBuffer(ctx, freq, dur + 0.2);
    const gain = ctx.createGain();
    gain.gain.value = 0.4;
    src.connect(gain).connect(ch.gain);
    src.start(time);
    try { src.stop(time + dur + 0.25); } catch (e) {}
    return;
  }
  const [type, cutoff, level] = {
    bass: ["triangle", 900, 0.5],
    piano: ["sine", 4000, 0.32],
    strings: ["sawtooth", 1800, 0.22],
    synth: ["sawtooth", 2500, 0.3]
  }[id] || ["triangle", 2000, 0.3];
  const attack = id === "strings" ? 0.08 : 0.005;
  const release = id === "strings" ? 0.25 : 0.08;
  const end = time + dur;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cutoff;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(level, time + attack);
  gain.gain.setValueAtTime(level, Math.max(time + attack, end - 0.03));
  gain.gain.exponentialRampToValueAtTime(0.0001, end + release);
  osc.connect(filter).connect(gain).connect(ch.gain);
  osc.start(time);
  osc.stop(end + release + 0.05);
}

function scheduleMetroClick(ctx, graph, time, downbeat) {
  if (!state.metronome.enabled) return;
  const freq = downbeat ? 920 : 620;
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, time);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.55), time + 0.05);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, time);
  gain.gain.exponentialRampToValueAtTime(downbeat ? 0.35 : 0.22, time + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.07);
  osc.connect(gain).connect(graph.metroGain);
  osc.start(time);
  osc.stop(time + 0.08);
}

function playInstrument(ctx, graph, id, time, barIndex, stepIndex) {
  const ch = graph.channels[id];
  if (!ch) return;
  switch (id) {
    case "kick": scheduleKick(ctx, ch, time, stepIndex); break;
    case "snare": scheduleSnare(ctx, ch, time, stepIndex); break;
    case "hihat": scheduleHihat(ctx, ch, time, false, stepIndex); break;
    case "crash": scheduleCrash(ctx, ch, time); break;
    case "ride": scheduleRide(ctx, ch, time, stepIndex); break;
    case "tom": scheduleTom(ctx, ch, time, stepIndex); break;
    case "cajon": scheduleCajon(ctx, ch, time, stepIndex); break;
    case "shaker": scheduleShaker(ctx, ch, time, stepIndex); break;
    case "bass": scheduleBass(ctx, ch, time, barIndex, stepIndex, state.bassType); break;
    case "piano": schedulePiano(ctx, ch, time, barIndex, stepIndex); break;
    case "guitar": scheduleGuitar(ctx, ch, time, barIndex, stepIndex); break;
    case "strings": scheduleStrings(ctx, ch, time, barIndex, stepIndex); break;
    case "synth": scheduleSynth(ctx, ch, time, barIndex, stepIndex); break;
  }
}

/* ----------------------------- Scheduler ----------------------------- */
// Un paso (semicorchea): las pistas con piano roll tocan sus notas; el resto, el secuenciador.
function scheduleStep(ctx, g, step, time) {
  const stepIndex = step % 16;
  const barIndex = Math.floor(step / 16) % state.loopBars;
  if (state.metronome.enabled && stepIndex % 4 === 0) {
    scheduleMetroClick(ctx, g, time, stepIndex === 0);
  }
  const stepDur = 60.0 / (state.bpm * 4);
  const rollStep = step % (state.roll.bars * 16);
  INSTRUMENTS.forEach((inst) => {
    if (state.roll.on[inst.id]) {
      state.roll.notes[inst.id].forEach((n) => {
        if (n.step === rollStep) voiceNote(ctx, g.channels[inst.id], inst.id, time, n.midi, n.len * stepDur);
      });
      return;
    }
    if (state.userGrid[inst.id] && state.userGrid[inst.id][stepIndex]) {
      playInstrument(ctx, g, inst.id, time, barIndex, stepIndex);
    }
  });
}

function scheduleAhead() {
  if (!isPlaying) return;
  const ctx = getAudioContext();
  const horizon = ctx.currentTime + 0.15;
  while (nextStepTime < horizon) {
    scheduleStep(ctx, graph, stepCounter, nextStepTime);
    const delayMs = Math.max(0, (nextStepTime - ctx.currentTime) * 1000);
    const si = stepCounter % 16;
    const rs = stepCounter % (state.roll.bars * 16);
    setTimeout(() => { highlightStep(si, rs); }, delayMs);
    stepCounter++;
    nextStepTime += 60.0 / (state.bpm * 4);
  }
  schedulerTimer = setTimeout(scheduleAhead, 25);
}

function highlightStep(stepIndex, rollStep) {
  const cells = document.querySelectorAll(".seq-cell.current, .pr-head.current");
  cells.forEach((c) => c.classList.remove("current"));
  document.querySelectorAll(`.seq-cell[data-step="${stepIndex}"]`).forEach((c) => c.classList.add("current"));
  const head = document.querySelector(`.pr-head[data-step="${rollStep}"]`);
  if (head) head.classList.add("current");
  const beatInd = document.getElementById("beatInd");
  if (beatInd) beatInd.textContent = (stepIndex % 4 === 0) ? "●" : "·";
}

function startVU() {
  if (vuRaf) return;
  const loop = () => {
    if (!isPlaying || !graph) { vuRaf = null; return; }
    INSTRUMENTS.forEach((inst) => {
      const ch = graph.channels[inst.id];
      if (!ch) return;
      const data = new Uint8Array(ch.analyser.frequencyBinCount);
      ch.analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const level = Math.min(1, sum / (data.length * 96));
      const el = document.getElementById("vu-" + inst.id);
      if (el) el.style.height = Math.round(level * 100) + "%";
    });
    vuRaf = requestAnimationFrame(loop);
  };
  vuRaf = requestAnimationFrame(loop);
}

function stopVU() {
  if (vuRaf) { cancelAnimationFrame(vuRaf); vuRaf = null; }
  INSTRUMENTS.forEach((inst) => {
    const el = document.getElementById("vu-" + inst.id);
    if (el) el.style.height = "0%";
  });
}

function disconnectGraph(g) {
  if (!g) return;
  ["masterGain", "convolver", "reverbReturn", "delayNode", "delayTone", "delayFeedback", "delayReturn", "metroGain"].forEach((k) => {
    try { g[k].disconnect(); } catch (e) {}
  });
  Object.values(g.channels || {}).forEach((ch) => {
    Object.values(ch).forEach((node) => { try { node.disconnect(); } catch (e) {} });
  });
}

function startBacking() {
  if (isPlaying) stopBacking();
  if (graph) { disconnectGraph(graph); graph = null; }
  const ctx = getAudioContext();
  resumeContext(ctx);
  warmRealSamples(null);
  ensureGrid();
  graph = createGraph(ctx);
  isPlaying = true;
  stepCounter = 0;
  nextStepTime = ctx.currentTime + 0.05;
  scheduleAhead();
  startVU();
  const btn = document.getElementById("backStart");
  if (btn) btn.textContent = "⏸ Pausar";
}

function stopBacking() {
  isPlaying = false;
  if (schedulerTimer) { clearTimeout(schedulerTimer); schedulerTimer = null; }
  stopVU();
  if (graph) { disconnectGraph(graph); graph = null; }
  document.querySelectorAll(".seq-cell.current, .pr-head.current").forEach((c) => c.classList.remove("current"));
  const btn = document.getElementById("backStart");
  if (btn) btn.textContent = "▶ Iniciar";
}

/* ----------------------------- Export WAV ----------------------------- */
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

async function exportTrack() {
  const bars = state.loopBars;
  const ctx = new OfflineAudioContext(2, Math.ceil(getAudioContext().sampleRate * (bars * 16 * (60 / (state.bpm * 4)))), getAudioContext().sampleRate);
  // replicate graph on offline ctx
  const offGraph = createGraph(ctx);

  const totalSteps = bars * 16;
  const stepDur = 60.0 / (state.bpm * 4);
  let t = 0.05;
  ensureGrid();
  for (let s = 0; s < totalSteps; s++) {
    scheduleStep(ctx, offGraph, s, t);
    t += stepDur;
  }
  const rendered = await ctx.startRendering();
  const blob = audioBufferToWav(rendered);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `backing-${state.pattern}-${state.bpm}bpm.wav`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(t("backing.exported"));
}

/* ----------------------------- UI ----------------------------- */
function injectStyles() {
  if (document.getElementById("backing-pro-styles")) return;
  const style = document.createElement("style");
  style.id = "backing-pro-styles";
  style.textContent = `
  .backing-pro { padding: 12px; }
  .backing-pro h2 { margin: 0 0 8px; }
  .bp-card { background: var(--card, #1e1e2e); border: 1px solid var(--border, #333); border-radius: 12px; padding: 12px; margin-bottom: 12px; }
  .bp-badge { display:inline-block; margin-left:6px; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:800;
    background: rgba(255,150,0,.16); color:#ffb347; border:1px solid rgba(255,150,0,.35); }
  .bp-badge.ready { background: rgba(34,197,94,.16); color:#7ee038; border-color: rgba(34,197,94,.4); }
  .bp-transport { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 10px; }
  .bp-transport button { padding: 8px 14px; border-radius: 8px; border: none; cursor: pointer; font-weight: 700; }
  .bp-transport .primary { background: #22c55e; color: #fff; }
  .bp-transport select, .bp-transport input { padding: 6px; border-radius: 8px; border: 1px solid var(--border,#444); background: var(--card2,#2a2a3a); color: var(--text,#fff); }
  .bp-slider-row { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
  .bp-slider-row label { min-width: 60px; font-size: 12px; color: var(--muted,#aaa); }
  .bp-slider-row input[type=range] { flex: 1; }
  .mixer-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 8px; }
  .mixer-strip { background: var(--card2,#2a2a3a); border-radius: 10px; padding: 8px 6px; text-align: center; }
  .mixer-name { font-size: 12px; font-weight: 800; margin-bottom: 6px; }
  .vu-wrap { height: 60px; width: 12px; margin: 0 auto 6px; background: #111; border-radius: 4px; position: relative; overflow: hidden; }
  .vu-bar { position: absolute; bottom: 0; left: 0; right: 0; height: 0%; background: linear-gradient(to top, #22c55e, #f1c40f, #e74c3c); transition: height 0.05s; }
  .mix-btn { width: 28px; height: 24px; border-radius: 4px; border: 1px solid #555; background: #333; color: #fff; font-size: 11px; font-weight: 800; cursor: pointer; margin: 2px; }
  .mix-btn.active.mute { background: #e74c3c; }
  .mix-btn.active.solo { background: #f1c40f; color: #000; }
  .mixer-strip input[type=range] { width: 100%; margin: 2px 0; }
  .mixer-strip label { font-size: 10px; color: var(--muted,#aaa); }
  .seq-grid { overflow-x: auto; }
  .seq-row { display: grid; grid-template-columns: 90px repeat(16, 1fr); gap: 2px; margin-bottom: 2px; }
  .seq-header .seq-stepnum { text-align: center; font-size: 10px; color: var(--muted,#aaa); }
  .seq-label { font-size: 11px; font-weight: 700; display: flex; align-items: center; padding-left: 4px; }
  .seq-cell { height: 22px; border-radius: 3px; background: #2a2a3a; cursor: pointer; border: 1px solid #333; transition: background 0.1s; }
  .seq-cell.on { background: var(--c, #22c55e); }
  .seq-cell.current { outline: 2px solid #fff; }
  .mix-btn.fx { width: 32px; }
  .mix-btn.fx.on { background: #3498db; border-color: #3498db; }
  .mixer-strip.sel { outline: 2px solid var(--c, #3498db); }
  .fx-panel { margin-top: 10px; padding: 10px; border-radius: 10px; background: var(--card2,#2a2a3a); border-left: 4px solid var(--c, #3498db); }
  .fx-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
  .fx-head button, .pr-tools button { padding: 5px 10px; border-radius: 8px; border: 1px solid #555; background: #333; color: #fff; cursor: pointer; font-weight: 700; font-size: 12px; }
  .fx-panel .bp-slider-row span { min-width: 52px; text-align: right; font-size: 12px; font-variant-numeric: tabular-nums; }
  .seq-row.roll .seq-cell { opacity: .3; pointer-events: none; }
  .pr-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 8px; font-size: 12px; }
  .pr-tools select { padding: 5px; border-radius: 8px; border: 1px solid var(--border,#444); background: var(--card2,#2a2a3a); color: var(--text,#fff); }
  .pr-wrap { overflow: auto; max-height: 440px; border-radius: 8px; border: 1px solid #333; }
  .pr-grid { display: grid; grid-template-columns: 44px repeat(var(--steps), 22px); width: max-content; }
  .pr-corner, .pr-head { position: sticky; top: 0; z-index: 2; height: 18px; background: #15151d; font-size: 9px; color: var(--muted,#aaa); display: flex; align-items: center; justify-content: center; }
  .pr-corner { left: 0; z-index: 4; }
  .pr-head.current { background: #f1c40f; color: #000; }
  .pr-key { position: sticky; left: 0; z-index: 3; height: 18px; display: flex; align-items: center; padding-left: 4px; font-size: 10px; font-weight: 700; background: #e9e9ee; color: #111; border-bottom: 1px solid #aaa; cursor: pointer; }
  .pr-key.blk { background: #26262f; color: #ccc; border-bottom-color: #111; }
  .pr-cell { height: 18px; background: #22222e; border-right: 1px solid #2b2b39; border-bottom: 1px solid #2b2b39; cursor: pointer; }
  .pr-cell.blk { background: #1b1b24; }
  .pr-cell.beat { border-left: 1px solid #44445a; }
  .pr-cell.bar { border-left: 2px solid #6a6a85; }
  .pr-cell.on { background: var(--c); border-radius: 4px 0 0 4px; box-shadow: inset 0 0 0 1px rgba(0,0,0,.35); }
  .pr-cell.tail { background: var(--c); opacity: .65; border-right-color: transparent; }
  .beat-ind { text-align: center; font-size: 28px; margin: 8px 0; }
  `;
  document.head.appendChild(style);
}

function toast(msg) {
  if (typeof window !== "undefined" && typeof window.toast === "function") {
    try { window.toast(msg); return; } catch (e) {}
  }
  // fallback
  const t = document.createElement("div");
  t.textContent = msg;
  t.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:8px 14px;border-radius:8px;z-index:9999";
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}

function warmRealSamples(container) {
  try {
    const ctx = getAudioContext();
    resumeContext(ctx);
    const badge = container && container.querySelector("#sampleBadge");
    const update = () => {
      if (!badge) return;
      const s = getSampleState();
      const g = s.groups;
      const total = g.drums.total + g.bass.total + g.guitar.total + g.hand.total;
      const loaded = g.drums.loaded + g.bass.loaded + g.guitar.loaded + g.hand.loaded;
      if (g.drums.ready && g.bass.ready && g.guitar.ready && g.hand.ready) {
        badge.textContent = "● Muestras reales";
        badge.classList.add("ready");
      } else {
        badge.textContent = `Cargando sonidos ${total ? Math.round((loaded / total) * 100) : 0}%`;
      }
    };
    Promise.all([
      preloadGroup("drums", ctx, update),
      preloadGroup("bass", ctx, update),
      preloadGroup("guitar", ctx, update),
      preloadGroup("hand", ctx, update),
    ]).then(update);
  } catch (e) { /* se mantiene la sintesis */ }
}

function renderBackingMixer(container) {
  injectStyles();
  ensureGrid();
  try {
    const _fx0 = (appState.settings && appState.settings.fx) || {};
    setFxReverb(_fx0.reverb !== false);
    setFxChorus(!!_fx0.chorus);
    setFxDelay(!!_fx0.delay);
    setFxDistortion(!!_fx0.distortion);
  } catch (e) {}
  const _fx = (appState.settings && appState.settings.fx) || {};
  container.innerHTML = `
    <div class="backing-pro">
      <div class="bp-card">
        <h2>🥁 Backing Tracks Pro</h2>
        <p style="color:var(--muted,#aaa);font-size:13px;margin:0 0 8px">Batería, bajo y guitarra grabados de verdad. <span class="bp-badge" id="sampleBadge">Cargando sonidos…</span></p>
        <div class="bp-transport">
          <select id="patSel">${Object.keys(PATTERNS).map((p) => `<option value="${p}" ${p === state.pattern ? "selected" : ""}>${PATTERNS[p].name}</option>`).join("")}</select>
          <button class="primary" id="backStart">▶ Iniciar</button>
          <button id="backStop">⏹ Detener</button>
          <button id="tapTempo">Tap Tempo</button>
          <select id="loopSel">
            <option value="4" ${state.loopBars === 4 ? "selected" : ""}>4 compases</option>
            <option value="8" ${state.loopBars === 8 ? "selected" : ""}>8 compases</option>
            <option value="16" ${state.loopBars === 16 ? "selected" : ""}>16 compases</option>
          </select>
          <button id="exportBtn">⬇ Exportar WAV</button>
        </div>
        <div class="bp-slider-row">
          <label>BPM</label>
          <input type="range" id="bpmSlider" min="40" max="240" value="${state.bpm}">
          <span id="bpmVal" style="min-width:40px;text-align:right">${state.bpm}</span>
        </div>
        <div class="bp-slider-row">
          <label>Bajo</label>
          <select id="bassTypeSel">
            <option value="sub" ${state.bassType === "sub" ? "selected" : ""}>Sub</option>
            <option value="electric" ${state.bassType === "electric" ? "selected" : ""}>Electric</option>
            <option value="upright" ${state.bassType === "upright" ? "selected" : ""}>Upright</option>
          </select>
        </div>
        <div class="bp-slider-row">
          <label>Metro</label>
          <input type="checkbox" id="metroToggle" ${state.metronome.enabled ? "checked" : ""}>
          <input type="range" id="metroVol" min="0" max="100" value="${Math.round(state.metronome.volume * 100)}">
        </div>
        <div class="beat-ind" id="beatInd">—</div>
      </div>

      <div class="bp-card">
        <h3 style="margin:0 0 8px">🎚 Mixer</h3>
        <p style="color:var(--muted,#aaa);font-size:12px;margin:0 0 8px">Pulsa <b>FX</b> en un canal para darle reverb, delay y ecualización solo a esa pista.</p>
        <div class="mixer-grid" id="mixerPanel"></div>
        <div id="fxPanel"></div>
      </div>

      <div class="bp-card">
        <h3>🎛 Efectos de audio</h3>
        <p style="color:var(--muted,#aaa);font-size:12px;margin:0 0 8px">Activa o desactiva efectos globales (se aplican al sonido de las pistas).</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:6px;font-weight:700"><input type="checkbox" id="bfxReverb" ${_fx.reverb !== false ? "checked" : ""}> Reverb</label>
          <label style="display:flex;align-items:center;gap:6px;font-weight:700"><input type="checkbox" id="bfxChorus" ${_fx.chorus ? "checked" : ""}> Chorus</label>
          <label style="display:flex;align-items:center;gap:6px;font-weight:700"><input type="checkbox" id="bfxDelay" ${_fx.delay ? "checked" : ""}> Delay</label>
          <label style="display:flex;align-items:center;gap:6px;font-weight:700"><input type="checkbox" id="bfxDistortion" ${_fx.distortion ? "checked" : ""}> Distorsión</label>
        </div>
      </div>

      <div class="bp-card">
        <h3 style="margin:0 0 8px">🎼 Secuenciador (16 pasos)</h3>
        <div class="seq-grid" id="seqGrid"></div>
      </div>

      <div class="bp-card">
        <h3 style="margin:0 0 4px">🎹 Piano roll</h3>
        <p style="color:var(--muted,#aaa);font-size:12px;margin:0 0 8px">Escribe tu propia melodía: toca una casilla para poner una nota y tócala otra vez para quitarla. Mientras una pista usa el piano roll, deja de seguir los acordes del secuenciador.</p>
        <div class="pr-tools">
          <label>Pista <select id="prTrack">${ROLL_TRACKS.map((id) => `<option value="${id}" ${id === state.roll.track ? "selected" : ""}>${INSTRUMENTS.find((i) => i.id === id).name}</option>`).join("")}</select></label>
          <label><input type="checkbox" id="prOn"> Usar piano roll</label>
          <label>Compases <select id="prBars">${[1, 2, 4].map((b) => `<option value="${b}" ${b === state.roll.bars ? "selected" : ""}>${b}</option>`).join("")}</select></label>
          <label>Duración <select id="prLen">${[[1, "1/16"], [2, "1/8"], [4, "1/4"], [8, "1/2"], [16, "1 compás"]].map(([v, l]) => `<option value="${v}" ${v === state.roll.len ? "selected" : ""}>${l}</option>`).join("")}</select></label>
          <button id="prClear" type="button">Borrar notas</button>
        </div>
        <div class="pr-wrap" id="prWrap"></div>
      </div>
    </div>
  `;

  renderMixerPanel(container);
  renderSequencer();
  bindPianoRoll(container);

  // Bind transport
  const patSel = container.querySelector("#patSel");
  patSel.onchange = () => {
    state.pattern = patSel.value;
    const pat = PATTERNS[state.pattern];
    state.userGrid = null;
    ensureGrid();
    // reset grid from pattern
    state.userGrid = {};
    INSTRUMENTS.forEach((inst) => {
      state.userGrid[inst.id] = [...(pat.steps[inst.id] || new Array(16).fill(0))];
    });
    state.bpm = pat.bpm;
    state.bassType = pat.bassType;
    state.progression = pat.progression;
    container.querySelector("#bpmSlider").value = state.bpm;
    container.querySelector("#bpmVal").textContent = state.bpm;
    container.querySelector("#bassTypeSel").value = state.bassType;
    renderMixerPanel(container);
    renderSequencer();
    applyMixerGains();
  };

  const startBtn = container.querySelector("#backStart");
  startBtn.onclick = () => {
    if (isPlaying) { stopBacking(); startBtn.textContent = "▶ Iniciar"; }
    else { startBacking(); startBtn.textContent = "⏸ Pausar"; }
  };
  container.querySelector("#backStop").onclick = () => { stopBacking(); startBtn.textContent = "▶ Iniciar"; };

  const bpmSlider = container.querySelector("#bpmSlider");
  const bpmVal = container.querySelector("#bpmVal");
  bpmSlider.oninput = () => {
    state.bpm = parseInt(bpmSlider.value, 10);
    bpmVal.textContent = state.bpm;
    applyMixerGains();
  };

  container.querySelector("#tapTempo").onclick = () => {
    const now = performance.now();
    state.tapTimes.push(now);
    if (state.tapTimes.length > 8) state.tapTimes.shift();
    if (state.tapTimes.length >= 2) {
      const intervals = [];
      for (let i = 1; i < state.tapTimes.length; i++) intervals.push(state.tapTimes[i] - state.tapTimes[i - 1]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = Math.round(60000 / avg);
      state.bpm = Math.max(40, Math.min(240, bpm));
      bpmSlider.value = state.bpm;
      bpmVal.textContent = state.bpm;
      applyMixerGains();
    }
  };

  container.querySelector("#loopSel").onchange = (e) => {
    state.loopBars = parseInt(e.target.value, 10);
  };

  container.querySelector("#bassTypeSel").onchange = (e) => {
    state.bassType = e.target.value;
  };

  const metroToggle = container.querySelector("#metroToggle");
  const metroVol = container.querySelector("#metroVol");
  metroToggle.onchange = () => {
    state.metronome.enabled = metroToggle.checked;
    applyMixerGains();
  };
  metroVol.oninput = () => {
    state.metronome.volume = parseInt(metroVol.value, 10) / 100;
    applyMixerGains();
  };

  container.querySelector("#exportBtn").onclick = () => exportTrack();

  // mixer binds
  bindMixer(container);
  // Global FX toggles
  function bindBfx(id, key, setter) {
    const cb = container.querySelector("#" + id);
    if (!cb) return;
    cb.onchange = () => {
      const val = cb.checked;
      if (!appState.settings.fx) appState.settings.fx = {};
      appState.settings.fx[key] = val;
      saveState(appState);
      try { setter(val); } catch (e) {}
    };
  }
  bindBfx("bfxReverb", "reverb", setFxReverb);
  bindBfx("bfxChorus", "chorus", setFxChorus);
  bindBfx("bfxDelay", "delay", setFxDelay);
  bindBfx("bfxDistortion", "distortion", setFxDistortion);
  warmRealSamples(container);
}

function renderMixerPanel(container) {
  const panel = container.querySelector("#mixerPanel");
  if (!panel) return;
  panel.innerHTML = "";
  INSTRUMENTS.forEach((inst) => {
    const m = state.mixer[inst.id];
    const strip = document.createElement("div");
    strip.className = "mixer-strip" + (state.fxTrack === inst.id ? " sel" : "");
    strip.style.setProperty("--c", inst.color);
    strip.innerHTML = `
      <div class="mixer-name" style="color:${inst.color}">${inst.name}</div>
      <div class="vu-wrap"><div class="vu-bar" id="vu-${inst.id}"></div></div>
      <div>
        <button class="mix-btn mute ${m.muted ? "active" : ""}" data-id="${inst.id}" data-type="mute">M</button>
        <button class="mix-btn solo ${m.solo ? "active" : ""}" data-id="${inst.id}" data-type="solo">S</button>
        <button class="mix-btn fx ${hasFx(inst.id) ? "on" : ""}" data-id="${inst.id}" data-type="fx" title="Efectos de esta pista">FX</button>
      </div>
      <label>Vol</label>
      <input type="range" min="0" max="100" value="${Math.round(m.volume * 100)}" class="vol" data-id="${inst.id}">
      <label>Pan</label>
      <input type="range" min="-100" max="100" value="${Math.round(m.pan * 100)}" class="pan" data-id="${inst.id}">
    `;
    panel.appendChild(strip);
  });
  bindMixer(container);
  renderFxPanel(container);
}

function hasFx(id) {
  const fx = state.mixer[id].fx;
  return Object.keys(FX_DEFAULT).some((k) => fx[k] !== FX_DEFAULT[k]);
}

const FX_CONTROLS = [
  { key: "reverb", label: "Reverb", min: 0, max: 100, unit: "%" },
  { key: "delay", label: "Delay", min: 0, max: 100, unit: "%" },
  { key: "low", label: "Graves", min: -12, max: 12, unit: " dB" },
  { key: "mid", label: "Medios", min: -12, max: 12, unit: " dB" },
  { key: "high", label: "Agudos", min: -12, max: 12, unit: " dB" }
];

function renderFxPanel(container) {
  const box = container.querySelector("#fxPanel");
  if (!box) return;
  const inst = INSTRUMENTS.find((i) => i.id === state.fxTrack) || INSTRUMENTS[0];
  const fx = state.mixer[inst.id].fx;
  const fmt = (c, v) => (c.unit === " dB" && v > 0 ? "+" : "") + v + c.unit;
  box.innerHTML = `
    <div class="fx-panel" style="--c:${inst.color}">
      <div class="fx-head">
        <b>Efectos · <span style="color:${inst.color}">${inst.name}</span></b>
        <button type="button" id="fxReset">Quitar efectos</button>
      </div>
      ${FX_CONTROLS.map((c) => `
        <div class="bp-slider-row">
          <label>${c.label}</label>
          <input type="range" min="${c.min}" max="${c.max}" step="1" value="${fx[c.key]}" data-fx="${c.key}">
          <span id="fxv-${c.key}">${fmt(c, fx[c.key])}</span>
        </div>`).join("")}
    </div>`;
  const syncFxBtn = () => {
    const b = container.querySelector(`.mix-btn.fx[data-id="${inst.id}"]`);
    if (b) b.classList.toggle("on", hasFx(inst.id));
  };
  box.querySelectorAll("[data-fx]").forEach((sl) => {
    const c = FX_CONTROLS.find((x) => x.key === sl.dataset.fx);
    sl.oninput = () => {
      fx[c.key] = parseInt(sl.value, 10);
      box.querySelector("#fxv-" + c.key).textContent = fmt(c, fx[c.key]);
      applyMixerGains();
      syncFxBtn();
    };
  });
  box.querySelector("#fxReset").onclick = () => {
    state.mixer[inst.id].fx = { ...FX_DEFAULT };
    applyMixerGains();
    renderFxPanel(container);
    syncFxBtn();
  };
}

function bindMixer(container) {
  container.querySelectorAll(".mix-btn").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      const type = btn.dataset.type;
      if (type === "fx") {
        state.fxTrack = id;
        container.querySelectorAll(".mixer-strip").forEach((st) => {
          st.classList.toggle("sel", !!st.querySelector(`.mix-btn[data-id="${id}"]`));
        });
        renderFxPanel(container);
        return;
      }
      if (type === "mute") state.mixer[id].muted = !state.mixer[id].muted;
      if (type === "solo") state.mixer[id].solo = !state.mixer[id].solo;
      btn.classList.toggle("active");
      applyMixerGains();
    };
  });
  container.querySelectorAll(".vol").forEach((sl) => {
    sl.oninput = () => {
      const id = sl.dataset.id;
      state.mixer[id].volume = parseInt(sl.value, 10) / 100;
      applyMixerGains();
    };
  });
  container.querySelectorAll(".pan").forEach((sl) => {
    sl.oninput = () => {
      const id = sl.dataset.id;
      state.mixer[id].pan = parseInt(sl.value, 10) / 100;
      applyMixerGains();
    };
  });
}

function renderSequencer() {
  const grid = document.getElementById("seqGrid");
  if (!grid) return;
  grid.innerHTML = "";
  const header = document.createElement("div");
  header.className = "seq-row seq-header";
  header.innerHTML = '<div class="seq-label"></div>' + Array.from({ length: 16 }, (_, i) => `<div class="seq-stepnum">${i + 1}</div>`).join("");
  grid.appendChild(header);
  INSTRUMENTS.forEach((inst) => {
    const row = document.createElement("div");
    const inRoll = !!state.roll.on[inst.id];
    row.className = "seq-row" + (inRoll ? " roll" : "");
    if (inRoll) row.title = "Esta pista toca las notas del piano roll";
    const label = document.createElement("div");
    label.className = "seq-label";
    label.textContent = inRoll ? inst.name + " 🎹" : inst.name;
    label.style.color = inst.color;
    row.appendChild(label);
    for (let s = 0; s < 16; s++) {
      const cell = document.createElement("div");
      cell.className = "seq-cell" + (state.userGrid[inst.id][s] ? " on" : "");
      cell.style.setProperty("--c", inst.color);
      cell.dataset.inst = inst.id;
      cell.dataset.step = String(s);
      cell.onclick = () => {
        state.userGrid[inst.id][s] = state.userGrid[inst.id][s] ? 0 : 1;
        cell.classList.toggle("on", !!state.userGrid[inst.id][s]);
      };
      row.appendChild(cell);
    }
    grid.appendChild(row);
  });
}

/* ----------------------------- Piano roll ----------------------------- */
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const isBlackKey = (midi) => [1, 3, 6, 8, 10].includes(midi % 12);
const noteName = (midi) => NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);

function previewNote(id, midi) {
  const ctx = getAudioContext();
  resumeContext(ctx);
  const ch = graph ? graph.channels[id] : { gain: ctx.destination };
  voiceNote(ctx, ch, id, ctx.currentTime + 0.01, midi, 0.35);
}

function renderPianoRoll(container) {
  const wrap = container.querySelector("#prWrap");
  if (!wrap) return;
  const id = state.roll.track;
  const inst = INSTRUMENTS.find((i) => i.id === id);
  const [lo, hi] = ROLL_RANGE[id];
  const steps = state.roll.bars * 16;
  const notes = state.roll.notes[id];
  // Casillas ocupadas: inicio de nota y su continuación.
  const occupied = new Map();
  notes.forEach((n) => {
    for (let k = 0; k < n.len && n.step + k < steps; k++) {
      occupied.set(n.midi + ":" + (n.step + k), k === 0 ? "on" : "tail");
    }
  });
  let html = '<div class="pr-corner"></div>';
  for (let st = 0; st < steps; st++) {
    html += `<div class="pr-head" data-step="${st}">${st % 4 === 0 ? (st % 16 === 0 ? (st / 16 + 1) : "·") : ""}</div>`;
  }
  for (let midi = hi; midi >= lo; midi--) {
    const blk = isBlackKey(midi) ? " blk" : "";
    html += `<div class="pr-key${blk}" data-key="${midi}">${noteName(midi)}</div>`;
    for (let st = 0; st < steps; st++) {
      const occ = occupied.get(midi + ":" + st);
      const line = st % 16 === 0 ? " bar" : (st % 4 === 0 ? " beat" : "");
      html += `<div class="pr-cell${blk}${line}${occ ? " " + occ : ""}" data-midi="${midi}" data-step="${st}"></div>`;
    }
  }
  wrap.innerHTML = `<div class="pr-grid" style="--steps:${steps};--c:${inst.color}">${html}</div>`;
  const onBox = container.querySelector("#prOn");
  if (onBox) onBox.checked = !!state.roll.on[id];
}

function bindPianoRoll(container) {
  const ctx = getAudioContext();
  const refresh = () => { renderPianoRoll(container); renderSequencer(); };
  const ensureSamples = (id) => {
    if (id === "piano") preloadGroup("piano", ctx);
  };
  container.querySelector("#prTrack").onchange = (e) => {
    state.roll.track = e.target.value;
    ensureSamples(state.roll.track);
    renderPianoRoll(container);
  };
  container.querySelector("#prOn").onchange = (e) => {
    state.roll.on[state.roll.track] = e.target.checked;
    ensureSamples(state.roll.track);
    refresh();
  };
  container.querySelector("#prBars").onchange = (e) => {
    state.roll.bars = parseInt(e.target.value, 10);
    renderPianoRoll(container);
  };
  container.querySelector("#prLen").onchange = (e) => {
    state.roll.len = parseInt(e.target.value, 10);
  };
  container.querySelector("#prClear").onclick = () => {
    state.roll.notes[state.roll.track] = [];
    state.roll.on[state.roll.track] = false;
    refresh();
  };
  container.querySelector("#prWrap").onclick = (e) => {
    const id = state.roll.track;
    const key = e.target.closest(".pr-key");
    if (key) { previewNote(id, parseInt(key.dataset.key, 10)); return; }
    const cell = e.target.closest(".pr-cell");
    if (!cell) return;
    const midi = parseInt(cell.dataset.midi, 10);
    const step = parseInt(cell.dataset.step, 10);
    const notes = state.roll.notes[id];
    const hit = notes.findIndex((n) => n.midi === midi && step >= n.step && step < n.step + n.len);
    if (hit >= 0) {
      notes.splice(hit, 1);
    } else {
      const len = Math.min(state.roll.len, state.roll.bars * 16 - step);
      notes.push({ step, midi, len });
      previewNote(id, midi);
      // La primera nota activa el piano roll en la pista.
      if (!state.roll.on[id]) { state.roll.on[id] = true; ensureSamples(id); renderSequencer(); }
    }
    renderPianoRoll(container);
  };
  renderPianoRoll(container);
}

/* ----------------------------- Compat API ----------------------------- */
export function getPatterns() {
  return Object.keys(PATTERNS);
}
export function startBackingTrack(patternName, onBeat) {
  if (patternName && PATTERNS[patternName]) state.pattern = patternName;
  ensureGrid();
  // reset grid
  const pat = PATTERNS[state.pattern];
  state.userGrid = {};
  INSTRUMENTS.forEach((inst) => {
    state.userGrid[inst.id] = [...(pat.steps[inst.id] || new Array(16).fill(0))];
  });
  startBacking();
  return true;
}
export function stopBackingTrack() {
  stopBacking();
}
export function isBackingRunning() {
  return isPlaying;
}
export { renderBackingMixer };
export default { getPatterns, startBackingTrack, stopBackingTrack, isBackingRunning, renderBackingMixer };