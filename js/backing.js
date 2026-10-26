// Backing track generator: bass + drums for improvisation practice
import { getAudioContext, resumeContext } from "./audio.js";

let backingNodes = [];
let backingRunning = false;
let backingTimer = null;

const PATTERNS = {
  "rock": { bpm: 120, bass: [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0], drums: { kick: [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0], snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], hihat: [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1] } },
  "blues": { bpm: 90, bass: [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0], drums: { kick: [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0], snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0] } },
  "funk": { bpm: 100, bass: [1,0,1,0, 0,1,0,0, 1,0,0,1, 0,0,1,0], drums: { kick: [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0], snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1], hihat: [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1] } },
  "jazz": { bpm: 140, bass: [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0], drums: { kick: [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0], snare: [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0], hihat: [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0] } },
  "latin": { bpm: 110, bass: [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,0,1,0], drums: { kick: [1,0,0,0, 0,0,0,1, 0,0,1,0, 0,0,0,0], snare: [0,0,1,0, 0,0,0,0, 0,0,1,0, 0,0,0,0], hihat: [1,1,0,1, 1,1,0,1, 1,1,0,1, 1,1,0,1] } },
};

export function getPatterns() { return Object.keys(PATTERNS); }

export function startBackingTrack(patternName, onBeat) {
  if (backingRunning) stopBackingTrack();
  const pattern = PATTERNS[patternName] || PATTERNS.rock;
  const ctx = getAudioContext();
  resumeContext(ctx);
  backingRunning = true;
  const stepMs = (60000 / pattern.bpm) / 4; // 16th notes
  let step = 0;
  backingTimer = setInterval(() => {
    if (!backingRunning) return;
    const idx = step % 16;
    // Kick
    if (pattern.drums.kick[idx]) playDrum(ctx, "kick");
    // Snare
    if (pattern.drums.snare[idx]) playDrum(ctx, "snare");
    // Hi-hat
    if (pattern.drums.hihat[idx]) playDrum(ctx, "hihat");
    // Bass
    if (pattern.bass[idx]) playBass(ctx, 55 + Math.random() * 10);
    if (onBeat) onBeat(idx);
    step++;
  }, stepMs);
}

export function stopBackingTrack() {
  backingRunning = false;
  if (backingTimer) { clearInterval(backingTimer); backingTimer = null; }
  backingNodes.forEach(n => { try { n.stop(); } catch(e){} });
  backingNodes = [];
}

export function isBackingRunning() { return backingRunning; }

function playDrum(ctx, type) {
  const now = ctx.currentTime;
  if (type === "kick") {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
    gain.gain.setValueAtTime(0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.3);
  } else if (type === "snare") {
    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 1000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.start(now); noise.stop(now + 0.15);
  } else if (type === "hihat") {
    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 5000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.start(now); noise.stop(now + 0.05);
  }
}

function playBass(ctx, freq) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sawtooth";
  osc.frequency.value = freq;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 400;
  gain.gain.setValueAtTime(0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(now); osc.stop(now + 0.3);
}