// song-player.js — toca una canción con banda real: batería, bajo y guitarra
// suenan con muestras reales mientras la pantalla enseña el acorde actual,
// el siguiente y el pulso. Un compás (4/4) por acorde de la progresión.
import { getAudioContext, guitarGroup } from "./audio.js";
import { preloadGroup, isGroupReady, playDrum, playHand, playPitched } from "./sample-engine.js";

const $ = (sel, root = document) => root.querySelector(sel);

/* ---------------- acordes ---------------- */
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUALITY = [
  ["maj7", [0, 4, 7, 11]], ["m7", [0, 3, 7, 10]], ["dim", [0, 3, 6]], ["m5", [0, 7]],
  ["m", [0, 3, 7]], ["7", [0, 4, 7, 10]], ["5", [0, 7]], ["sus4", [0, 5, 7]], ["sus2", [0, 2, 7]], ["", [0, 4, 7]],
];

export function parseChord(name) {
  const m = /^([A-G])([#b]?)(.*)$/.exec(name || "");
  if (!m) return null;
  let root = NOTE[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  root = (root + 12) % 12;
  const q = QUALITY.find(([k]) => m[3] === k) || QUALITY.find(([k]) => k && m[3].startsWith(k)) || QUALITY[QUALITY.length - 1];
  return { root, intervals: q[1] };
}

// Voicing de guitarra: bajo entre E2 y D#3, el acorde encima y la octava.
function guitarVoicing(ch) {
  const bass = 40 + ((ch.root - 4 + 12) % 12);
  const upper = ch.intervals.slice(1);
  return [bass, ...upper.map((iv) => bass + iv), bass + 12, ...upper.slice(0, 2).map((iv) => bass + 12 + iv)].slice(0, 6);
}

/* ---------------- estilos de batería (16 semicorcheas) ---------------- */
// Cada pista: [instrumento, pasos, intensidad]
const STYLES = {
  pop: { drums: [["kick", [0, 8, 10]], ["snare", [4, 12]], ["hihat", [0, 2, 4, 6, 8, 10, 12, 14], 0.55]], bass: [0, 8, 10], strum: [0, 4, 6, 8, 12, 14] },
  rock: { drums: [["kick", [0, 6, 8, 10]], ["snare", [4, 12], 1], ["hihat", [0, 2, 4, 6, 8, 10, 12, 14], 0.7]], bass: [0, 2, 4, 6, 8, 10, 12, 14], strum: [0, 2, 4, 6, 8, 10, 12, 14] },
  folk: { drums: [["kick", [0, 8], 0.7], ["snare_rim", [4, 12], 0.6], ["hihat_pedal", [0, 4, 8, 12], 0.4]], hand: [["shaker", [0, 2, 4, 6, 8, 10, 12, 14], 0.45]], bass: [0, 8], strum: [0, 4, 8, 12] },
  country: { drums: [["kick", [0, 8]], ["snare", [4, 12], 0.8], ["hihat", [2, 6, 10, 14], 0.5]], bass: [0, 8], fifth: true, strum: [0, 4, 6, 8, 12, 14] },
  blues: { drums: [["kick", [0, 8], 0.8], ["snare", [4, 12], 0.8], ["ride", [0, 4, 7, 8, 12, 15], 0.5]], bass: [0, 4, 8, 12], walk: true, strum: [0, 4, 8, 12] },
  jazz: { drums: [["kick", [0], 0.4], ["hihat_pedal", [4, 12], 0.5], ["ride", [0, 4, 7, 8, 12, 15], 0.45]], bass: [0, 4, 8, 12], walk: true, strum: [0, 7, 12] },
  latin: { drums: [["kick", [0, 6, 8, 14], 0.6], ["snare_rim", [3, 6, 10, 12], 0.6]], hand: [["shaker", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 0.4], ["conga_high", [4, 12], 0.7], ["conga_low", [6, 14], 0.7]], bass: [0, 6, 8, 14], strum: [0, 3, 6, 10, 12] },
  bossa: { drums: [["kick", [0, 6, 8, 14], 0.55], ["snare_rim", [0, 6, 12], 0.55]], hand: [["shaker", [0, 2, 4, 6, 8, 10, 12, 14], 0.4]], bass: [0, 6, 8, 14], fifth: true, strum: [0, 3, 6, 10, 12] },
  rumba: { drums: [], hand: [["cajon_bass", [0, 6, 8], 0.9], ["cajon_slap", [4, 12], 0.8], ["cajon_slap", [3, 10, 15], 0.25], ["shaker", [0, 2, 4, 6, 8, 10, 12, 14], 0.4]], bass: [0, 6, 8], strum: [0, 3, 4, 6, 8, 11, 12, 14] },
  reggae: { drums: [["kick", [8]], ["snare_rim", [8], 0.8], ["hihat", [2, 6, 10, 14], 0.55]], bass: [0, 6, 8], strum: [2, 6, 10, 14] },
  funk: { drums: [["kick", [0, 3, 8, 10]], ["snare", [4, 12]], ["snare", [7, 15], 0.25], ["hihat", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 0.4]], bass: [0, 3, 8, 10, 14], strum: [0, 2, 4, 6, 8, 10, 12, 14] },
  classical: { drums: [], hand: [["shaker", [0, 4, 8, 12], 0.3]], bass: [0, 8], arp: true, strum: [0, 2, 4, 6, 8, 10, 12, 14] },
};
const STYLE_ALIAS = { "bossa nova": "bossa", flamenco: "rumba", gospel: "pop", metal: "rock", ska: "reggae" };
function styleFor(song) { return STYLES[STYLE_ALIAS[song.style] || song.style] || STYLES.pop; }

/* ---------------- motor ---------------- */
let engine = null;

export function stopSongPlayer() {
  if (!engine) return;
  clearInterval(engine.timer);
  engine.uiTimers.forEach(clearTimeout);
  try { engine.out.gain.setTargetAtTime(0, engine.ctx.currentTime, 0.05); } catch (e) {}
  const out = engine.out;
  setTimeout(() => { try { out.disconnect(); } catch (e) {} }, 400);
  if (engine.onStop) engine.onStop();
  engine = null;
}
export function isSongPlaying() { return !!engine; }

function startEngine(song, opts, onStep) {
  stopSongPlayer();
  const ctx = getAudioContext();
  if (ctx.state === "suspended") ctx.resume();
  const out = ctx.createGain();
  out.gain.value = 0.9;
  out.connect(ctx.destination);
  const style = styleFor(song);
  const bpm = Math.round(song.bpm * opts.tempo);
  const stepDur = 60 / bpm / 4;
  const chords = song.progression.map((n) => ({ name: n, ch: parseChord(n) }));
  const countIn = opts.countIn ? 16 : 0;
  const gGroup = guitarGroup();
  const e = { ctx, out, timer: null, uiTimers: [], onStop: opts.onStop, step: 0, next: ctx.currentTime + 0.15 };

  function schedule(step, t) {
    const s16 = step % 16;
    if (step < countIn) {
      if (s16 % 4 === 0) playHand("woodblock", t, out, { velocity: s16 === 0 ? 1 : 0.3, gain: 0.8 });
      e.uiTimers.push(setTimeout(() => onStep({ countIn: true, beat: s16 / 4, bar: -1 }), (t - ctx.currentTime) * 1000));
      return;
    }
    const k = step - countIn;
    const barTotal = chords.length;
    const bar = Math.floor(k / 16) % barTotal;
    const loop = Math.floor(k / 16 / barTotal);
    if (!opts.loop && loop > 0) { stopSongPlayer(); return; }
    const { ch } = chords[bar];
    if (opts.drums) {
      (style.drums || []).forEach(([id, steps, vel = 0.9]) => { if (steps.includes(s16)) playDrum(id, t, out, { velocity: vel, gain: 0.8 }); });
      (style.hand || []).forEach(([id, steps, vel = 0.8]) => { if (steps.includes(s16)) playHand(id, t, out, { velocity: vel, gain: 0.7 }); });
      if (s16 === 0 && bar === 0 && style !== STYLES.classical) playDrum("crash", t, out, { velocity: 0.5, gain: 0.5 });
    }
    if (opts.bass && ch && style.bass.includes(s16)) {
      let midi = 28 + ((ch.root - 4 + 12) % 12);
      const idx = style.bass.indexOf(s16);
      if (style.walk) midi += [0, 4, 7, 9][idx % 4] - (idx === 1 && ch.intervals[1] === 3 ? 1 : 0);
      else if (style.fifth && idx % 2 === 1) midi += 7;
      playPitched("bass", midi, t, out, { gain: 0.6, velocity: s16 === 0 ? 0.9 : 0.7, duration: stepDur * 3.5 });
    }
    if (opts.guitar && ch && style.strum.includes(s16)) {
      const notes = guitarVoicing(ch);
      const down = s16 % 4 === 0;
      if (style.arp) {
        const n = notes[[0, 2, 3, 4, 5, 4, 3, 2][(s16 / 2) % 8] % notes.length];
        playPitched(gGroup, n, t, out, { gain: 0.5, velocity: 0.7, duration: stepDur * 6 });
      } else {
        const order = down ? notes : notes.slice(1).reverse();
        order.forEach((n, i) => playPitched(gGroup, n, t + i * 0.012, out, { gain: 0.32, velocity: down ? 0.8 : 0.5, duration: stepDur * 4 }));
      }
    }
    if (s16 % 4 === 0) {
      e.uiTimers.push(setTimeout(() => onStep({ bar, beat: s16 / 4, loop }), Math.max(0, (t - ctx.currentTime) * 1000)));
    }
  }

  e.timer = setInterval(() => {
    while (engine === e && e.next < ctx.currentTime + 0.12) {
      schedule(e.step, e.next);
      e.step++;
      e.next += stepDur;
    }
    if (e.uiTimers.length > 64) e.uiTimers = e.uiTimers.slice(-32);
  }, 25);
  engine = e;
  return bpm;
}

/* ---------------- interfaz ---------------- */
/**
 * @param {HTMLElement} area
 * @param {object} song  canción de data/songs.json
 * @param {object} helpers { diagram(name) -> html, onBack() }
 */
export function renderSongPlayer(area, song, helpers = {}) {
  const opts = { tempo: 1, drums: true, bass: true, guitar: true, loop: true, countIn: true };
  const chords = song.progression;
  area.innerHTML = `
    <div class="song-player">
      ${helpers.onBack ? `<button class="auth-link sp-back" id="spBack">‹ Canciones</button>` : ""}
      <div class="sp-head">
        <div>
          <h2>${song.name}</h2>
          <p>${song.artist} · ${song.style} · ${song.key} · <span id="spBpm">${song.bpm}</span> BPM</p>
        </div>
      </div>
      <div class="sp-stage">
        <div class="sp-now"><span class="sp-label">Ahora</span><b id="spNow">${chords[0]}</b><div id="spDiagram" class="sp-diagram">${helpers.diagram ? helpers.diagram(chords[0]) : ""}</div></div>
        <div class="sp-next"><span class="sp-label">Después</span><b id="spNext">${chords[1 % chords.length]}</b></div>
      </div>
      <div class="sp-beats" id="spBeats">${[0, 1, 2, 3].map((i) => `<span data-b="${i}"></span>`).join("")}</div>
      <div class="sp-strip" id="spStrip">${chords.map((c, i) => `<span data-bar="${i}">${c}</span>`).join("")}</div>
      <p class="sp-strum">Rasgueo: <b>${song.strumming}</b></p>
      <button class="btn btn-primary btn-block" id="spPlay">▶ Tocar con la banda</button>
      <div class="sp-controls">
        <label>Tempo <input type="range" id="spTempo" min="50" max="120" step="5" value="100"><span id="spTempoV">100%</span></label>
        <div class="sp-toggles">
          ${[["drums", "🥁 Batería"], ["bass", "🎸 Bajo"], ["guitar", "🎶 Guitarra"], ["countIn", "⏱ Cuenta"], ["loop", "🔁 Repetir"]].map(([k, l]) => `<button class="sp-toggle on" data-opt="${k}" aria-pressed="true">${l}</button>`).join("")}
        </div>
        <p class="sp-hint" id="spHint">Quita la guitarra para tocar tú encima de la banda.</p>
      </div>
    </div>`;

  const groups = ["drums", "bass", "hand", guitarGroup()];
  const ctx = getAudioContext();
  const ready = () => groups.every(isGroupReady);
  const loading = Promise.all(groups.map((g) => preloadGroup(g, ctx)));

  function showBar(bar) {
    const now = chords[bar], next = chords[(bar + 1) % chords.length];
    $("#spNow", area).textContent = now;
    $("#spNext", area).textContent = next;
    if (helpers.diagram) $("#spDiagram", area).innerHTML = helpers.diagram(now);
    area.querySelectorAll("#spStrip span").forEach((s) => s.classList.toggle("on", +s.dataset.bar === bar));
  }
  function onStep(info) {
    if (!area.isConnected) { stopSongPlayer(); return; }
    area.querySelectorAll("#spBeats span").forEach((s) => s.classList.toggle("on", +s.dataset.b === info.beat));
    $("#spBeats", area).classList.toggle("count", !!info.countIn);
    if (info.countIn) { $("#spNow", area).textContent = String(info.beat + 1); return; }
    if (info.beat === 0) showBar(info.bar);
  }
  function setPlaying(on) {
    const b = $("#spPlay", area);
    if (b) b.textContent = on ? "■ Parar" : "▶ Tocar con la banda";
    area.classList.toggle("is-playing", on);
  }
  async function start(restart = false) {
    const b = $("#spPlay", area);
    if (!ready()) { b.disabled = true; b.textContent = "Cargando sonidos…"; await loading; b.disabled = false; }
    if (!area.isConnected) return;
    const bpm = startEngine(song, { ...opts, countIn: opts.countIn && !restart, onStop: () => { setPlaying(false); showBar(0); } }, onStep);
    $("#spBpm", area).textContent = bpm;
    setPlaying(true);
  }

  $("#spPlay", area).onclick = () => (isSongPlaying() ? stopSongPlayer() : start());
  $("#spTempo", area).oninput = (ev) => {
    opts.tempo = ev.target.value / 100;
    $("#spTempoV", area).textContent = ev.target.value + "%";
    $("#spBpm", area).textContent = Math.round(song.bpm * opts.tempo);
    if (isSongPlaying()) start(true);
  };
  area.querySelectorAll("[data-opt]").forEach((t) => {
    t.onclick = () => {
      const k = t.dataset.opt;
      opts[k] = !opts[k];
      t.classList.toggle("on", opts[k]);
      t.setAttribute("aria-pressed", opts[k]);
      if (isSongPlaying() && k !== "countIn") start(true);
    };
  });
  const back = $("#spBack", area);
  if (back) back.onclick = () => { stopSongPlayer(); helpers.onBack(); };
  showBar(0);
}
