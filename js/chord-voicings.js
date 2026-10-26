// chord-voicings.js — chord voicing library + strumming trainer for Strumio
import { playTone, playChord, startMetronome, stopMetronome } from "./audio.js";
import { midiToFreq } from "./instruments.js";

const $ = (sel, root = document) => (root || document).querySelector(sel);

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}

const GUITAR_BASE_MIDI = [40, 45, 50, 55, 59, 64];

function V(frets, fingers, difficulty, type, label) {
  return { frets, fingers, difficulty, type, label };
}

export const CHORD_VOICINGS = {
  Em: [
    V([0,2,2,0,0,0],[0,2,3,0,0,0],1,"open","Em open"),
    V([7,9,9,7,7,7],[1,3,4,1,1,1],3,"barre","Em barre (7fr)"),
    V([0,2,0,0,0,2],[0,2,0,0,0,4],2,"jazz","Em9 open"),
    V([12,14,14,12,12,12],[1,3,4,1,1,1],4,"high","Em (12fr)"),
    V([0,7,5,0,0,0],[0,3,2,0,0,0],2,"alt","Em (add9 low)"),
    V([0,2,2,0,0,3],[0,2,3,0,0,4],2,"alt","Em (high B)"),
  ],
  Am: [
    V([-1,0,2,2,1,0],[0,0,2,3,1,0],1,"open","Am open"),
    V([5,7,7,5,5,5],[1,3,4,1,1,1],3,"barre","Am barre (5fr)"),
    V([-1,0,2,0,1,0],[0,0,2,0,1,0],2,"jazz","Am7 open"),
    V([-1,12,14,14,13,12],[0,1,3,4,2,1],4,"high","Am (12fr)"),
    V([-1,0,2,4,1,0],[0,0,2,4,1,0],2,"jazz","Am9 open"),
    V([-1,5,7,5,5,5],[0,1,3,1,1,1],3,"barre","Am7 barre (5fr)"),
  ],
  C: [
    V([-1,3,2,0,1,0],[0,3,2,0,1,0],1,"open","C open"),
    V([8,10,10,9,8,8],[1,3,4,2,1,1],3,"barre","C barre (8fr)"),
    V([-1,3,2,0,0,0],[0,3,2,0,0,0],2,"jazz","Cmaj7 open"),
    V([-1,3,5,5,5,3],[0,1,2,3,4,1],2,"alt","C (3fr A-shape)"),
    V([-1,3,2,0,3,0],[0,3,2,0,4,0],2,"alt","Cadd9 open"),
    V([-1,3,5,4,5,3],[0,1,3,2,4,1],3,"jazz","Cmaj9 (3fr)"),
  ],
  G: [
    V([3,2,0,0,0,3],[2,1,0,0,0,3],1,"open","G open"),
    V([3,5,5,4,3,3],[1,3,4,2,1,1],3,"barre","G barre (3fr)"),
    V([3,2,0,0,0,2],[2,1,0,0,0,4],2,"jazz","Gmaj7 open"),
    V([3,2,0,0,0,1],[2,1,0,0,0,4],2,"jazz","G7 open"),
    V([10,9,7,7,7,10],[3,2,1,1,1,4],4,"high","G (10fr)"),
    V([3,2,0,2,0,3],[2,1,0,3,0,4],2,"alt","G (add9)"),
  ],
  D: [
    V([-1,-1,0,2,3,2],[0,0,0,1,3,2],1,"open","D open"),
    V([-1,5,7,7,7,5],[0,1,3,4,2,1],3,"barre","D barre (5fr)"),
    V([-1,-1,0,2,2,2],[0,0,0,1,1,1],2,"jazz","Dmaj7 open"),
    V([-1,-1,0,2,3,3],[0,0,0,1,2,3],2,"alt","Dsus4 open"),
    V([-1,-1,7,9,10,9],[0,0,1,3,4,2],4,"high","D (7fr)"),
    V([-1,-1,0,2,1,2],[0,0,0,2,1,3],2,"jazz","D7 open"),
  ],
  F: [
    V([1,3,3,2,1,1],[1,3,4,2,1,1],2,"barre","F barre (1fr)"),
    V([1,3,2,2,1,0],[1,3,2,2,1,0],2,"jazz","Fmaj7"),
    V([1,3,1,2,1,1],[1,3,1,2,1,1],2,"jazz","F7"),
    V([8,10,10,9,8,8],[1,3,4,2,1,1],4,"high","F (8fr)"),
    V([1,3,3,2,1,3],[1,3,4,2,1,4],3,"alt","F (add9)"),
    V([1,0,2,2,1,0],[1,0,2,3,1,0],2,"alt","Fmaj7 (simpl)"),
  ],
  A: [
    V([-1,0,2,2,2,0],[0,0,1,2,3,0],1,"open","A open"),
    V([5,7,7,6,5,5],[1,3,4,2,1,1],3,"barre","A barre (5fr)"),
    V([-1,0,2,0,2,0],[0,0,2,0,3,0],2,"jazz","A7 open"),
    V([-1,0,2,1,2,0],[0,0,2,1,3,0],2,"jazz","Amaj7 open"),
    V([-1,12,14,14,14,12],[0,1,3,4,2,1],4,"high","A (12fr)"),
    V([-1,0,2,2,2,5],[0,0,1,2,3,4],2,"alt","A (add9)"),
  ],
  E: [
    V([0,2,2,1,0,0],[0,2,3,1,0,0],1,"open","E open"),
    V([7,9,9,8,7,7],[1,3,4,2,1,1],3,"barre","E barre (7fr)"),
    V([0,2,0,1,0,0],[0,2,0,1,0,0],2,"jazz","E7 open"),
    V([0,2,1,1,0,0],[0,2,1,1,0,0],2,"jazz","Emaj7 open"),
    V([12,14,14,13,12,12],[1,3,4,2,1,1],4,"high","E (12fr)"),
    V([0,2,2,1,0,2],[0,2,3,1,0,4],2,"alt","E (add9)"),
  ],
  Dm: [
    V([-1,-1,0,2,3,1],[0,0,0,2,3,1],1,"open","Dm open"),
    V([-1,5,7,7,6,5],[0,1,3,4,2,1],3,"barre","Dm barre (5fr)"),
    V([-1,-1,0,2,1,1],[0,0,0,2,1,1],2,"jazz","Dm7 open"),
    V([-1,-1,7,9,10,8],[0,0,1,3,4,2],4,"high","Dm (7fr)"),
    V([-1,-1,0,2,3,5],[0,0,0,2,3,4],2,"alt","Dm (add9)"),
    V([-1,-1,0,2,1,0],[0,0,0,2,1,0],2,"jazz","Dm9 open"),
  ],
  Bm: [
    V([-1,2,4,4,3,2],[0,1,3,4,2,1],2,"barre","Bm barre (2fr)"),
    V([-1,7,9,9,8,7],[0,1,3,4,2,1],3,"barre","Bm barre (7fr)"),
    V([-1,2,4,2,3,2],[0,1,3,1,2,1],3,"jazz","Bm7"),
    V([-1,10,12,12,11,10],[0,1,3,4,2,1],4,"high","Bm (10fr)"),
    V([-1,2,4,4,3,4],[0,1,3,4,2,4],3,"alt","Bm (add9)"),
    V([-1,2,4,4,2,2],[0,1,3,4,1,1],3,"alt","Bm (alt)"),
  ],
  G7: [
    V([3,2,0,0,0,1],[2,1,0,0,0,4],1,"open","G7 open"),
    V([3,5,3,4,3,3],[1,3,1,2,1,1],3,"barre","G7 (3fr)"),
    V([3,2,0,2,0,1],[2,1,0,3,0,4],2,"jazz","G9 open"),
    V([10,9,7,7,7,10],[3,2,1,1,1,4],4,"high","G7 (10fr)"),
    V([3,5,5,4,3,1],[1,3,4,2,1,4],3,"alt","G7 (alt)"),
    V([3,2,3,0,0,1],[2,1,3,0,0,4],2,"alt","G7 (add)"),
  ],
  C7: [
    V([-1,3,2,3,1,0],[0,3,2,4,1,0],1,"open","C7 open"),
    V([-1,3,5,3,5,3],[0,1,2,1,3,1],3,"barre","C7 (3fr)"),
    V([-1,3,2,3,3,0],[0,3,2,4,4,0],2,"jazz","C9 open"),
    V([8,10,8,9,8,8],[1,3,1,2,1,1],4,"high","C7 (8fr)"),
    V([-1,3,5,4,5,3],[0,1,3,2,4,1],3,"jazz","Cmaj? C7 (3fr)"),
    V([10,12,10,11,10,10],[1,3,1,2,1,1],4,"high","C7 (10fr)"),
  ],
  D7: [
    V([-1,-1,0,2,1,2],[0,0,0,2,1,3],1,"open","D7 open"),
    V([-1,5,7,5,7,5],[0,1,3,1,4,1],3,"barre","D7 (5fr)"),
    V([-1,-1,0,2,1,0],[0,0,0,2,1,0],2,"jazz","D9 open"),
    V([-1,-1,7,9,7,9],[0,0,1,3,1,4],4,"high","D7 (7fr)"),
    V([-1,-1,0,2,3,2],[0,0,0,1,3,2],2,"alt","D7 (alt)"),
    V([-1,-1,10,12,10,12],[0,0,1,3,1,4],4,"high","D7 (10fr)"),
  ],
  A7: [
    V([-1,0,2,0,2,0],[0,0,2,0,3,0],1,"open","A7 open"),
    V([5,7,5,6,5,5],[1,3,1,2,1,1],3,"barre","A7 (5fr)"),
    V([-1,0,2,4,2,0],[0,0,2,4,3,0],2,"jazz","A9 open"),
    V([7,9,7,8,7,7],[1,3,1,2,1,1],4,"high","A7 (7fr)"),
    V([-1,0,2,2,2,3],[0,0,1,2,3,4],2,"alt","A7 (add)"),
    V([10,12,10,11,10,10],[1,3,1,2,1,1],4,"high","A7 (10fr)"),
  ],
  E7: [
    V([0,2,0,1,0,0],[0,2,0,1,0,0],1,"open","E7 open"),
    V([7,9,7,8,7,7],[1,3,1,2,1,1],3,"barre","E7 (7fr)"),
    V([0,2,0,1,2,0],[0,2,0,1,3,0],2,"jazz","E9 open"),
    V([10,12,10,11,10,10],[1,3,1,2,1,1],4,"high","E7 (10fr)"),
    V([0,2,2,1,0,0],[0,2,3,1,0,0],2,"alt","E7 (alt)"),
    V([12,14,12,13,12,12],[1,3,1,2,1,1],4,"high","E7 (12fr)"),
  ],
  Am7: [
    V([-1,0,2,0,1,0],[0,0,2,0,1,0],1,"open","Am7 open"),
    V([5,7,5,5,5,5],[1,3,1,1,1,1],3,"barre","Am7 (5fr)"),
    V([-1,0,2,4,1,0],[0,0,2,4,1,0],2,"jazz","Am9 open"),
    V([7,9,7,7,8,7],[1,3,1,1,2,1],4,"high","Am7 (7fr)"),
    V([-1,0,2,2,1,3],[0,0,1,2,1,4],2,"alt","Am7 (add)"),
    V([10,12,10,10,11,10],[1,3,1,1,2,1],4,"high","Am7 (10fr)"),
  ],
  Em7: [
    V([0,2,2,0,3,0],[0,2,3,0,4,0],1,"open","Em7 open"),
    V([7,9,7,7,7,7],[1,3,1,1,1,1],3,"barre","Em7 (7fr)"),
    V([0,2,0,0,0,2],[0,2,0,0,0,4],2,"jazz","Em9 open"),
    V([12,14,12,12,12,12],[1,3,1,1,1,1],4,"high","Em7 (12fr)"),
    V([0,2,2,0,0,0],[0,2,3,0,0,0],2,"alt","Em7 (alt)"),
    V([0,2,2,0,3,3],[0,2,3,0,4,4],2,"alt","Em7 (add)"),
  ],
  Dm7: [
    V([-1,-1,0,2,1,1],[0,0,0,2,1,1],1,"open","Dm7 open"),
    V([-1,5,7,5,6,5],[0,1,3,1,2,1],3,"barre","Dm7 (5fr)"),
    V([-1,-1,0,2,1,0],[0,0,0,2,1,0],2,"jazz","Dm9 open"),
    V([-1,-1,7,9,8,8],[0,0,1,3,2,2],4,"high","Dm7 (7fr)"),
    V([-1,-1,0,2,3,1],[0,0,0,2,3,1],2,"alt","Dm7 (alt)"),
    V([-1,-1,10,12,11,11],[0,0,1,3,2,2],4,"high","Dm7 (10fr)"),
  ],
  Fmaj7: [
    V([1,3,2,2,1,0],[1,3,2,2,1,0],2,"barre","Fmaj7"),
    V([5,7,6,6,5,5],[1,3,2,2,1,1],3,"barre","Fmaj7 (5fr)"),
    V([1,3,2,2,1,3],[1,3,2,2,1,4],3,"jazz","Fmaj9"),
    V([8,10,9,9,8,8],[1,3,2,2,1,1],4,"high","Fmaj7 (8fr)"),
    V([1,0,2,2,1,0],[1,0,2,3,1,0],2,"alt","Fmaj7 (simpl)"),
    V([10,12,11,11,10,10],[1,3,2,2,1,1],4,"high","Fmaj7 (10fr)"),
  ],
  Cmaj7: [
    V([-1,3,2,0,0,0],[0,3,2,0,0,0],1,"open","Cmaj7 open"),
    V([-1,3,5,4,5,3],[0,1,3,2,4,1],3,"barre","Cmaj7 (3fr)"),
    V([-1,3,2,0,3,0],[0,3,2,0,4,0],2,"jazz","Cmaj9 open"),
    V([7,9,9,8,7,7],[1,3,4,2,1,1],4,"high","Cmaj7 (7fr)"),
    V([8,10,9,9,8,8],[1,3,2,2,1,1],4,"high","Cmaj7 (8fr)"),
    V([-1,3,5,4,3,0],[0,1,3,2,1,0],3,"alt","Cmaj7 (alt)"),
  ],
  Gmaj7: [
    V([3,2,0,0,0,2],[2,1,0,0,0,4],1,"open","Gmaj7 open"),
    V([3,5,4,4,3,3],[1,3,2,2,1,1],3,"barre","Gmaj7 (3fr)"),
    V([3,2,0,2,0,2],[2,1,0,3,0,4],2,"jazz","Gmaj9 open"),
    V([7,9,7,8,7,7],[1,3,1,2,1,1],4,"high","Gmaj7 (7fr)"),
    V([10,12,11,11,10,10],[1,3,2,2,1,1],4,"high","Gmaj7 (10fr)"),
    V([3,2,4,0,0,2],[2,1,3,0,0,4],2,"alt","Gmaj7 (alt)"),
  ],
};

export function voicingToFrequencies(v) {
  const out = [];
  v.frets.forEach((f, i) => {
    if (f !== -1 && f != null) {
      out.push(midiToFreq(GUITAR_BASE_MIDI[i] + f));
    }
  });
  return out;
}

function voicingDiagram(v) {
  const frets = v.frets;
  const n = frets.length;
  const played = frets.filter(f => f > 0);
  const minFret = played.length ? Math.min(...played) : 1;
  const maxFret = played.length ? Math.max(...played) : 1;
  let start = 1;
  if (minFret > 1) start = minFret;
  if (maxFret - start + 1 > 5) start = Math.max(1, maxFret - 4);
  const rows = 5;
  let html = `<div style="display:inline-block">`;
  html += `<div style="display:grid;grid-template-columns:20px repeat(${n},24px);gap:2px">`;
  // open/muted row
  html += `<div></div>`;
  for (let s = 0; s < n; s++) {
    const f = frets[s];
    if (f === -1) html += `<div style="color:var(--red);font-weight:900;font-size:11px;text-align:center">✕</div>`;
    else if (f === 0) html += `<div style="color:var(--green);font-weight:900;font-size:11px;text-align:center">○</div>`;
    else html += `<div></div>`;
  }
  for (let r = 0; r < rows; r++) {
    const fretNum = start + r;
    html += `<div style="font-size:10px;color:var(--muted);align-self:center;text-align:center">${fretNum}</div>`;
    for (let s = 0; s < n; s++) {
      const f = frets[s];
      let cell = `<div style="width:24px;height:18px;border:1px solid var(--border-2);border-radius:3px;position:relative;background:var(--card-2)">`;
      if (f === fretNum) {
        cell += `<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:13px;height:13px;border-radius:50%;background:radial-gradient(circle at 30% 30%,var(--green),var(--green-2));box-shadow:0 2px 4px rgba(0,0,0,.3)"></div>`;
        const fi = (v.fingers && v.fingers[s]) ? v.fingers[s] : "";
        if (fi && fi !== 0) cell += `<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:#000;font-size:8px;font-weight:900">${fi}</div>`;
      }
      cell += `</div>`;
      html += cell;
    }
  }
  html += `</div></div>`;
  return html;
}

export function renderChordVoicings(container) {
  container.innerHTML = `
    <div class="card">
      <h2>🎼 Voicings de acordes</h2>
      <p>Explora diferentes posiciones para el mismo acorde.</p>
      <select id="cvChord" style="width:100%;padding:10px;border-radius:10px;border:2px solid var(--border);background:var(--card2);color:var(--text);font-weight:700"></select>
    </div>
    <div id="cvList" style="padding:0 16px"></div>
  `;
  const sel = $("#cvChord", container);
  Object.keys(CHORD_VOICINGS).forEach(name => {
    const opt = document.createElement("option");
    opt.value = name; opt.textContent = name;
    sel.appendChild(opt);
  });
  function draw() {
    const name = sel.value;
    const list = $("#cvList", container);
    list.innerHTML = "";
    CHORD_VOICINGS[name].forEach((v, idx) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
          <h3 style="margin:0;font-size:16px">${v.label} <span style="color:var(--muted);font-size:12px">(${v.type})</span></h3>
          <span style="color:var(--gold);font-weight:800">★ ${v.difficulty}/5</span>
        </div>
        <div style="text-align:center;margin:8px 0">${voicingDiagram(v)}</div>
        <div style="display:flex;gap:8px;justify-content:center">
          <button class="btn btn-secondary" data-play="${idx}">🔊 Escuchar</button>
        </div>
        <div style="color:var(--muted);font-size:12px;margin-top:6px">Dedos: ${v.fingers.join(" ")}</div>
      `;
      list.appendChild(card);
    });
    list.querySelectorAll("[data-play]").forEach(b => {
      b.onclick = () => {
        const v = CHORD_VOICINGS[name][parseInt(b.dataset.play)];
        playChord(voicingToFrequencies(v), 1.2, { arpeggiate: true, stagger: 0.06 });
      };
    });
  }
  sel.onchange = draw;
  draw();
}

// ---------- Strumming patterns ----------
export const STRUMMING_PATTERNS = [
  { name: "Pop básico", style: "pop", bpm: 120, pattern: "D D D D", description: "Cuatro negras, ideal para empezar." },
  { name: "Pop estándar", style: "pop", bpm: 110, pattern: "D D U U D U", description: "Patrón clásico de pop/acústico." },
  { name: "Pop 16avos", style: "pop", bpm: 95, pattern: "D - D U - U D U", description: "Sincopado con 16avos." },
  { name: "Pop balada", style: "ballad", bpm: 72, pattern: "D - - U - - U -", description: "Lento y suave." },
  { name: "Rock básico", style: "rock", bpm: 130, pattern: "D - D U - U D U", description: "Rock clásico." },
  { name: "Rock power", style: "rock", bpm: 140, pattern: "D - - - D - U -", description: "Acentos fuertes." },
  { name: "Rock shuffle", style: "rock", bpm: 120, pattern: "D - U - D - U -", description: "Shuffle ternario." },
  { name: "Folk travis", style: "folk", bpm: 100, pattern: "D - D U - U D U", description: "Alternancia bajo/melodía." },
  { name: "Folk arpegio", style: "folk", bpm: 90, pattern: "D - - - - - - -", description: "Un acorde por compás." },
  { name: "Folk rápido", style: "folk", bpm: 150, pattern: "D D U U D U", description: "Rasgueo rápido folk." },
  { name: "Blues shuffle", style: "blues", bpm: 105, pattern: "D - U - D - U -", description: "Shuffle de blues." },
  { name: "Blues lento", style: "blues", bpm: 70, pattern: "D - - U - - U -", description: "Blues lento." },
  { name: "Reggae offbeat", style: "reggae", bpm: 80, pattern: "- X - X - X - X", description: "Acentos en contratiempo." },
  { name: "Reggae skank", style: "reggae", bpm: 85, pattern: "X - X - X - X -", description: "Skank reggae." },
  { name: "Funk 16", style: "funk", bpm: 100, pattern: "X - X U - X U -", description: "Funk sincopado." },
  { name: "Funk tight", style: "funk", bpm: 110, pattern: "X X - X - X - X", description: "Cortes (chicken scratch)." },
  { name: "Country boom", style: "country", bpm: 115, pattern: "D - D U - U D U", description: "Boom-chick country." },
  { name: "Country rápido", style: "country", bpm: 160, pattern: "D D U D D U", description: "Country rápido." },
  { name: "Latin bossa", style: "latin", bpm: 90, pattern: "D - U - D U - U", description: "Bossa nova suave." },
  { name: "Latin rumba", style: "latin", bpm: 100, pattern: "D - U U - U D U", description: "Rumba flamenca." },
  { name: "Flamenco rasgueo", style: "flamenco", bpm: 120, pattern: "D D U U D U", description: "Rasgueo flamenco." },
  { name: "Flamenco golpe", style: "flamenco", bpm: 130, pattern: "X D U X D U", description: "Con golpe." },
  { name: "Ballad suave", style: "ballad", bpm: 60, pattern: "D - - - U - - -", description: "Ballad muy lenta." },
  { name: "Ballad arpegio", style: "ballad", bpm: 70, pattern: "D - U - D - U -", description: "Arpegio lento." },
];

export function renderStrummingTrainer(container) {
  container.innerHTML = `
    <div class="card">
      <h2>🥁 Entrenador de rasgueo</h2>
      <select id="stPattern" style="width:100%;padding:10px;border-radius:10px;border:2px solid var(--border);background:var(--card2);color:var(--text);font-weight:700;margin-bottom:8px"></select>
      <div id="stInfo" style="color:var(--muted);font-size:13px;margin:8px 0"></div>
      <div id="stDisplay" style="font-size:22px;font-weight:900;letter-spacing:4px;margin:12px 0;text-align:center;flex-wrap:wrap"></div>
      <div id="stHand" style="font-size:48px;text-align:center;height:60px;transition:transform 0.1s">✋</div>
      <div style="display:flex;gap:8px;align-items:center;margin:12px 0">
        <label style="font-weight:700">BPM</label>
        <input type="range" id="stBpm" min="40" max="200" value="100" style="flex:1">
        <span id="stBpmVal" style="font-weight:800;min-width:36px">100</span>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary btn-block" id="stPlay">▶ Reproducir</button>
        <button class="btn btn-secondary" id="stStop">⏹</button>
      </div>
      <div style="margin-top:12px;color:var(--muted);font-weight:700" id="stAcc">Aciertos: 0/0</div>
      <div style="color:var(--muted);font-size:12px">Pulsa ESPACIO al ritmo para medir precisión.</div>
    </div>
  `;
  const sel = $("#stPattern", container);
  STRUMMING_PATTERNS.forEach((p, i) => {
    const opt = document.createElement("option");
    opt.value = i; opt.textContent = `${p.name} (${p.style})`;
    sel.appendChild(opt);
  });
  let running = false, timers = [], expected = [], hits = 0, total = 0, tapHandler = null;

  function updateInfo() {
    const p = STRUMMING_PATTERNS[parseInt(sel.value)];
    $("#stInfo", container).textContent = `${p.style} · BPM sugerido ${p.bpm} · ${p.description || ""}`;
    $("#stDisplay", container).innerHTML = p.pattern.split(/\s+/).map(t => `<span style="display:inline-block;margin:2px 4px;padding:4px 8px;border-radius:6px;background:var(--card-2)">${t}</span>`).join("");
    const bpmSlider = $("#stBpm", container);
    bpmSlider.value = p.bpm;
    $("#stBpmVal", container).textContent = p.bpm;
  }
  sel.onchange = updateInfo;
  updateInfo();
  $("#stBpm", container).oninput = () => { $("#stBpmVal", container).textContent = $("#stBpm", container).value; };

  function stop() {
    running = false;
    timers.forEach(t => clearTimeout(t)); timers = [];
    stopMetronome();
    if (tapHandler) { document.removeEventListener("keydown", tapHandler); tapHandler = null; }
    const hand = $("#stHand", container);
    if (hand) hand.textContent = "✋";
    const btn = $("#stPlay", container);
    if (btn) btn.textContent = "▶ Reproducir";
  }
  $("#stStop", container).onclick = stop;

  $("#stPlay", container).onclick = () => {
    if (running) return;
    running = true;
    $("#stPlay", container).textContent = "Corriendo...";
    const p = STRUMMING_PATTERNS[parseInt(sel.value)];
    const bpm = parseInt($("#stBpm", container).value);
    const interval = 60000 / (bpm * 2);
    const tokens = p.pattern.split(/\s+/).filter(Boolean);
    expected = tokens.map((_, i) => i * interval);
    hits = 0; total = 0;
    $("#stAcc", container).textContent = "Aciertos: 0/0";
    const start = performance.now();
    const hand = $("#stHand", container);
    tokens.forEach((tok, i) => {
      const t = setTimeout(() => {
        if (!running) return;
        if (hand) {
          hand.textContent = (tok === "U") ? "✋" : "👊";
          hand.style.transform = (tok === "U") ? "scaleX(-1)" : "scaleX(1)";
        }
        if (tok === "D" || tok === "U") {
          const notes = [82.41, 123.47, 164.81, 196.00, 246.94, 329.63];
          const arr = (tok === "U") ? notes.slice().reverse() : notes;
          playChord(arr, 0.4, { arpeggiate: false, stagger: 0.012, gain: 0.18 });
        } else if (tok === "X") {
          playTone(200, 0.08, { gain: 0.15 });
        }
        const spans = $("#stDisplay", container).querySelectorAll("span");
        spans.forEach((s, si) => { s.style.background = (si === i) ? "var(--green)" : "var(--card-2)"; s.style.color = (si === i) ? "#000" : "var(--text)"; });
        setTimeout(() => { if (running && hand) hand.textContent = "✋"; }, interval * 0.6);
      }, i * interval);
      timers.push(t);
    });
    const endT = setTimeout(() => {
      if (!running) return;
      const acc = total ? Math.round((hits / total) * 100) : 0;
      toast(`Terminado. Precisión: ${acc}%`);
      stop();
    }, tokens.length * interval + 500);
    timers.push(endT);

    startMetronome(bpm, 4, () => {});

    tapHandler = (e) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      if (!running) return;
      const now = performance.now() - start;
      let best = null, bestDist = 150;
      expected.forEach((exp, idx) => {
        if (exp === Infinity) return;
        const d = Math.abs(now - exp);
        if (d < bestDist) { bestDist = d; best = idx; }
      });
      if (best !== null) {
        hits++;
        expected[best] = Infinity;
      }
      total++;
      $("#stAcc", container).textContent = `Aciertos: ${hits}/${total}`;
    };
    document.addEventListener("keydown", tapHandler);
  };
}

export function renderChordVoicingQuiz(container) {
  container.innerHTML = `
    <div class="card">
      <h2>🎯 Quiz de voicings</h2>
      <p>Escucha el acorde y elige la posición tocada.</p>
      <div id="cvqScore" style="color:var(--muted);margin-bottom:8px;font-weight:700">Aciertos: 0/0</div>
      <button class="btn btn-primary btn-block" id="cvqPlay">🔊 Reproducir</button>
      <div id="cvqOptions" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px"></div>
      <div id="cvqFeedback" style="margin-top:8px;font-weight:800"></div>
    </div>
  `;
  let score = 0, total = 0, current = null;

  function newQ() {
    const chordNames = Object.keys(CHORD_VOICINGS);
    const chord = chordNames[Math.floor(Math.random() * chordNames.length)];
    const voicings = CHORD_VOICINGS[chord];
    const correctIdx = Math.floor(Math.random() * voicings.length);
    const correct = voicings[correctIdx];
    let opts = [correct];
    const pool = voicings.filter((_, i) => i !== correctIdx);
    while (opts.length < 4 && pool.length) {
      const i = Math.floor(Math.random() * pool.length);
      opts.push(pool.splice(i, 1)[0]);
    }
    const other = chordNames.filter(c => c !== chord);
    while (opts.length < 4) {
      const c = other[Math.floor(Math.random() * other.length)];
      const v = CHORD_VOICINGS[c][Math.floor(Math.random() * CHORD_VOICINGS[c].length)];
      opts.push(v);
    }
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    current = { chord, correct, opts };
    $("#cvqFeedback", container).textContent = "";
    const optionsDiv = $("#cvqOptions", container);
    optionsDiv.innerHTML = "";
    opts.forEach((v) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-secondary";
      btn.style.cssText = "padding:8px;text-align:left";
      btn.innerHTML = `<div style="font-weight:800;margin-bottom:4px">${v.label}</div>${voicingDiagram(v)}`;
      btn.onclick = () => {
        total++;
        if (v === correct) {
          score++;
          toast("¡Correcto!");
          $("#cvqFeedback", container).textContent = "✅ Correcto";
          $("#cvqFeedback", container).style.color = "var(--green)";
        } else {
          toast("Incorrecto");
          $("#cvqFeedback", container).textContent = "❌ Era " + correct.label;
          $("#cvqFeedback", container).style.color = "var(--red)";
        }
        $("#cvqScore", container).textContent = `Aciertos: ${score}/${total}`;
        setTimeout(newQ, 1200);
      };
      optionsDiv.appendChild(btn);
    });
    playChord(voicingToFrequencies(correct), 1.2, { arpeggiate: true, stagger: 0.07 });
  }
  $("#cvqPlay", container).onclick = () => {
    if (current) playChord(voicingToFrequencies(current.correct), 1.2, { arpeggiate: true, stagger: 0.07 });
  };
  newQ();
}
