// pitch-worker.js - Web Worker for YIN pitch detection off the main thread.
// Receives audio buffers via postMessage and returns pitch results.
//
// Message in:  { type: "detect", id, buffer: Float32Array, sampleRate, threshold? }
// Message out: { type: "pitch", id, pitch: { freq, midi, note, confidence } | null }

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function midiToNote(midi) {
  const rounded = Math.round(midi);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return { name, octave, full: name + octave };
}

function rms(buffer) {
  let s = 0;
  for (let i = 0; i < buffer.length; i++) s += buffer[i] * buffer[i];
  return Math.sqrt(s / buffer.length);
}

function yinPitch(buffer, sampleRate, threshold) {
  threshold = (threshold == null) ? 0.2 : threshold;
  const SIZE = buffer.length;
  const half = Math.floor(SIZE / 2);
  if (rms(buffer) < 0.003) return null;

  const d = new Float64Array(half);
  for (let tau = 0; tau < half; tau++) {
    let sum = 0;
    for (let i = 0; i < half; i++) {
      const delta = buffer[i] - buffer[i + tau];
      sum += delta * delta;
    }
    d[tau] = sum;
  }

  const cmnd = new Float64Array(half);
  cmnd[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < half; tau++) {
    runningSum += d[tau];
    cmnd[tau] = runningSum > 0 ? (d[tau] * tau) / runningSum : 1;
  }

  let tauEstimate = -1;
  for (let tau = 2; tau < half; tau++) {
    if (cmnd[tau] < threshold) {
      while (tau + 1 < half && cmnd[tau + 1] < cmnd[tau]) tau++;
      tauEstimate = tau;
      break;
    }
  }

  if (tauEstimate === -1) {
    let minVal = Infinity, minTau = -1;
    for (let tau = 2; tau < half; tau++) {
      if (cmnd[tau] < minVal) { minVal = cmnd[tau]; minTau = tau; }
    }
    if (minTau === -1 || minVal > 0.8) return null;
    tauEstimate = minTau;
  }

  const t = tauEstimate;
  const x0 = t > 1 ? cmnd[t - 1] : cmnd[t];
  const x1 = cmnd[t];
  const x2 = t + 1 < half ? cmnd[t + 1] : cmnd[t];
  const denom = 2 * (x0 - 2 * x1 + x2);
  const p = denom !== 0 ? (x0 - x2) / denom : 0;
  const refinedTau = t + p;

  const freq = sampleRate / refinedTau;
  if (!isFinite(freq) || freq < 50 || freq > 1300) return null;

  const confidence = Math.max(0, Math.min(1, 1 - cmnd[t]));
  const midi = 69 + 12 * Math.log2(freq / 440);
  const note = midiToNote(midi);
  return { freq, midi, note, confidence };
}

function autocorrPitch(buffer, sampleRate) {
  const SIZE = buffer.length;
  let rmsVal = 0;
  for (let i = 0; i < SIZE; i++) rmsVal += buffer[i] * buffer[i];
  rmsVal = Math.sqrt(rmsVal / SIZE);
  if (rmsVal < 0.008) return null;

  let bestLag = -1;
  let bestCorr = 0;
  const minLag = Math.floor(sampleRate / 1000);
  const maxLag = Math.floor(sampleRate / 60);

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0, n1 = 0, n2 = 0;
    for (let i = 0; i < SIZE - lag; i++) {
      corr += buffer[i] * buffer[i + lag];
      n1 += buffer[i] * buffer[i];
      n2 += buffer[i + lag] * buffer[i + lag];
    }
    const denom = Math.sqrt(n1 * n2);
    const r = denom > 0 ? corr / denom : 0;
    if (r > bestCorr) { bestCorr = r; bestLag = lag; }
  }
  if (bestLag === -1 || bestCorr < 0.7) return null;

  const lags = [bestLag - 1, bestLag, bestLag + 1];
  const corrs = lags.map((lag) => {
    let corr = 0, n1 = 0, n2 = 0;
    for (let i = 0; i < SIZE - lag; i++) {
      corr += buffer[i] * buffer[i + lag];
      n1 += buffer[i] * buffer[i];
      n2 += buffer[i + lag] * buffer[i + lag];
    }
    const d = Math.sqrt(n1 * n2);
    return d > 0 ? corr / d : 0;
  });
  const alpha = corrs[0], beta = corrs[1], gamma = corrs[2];
  const denom = alpha - 2 * beta + gamma;
  const p = denom !== 0 ? 0.5 * (alpha - gamma) / denom : 0;
  const refinedLag = bestLag + (isFinite(p) ? p : 0);
  const freq = sampleRate / refinedLag;
  if (freq < 60 || freq > 1200) return null;

  const midi = 69 + 12 * Math.log2(freq / 440);
  const note = midiToNote(midi);
  return { freq, midi, note, confidence: bestCorr };
}

function detectPitch(buffer, sampleRate) {
  const y = yinPitch(buffer, sampleRate);
  if (y) return y;
  return autocorrPitch(buffer, sampleRate);
}

self.onmessage = (e) => {
  const data = e.data || {};
  if (data.type !== "detect") return;
  try {
    const buf = data.buffer instanceof Float32Array
      ? data.buffer
      : new Float32Array(data.buffer);
    const pitch = detectPitch(buf, data.sampleRate || 44100);
    self.postMessage({ type: "pitch", id: data.id, pitch });
  } catch (err) {
    self.postMessage({ type: "pitch", id: data.id, pitch: null, error: String(err) });
  }
};