// Definiciones de instrumentos y afinaciones (frecuencias en Hz)
export const INSTRUMENTS = {
  guitar: {
    name: "Guitarra (6 cuerdas)",
    emoji: "🎸",
    strings: ["E2","A2","D3","G3","B3","E4"],
    tunings: {
      standard: [82.41, 110.00, 146.83, 196.00, 246.94, 329.63],
      dropD:     [73.42, 110.00, 146.83, 196.00, 246.94, 329.63],
      openG:     [73.42, 98.00, 146.83, 196.00, 246.94, 293.66],
      dadgad:    [73.42, 110.00, 146.83, 196.00, 220.00, 293.66]
    },
    tuningNames: { standard:"Estándar (EADGBE)", dropD:"Drop D", openG:"Open G", dadgad:"DADGAD" }
  },
  ukulele: {
    name: "Ukelele (4 cuerdas)",
    emoji: "🪕",
    strings: ["G4","C4","E4","A4"],
    tunings: {
      standard: [392.00, 261.63, 329.63, 440.00],   // GCEA
      baritone: [146.83, 196.00, 246.94, 329.63],   // DGBE
      lowG:     [196.00, 261.63, 329.63, 440.00]    // low-G
    },
    tuningNames: { standard:"Estándar (GCEA)", baritone:"Barítono (DGBE)", lowG:"Low-G" }
  },
  bass: {
    name: "Bajo (4 cuerdas)",
    emoji: "🎸",
    strings: ["E1","A1","D2","G2"],
    tunings: {
      standard: [41.20, 55.00, 73.42, 98.00],
      dropD:    [36.71, 55.00, 73.42, 98.00],
      five:     [30.87, 41.20, 55.00, 73.42, 98.00]
    },
    tuningNames: { standard:"Estándar (EADG)", dropD:"Drop D", five:"5 cuerdas (BEADG)" }
  },
  mandolin: {
    name: "Mandolina (4 cuerdas)",
    emoji: "🎻",
    strings: ["G3","D4","A4","E5"],
    tunings: {
      standard: [196.00, 293.66, 440.00, 659.25]
    },
    tuningNames: { standard:"Estándar (GDAE)" }
  },
  banjo: {
    name: "Banjo (5 cuerdas)",
    emoji: "🪕",
    strings: ["G4","D3","G3","B3","D4"],
    tunings: {
      standard: [392.00, 146.83, 196.00, 246.94, 293.66],
      openG:    [392.00, 146.83, 196.00, 246.94, 293.66]
    },
    tuningNames: { standard:"Estándar (gDGBD)", openG:"Open G" }
  },
  violin: {
    name: "Violín (4 cuerdas)",
    emoji: "🎻",
    strings: ["G3","D4","A4","E5"],
    tunings: {
      standard: [196.00, 293.66, 440.00, 659.25]
    },
    tuningNames: { standard:"Estándar (GDAE)" }
  }
};

export const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

export function freqToMidi(freq) {
  return 69 + 12 * Math.log2(freq / 440);
}
export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
export function midiToNote(midi) {
  const n = Math.round(midi);
  const name = NOTE_NAMES[((n % 12) + 12) % 12];
  const octave = Math.floor(n / 12) - 1;
  return { name, octave, full: name + octave };
}
export function centsOff(freq, targetFreq) {
  return 1200 * Math.log2(freq / targetFreq);
}
export function closestString(freq, tuningFreqs) {
  let best = 0, bestDiff = Infinity;
  tuningFreqs.forEach((f, i) => {
    const d = Math.abs(1200 * Math.log2(freq / f));
    if (d < bestDiff) { bestDiff = d; best = i; }
  });
  return { index: best, diff: bestDiff };
}
