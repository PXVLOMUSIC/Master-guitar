// practice-routines.js — daily routines, chord transition trainer, finger exercises, streak tracker
import { state, saveState } from "./storage.js";
import { playTone, playChord, startMetronome, stopMetronome } from "./audio.js";
import { updateStreak, addXP } from "./gamification.js";
import { renderFretboard } from "./fretboard.js";

const $ = (sel, root = document) => (root || document).querySelector(sel);
const $$ = (sel, root = document) => [...(root || document).querySelectorAll(sel)];

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}
function clear(container) { if (container) container.innerHTML = ""; }

/* ---------------- streak data helpers ---------------- */
function ensureLog() {
  if (!state.practiceLog) state.practiceLog = {};
  if (!state.practiceDays) state.practiceDays = [];
  if (!state.stats) state.stats = {};
  if (!state.stats.chordTransitionBest) state.stats.chordTransitionBest = {};
}
function todayKey() { return new Date().toDateString(); }
function formatTime(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + ":" + String(s).padStart(2, "0");
}
const BLOCK_NAMES = { warmup: "Calentamiento", technique: "Técnica", changes: "Cambios", chordChanges: "Cambios de acorde", song: "Canción", cooldown: "Oído", finger: "Dedos" };
function formatBreakdown(blocks) {
  return Object.entries(blocks || {}).map(([k, v]) => (BLOCK_NAMES[k] || k) + " " + (Math.round((v || 0) * 10) / 10) + "m").join(" · ") || "Sin desglose";
}
function recordPractice(entry) {
  ensureLog();
  const key = todayKey();
  const prev = state.practiceLog[key] || { minutes: 0, blocks: {}, cpm: [], exercises: [] };
  prev.minutes = (prev.minutes || 0) + (entry.minutes || 0);
  prev.blocks = prev.blocks || {};
  if (entry.blocks) {
    Object.entries(entry.blocks).forEach(([k, v]) => { prev.blocks[k] = (prev.blocks[k] || 0) + (v || 0); });
  }
  if (entry.cpm != null) { prev.cpm = prev.cpm || []; prev.cpm.push(entry.cpm); }
  const ex = [].concat(entry.exercise || [], entry.exercises || []);
  if (ex.length) { prev.exercises = (prev.exercises || []).concat(ex); }
  state.practiceLog[key] = prev;
  if (!state.practiceDays.includes(key)) state.practiceDays.push(key);
  state.stats.minutesPracticed = (state.stats.minutesPracticed || 0) + (entry.minutes || 0);
  state.stats.totalPracticeTime = (state.stats.totalPracticeTime || 0) + (entry.minutes || 0);
  try { updateStreak(); } catch (e) {}
  saveState(state);
}

/* ---------------- routine data ---------------- */
function userLevelKey() {
  const ul = state.user && state.user.level;
  if (typeof ul === "string" && ["beginner", "intermediate", "advanced"].includes(ul)) return ul;
  const lv = state.level || 1;
  if (lv >= 6) return "advanced";
  if (lv >= 3) return "intermediate";
  return "beginner";
}
const ROUTINE_TASKS = {
  beginner: {
    warmup: ["Chromatic 1-2-3-4 en cada cuerda (lento)", "Estiramiento de dedos"],
    technique: ["Escala pentatónica menor pos.1 x3", "Arpegio de acorde Em"],
    changes: ["Em ↔ Am", "C ↔ G"],
    song: ["Practica canción de 2 acordes (Em-D) con rasgueo"],
    cooldown: ["Identifica notas: Do Re Mi Fa Sol La Si"]
  },
  intermediate: {
    warmup: ["Spider exercise 5-8 en todas las cuerdas", "Legato hammer-on/pull-off"],
    technique: ["Escala mayor y menor x2", "Arpegios de acordes mayores"],
    changes: ["G ↔ D", "D ↔ A", "Am ↔ F"],
    song: ["Practica canción de 4 acordes (C-G-Am-F)"],
    cooldown: ["Intervalos: 3ª, 5ª, octava"]
  },
  advanced: {
    warmup: ["Chromatic runs a 120 BPM", "String skipping patterns"],
    technique: ["Modos y arpegios extendidos", "Alternate picking patterns"],
    changes: ["F ↔ Bm", "Cambios rápidos (80+ CPM)", "Barre chords"],
    song: ["Practica canción completa con solo"],
    cooldown: ["Dictado melódico y armonía"]
  }
};
function generateRoutine(levelKey) {
  const tasks = ROUTINE_TASKS[levelKey] || ROUTINE_TASKS.beginner;
  const blocks = [
    { id: "warmup", name: "Calentamiento", icon: "🔥", duration: 2, tasks: tasks.warmup },
    { id: "technique", name: "Técnica", icon: "⚡", duration: 3, tasks: tasks.technique },
    { id: "changes", name: "Cambios de acorde", icon: "🔄", duration: 3, tasks: tasks.changes },
    { id: "song", name: "Práctica de canción", icon: "🎵", duration: 5, tasks: tasks.song },
    { id: "cooldown", name: "Enfriamiento (oído)", icon: "👂", duration: 2, tasks: tasks.cooldown }
  ];
  return { level: levelKey, total: 15, blocks };
}

// Rutina de hoy para la pantalla de Inicio.
export function getTodayRoutine() {
  ensureLog();
  const routine = generateRoutine(userLevelKey());
  const log = state.practiceLog[todayKey()] || {};
  const done = (log.exercises || []).some((e) => e.startsWith("daily-routine-") && e !== "daily-routine-partial");
  return { ...routine, done, minutesToday: log.minutes || 0 };
}

/* ============================================================
   renderPracticeRoutines
   ============================================================ */
export function renderPracticeRoutines(container) {
  ensureLog();
  let currentTab = "routine";
  let selectedLevel = userLevelKey();
  let routine = generateRoutine(selectedLevel);
  let sessionActive = false;
  let isPlaying = false;
  let blockIndex = 0;
  let remaining = 0;
  let timerId = null;
  const completedMinutes = {};

  function aggregateBreakdown() {
    const totals = {};
    Object.values(state.practiceLog || {}).forEach((d) => {
      Object.entries(d.blocks || {}).forEach(([k, v]) => { totals[k] = (totals[k] || 0) + (v || 0); });
    });
    return totals;
  }

  function draw() {
    clear(container);
    container.innerHTML = `
      <div class="card"><h2>📅 Rutinas y racha</h2><p>Genera una rutina diaria y sigue tu racha.</p></div>
      <div style="display:flex;gap:8px;padding:0 16px;margin-bottom:8px">
        <button class="btn btn-secondary" data-tab="routine" style="flex:1;${currentTab === 'routine' ? 'border-color:var(--green);background:#2d4a2d' : ''}">Rutina</button>
        <button class="btn btn-secondary" data-tab="streak" style="flex:1;${currentTab === 'streak' ? 'border-color:var(--green);background:#2d4a2d' : ''}">Racha</button>
      </div>
      <div id="prContent" style="padding:0 16px"></div>
    `;
    $$("[data-tab]", container).forEach((b) => {
      b.onclick = () => { currentTab = b.dataset.tab; draw(); renderTab(); };
    });
    renderTab();
  }

  function renderTab() {
    if (sessionActive && currentTab === "routine") drawPlayer();
    else if (currentTab === "routine") drawRoutineTab();
    else drawStreakTab();
  }

  function drawRoutineTab() {
    const content = $("#prContent");
    content.innerHTML = `
      <div class="card">
        <h3>Generador de rutina diaria</h3>
        <p style="color:var(--muted);font-size:13px">10-15 min adaptados a tu nivel.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0;align-items:center">
          <span style="font-weight:700">Nivel:</span>
          ${["beginner", "intermediate", "advanced"].map((l) => `<button class="btn btn-secondary" data-lv="${l}" style="padding:6px 10px;${l === selectedLevel ? 'border-color:var(--green);background:#2d4a2d' : ''}">${l === "beginner" ? "Principiante" : l === "intermediate" ? "Intermedio" : "Avanzado"}</button>`).join("")}
        </div>
        <button class="btn btn-primary btn-block" id="prGen">🔄 Generar rutina</button>
      </div>
      <div class="card">
        <h3>Rutina generada (${routine.total} min)</h3>
        ${routine.blocks.map((b) => `
          <div class="ach" style="align-items:center">
            <span class="ico">${b.icon}</span>
            <div class="info" style="flex:1">
              <div class="name">${b.name} — ${b.duration} min</div>
              <div class="desc">${b.tasks.join(" · ")}</div>
            </div>
          </div>`).join("")}
        <button class="btn btn-primary btn-block" style="margin-top:12px" id="prStart">▶ Iniciar rutina</button>
      </div>
      <div class="card">
        <h3>🔥 Racha: ${state.streak} días</h3>
        <p style="color:var(--muted);font-size:13px">${(state.practiceDays || []).length} días practicados · ${Math.round(Object.values(state.practiceLog || {}).reduce((a, d) => a + (d.minutes || 0), 0))} min totales</p>
      </div>
    `;
    $$("[data-lv]", content).forEach((b) => {
      b.onclick = () => { selectedLevel = b.dataset.lv; routine = generateRoutine(selectedLevel); drawRoutineTab(); };
    });
    $("#prGen", content).onclick = () => { routine = generateRoutine(selectedLevel); toast("Rutina generada"); drawRoutineTab(); };
    $("#prStart", content).onclick = startRoutine;
  }

  function startRoutine() {
    sessionActive = true;
    isPlaying = true;
    blockIndex = 0;
    remaining = routine.blocks[0].duration * 60;
    Object.keys(completedMinutes).forEach((k) => delete completedMinutes[k]);
    if (timerId) clearInterval(timerId);
    timerId = setInterval(tick, 1000);
    draw();
    drawPlayer();
  }

  function tick() {
    if (!isPlaying) return;
    remaining--;
    updateTimerUI();
    if (remaining <= 0) {
      const block = routine.blocks[blockIndex];
      completedMinutes[block.id] = block.duration;
      blockIndex++;
      if (blockIndex >= routine.blocks.length) {
        finishRoutine();
      } else {
        remaining = routine.blocks[blockIndex].duration * 60;
        toast("Siguiente: " + routine.blocks[blockIndex].name);
        drawPlayer();
      }
    }
  }

  function updateTimerUI() {
    const timerEl = $("#prTimer");
    if (timerEl) timerEl.textContent = formatTime(remaining);
    const block = routine.blocks[blockIndex];
    const overallDone = blockIndex + (block ? (block.duration * 60 - remaining) / (block.duration * 60) : 0);
    const pct = (overallDone / routine.blocks.length) * 100;
    const prog = $("#prProgress");
    if (prog) prog.style.width = Math.min(100, pct) + "%";
    // update list
    const list = $("#prBlockList");
    if (list) {
      list.innerHTML = routine.blocks.map((b, i) => `
        <div style="display:flex;justify-content:space-between;padding:4px 0;opacity:${i <= blockIndex ? 1 : 0.5}">
          <span>${b.icon} ${b.name}</span>
          <span>${i < blockIndex ? "✅" : (i === blockIndex ? formatTime(remaining) : b.duration + " min")}</span>
        </div>`).join("");
    }
  }

  function drawPlayer() {
    const content = $("#prContent");
    const block = routine.blocks[blockIndex];
    content.innerHTML = `
      <div class="card" style="text-align:center">
        <h2 id="prBlockName">${block.icon} ${block.name}</h2>
        <div style="font-size:12px;color:var(--muted)">Bloque ${blockIndex + 1} de ${routine.blocks.length}</div>
        <div style="font-size:64px;font-weight:900;margin:12px 0" id="prTimer">${formatTime(remaining)}</div>
        <div class="progress"><div id="prProgress" style="width:0%"></div></div>
        <div style="text-align:left;margin-top:12px;font-size:13px;color:var(--muted)">${block.tasks.map((t) => "• " + t).join("<br>")}</div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn btn-primary" id="prPause" style="flex:1">${isPlaying ? "⏸ Pausar" : "▶ Reanudar"}</button>
          <button class="btn btn-secondary" id="prSkip" style="flex:1">⏭ Saltar</button>
          <button class="btn btn-danger" id="prStop" style="flex:1">⏹ Detener</button>
        </div>
      </div>
      <div class="card">
        <h3>Progreso de la rutina</h3>
        <div id="prBlockList">${routine.blocks.map((b, i) => `
          <div style="display:flex;justify-content:space-between;padding:4px 0;opacity:${i <= blockIndex ? 1 : 0.5}">
            <span>${b.icon} ${b.name}</span>
            <span>${i < blockIndex ? "✅" : (i === blockIndex ? formatTime(remaining) : b.duration + " min")}</span>
          </div>`).join("")}</div>
      </div>
    `;
    $("#prPause", content).onclick = () => {
      isPlaying = !isPlaying;
      $("#prPause", content).textContent = isPlaying ? "⏸ Pausar" : "▶ Reanudar";
      if (isPlaying && !timerId) { timerId = setInterval(tick, 1000); }
    };
    $("#prSkip", content).onclick = skipBlock;
    $("#prStop", content).onclick = () => { if (confirm("¿Detener la rutina?")) stopRoutine(); };
    updateTimerUI();
  }

  function skipBlock() {
    const block = routine.blocks[blockIndex];
    const elapsed = (block.duration * 60 - remaining) / 60;
    completedMinutes[block.id] = (completedMinutes[block.id] || 0) + elapsed;
    blockIndex++;
    if (blockIndex >= routine.blocks.length) finishRoutine();
    else {
      remaining = routine.blocks[blockIndex].duration * 60;
      toast("Siguiente: " + routine.blocks[blockIndex].name);
      drawPlayer();
    }
  }

  function stopRoutine() {
    if (timerId) { clearInterval(timerId); timerId = null; }
    const blocksBreakdown = {};
    let total = 0;
    routine.blocks.forEach((b, i) => {
      if (i < blockIndex) { blocksBreakdown[b.id] = b.duration; total += b.duration; }
      else if (i === blockIndex) {
        const el = (b.duration * 60 - remaining) / 60;
        blocksBreakdown[b.id] = Math.round(el * 10) / 10;
        total += el;
      }
    });
    if (total > 0) recordPractice({ minutes: Math.round(total * 10) / 10, blocks: blocksBreakdown, exercises: ["daily-routine-partial"] });
    isPlaying = false;
    sessionActive = false;
    draw();
    drawRoutineTab();
  }

  function finishRoutine() {
    if (timerId) { clearInterval(timerId); timerId = null; }
    isPlaying = false;
    const blocksBreakdown = {};
    routine.blocks.forEach((b) => { blocksBreakdown[b.id] = b.duration; completedMinutes[b.id] = b.duration; });
    recordPractice({ minutes: routine.total, blocks: blocksBreakdown, exercises: ["daily-routine-" + routine.level] });
    try { addXP(20); } catch (e) {}
    toast("¡Rutina completada! +20 XP 🎉");
    sessionActive = false;
    drawSummary();
  }

  function drawSummary() {
    const content = $("#prContent");
    content.innerHTML = `
      <div class="card" style="text-align:center">
        <div style="font-size:48px">🎉</div>
        <h2>¡Rutina completada!</h2>
        <p>${routine.total} minutos de práctica registrados.</p>
        <div style="text-align:left;margin:12px 0">
          ${routine.blocks.map((b) => `<div style="display:flex;justify-content:space-between"><span>${b.icon} ${b.name}</span><span>${b.duration} min</span></div>`).join("")}
        </div>
        <button class="btn btn-primary btn-block" id="prAgain">Nueva rutina</button>
      </div>
    `;
    $("#prAgain", content).onclick = () => { sessionActive = false; currentTab = "routine"; draw(); drawRoutineTab(); };
  }

  function drawStreakTab() {
    const content = $("#prContent");
    const days = state.practiceDays || [];
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toDateString();
      last7.push({ date: d, data: (state.practiceLog || {})[d] });
    }
    const totalMinutes = Object.values(state.practiceLog || {}).reduce((a, d) => a + (d.minutes || 0), 0);
    const agg = aggregateBreakdown();
    content.innerHTML = `
      <div class="card" style="text-align:center">
        <div style="font-size:48px">🔥</div>
        <h2>Racha: ${state.streak} días</h2>
        <p>Minutos totales: ${Math.round(totalMinutes)} · Días practicados: ${days.length}</p>
      </div>
      <div class="card">
        <h3>Últimos 7 días</h3>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;text-align:center">
          ${last7.map((d) => `
            <div style="padding:8px 4px;border-radius:8px;background:${d.data ? 'var(--green-soft)' : 'var(--card2)'};border:1px solid ${d.date === todayKey() ? 'var(--green)' : 'var(--border)'}">
              <div style="font-size:11px;color:var(--muted)">${new Date(d.date).toLocaleDateString('es', { weekday: 'short' })}</div>
              <div style="font-weight:800">${d.data ? Math.round(d.data.minutes) : 0}</div>
              <div style="font-size:10px;color:var(--muted)">min</div>
            </div>`).join("")}
        </div>
      </div>
      <div class="card">
        <h3>Desglose acumulado</h3>
        ${Object.keys(agg).length ? Object.entries(agg).map(([k, v]) => `
          <div style="display:flex;justify-content:space-between;padding:4px 0">
            <span>${BLOCK_NAMES[k] || k}</span><span style="font-weight:800">${Math.round(v * 10) / 10} min</span>
          </div>`).join("") : '<p style="color:var(--muted)">Sin datos aún.</p>'}
      </div>
      <div class="card">
        <h3>Historial reciente</h3>
        <div style="max-height:240px;overflow:auto">
          ${days.slice(-10).reverse().map((d) => {
            const data = (state.practiceLog || {})[d] || {};
            return `<div style="padding:6px 0;border-bottom:1px solid var(--border)">
              <div style="font-weight:700">${new Date(d).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' })} — ${Math.round(data.minutes || 0)} min</div>
              <div style="font-size:12px;color:var(--muted)">${formatBreakdown(data.blocks || {})}</div>
            </div>`;
          }).join("") || '<p style="color:var(--muted)">Sin práctica registrada aún.</p>'}
        </div>
      </div>
    `;
  }

  draw();
}

/* ============================================================
   chord transition trainer
   ============================================================ */
const CHORD_PAIRS = [
  { id: "em-am", a: "Em", b: "Am", level: 1, target: 20 },
  { id: "c-g", a: "C", b: "G", level: 1, target: 20 },
  { id: "g-d", a: "G", b: "D", level: 1, target: 20 },
  { id: "d-a", a: "D", b: "A", level: 1, target: 20 },
  { id: "am-f", a: "Am", b: "F", level: 2, target: 15 },
  { id: "c-f", a: "C", b: "F", level: 2, target: 15 },
  { id: "g-c", a: "G", b: "C", level: 2, target: 18 },
  { id: "d-g", a: "D", b: "G", level: 2, target: 18 },
  { id: "a-e", a: "A", b: "E", level: 2, target: 18 },
  { id: "f-bm", a: "F", b: "Bm", level: 3, target: 12 },
  { id: "em-g", a: "Em", b: "G", level: 3, target: 22 },
  { id: "c-am", a: "C", b: "Am", level: 3, target: 20 }
];

let CHORDS_CACHE = null;
async function loadChords() {
  if (CHORDS_CACHE) return CHORDS_CACHE;
  try {
    const r = await fetch("data/chords.json");
    CHORDS_CACHE = await r.json();
  } catch (e) { CHORDS_CACHE = { guitar: {}, ukulele: {} }; }
  return CHORDS_CACHE;
}
function chordDiagramHTML(chord) {
  if (!chord || !chord.frets) return "";
  const frets = chord.frets;
  const n = frets.length;
  let html = `<div style="display:grid;grid-template-columns:repeat(${n},22px);gap:2px;justify-content:center">`;
  for (let f = 1; f <= 5; f++) {
    for (let s = 0; s < n; s++) {
      const fr = frets[s];
      let bg = "var(--card2)"; let text = "";
      if (fr === -1 && f === 1) text = "x";
      else if (fr === 0 && f === 1) text = "o";
      else if (fr === f) bg = "var(--green)";
      html += `<div style="width:22px;height:22px;border:1px solid var(--border);border-radius:4px;background:${bg};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:var(--text)">${text}</div>`;
    }
  }
  html += "</div>";
  return html;
}

export async function renderChordTransitions(container) {
  ensureLog();
  const chords = await loadChords();
  const ins = state.settings && state.settings.instrument === "ukulele" ? "ukulele" : "guitar";
  let selectedPairId = CHORD_PAIRS[0].id;
  let running = false;
  let secs = 60;
  let count = 0;
  let timerId = null;

  function getPair(id) { return CHORD_PAIRS.find((p) => p.id === id) || CHORD_PAIRS[0]; }
  function bestOf(id) { return (state.stats.chordTransitionBest || {})[id] || 0; }

  function draw() {
    clear(container);
    const pair = getPair(selectedPairId);
    const chordA = (chords[ins] || {})[pair.a];
    const chordB = (chords[ins] || {})[pair.b];
    container.innerHTML = `
      <div class="card"><h2>🔄 Entrenador de transiciones</h2><p>Alterna entre dos acordes. Cuenta cambios limpios en 60 s.</p></div>
      <div class="card">
        <h3>Selecciona par</h3>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${CHORD_PAIRS.map((p) => `<button class="btn btn-secondary" data-pair="${p.id}" style="padding:6px 10px;font-size:12px;${p.id === selectedPairId ? 'border-color:var(--green);background:#2d4a2d' : ''}">${p.a} ↔ ${p.b} (N${p.level})</button>`).join("")}
        </div>
      </div>
      <div class="card" style="text-align:center">
        <h2>${pair.a} ↔ ${pair.b}</h2>
        <div style="display:flex;gap:24px;justify-content:center;margin:12px 0">
          <div><div style="font-weight:800;margin-bottom:4px">${pair.a}</div>${chordDiagramHTML(chordA)}</div>
          <div><div style="font-weight:800;margin-bottom:4px">${pair.b}</div>${chordDiagramHTML(chordB)}</div>
        </div>
        <div style="position:relative;width:160px;height:160px;margin:12px auto">
          <svg viewBox="0 0 160 160" width="160" height="160">
            <circle cx="80" cy="80" r="70" stroke="var(--border)" stroke-width="10" fill="none"/>
            <circle id="ctCircle" cx="80" cy="80" r="70" stroke="var(--green)" stroke-width="10" fill="none" stroke-dasharray="439.82" stroke-dashoffset="0" transform="rotate(-90 80 80)" style="transition:stroke-dashoffset 1s linear"/>
          </svg>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:48px;font-weight:900" id="ctTimer">60</div>
        </div>
        <div style="font-size:24px;font-weight:900;margin:8px 0">Cambios: <span id="ctCount">0</span></div>
        <div style="color:var(--muted);font-size:13px;margin-bottom:8px">Mejor: ${bestOf(selectedPairId)} CPM · Objetivo: ${pair.target} CPM</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-block" id="ctStart" ${running ? 'disabled' : ''}>${running ? 'Corriendo...' : '▶ Empezar'}</button>
          <button class="btn btn-secondary" id="ctInc" ${running ? '' : 'disabled'} style="flex:1">+1 cambio limpio</button>
        </div>
      </div>
      <div class="card">
        <h3>Récords por par</h3>
        <div style="max-height:200px;overflow:auto">
          ${CHORD_PAIRS.map((p) => `
            <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)">
              <span>${p.a} ↔ ${p.b} (N${p.level})</span>
              <span style="font-weight:800">${bestOf(p.id)} CPM</span>
            </div>`).join("")}
        </div>
      </div>
    `;
    $$("[data-pair]", container).forEach((b) => {
      b.onclick = () => {
        if (running) return;
        selectedPairId = b.dataset.pair;
        draw();
      };
    });
    $("#ctStart", container).onclick = start;
    $("#ctInc", container).onclick = () => {
      if (running) {
        count++;
        const c = $("#ctCount", container);
        if (c) c.textContent = count;
      }
    };
    updateCircle();
  }

  function updateCircle() {
    const circle = $("#ctCircle");
    if (circle) {
      const circ = 439.82;
      circle.style.strokeDashoffset = (circ * (1 - secs / 60)) + "";
    }
    const t = $("#ctTimer");
    if (t) t.textContent = secs;
    const c = $("#ctCount");
    if (c) c.textContent = count;
  }

  function start() {
    if (running) return;
    running = true;
    secs = 60;
    count = 0;
    draw();
    timerId = setInterval(() => {
      secs--;
      updateCircle();
      if (secs <= 0) finish();
    }, 1000);
  }

  function finish() {
    if (timerId) { clearInterval(timerId); timerId = null; }
    running = false;
    const pair = getPair(selectedPairId);
    const cpm = count;
    const prev = bestOf(pair.id);
    if (cpm > prev) {
      state.stats.chordTransitionBest = state.stats.chordTransitionBest || {};
      state.stats.chordTransitionBest[pair.id] = cpm;
      toast("¡Nuevo récord! " + cpm + " CPM 🎉");
    } else {
      toast("Resultado: " + cpm + " cambios/min");
    }
    if (cpm >= pair.target) toast("¡Dominado! Prueba un nivel superior 🚀");
    recordPractice({ minutes: 1, blocks: { chordChanges: 1 }, cpm: cpm, exercise: "chord-transition-" + pair.id });
    try { addXP(10); } catch (e) {}
    draw();
  }

  draw();
}

/* ============================================================
   finger exercises
   ============================================================ */
const FINGER_EXERCISES = [
  {
    id: "spider",
    name: "Spider (araña)",
    icon: "🕷️",
    desc: "Toca 1-2-3-4 en cada cuerda, subiendo una cuerda cada vez. Mejora independencia de dedos.",
    tempo: 60,
    highlights: (function () {
      const out = [];
      for (let s = 0; s < 6; s++) for (let f = 5; f <= 8; f++) out.push({ string: s, fret: f, color: f === 5 ? "#ffc800" : (f === 8 ? "#ff4b4b" : "#1cb0f6") });
      return out;
    })()
  },
  {
    id: "chromatic",
    name: "Chromatic runs",
    icon: "🎹",
    desc: "Corridas cromáticas 1-2-3-4 en todas las cuerdas, ascendente y descendente.",
    tempo: 80,
    highlights: (function () {
      const out = [];
      for (let s = 0; s < 6; s++) for (let f = 1; f <= 4; f++) out.push({ string: s, fret: f, color: "#1cb0f6" });
      return out;
    })()
  },
  {
    id: "skipping",
    name: "String skipping",
    icon: "🦘",
    desc: "Salta una cuerda entre notas. Coordina ambas manos y mejora precisión.",
    tempo: 70,
    highlights: (function () {
      const out = [];
      [0, 2, 4].forEach((s) => { for (let f = 5; f <= 8; f++) out.push({ string: s, fret: f, color: "#ce82ff" }); });
      return out;
    })()
  },
  {
    id: "legato",
    name: "Legato (hammer-on / pull-off)",
    icon: "🎸",
    desc: "Hammer-on y pull-off en una sola cuerda. Desarrolla fuerza y control.",
    tempo: 50,
    highlights: (function () {
      const out = [];
      for (let f = 5; f <= 9; f++) out.push({ string: 2, fret: f, color: f % 2 === 0 ? "#ffc800" : "#22c55e" });
      return out;
    })()
  }
];

export function renderFingerExercises(container) {
  ensureLog();
  let selectedEx = FINGER_EXERCISES[0].id;
  let tempo = FINGER_EXERCISES[0].tempo;
  let practicing = false;
  let remaining = 120;
  let timerId = null;

  function getEx(id) { return FINGER_EXERCISES.find((e) => e.id === id) || FINGER_EXERCISES[0]; }

  function draw() {
    clear(container);
    const ex = getEx(selectedEx);
    container.innerHTML = `
      <div class="card"><h2>🖐️ Ejercicios de dedos</h2><p>Independencia, cromatismo, salto de cuerdas y legato.</p></div>
      <div class="card">
        <h3>Selecciona ejercicio</h3>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${FINGER_EXERCISES.map((e) => `<button class="btn btn-secondary" data-ex="${e.id}" style="padding:6px 10px;font-size:12px;${e.id === selectedEx ? 'border-color:var(--green);background:#2d4a2d' : ''}">${e.icon} ${e.name}</button>`).join("")}
        </div>
      </div>
      <div class="card">
        <h3>${ex.icon} ${ex.name}</h3>
        <p style="color:var(--muted);font-size:13px">${ex.desc}</p>
        <div id="feFretboard" style="margin:12px 0"></div>
        <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
          <span style="font-weight:700">Tempo:</span>
          <input type="range" min="40" max="160" value="${tempo}" id="feTempo" style="flex:1">
          <span id="feTempoVal" style="font-weight:800;min-width:40px;text-align:right">${tempo} BPM</span>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-primary btn-block" id="feMetro">${practicing ? '⏹ Detener metrónomo' : '▶ Metrónomo'}</button>
        </div>
        <div style="margin-top:12px;text-align:center">
          <div style="font-size:12px;color:var(--muted)">Práctica cronometrada (2 min)</div>
          <div style="font-size:40px;font-weight:900" id="feTimer">${formatTime(remaining)}</div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn btn-primary btn-block" id="feStart" ${practicing ? 'disabled' : ''}>▶ Iniciar práctica</button>
            <button class="btn btn-secondary" id="feStop" ${practicing ? '' : 'disabled'}>⏹ Detener</button>
          </div>
        </div>
      </div>
      <div class="card">
        <h3>Consejos</h3>
        <ul style="margin:0;padding-left:18px;color:var(--muted);font-size:13px;line-height:1.6">
          <li>Mantén los dedos cerca de las cuerdas.</li>
          <li>Usa la punta de los dedos, no la yema.</li>
          <li>Empieza lento y sube el tempo gradualmente.</li>
          <li>Relaja la muñeca y el brazo.</li>
        </ul>
      </div>
    `;
    $$("[data-ex]", container).forEach((b) => {
      b.onclick = () => {
        if (practicing) return;
        selectedEx = b.dataset.ex;
        tempo = getEx(selectedEx).tempo;
        remaining = 120;
        draw();
      };
    });
    const fbContainer = $("#feFretboard", container);
    try {
      renderFretboard(fbContainer, {
        strings: 6,
        frets: 12,
        tuning: [82.41, 110.0, 146.83, 196.0, 246.94, 329.63],
        highlights: ex.highlights,
        showNotes: false
      });
    } catch (e) { /* ignore */ }
    $("#feTempo", container).oninput = (e) => {
      tempo = parseInt(e.target.value, 10);
      $("#feTempoVal", container).textContent = tempo + " BPM";
    };
    $("#feMetro", container).onclick = () => {
      if (window.__feMetroRunning) {
        try { stopMetronome(); } catch (e) {}
        window.__feMetroRunning = false;
        $("#feMetro", container).textContent = "▶ Metrónomo";
      } else {
        try { startMetronome(tempo, 4, () => {}); } catch (e) {}
        window.__feMetroRunning = true;
        $("#feMetro", container).textContent = "⏹ Detener metrónomo";
      }
    };
    $("#feStart", container).onclick = startPractice;
    $("#feStop", container).onclick = stopPractice;
  }

  function startPractice() {
    if (practicing) return;
    practicing = true;
    remaining = 120;
    try { startMetronome(tempo, 4, () => {}); } catch (e) {}
    window.__feMetroRunning = true;
    if (timerId) clearInterval(timerId);
    timerId = setInterval(() => {
      remaining--;
      const t = $("#feTimer");
      if (t) t.textContent = formatTime(remaining);
      if (remaining <= 0) stopPractice();
    }, 1000);
    draw();
  }

  function stopPractice() {
    if (timerId) { clearInterval(timerId); timerId = null; }
    try { stopMetronome(); } catch (e) {}
    window.__feMetroRunning = false;
    const elapsed = 120 - remaining;
    if (elapsed > 10) {
      recordPractice({ minutes: Math.round((elapsed / 60) * 10) / 10, blocks: { technique: elapsed / 60 }, exercise: "finger-" + selectedEx });
      try { addXP(5); } catch (e) {}
      toast("Práctica registrada · +" + 5 + " XP");
    }
    practicing = false;
    remaining = 120;
    draw();
  }

  draw();
}
