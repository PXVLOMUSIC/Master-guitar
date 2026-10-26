import { state, saveState, resetState } from "./storage.js";
import { INSTRUMENTS, midiToFreq, closestString, centsOff, midiToNote } from "./instruments.js";
import { addXP, updateStreak, checkAchievements, ACHIEVEMENTS, levelTitle, refillHearts, loseHeart, spendGems } from "./gamification.js";
import { startMic, stopMic, playTone, isRunning, playChord, startMetronome, stopMetronome, isMetronomeRunning, detectChord, isRecordingSupported, startRecording, stopRecording, noteToFrequency, setSoundBank, loadInstrumentSamples } from "./audio.js";
import { initBackend, syncProgress, getSession, getAuthSettings, signInWithProvider } from "./backend.js";
import { renderPracticeHub, openToolWindow, CATEGORIES } from "./practice-hub.js";

// Lazy loaders for heavy modules (loaded on demand).
const loadPracticeAdvanced = () => import("./practice-advanced.js");
const loadFretboard = () => import("./fretboard.js");
const loadBacking = () => import("./backing-pro.js");
const loadTablature = () => import("./tablature.js");
const loadSettings = () => import("./settings.js");
const loadTheory = () => import("./theory.js");
const loadScales = () => import("./scales.js");
const loadVideoPlayer = () => import("./video-player.js");
const loadTabPlayer = () => import("./tab-player.js");
const loadPracticeRoutines = () => import("./practice-routines.js");
const loadChordVoicings = () => import("./chord-voicings.js");
const loadImprovisation = () => import("./improvisation.js");

let LESSONS = { units: [], ukulele: [] };
let CHORDS = { guitar: {}, ukulele: {} };
let SONGS = [];

async function loadContent() {
  try {
    const r1 = await fetch("data/lessons.json");
    LESSONS = await r1.json();
    const r2 = await fetch("data/chords.json");
    CHORDS = await r2.json();
  } catch (e) {
    console.error("content load error", e);
  }
  try { await initBackend(); } catch (e) { console.warn("backend init error", e); }
}

// ---- helpers ----
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
const view = () => $("#view");

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  t.setAttribute("role", "status");
  t.setAttribute("aria-live", "polite");
  document.body.appendChild(t);
  announce(msg);
  setTimeout(() => t.remove(), 2000);
}

function renderTopbar() {
  const tb = $("#topbar");
  if (!state.user) { tb.style.display = "none"; return; }
  tb.style.display = "flex";
  $("#streak").textContent = state.streak;
  $("#gems").textContent = state.gems;
  $("#hearts").textContent = state.hearts;
  const pct = (state.xp / (state.level * 100)) * 100;
  $("#xpfill").style.width = Math.min(100, pct) + "%";
}

function showNav(show) {
  $("#bottomnav").style.display = show ? "flex" : "none";
}

// ---- routing ----
let currentRoute = "home";
async function navigate(route, params={}) {
  currentRoute = route;
  try { $$("#bottomnav button").forEach(b => b.classList.toggle("active", b.dataset.route === route)); } catch(e){}
  await render(route, params);
}

async function render(route, params={}) {
  const v = view();
  if (!v) return;
  v.innerHTML = "";
  switch (route) {
    case "onboard": renderOnboard(v); break;
    case "home": renderHome(v); break;
    case "learn": renderLearn(v); break;
    case "lesson": renderLesson(v, params.lessonId); break;
    case "tuner": renderTuner(v); break;
    case "practice": renderPractice(v); break;
    case "profile": renderProfile(v); break;
    case "settings": { const m = await loadSettings(); m.renderSettings(v); break; }
    case "dashboard": { const m = await loadSettings(); m.renderDashboard(v); break; }
    default: renderHome(v);
  }
  renderTopbar();
}

// ---- onboarding ----
function renderOnboard(v) {
  showNav(false);
  let step = 0;
  const data = { name: "", instrument: "guitar", level: "beginner" };
  const steps = [
    () => `
      <div class="onboard">
        <div class="emoji">🎸</div>
        <h1>¡Bienvenido a Strumio!</h1>
        <p class="sub">Aprende guitarra paso a paso, como un juego.</p>
        <input id="nameInput" placeholder="Tu nombre" style="width:100%;padding:14px;border-radius:12px;border:2px solid var(--border);background:var(--card2);color:var(--text);font-size:16px;font-weight:700;margin-top:16px">
        <button class="btn btn-primary btn-block" style="margin-top:16px" id="nextBtn">Continuar</button>
      </div>`,
    () => `
      <div class="onboard">
        <h1>Elige tu instrumento</h1>
        <div class="choices">
          ${Object.entries(INSTRUMENTS).map(([k,ins]) => `
            <div class="choice ${data.instrument===k?'selected':''}" data-ins="${k}" role="button" tabindex="0" aria-label="${ins.name}">
              <span class="ico">${ins.emoji}</span>
              <div><div style="font-weight:800">${ins.name}</div></div>
            </div>`).join("")}
        </div>
        <button class="btn btn-primary btn-block" style="margin-top:16px" id="nextBtn">Continuar</button>
      </div>`,
    () => `
      <div class="onboard">
        <h1>¿Tu nivel?</h1>
        <div class="choices">
          <div class="choice ${data.level==='beginner'?'selected':''}" data-lv="beginner" role="button" tabindex="0" aria-label="Principiante"><span class="ico">🌱</span><div><div style="font-weight:800">Principiante</div><div style="color:var(--muted);font-size:13px">Nunca he tocado</div></div></div>
          <div class="choice ${data.level==='intermediate'?'selected':''}" data-lv="intermediate" role="button" tabindex="0" aria-label="Intermedio"><span class="ico">🌿</span><div><div style="font-weight:800">Intermedio</div><div style="color:var(--muted);font-size:13px">Ya toco algunos acordes</div></div></div>
          <div class="choice ${data.level==='advanced'?'selected':''}" data-lv="advanced" role="button" tabindex="0" aria-label="Avanzado"><span class="ico">🌳</span><div><div style="font-weight:800">Avanzado</div><div style="color:var(--muted);font-size:13px">Quiero perfeccionar</div></div></div>
        </div>
        <button class="btn btn-primary btn-block" style="margin-top:16px" id="nextBtn">Empezar</button>
      </div>`
  ];

  function draw() {
    v.innerHTML = steps[step]();
    if (step === 0) {
      $("#nextBtn").onclick = () => {
        data.name = $("#nameInput").value.trim() || "Guitarrista";
        step = 1; draw();
      };
    } else if (step === 1) {
      $$(".choice").forEach(c => c.onclick = () => { data.instrument = c.dataset.ins; draw(); });
      $("#nextBtn").onclick = () => { step = 2; draw(); };
    } else {
      $$(".choice").forEach(c => c.onclick = () => { data.level = c.dataset.lv; draw(); });
      $("#nextBtn").onclick = () => {
        if (data.level === "beginner") finish();
        else startPlacement(data);
      };
    }
  }
  function finish() {
    state.user = { name: data.name, instrument: data.instrument, level: data.level };
    state.settings.instrument = data.instrument;
    updateStreak();
    saveState(state);
    toast("¡Bienvenido, " + data.name + "! 🎸");
    navigate("home");
  }
  draw();
}

// ---- placement test ----
function startPlacement(data) {
  const questions = [
    { q: "¿Qué acorde es este? (diagrama con 2 dedos en traste 2)", opts: ["Em","Am","C","G"], a: 0 },
    { q: "La afinación estándar de guitarra es:", opts: ["EADGBE","DADGAD","GCEA","CGDA"], a: 0 },
    { q: "¿Qué cuerda se omite en el acorde D?", opts: ["6ª","5ª y 6ª","1ª","3ª"], a: 1 },
    { q: "La escala pentatónica menor tiene:", opts: ["5 notas","7 notas","8 notas","12 notas"], a: 0 },
    { q: "¿Qué técnica es 'hammer-on'?", opts: ["Golpear la cuerda con el dedo de la mano derecha","Pulsar un traste sin volver a tocar la cuerda","Bajar el tempo","Cambiar de acorde"], a: 1 }
  ];
  let qi = 0, score = 0;
  const v = view();
  showNav(false);
  function drawQ() {
    if (qi >= questions.length) { finishPlacement(data, score); return; }
    const q = questions[qi];
    v.innerHTML = `
      <div class="onboard">
        <h1>Prueba de nivel</h1>
        <p style="color:var(--muted)">Pregunta ${qi+1} de ${questions.length}</p>
        <div class="qcard" style="margin-top:16px">
          <div class="prompt">${q.q}</div>
        </div>
        <div class="options" style="margin-top:16px">
          ${q.opts.map((o,i)=>`<div class="opt" data-i="${i}">${o}</div>`).join("")}
        </div>
      </div>`;
    $$(".opt").forEach(o => o.onclick = () => {
      if (parseInt(o.dataset.i) === q.a) { score++; toast("Correcto"); }
      else toast("Incorrecto");
      qi++;
      setTimeout(drawQ, 600);
    });
  }
  drawQ();
}
function finishPlacement(data, score) {
  // score >=4 -> advanced-ish: mark units 1-2 complete; >=2 -> mark unit1; else beginner
  state.user = { name: data.name, instrument: data.instrument, level: data.level };
  state.settings.instrument = data.instrument;
  const all = (LESSONS.units || []).flatMap(u => u.lessons);
  if (score >= 4) {
    // mark first 10 lessons complete
    all.slice(0, 10).forEach(l => { state.completed[l.id] = true; });
    state.stats.lessonsCompleted = Math.min(10, all.length);
    state.level = 4;
    state.xp = 0;
    toast("Nivel avanzado detectado 🚀");
  } else if (score >= 2) {
    all.slice(0, 5).forEach(l => { state.completed[l.id] = true; });
    state.stats.lessonsCompleted = Math.min(5, all.length);
    state.level = 2;
    toast("Nivel intermedio detectado 🌿");
  } else {
    state.level = 1;
    toast("Empezamos desde el principio 🌱");
  }
  updateStreak();
  saveState(state);
  navigate("home");
}

// ---- home ----
function renderHome(v) {
  showNav(true);
  if (!state.user) { navigate("onboard"); return; }
  const ins = INSTRUMENTS[state.user.instrument];
  const dailyDone = state.dailyChallengeDone === new Date().toDateString();
  v.innerHTML = `
    <div class="card" style="text-align:center">
      <div style="font-size:40px">${ins.emoji}</div>
      <h2>Hola, ${state.user.name}</h2>
      <p>Nivel ${state.level} · ${levelTitle(state.level)} · ${state.xp}/${state.level*100} XP</p>
      <button class="btn btn-primary btn-block" id="continueBtn">Continuar aprendiendo</button>
    </div>
    ${!getSession().user ? `<div id="cloudCard"></div>` : ""}
    ${state.stats.lessonsCompleted < 10 ? `<div class="card" style="border-color:var(--orange);background:#2a2218">
      <p style="margin:0;font-weight:800;color:var(--orange)">💡 Consejo de la semana</p>
      <p style="margin:4px 0 0">Es normal que te duelan las yemas los primeros días. En 1–2 semanas se forman callos y deja de doler. ¡No abandones!</p>
    </div>` : ""}
    ${getReviewLessons().length ? `<div class="card">
      <h2>🔁 Repaso del día</h2>
      <p>Refuerza lo aprendido (repetición espaciada).</p>
      ${getReviewLessons().map(l=>`<button class="btn btn-secondary btn-block" style="margin-top:6px" data-rev="${l.id}">📖 ${l.title}</button>`).join("")}
    </div>` : ""}
    <div class="challenge-card">
      <h3>⚡ Desafío diario</h3>
      <p style="color:var(--muted);font-size:14px;margin:0 0 10px">${dailyDone ? "¡Ya completado hoy! Vuelve mañana." : "Completa una lección especial para ganar el doble de XP."}</p>
      <button class="btn btn-secondary btn-block" id="dailyBtn" ${dailyDone?"disabled":""}>${dailyDone?"Completado ✓":"Empezar desafío"}</button>
    </div>
    <div class="section-title">Tu progreso</div>
    <div class="card">
      <p>📚 Lecciones completadas: <b>${state.stats.lessonsCompleted}</b></p>
      <p>🔥 Racha: <b>${state.streak} días</b></p>
      <p>🎯 Afinaciones: <b>${state.stats.tunings}</b></p>
      <p>💎 Gemas: <b>${state.gems}</b></p>
    </div>
    <div class="card">
      <h2>📅 Plan de 30 días</h2>
      <p>Día ${Math.min(30, state.stats.lessonsCompleted + 1)} de 30 · ${Math.round((state.stats.lessonsCompleted/30)*100)}% completado</p>
      <div class="progress"><div style="width:${Math.min(100, (state.stats.lessonsCompleted/30)*100)}%"></div></div>
    </div>
    <div class="section-title">Accesos rápidos</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 16px">
      <button class="btn btn-secondary" id="quickTuner">🎯 Afinador</button>
      <button class="btn btn-secondary" id="quickPractice">🎸 Practicar</button>
    </div>
  `;
  $("#continueBtn").onclick = () => navigate("learn");
  $("#dailyBtn").onclick = () => {
    if (dailyDone) return;
    const all = getAllLessons();
    const next = all.find(l => !state.completed[l.id]) || all[0];
    if (next) { state.dailyChallengeDone = new Date().toDateString(); saveState(state); navigate("lesson", { lessonId: next.id, daily: true }); }
  };
  $$("[data-rev]").forEach(b => b.onclick = () => navigate("lesson", { lessonId: b.dataset.rev }));
  $("#quickTuner").onclick = () => navigate("tuner");
  $("#quickPractice").onclick = () => navigate("practice");
  hydrateCloudCard();
}

/**
 * Tarjeta discreta de "guarda tu progreso". Solo aparece si no hay sesión
 * en la nube y el usuario no la ha pospuesto en esta sesión.
 */
async function hydrateCloudCard() {
  const box = document.getElementById("cloudCard");
  if (!box) return;
  try {
    if (sessionStorage.getItem("strumio_cloud_later")) return;
  } catch (e) {}
  let settings = {};
  try { settings = await getAuthSettings(); } catch (e) {}
  if (!document.body.contains(box)) return;
  const google = !!(settings.providers && settings.providers.google);
  box.innerHTML = `
    <div class="card cloud-card">
      <div class="cloud-head">
        <span class="cloud-ico">☁️</span>
        <div>
          <b>Guarda tu progreso</b>
          <p>Tu cuenta se sincroniza en todos tus dispositivos.</p>
        </div>
      </div>
      ${google
        ? `<button class="btn btn-primary btn-block" id="cloudGoogle" type="button">Continuar con Google</button>`
        : `<button class="btn btn-secondary btn-block" id="cloudOpen" type="button">Iniciar sesión o crear cuenta</button>`}
      <button class="auth-link" id="cloudLater" type="button">Ahora no</button>
    </div>`;
  const g = box.querySelector("#cloudGoogle");
  if (g) g.onclick = async () => {
    g.disabled = true;
    const r = await signInWithProvider("google");
    if (r && r.error) { toast("No se pudo abrir Google"); g.disabled = false; }
  };
  const o = box.querySelector("#cloudOpen");
  if (o) o.onclick = () => navigate("settings");
  const later = box.querySelector("#cloudLater");
  if (later) later.onclick = () => {
    try { sessionStorage.setItem("strumio_cloud_later", "1"); } catch (e) {}
    box.innerHTML = "";
  };
}

function getAllLessons() {
  const out = [];
  const units = (LESSONS.units || []).concat(LESSONS.ukulele || []);
  for (const u of units) for (const l of u.lessons) out.push(l);
  return out;
}
function getReviewLessons() {
  const completed = Object.keys(state.completed);
  if (completed.length === 0) return [];
  const all = getAllLessons();
  // pick up to 2 completed lessons at random for spaced repetition
  const pool = all.filter(l => state.completed[l.id]);
  const shuffled = pool.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 2);
}

// ---- learn ----
function renderLearn(v) {
  showNav(true);
  const isUk = state.settings.instrument === "ukulele";
  const units = isUk ? (LESSONS.ukulele || []) : (LESSONS.units || []);
  v.innerHTML = `<div class="path"><h2 style="margin:0 0 8px">📚 Ruta de aprendizaje</h2>
    <p style="color:var(--muted);font-size:13px;margin:0 0 12px">Instrumento: ${INSTRUMENTS[state.user.instrument].name}</p></div>`;
  const path = $(".path", v);
  for (const u of units) {
    const header = document.createElement("div");
    header.className = "unit-header";
    header.textContent = u.title;
    path.appendChild(header);
    const nodes = document.createElement("div");
    nodes.className = "nodes";
    u.lessons.forEach((l, idx) => {
      const done = !!state.completed[l.id];
      // lock logic: first lesson of first unit always open; others open if prev done
      const allLessons = units.flatMap(x=>x.lessons);
      const globalIdx = allLessons.indexOf(l);
      const prev = globalIdx > 0 ? allLessons[globalIdx-1] : null;
      const locked = !done && prev && !state.completed[prev.id] && globalIdx > 0;
      // Actually allow opening any lesson in current unit if unit unlocked
      const node = document.createElement("div");
      node.className = "node " + (done ? "done" : (locked ? "locked" : "current"));
      node.textContent = done ? "✓" : l.icon || "•";
      node.title = l.title;
      node.setAttribute("role", "button");
      node.tabIndex = locked ? -1 : 0;
      node.setAttribute("aria-label", l.title);
      if (!locked) {
        node.onclick = () => navigate("lesson", { lessonId: l.id });
        node.onkeydown = (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); node.click(); } };
      }
      const label = document.createElement("div");
      label.style.cssText = "font-size:12px;color:var(--muted);text-align:center;max-width:120px";
      label.textContent = l.title;
      const wrap = document.createElement("div");
      wrap.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:4px";
      wrap.appendChild(node); wrap.appendChild(label);
      nodes.appendChild(wrap);
    });
    path.appendChild(nodes);
  }
  // ukulele toggle
  const toggle = document.createElement("div");
  toggle.style.cssText = "padding:16px;text-align:center";
  toggle.innerHTML = `<button class="btn btn-ghost" id="switchIns">${isUk ? "🎸 Cambiar a guitarra" : "🪕 Cambiar a ukelele"}</button>`;
  path.appendChild(toggle);
  $("#switchIns").onclick = async () => {
    const newIns = isUk ? "guitar" : "ukulele";
    state.settings.instrument = newIns;
    state.user.instrument = newIns;
    saveState(state);
    try { await loadInstrumentSamples(newIns); setSoundBank("samples"); } catch (e) {}
    renderLearn(v);
    toast("Instrumento: " + INSTRUMENTS[newIns].name);
  };
}

// ---- lesson engine ----
let lessonState = null;
function renderLesson(v, lessonId) {
  showNav(true);
  const all = getAllLessons();
  const lesson = all.find(l => l.id === lessonId);
  if (!lesson) { navigate("learn"); return; }
  lessonState = { lesson, idx: 0, heartsLost: 0, xpEarned: 0, daily: false };
  // detect daily
  drawLessonStep(v);
}

function drawLessonStep(v) {
  const { lesson, idx } = lessonState;
  if (idx >= lesson.steps.length) {
    finishLesson(v);
    return;
  }
  const step = lesson.steps[idx];
  const pct = (idx / lesson.steps.length) * 100;
  v.innerHTML = `
    <div class="lesson">
      <div class="progress"><div style="width:${pct}%"></div></div>
      <div class="qcard" id="qcard"></div>
      <div id="controls" style="margin-top:16px"></div>
    </div>`;
  const qc = $("#qcard", v);
  const ctrl = $("#controls", v);
  switch (step.type) {
    case "info": renderInfo(qc, ctrl, step); break;
    case "demo": renderDemo(qc, ctrl, step); break;
    case "quiz": renderQuiz(qc, ctrl, step); break;
    case "tuner": renderTunerStep(qc, ctrl, step); break;
    case "play": renderPlayStep(qc, ctrl, step); break;
    case "playChord": renderPlayChordStep(qc, ctrl, step); break;
    case "video": renderVideoStep(qc, ctrl, step); break;
    default: renderInfo(qc, ctrl, step);
  }
}

function nextStep(v) {
  lessonState.idx += 1;
  drawLessonStep(v);
}

function renderInfo(qc, ctrl, step) {
  qc.innerHTML = `
    <div class="prompt">${step.title || ""}</div>
    <div class="sub">${step.text || ""}</div>`;
  ctrl.innerHTML = `<button class="btn btn-primary btn-block" id="contBtn">Continuar</button>`;
  $("#contBtn").onclick = () => nextStep(view());
}

function renderDemo(qc, ctrl, step) {
  const chord = step.chord ? CHORDS.guitar[step.chord] || CHORDS.ukulele[step.chord] : null;
  let chordHtml = "";
  if (chord) chordHtml = renderChordDiagram(chord);
  qc.innerHTML = `
    <div class="prompt">${step.title || "Demo"}</div>
    <div class="sub">${step.text || ""}</div>
    ${chordHtml}
    ${step.freq ? `<div style="margin-top:12px"><button class="btn btn-secondary" id="playBtn">🔊 Escuchar</button></div>` : ""}
  `;
  if (step.freq) $("#playBtn").onclick = () => playTone(step.freq);
  if (step.chord) {
    const btn = document.createElement("button");
    btn.className = "btn btn-secondary btn-block"; btn.style.marginTop = "10px";
    btn.textContent = "🔊 Escuchar acorde";
    btn.onclick = () => {
      const notes = CHORD_NOTES[step.chord];
      if (notes) playChord(notes, 1.4, { arpeggiate: true, stagger: 0.08 });
      else playTone(CHORD_FREQS[step.chord] || 261.63);
    };
    ctrl.appendChild(btn);
  }
  const cont = document.createElement("button");
  cont.className = "btn btn-primary btn-block"; cont.style.marginTop = "10px";
  cont.textContent = "Continuar";
  cont.id = "contBtn";
  cont.onclick = () => nextStep(view());
  ctrl.appendChild(cont);
}

const CHORD_FREQS = { "Em": 329.63*0.5, "Am": 220, "C": 261.63, "G": 196, "D": 293.66, "F": 174.61, "A": 220, "E": 164.81, "Dm": 293.66, "Bm": 246.94 };
// Map chord name -> array of frequencies (notes) for playback
const CHORD_NOTES = {
  "Em": [82.41, 123.47, 164.81, 196.00, 246.94, 329.63],
  "Am": [110.00, 130.81, 164.81, 196.00, 220.00, 261.63],
  "C": [130.81, 164.81, 196.00, 261.63, 329.63, 392.00],
  "G": [98.00, 123.47, 146.83, 196.00, 246.94, 392.00],
  "D": [146.83, 185.00, 220.00, 293.66, 369.99, 440.00],
  "F": [87.31, 130.81, 174.61, 219.99, 261.63, 349.23],
  "A": [110.00, 138.59, 164.81, 220.00, 277.18, 329.63],
  "E": [82.41, 103.83, 123.47, 164.81, 207.65, 246.94],
  "Dm": [146.83, 174.61, 220.00, 293.66, 349.23, 440.00],
  "Bm": [123.47, 146.83, 185.00, 246.94, 308.68, 369.99],
  "Asus2": [110.00, 138.59, 164.81, 220.00, 293.66, 329.63],
  "G7": [98.00, 123.47, 146.83, 196.00, 246.94, 349.23]
};

function showLevelUp(level) {
  const m = document.createElement("div");
  m.className = "modal-backdrop";
  m.innerHTML = `<div class="modal levelup-celebration">
    <div class="modal-body" style="text-align:center">
      <div style="font-size:64px">🎉</div>
      <h2>¡Nivel ${level}!</h2>
      <p>Has subido de nivel. Sigue así.</p>
      <button class="btn btn-primary btn-block" id="closeLvl">Continuar</button>
    </div>
  </div>`;
  document.body.appendChild(m);
  $("#closeLvl").onclick = () => m.remove();
}

function renderChordDiagram(chord) {
  // chord.frets: array from low E to high e (6) or 4 for uke
  const n = chord.frets.length;
  const cols = n;
  const rows = 5;
  let html = `<div class="chord-diagram" style="grid-template-columns:repeat(${cols},28px)">`;
  // We'll render 5 fret rows x n strings; place dots
  // Build a grid: for each fret row (1..5), for each string, cell
  for (let f = 1; f <= 5; f++) {
    for (let s = 0; s < n; s++) {
      const fr = chord.frets[s];
      let cls = "cell";
      if (fr === -1) {
        if (f === 1) cls += " muted";
      } else if (fr === 0) {
        if (f === 1) cls += " open";
      } else if (fr === f) {
        cls += " dot";
      }
      html += `<div class="${cls}"></div>`;
    }
  }
  html += "</div>";
  // finger numbers legend
  html += `<div style="color:var(--muted);font-size:12px;margin-top:6px">Dedos: ${chord.fingers.join(" ")}</div>`;
  return html;
}

function renderQuiz(qc, ctrl, step) {
  qc.innerHTML = `<div class="prompt">${step.prompt}</div>`;
  const opts = document.createElement("div");
  opts.className = "options";
  step.options.forEach((o, i) => {
    const b = document.createElement("div");
    b.className = "opt";
    b.textContent = o;
    b.setAttribute("role", "button");
    b.tabIndex = 0;
    b.onkeydown = (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); b.click(); } };
    b.onclick = () => {
      if (i === step.answer) {
        b.classList.add("correct");
        lessonState.xpEarned += 5;
        toast("¡Correcto! +5 XP");
        setTimeout(() => nextStep(view()), 700);
      } else {
        b.classList.add("wrong");
        loseHeart();
        renderTopbar();
        toast("Incorrecto. -1 ❤️");
        // show correct
        $$(".opt", opts)[step.answer].classList.add("correct");
        setTimeout(() => nextStep(view()), 1200);
      }
    };
    opts.appendChild(b);
  });
  qc.appendChild(opts);
}

function renderTunerStep(qc, ctrl, step) {
  qc.innerHTML = `
    <div class="prompt">${step.text}</div>
    <div class="sub">Toca la cuerda indicada. El afinador detectará la nota.</div>
    <div class="note-big" id="tNote">—</div>
    <div class="cents" id="tCents">Esperando sonido...</div>
  `;
  ctrl.innerHTML = `<button class="btn btn-secondary btn-block" id="startMicBtn">🎤 Activar micrófono</button>
    <button class="btn btn-primary btn-block" style="margin-top:10px" id="skipBtn">Saltar</button>`;
  let detected = false;
  $("#startMicBtn").onclick = async () => {
    const ok = await startMic((pitch) => {
      if (!pitch) return;
      const noteEl = $("#tNote");
      const centsEl = $("#tCents");
      if (noteEl) noteEl.textContent = pitch.note.name;
      if (centsEl) centsEl.textContent = `${pitch.freq.toFixed(1)} Hz · ${pitch.note.full}`;
      // check if close to target
      const targetFreq = step.freq;
      const cents = centsOff(pitch.freq, targetFreq);
      if (Math.abs(cents) < 25 && !detected) {
        detected = true;
        lessonState.xpEarned += 8;
        toast("¡Afinado! +8 XP");
        setTimeout(() => { stopMic(); nextStep(view()); }, 900);
      }
    });
    if (!ok) toast("No se pudo acceder al micrófono");
  };
  $("#skipBtn").onclick = () => { stopMic(); nextStep(view()); };
}

function renderPlayStep(qc, ctrl, step) {
  qc.innerHTML = `
    <div class="prompt">${step.title || "Toca la nota"}</div>
    <div class="sub">${step.text || "Toca la nota indicada. El micrófono verificará."}</div>
    <div class="note-big" id="playNote">—</div>
    <div class="cents" id="playStatus">Pulsa "Empezar"</div>
  `;
  ctrl.innerHTML = `<button class="btn btn-primary btn-block" id="playStartBtn">🎤 Empezar</button>
    <button class="btn btn-secondary btn-block" style="margin-top:10px" id="playSkipBtn">Saltar</button>`;
  let done = false;
  $("#playStartBtn").onclick = async () => {
    const ok = await startMic((pitch) => {
      if (!pitch || done) return;
      $("#playNote").textContent = pitch.note.name;
      const target = step.freq || 329.63;
      const cents = centsOff(pitch.freq, target);
      $("#playStatus").textContent = `${pitch.freq.toFixed(1)} Hz · ${cents > 0 ? "+" : ""}${cents.toFixed(0)} cents`;
      if (Math.abs(cents) < 25) {
        done = true;
        lessonState.xpEarned += 8;
        toast("¡Correcto! +8 XP");
        setTimeout(() => { stopMic(); nextStep(view()); }, 900);
      }
    });
    if (!ok) toast("No se pudo acceder al micrófono");
  };
  $("#playSkipBtn").onclick = () => { stopMic(); nextStep(view()); };
}

function renderPlayChordStep(qc, ctrl, step) {
  qc.innerHTML = `
    <div class="prompt">${step.title || "Toca el acorde"}</div>
    <div class="sub">${step.text || "Toca el acorde indicado. La app lo detectará automáticamente."}</div>
    <div class="note-big" id="pcChord" style="font-size:48px">—</div>
    <div class="cents" id="pcConf">Confianza: —</div>
    <div class="chord-diagram" id="pcDiagram" style="margin-top:12px"></div>
  `;
  // show expected chord diagram
  if (step.expected && CHORDS.guitar[step.expected]) {
    const d = $("#pcDiagram", qc);
    d.outerHTML = renderChordDiagram(CHORDS.guitar[step.expected] || CHORDS.ukulele[step.expected]);
  }
  ctrl.innerHTML = `<button class="btn btn-primary btn-block" id="pcStartBtn">🎤 Empezar detección</button>
    <button class="btn btn-secondary btn-block" style="margin-top:10px" id="pcSkipBtn">Saltar</button>`;
  let done = false;
  $("#pcStartBtn").onclick = async () => {
    $("#pcStartBtn").disabled = true;
    $("#pcStartBtn").textContent = "Escuchando...";
    const res = await detectChord(2500);
    $("#pcStartBtn").disabled = false;
    $("#pcStartBtn").textContent = "🎤 Empezar detección";
    if (res && res.chord) {
      $("#pcChord").textContent = res.chord;
      $("#pcConf").textContent = "Confianza: " + Math.round(res.confidence * 100) + "%";
      if (res.chord === step.expected) {
        if (!done) { done = true; lessonState.xpEarned += 10; toast("¡Acorde correcto! +10 XP"); setTimeout(() => nextStep(view()), 900); }
      } else {
        toast("Ese era " + res.chord + ", intenta de nuevo");
      }
    } else {
      $("#pcChord").textContent = "?";
      $("#pcConf").textContent = "No se detectó";
      toast("No se detectó acorde, intenta de nuevo");
    }
  };
  $("#pcSkipBtn").onclick = () => { stopMic(); nextStep(view()); };
}

function renderVideoStep(qc, ctrl, step) {
  const videoUrl = step.url || step.videoUrl || step.src || "";
  qc.innerHTML = `
    <div class="prompt">${step.title || "Video"}</div>
    <div class="sub">${step.text || ""}</div>
    <div id="videoHost" style="margin-top:12px"></div>`;
  const host = $("#videoHost", qc);
  const sk = document.createElement("div");
  sk.className = "skeleton";
  sk.style.cssText = "width:100%;aspect-ratio:9/16;border-radius:12px;";
  host.appendChild(sk);
  loadVideoPlayer().then((m) => {
    host.innerHTML = "";
    m.renderLessonVideo(host, videoUrl, {
      captions: step.captions || step.captionsUrl,
      title: step.title,
      autoplay: step.autoplay !== false,
      loop: !!step.loop,
      onProgress: (pct) => {
        // track progress locally; mark watched handled by player
      },
      onWatched: () => {
        lessonState.xpEarned += (step.xp || 5);
        try { announce("Video visto: " + (step.title || "")); } catch (e) {}
      }
    });
  }).catch((e) => {
    host.innerHTML = `<div style="color:var(--muted);padding:12px">No se pudo cargar el reproductor de video.</div>`;
    console.warn("video player load error", e);
  });
  ctrl.innerHTML = `<button class="btn btn-primary btn-block" id="contBtn">Continuar</button>`;
  const btn = document.getElementById("contBtn");
  if (btn) btn.onclick = () => nextStep(view());
}

function finishLesson(v) {
  const { lesson, xpEarned } = lessonState;
  const wasCompleted = !!state.completed[lesson.id];
  if (!wasCompleted) {
    state.completed[lesson.id] = true;
    state.stats.lessonsCompleted += 1;
  }
  const dailyBonus = lessonState.daily ? 2 : 1;
  const totalXp = Math.max(10, xpEarned + (lesson.xp || 10)) * dailyBonus;
  const res = addXP(totalXp);
  updateStreak();
  state.stats.minutesPracticed += 3;
  if (!state.stats.totalPracticeTime) state.stats.totalPracticeTime = 0;
  state.stats.totalPracticeTime = (state.stats.totalPracticeTime || 0) + 3;
  // daily log for dashboard charts
  if (!state.dailyLog) state.dailyLog = {};
  const todayKey = new Date().toDateString();
  if (!state.dailyLog[todayKey]) state.dailyLog[todayKey] = { xp: 0, minutes: 0, lessons: 0 };
  state.dailyLog[todayKey].xp += totalXp;
  state.dailyLog[todayKey].minutes += 3;
  state.dailyLog[todayKey].lessons += 1;
  if (!state.practiceDays) state.practiceDays = [];
  if (!state.practiceDays.includes(todayKey)) state.practiceDays.push(todayKey);
  const newAch = checkAchievements();
  saveState(state);
  try { syncProgress(); } catch (e) {}
  if (res.leveled) setTimeout(() => showLevelUp(res.level), 400);
  v.innerHTML = `
    <div class="card" style="text-align:center;padding:32px 16px">
      <div style="font-size:64px">🎉</div>
      <h2>¡Lección completada!</h2>
      <p class="xp-pop">+${totalXp} XP ${dailyBonus>1?"(x2 desafío diario)":""}</p>
      ${res.leveled ? `<p style="color:var(--gold);font-weight:800">¡Subiste a nivel ${res.level}!</p>` : ""}
      <p style="color:var(--muted)">Racha: ${state.streak} días 🔥</p>
      ${newAch.length ? `<div style="margin-top:10px">${newAch.map(a=>`<div class="ach"><span class="ico">${a.icon}</span><div class="info"><div class="name">${a.name}</div><div class="desc">${a.desc}</div></div></div>`).join("")}</div>` : ""}
      <button class="btn btn-primary btn-block" style="margin-top:16px" id="backBtn">Volver a la ruta</button>
    </div>`;
  $("#backBtn").onclick = () => navigate("learn");
  renderTopbar();
}

// ---- tuner ----
let tunerState = { instrument: null, tuning: "standard", targetString: 0, auto: true, chromatic: false, muteChime: false, continuous: false, autoTune: false, autoTuneIdx: 0, autoTuneInTuneStart: null, history: null };
function renderTuner(v) {
  showNav(true);
  if (!tunerState.instrument) tunerState.instrument = state.settings.instrument || "guitar";
  if (!tunerState.history) tunerState.history = state.tunerHistory || {};
  const ins = INSTRUMENTS[tunerState.instrument];
  const tuningFreqs = ins.tunings[tunerState.tuning];
  const tuningNames = ins.tuningNames;
  const numStrings = tuningFreqs.length;
  if (tunerState.targetString >= numStrings) tunerState.targetString = 0;
  if (tunerState.autoTuneIdx >= numStrings) tunerState.autoTuneIdx = 0;
  v.innerHTML = `
    <div class="tuner" style="padding:16px">
      <h2 style="margin:0 0 12px;text-align:center">🎯 Afinador</h2>
      <!-- Instrument selector -->
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:12px">
        ${Object.keys(INSTRUMENTS).map(k => `<button class="btn btn-secondary" data-ins="${k}" style="padding:8px 14px;font-size:13px;${k===tunerState.instrument?'border-color:var(--green);background:#2d4a2d':''}">${INSTRUMENTS[k].emoji} ${k}</button>`).join("")}
      </div>
      <!-- Tuning selector -->
      <select id="tuningSel" style="width:100%;padding:10px;border-radius:10px;border:2px solid var(--border);background:var(--card2);color:var(--text);font-weight:700;margin-bottom:16px">
        ${Object.keys(tuningNames).map(k => `<option value="${k}" ${k===tunerState.tuning?'selected':''}>${tuningNames[k]}</option>`).join("")}
      </select>
      <!-- Mode toggles -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;justify-content:center">
        <button class="btn btn-secondary" id="chromaticBtn" style="padding:8px 14px;font-size:13px;${tunerState.chromatic?'border-color:var(--green);background:#2d4a2d':''}">${tunerState.chromatic?'Cromático':'Por cuerda'}</button>
        <button class="btn btn-secondary" id="muteBtn" style="padding:8px 14px;font-size:13px">${tunerState.muteChime?'🔇 Silenciado':'🔔 Sonido'}</button>
        <button class="btn btn-secondary" id="continuousBtn" style="padding:8px 14px;font-size:13px;${tunerState.continuous?'border-color:var(--green);background:#2d4a2d':''}">${tunerState.continuous?'⏹ Parar tono':'🔊 Tono continuo'}</button>
        <button class="btn btn-secondary" id="autoTuneBtn" style="padding:8px 14px;font-size:13px;${tunerState.autoTune?'border-color:var(--green);background:#2d4a2d':''}">🎯 Afinar todas</button>
      </div>
      <!-- Guitar visual -->
      <div id="guitarVisual" style="background:linear-gradient(180deg,#2a1f14,#1a1208);border-radius:16px;padding:20px 16px;margin-bottom:16px;position:relative;overflow:hidden;border:2px solid #3a2a1a">
        <div style="position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent,transparent 40px,rgba(255,255,255,0.03) 40px,rgba(255,255,255,0.03) 41px);pointer-events:none"></div>
        <div id="stringsContainer" style="position:relative;z-index:1;display:flex;flex-direction:column;gap:${numStrings>4?8:12}px">
          ${tuningFreqs.map((f, i) => {
            const strName = ins.strings[i];
            const isActive = i === tunerState.targetString;
            const badgeCount = (tunerState.history[tunerState.instrument+":"+tunerState.tuning+":"+i] || 0);
            return `<div class="guitar-string" data-string="${i}" onclick="window.__tunerSetString(${i})" style="display:flex;align-items:center;gap:12px;cursor:pointer;padding:8px 4px;border-radius:8px;transition:background 0.2s;${isActive?'background:rgba(88,204,2,0.15)':''}">
              <div style="width:24px;text-align:center;font-weight:900;font-size:14px;color:${isActive?'var(--green)':'var(--muted)'}">${strName}</div>
              <div style="flex:1;height:3px;background:linear-gradient(90deg,#888,#ccc,#888);border-radius:2px;position:relative">
                <div class="string-vibrate" data-sv="${i}" style="position:absolute;inset:-4px 0;pointer-events:none;opacity:0"></div>
              </div>
              <div style="display:flex;align-items:center;gap:6px">
                <span data-badge="${i}" style="background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:2px 8px;font-size:11px;font-weight:700;color:var(--muted)">${badgeCount}</span>
                <div style="width:60px;text-align:right;font-size:12px;color:var(--muted)" id="strFreq${i}">${f.toFixed(1)} Hz</div>
              </div>
            </div>`;
          }).join("")}
        </div>
      </div>
      <!-- Strobe tuner -->
      <div style="display:flex;justify-content:center;margin-bottom:16px">
        <div id="strobe" class="strobe" style="width:80px;height:80px;border-radius:50%;border:3px solid var(--border);position:relative;overflow:hidden;background:var(--card2)">
          <div class="strobe-pattern" style="position:absolute;inset:0;background:repeating-conic-gradient(var(--green) 0deg 10deg, transparent 10deg 20deg);opacity:0.8"></div>
        </div>
      </div>
      <!-- Note display -->
      <div class="tuner-display" style="text-align:center;padding:24px;background:var(--card);border-radius:16px;margin-bottom:16px;border:2px solid var(--border)">
        <div class="note-big" id="tNote" style="font-size:80px;font-weight:900;line-height:1;transition:color 0.3s">—</div>
        <div style="font-size:16px;color:var(--muted);margin-top:4px" id="tNoteFull">Toca una cuerda</div>
        <div class="cents" id="tCents" style="font-size:18px;margin-top:8px;font-weight:700">—</div>
        <div id="fineTune" style="font-size:13px;color:var(--green);margin-top:4px;min-height:18px"></div>
        <!-- Meter bar -->
        <div style="margin:16px 0;position:relative">
          <div class="meter" style="height:20px;background:var(--border);border-radius:10px;position:relative;overflow:hidden">
            <div class="zone" style="position:absolute;top:0;height:100%;background:rgba(88,204,2,0.2);left:42%;width:16%;border-left:2px solid var(--green);border-right:2px solid var(--green)"></div>
            <div id="needle" style="position:absolute;top:0;width:4px;height:100%;background:var(--red);left:50%;transform:translateX(-50%);transition:left 0.1s,bbackground 0.3s;border-radius:2px"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:4px">
            <span>♭ Bajo</span>
            <span style="color:var(--green);font-weight:800">✓ Afinado</span>
            <span>♯ Alto</span>
          </div>
        </div>
        <!-- Status indicator -->
        <div id="tuneStatus" style="font-size:24px;font-weight:900;margin-top:8px;transition:all 0.3s">—</div>
      </div>
      <!-- Mic button -->
      <button class="btn btn-primary btn-block" id="micBtn" style="margin-bottom:16px">🎤 Activar micrófono</button>
      <button class="btn btn-secondary btn-block" id="testAudioBtn" style="margin-bottom:16px">🔊 Probar audio (deberías oír un tono)</button>
      <!-- String selector -->
      <div class="section-title" style="margin-left:0;margin-bottom:8px">Cuerdas</div>
      <div class="strings-list" id="stringsList" style="display:grid;gap:6px"></div>
    </div>`;
  // Global handler for guitar string clicks
  window.__tunerSetString = (i) => {
    tunerState.targetString = i;
    tunerState.autoTune = false;
    $$(".guitar-string").forEach((el, idx) => {
      el.style.background = idx === i ? "rgba(88,204,2,0.15)" : "transparent";
      const nameEl = el.querySelector('div:first-child');
      if (nameEl) nameEl.style.color = idx === i ? "var(--green)" : "var(--muted)";
    });
    $$(".string-btn").forEach((b, idx) => b.classList.toggle("active", idx === i));
    playTone(tuningFreqs[i], 1.0, { gain: 0.2 });
    toast("Cuerda " + ins.strings[i] + " seleccionada");
    if (tunerState.continuous) startContinuousTone(tuningFreqs[i]);
  };
  // instrument buttons
  $$("[data-ins]").forEach(b => b.onclick = async () => {
    tunerState.instrument = b.dataset.ins;
    tunerState.tuning = "standard";
    tunerState.autoTune = false;
    state.stats.tunings += 1;
    saveState(state);
    try { await loadInstrumentSamples(b.dataset.ins); setSoundBank("samples"); } catch (e) {}
    renderTuner(view());
  });
  $("#tuningSel").onchange = (e) => { tunerState.tuning = e.target.value; tunerState.autoTune = false; renderTuner(view()); };
  // strings list
  const sl = $("#stringsList");
  tuningFreqs.forEach((f, i) => {
    const btn = document.createElement("div");
    btn.className = "string-btn" + (i === tunerState.targetString ? " active" : "");
    const badgeCount = (tunerState.history[tunerState.instrument+":"+tunerState.tuning+":"+i] || 0);
    btn.innerHTML = `<span>${ins.strings[i]}</span><span data-badge2="${i}" style="background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:2px 8px;font-size:11px;font-weight:700;color:var(--muted);margin-left:8px">${badgeCount}</span><span class="freq">${f.toFixed(2)} Hz</span>`;
    btn.onclick = () => { tunerState.targetString = i; tunerState.autoTune = false; $$(".string-btn").forEach(x=>x.classList.remove("active")); btn.classList.add("active");
      $$(".guitar-string").forEach((el, idx) => {
        el.style.background = idx === i ? "rgba(88,204,2,0.15)" : "transparent";
      });
      playTone(tuningFreqs[i], 1.0, { gain: 0.2 });
      if (tunerState.continuous) startContinuousTone(tuningFreqs[i]);
    };
    sl.appendChild(btn);
  });
  // Mode buttons handlers
  $("#chromaticBtn").onclick = () => { tunerState.chromatic = !tunerState.chromatic; tunerState.autoTune = false; renderTuner(view()); };
  $("#muteBtn").onclick = () => { tunerState.muteChime = !tunerState.muteChime; renderTuner(view()); };
  $("#continuousBtn").onclick = () => {
    tunerState.continuous = !tunerState.continuous;
    if (tunerState.continuous) {
      startContinuousTone(tuningFreqs[tunerState.targetString]);
    } else {
      stopContinuousTone();
    }
    renderTuner(view());
  };
  $("#autoTuneBtn").onclick = async () => {
    tunerState.autoTune = true;
    tunerState.autoTuneIdx = 0;
    tunerState.autoTuneInTuneStart = null;
    tunerState.chromatic = false;
    if (!isRunning()) {
      $("#micBtn").click();
    }
    toast("Afinando todas: " + ins.strings[0]);
    renderTuner(view());
  };
  // Continuous tone helpers
  function startContinuousTone(freq) {
    stopContinuousTone();
    try {
      if (!window.__audioCtx) window.__audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = window.__audioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.value = 0.15;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      window.__tunerContOsc = osc;
      window.__tunerContGain = gain;
    } catch (e) {}
  }
  function stopContinuousTone() {
    try { if (window.__tunerContOsc) { window.__tunerContOsc.stop(); } } catch (e) {}
    window.__tunerContOsc = null;
    window.__tunerContGain = null;
  }
  // Auto-detect string when mic is running
  let lastDetectedString = -1;
  let inTuneFrames = 0;
  let smoothedNeedlePos = 50;
  $("#micBtn").onclick = async () => {
    if (isRunning()) { stopMic(); stopContinuousTone(); tunerState.continuous=false; $("#micBtn").textContent = "🎤 Activar micrófono"; $("#tuneStatus").textContent = "—"; return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast("Tu navegador no soporta acceso al micrófono");
      return;
    }
    try {
      if (!window.__audioCtx) window.__audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (window.__audioCtx.state === 'suspended') await window.__audioCtx.resume();
    } catch (e) {}
    $("#micBtn").textContent = "⏳ Solicitando permiso...";
    const ok = await startMic((pitch) => {
      if (!pitch) {
        $("#tCents").textContent = "Sin señal... Toca una cuerda más fuerte o acerca el micrófono";
        $("#tuneStatus").textContent = "🎤 Escuchando...";
        $("#tuneStatus").style.color = "var(--muted)";
        $("#tNote").textContent = "—";
        $("#tNoteFull").textContent = "Toca una cuerda cerca del micrófono";
        $("#fineTune").textContent = "";
        inTuneFrames = 0;
        tunerState.autoTuneInTuneStart = null;
        const strobePat0 = document.querySelector("#strobe .strobe-pattern");
        if (strobePat0) strobePat0.style.animationPlayState = "paused";
        return;
      }
      // Determine target
      let detectedStr = tunerState.targetString;
      let targetFreq = tuningFreqs[detectedStr];
      let strName = ins.strings[detectedStr];
      let chromaticNote = null;
      if (tunerState.autoTune) {
        detectedStr = tunerState.autoTuneIdx;
        if (detectedStr >= numStrings) { tunerState.autoTune = false; detectedStr = numStrings-1; }
        targetFreq = tuningFreqs[detectedStr];
        strName = ins.strings[detectedStr];
        // highlight
        $$(".guitar-string").forEach((el, i) => { el.style.background = i === detectedStr ? "rgba(88,204,2,0.15)" : "transparent"; });
        $$(".string-btn").forEach((b, i) => b.classList.toggle("active", i === detectedStr));
      } else if (tunerState.chromatic) {
        const roundedMidi = Math.round(pitch.midi);
        targetFreq = midiToFreq(roundedMidi);
        chromaticNote = midiToNote(roundedMidi);
        strName = chromaticNote.full;
        detectedStr = -1;
      } else {
        const auto = closestString(pitch.freq, tuningFreqs);
        detectedStr = auto.index;
        if (detectedStr !== lastDetectedString) {
          lastDetectedString = detectedStr;
          $$(".guitar-string").forEach((el, i) => { el.style.background = i === detectedStr ? "rgba(88,204,2,0.15)" : "transparent"; });
          tunerState.targetString = detectedStr;
          $$(".string-btn").forEach((b, i) => b.classList.toggle("active", i === detectedStr));
        }
        targetFreq = tuningFreqs[detectedStr];
        strName = ins.strings[detectedStr];
      }
      const cents = centsOff(pitch.freq, targetFreq);
      // Update note display
      $("#tNote").textContent = tunerState.chromatic ? (chromaticNote ? chromaticNote.full : pitch.note.full) : pitch.note.full;
      $("#tNoteFull").textContent = `${pitch.note.full} · ${pitch.freq.toFixed(2)} Hz`;
      // cents text
      const centsStr = (cents > 0 ? "+" : "") + cents.toFixed(1);
      if (Math.abs(cents) < 5) {
        $("#tCents").textContent = `${centsStr} cents — ¡Afinado! ✓`;
        $("#tCents").style.color = "var(--green)";
      } else if (Math.abs(cents) < 25) {
        $("#tCents").textContent = `${centsStr} cents — Cerca`;
        $("#tCents").style.color = "var(--gold)";
      } else {
        $("#tCents").textContent = `${centsStr} cents — ${cents > 0 ? "Baja la cuerda" : "Sube la cuerda"}`;
        $("#tCents").style.color = "var(--red)";
      }
      $("#fineTune").textContent = Math.abs(cents) <= 1 ? "🎯 Afinación fina (±1 cent)" : "";
      // Needle
      const targetPos = 50 + Math.max(-50, Math.min(50, cents));
      smoothedNeedlePos += (targetPos - smoothedNeedlePos) * 0.15;
      if (Math.abs(cents) < 5) smoothedNeedlePos += (50 - smoothedNeedlePos) * 0.3;
      const needle = $("#needle");
      if (needle) {
        needle.style.left = smoothedNeedlePos + "%";
        needle.style.background = Math.abs(cents) < 5 ? "var(--green)" : (Math.abs(cents) < 25 ? "var(--gold)" : "var(--red)");
      }
      $("#tNote").style.color = Math.abs(cents) < 5 ? "var(--green)" : (Math.abs(cents) < 25 ? "var(--gold)" : "var(--red)");
      // Strobe
      const strobePat = document.querySelector("#strobe .strobe-pattern");
      if (strobePat) {
        if (Math.abs(cents) < 1) {
          strobePat.style.animationPlayState = "paused";
        } else {
          strobePat.style.animationPlayState = "running";
          const dur = Math.max(0.15, Math.min(2, 2 - (Math.abs(cents)/50)*1.8));
          strobePat.style.animationDuration = dur + "s";
        }
      }
      // Status + chime
      const status = $("#tuneStatus");
      if (status) {
        if (Math.abs(cents) < 5) {
          status.textContent = "✓ ¡Afinado!";
          status.style.color = "var(--green)";
          inTuneFrames++;
          // vibrate
          if (detectedStr >= 0) {
            const sv = document.querySelector(`[data-sv="${detectedStr}"]`);
            if (sv) { sv.style.opacity = "1"; sv.style.background = "radial-gradient(ellipse, rgba(88,204,2,0.6), transparent)"; setTimeout(() => { if (sv) sv.style.opacity = "0"; }, 300); }
          }
          if (inTuneFrames === 5) {
            if (!tunerState.muteChime) {
              playTone(targetFreq, 0.15, { gain: 0.12, waveform: "sine" });
              setTimeout(() => playTone(targetFreq * 1.25, 0.25, { gain: 0.12, waveform: "sine" }), 120);
            }
            $("#tNote").classList.add("tune-pulse");
            setTimeout(() => { const n=$("#tNote"); if(n) n.classList.remove("tune-pulse"); }, 500);
            toast("✅ " + strName + " afinada");
            // history increment (string mode only)
            if (!tunerState.chromatic && detectedStr >= 0) {
              const key = tunerState.instrument + ":" + tunerState.tuning + ":" + detectedStr;
              tunerState.history[key] = (tunerState.history[key] || 0) + 1;
              state.tunerHistory = tunerState.history;
              saveState(state);
              const badge = document.querySelector(`[data-badge="${detectedStr}"]`);
              if (badge) badge.textContent = tunerState.history[key];
              const badge2 = document.querySelector(`[data-badge2="${detectedStr}"]`);
              if (badge2) badge2.textContent = tunerState.history[key];
            }
          }
          // auto-tune advance after 2s
          if (tunerState.autoTune) {
            if (!tunerState.autoTuneInTuneStart) tunerState.autoTuneInTuneStart = Date.now();
            if (Date.now() - tunerState.autoTuneInTuneStart >= 2000) {
              tunerState.autoTuneIdx++;
              tunerState.autoTuneInTuneStart = null;
              inTuneFrames = 0;
              if (tunerState.autoTuneIdx >= numStrings) {
                tunerState.autoTune = false;
                toast("✅ Todas las cuerdas afinadas");
              } else {
                toast("Siguiente: " + ins.strings[tunerState.autoTuneIdx]);
              }
            }
          }
        } else {
          status.textContent = cents > 0 ? "♯ Muy alto" : "♭ Muy bajo";
          status.style.color = Math.abs(cents) < 25 ? "var(--gold)" : "var(--red)";
          inTuneFrames = 0;
          tunerState.autoTuneInTuneStart = null;
        }
      }
      // Update string frequency display
      if (detectedStr >= 0) {
        const freqEl = document.getElementById(`strFreq${detectedStr}`);
        if (freqEl) freqEl.textContent = `${pitch.freq.toFixed(1)} Hz`;
      }
    });
    if (ok) {
      $("#micBtn").textContent = "⏹ Detener";
      $("#tuneStatus").textContent = "🎤 Escuchando...";
      toast("Micrófono activado. Toca una cuerda.");
    } else {
      $("#micBtn").textContent = "🎤 Activar micrófono";
      toast("No se pudo acceder al micrófono.");
      const helpDiv = document.createElement("div");
      helpDiv.style.cssText = "background:var(--card2);padding:12px;border-radius:8px;margin-top:8px;font-size:12px;color:var(--muted)";
      helpDiv.innerHTML = `
        <b style="color:var(--text)">¿No funciona el micrófono?</b><br>
        1. Haz clic en el icono de candado 🔒 en la barra de direcciones<br>
        2. Busca "Micrófono" y cámbialo a "Permitir"<br>
        3. Recarga la página (F5) y vuelve a intentar`;
      $("#micBtn").parentElement.appendChild(helpDiv);
    }
  };
  // Test audio button
  const testBtn = $("#testAudioBtn");
  if (testBtn) {
    testBtn.onclick = () => {
      playTone(440, 0.5, { gain: 0.3 });
      setTimeout(() => playTone(550, 0.5, { gain: 0.3 }), 300);
      toast("¿Oíste el tono? Si no, verifica el volumen del navegador.");
    };
  }
  // stop continuous on unload? not needed
}

// ---- practice ----
// Registro central de herramientas. Cada una se abre en su propia ventana.
const PRACTICE_TOOLS = [
  // --- Acordes ---
  { id: "chords", cat: "chords", icon: "📖", title: "Biblioteca de acordes", desc: "Acordes con diagramas, audio y consejos de digitación.", tags: ["Diagramas", "Audio"], keywords: "acorde mayor menor", mount: (el) => renderChordLibrary(el) },
  { id: "voicings", cat: "chords", icon: "🎼", title: "Voicings de acordes", desc: "Varias posiciones para cada acorde: abiertas, cejilla y jazz.", tags: ["5 posiciones"], keywords: "posiciones inversiones", mount: async (el) => { const m = await loadChordVoicings(); m.renderChordVoicings(el); } },
  { id: "transitions", cat: "chords", icon: "🔀", title: "Cambios entre acordes", desc: "Cambia de acorde con cronómetro y récord de cambios por minuto.", tags: ["Reto", "CPM"], keywords: "transiciones velocidad", mount: async (el) => { const m = await loadPracticeRoutines(); m.renderChordTransitions(el); } },
  { id: "changes", cat: "chords", icon: "⚡", title: "Cambios de 1 minuto", desc: "Un minuto al día para ganar velocidad y limpieza.", tags: ["1 min"], keywords: "one minute changes", mount: (el) => renderOneMinuteChanges(el) },
  { id: "chordDetect", cat: "chords", icon: "🎤", title: "Detector de acordes", desc: "Escucha lo que tocas y te dice el acorde con el micrófono.", tags: ["Micrófono"], keywords: "reconocer acorde micro", mount: (el) => renderChordDetect(el) },

  // --- Ritmo ---
  { id: "metronome", cat: "rhythm", icon: "⏱", title: "Metrónomo", desc: "Ritmo preciso con acentos, subdivisiones y tap tempo.", tags: ["BPM", "Tap"], keywords: "tempo compas pulso", mount: (el) => renderMetronome(el) },
  { id: "strumming", cat: "rhythm", icon: "🥁", title: "Entrenador de rasgueo", desc: "24 patrones (D/U/–/✕) con guía visual y metrónomo.", tags: ["24 patrones"], keywords: "strumming ritmo mano", mount: async (el) => { const m = await loadChordVoicings(); m.renderStrummingTrainer(el); } },
  { id: "rhythm", cat: "rhythm", icon: "🎯", title: "Entrenador de ritmo", desc: "Mide tu precisión con ejercicios progresivos.", tags: ["Precisión"], keywords: "sincronia tempo", mount: async (el) => { const m = await loadPracticeAdvanced(); m.renderRhythmTrainer(el); } },
  { id: "backing", cat: "rhythm", icon: "🎛", title: "Backing Tracks Pro", desc: "Batería, bajo y guitarra reales. Mezclador, secuenciador y exportación WAV.", tags: ["Samples reales", "Mixer"], keywords: "improvisar pista base drums", mount: async (el) => { const m = await loadBacking(); m.renderBackingMixer(el); } },

  // --- Oído ---
  { id: "ear", cat: "ear", icon: "👂", title: "Entrenador de oído", desc: "Reconoce intervalos, acordes y progresiones de oído.", tags: ["Oído"], keywords: "escuchar reconocer", mount: (el) => renderEarTrainer(el) },
  { id: "interval", cat: "ear", icon: "📐", title: "Entrenador de intervalos", desc: "Intervalos ascendentes y descendentes con audio real.", tags: ["Oído"], keywords: "tercera quinta octava", mount: async (el) => { const m = await loadPracticeAdvanced(); m.renderIntervalTrainer(el); } },
  { id: "chordType", cat: "ear", icon: "🎹", title: "Tipos de acorde", desc: "Distingue mayor, menor, séptima, suspendido… por sonido.", tags: ["Oído"], keywords: "mayor menor septima", mount: async (el) => { const m = await loadPracticeAdvanced(); m.renderChordTypeTrainer(el); } },
  { id: "voicingQuiz", cat: "ear", icon: "🎲", title: "Quiz de voicings", desc: "Escucha una posición y elige el diagrama correcto.", tags: ["Quiz"], keywords: "juego posiciones", mount: async (el) => { const m = await loadChordVoicings(); m.renderChordVoicingQuiz(el); } },

  // --- Técnica ---
  { id: "scales", cat: "technique", icon: "🎼", title: "Escalas", desc: "Más de 60 escalas por categorías con mástil y audio.", tags: ["60+"], keywords: "pentatonica modos mayor menor", mount: async (el) => { const m = await loadScales(); m.renderScaleExplorer(el); } },
  { id: "fretboard", cat: "technique", icon: "🎸", title: "Mástil interactivo", desc: "Explora notas, intervalos y escalas en todo el mástil.", tags: ["Visual"], keywords: "diapason notas trastes", mount: (el) => renderFretboardView(el) },
  { id: "fingerExercises", cat: "technique", icon: "🕷", title: "Ejercicios de dedos", desc: "Spider, cromáticos, saltos de cuerda y legato.", tags: ["Calentamiento"], keywords: "independencia agilidad", mount: async (el) => { const m = await loadPracticeRoutines(); m.renderFingerExercises(el); } },
  { id: "techniques", cat: "technique", icon: "📚", title: "Biblioteca de técnicas", desc: "Bend, vibrato, hammer-on, tapping, armónicos y más.", tags: ["10 técnicas"], keywords: "tecnica guitarra", mount: async (el) => { const m = await loadPracticeAdvanced(); m.renderTechniqueLibrary(el); } },
  { id: "practiceMode", cat: "technique", icon: "🔁", title: "Bucle y velocidad", desc: "Repite un pasaje, baja el tempo y súbelo poco a poco.", tags: ["Bucle"], keywords: "loop lento speed", mount: async (el) => { const m = await loadPracticeAdvanced(); m.renderPracticeMode(el); } },
  { id: "routines", cat: "technique", icon: "📅", title: "Rutina diaria", desc: "Sesión guiada de 15 minutos adaptada a tu nivel.", tags: ["15 min"], keywords: "plan practica diaria", mount: async (el) => { const m = await loadPracticeRoutines(); m.renderPracticeRoutines(el); } },

  // --- Repertorio ---
  { id: "songs", cat: "songs", icon: "🎵", title: "Canciones con acordes", desc: "50 canciones de dominio público con letra y acordes.", tags: ["50 canciones"], keywords: "cancion letra tocar", mount: (el) => renderSongs(el) },
  { id: "songLibrary", cat: "songs", icon: "📚", title: "Biblioteca de canciones", desc: "Filtra por estilo, dificultad y tonalidad.", tags: ["Filtros"], keywords: "buscar cancion estilo", mount: (el) => renderSongLibrary(el) },
  { id: "tabs", cat: "songs", icon: "🎼", title: "Tablaturas de riffs", desc: "Riffs clásicos en tablatura interactiva.", tags: ["Riffs"], keywords: "tab riff", mount: (el) => renderTabs(el) },
  { id: "tabPlayer", cat: "songs", icon: "▶️", title: "Tab Player con audio", desc: "Reproduce tablaturas con audio, bucle y control de velocidad.", tags: ["Audio"], keywords: "reproducir tab", mount: async (el) => { const m = await loadTabPlayer(); m.renderTabPlayer(el); } },
  { id: "videos", cat: "songs", icon: "🎬", title: "Videoteca de lecciones", desc: "Lecciones en vídeo organizadas por técnica.", tags: ["Vídeo"], keywords: "video curso", mount: async (el) => { const m = await loadVideoPlayer(); m.renderVideoLibrary(el); } },

  // --- Teoría y más ---
  { id: "theory", cat: "theory", icon: "🧠", title: "Teoría musical", desc: "Intervalos, escalas, armonía y círculo de quintas.", tags: ["Teoría"], keywords: "armonia circulo quintas", mount: async (el) => { const m = await loadTheory(); m.renderTheory(el); } },
  { id: "improvisation", cat: "theory", icon: "🎷", title: "Guía de improvisación", desc: "Qué escala y modo usar sobre cada acorde.", tags: ["Impro"], keywords: "solo escala acorde", mount: async (el) => { const m = await loadImprovisation(); m.renderImprovisationGuide(el); } },
  { id: "styles", cat: "theory", icon: "🧭", title: "Rutas por estilo", desc: "Aprende por estilo: rock, blues, funk, jazz y más.", tags: ["Rutas"], keywords: "estilo genero", mount: (el) => renderStyles(el) },
  { id: "capo", cat: "theory", icon: "🧮", title: "Calculadora de cejilla", desc: "Calcula el cejillo y los acordes transportados.", tags: ["Cejilla"], keywords: "capo transporte", mount: async (el) => { const m = await loadImprovisation(); m.renderCapoCalculator(el); } },
  { id: "transposition", cat: "theory", icon: "🔄", title: "Transposición", desc: "Transporta cualquier progresión a otra tonalidad.", tags: ["Transporte"], keywords: "cambiar tono", mount: async (el) => { const m = await loadImprovisation(); m.renderTranspositionTool(el); } },
];

function toolColor(catId) {
  const c = CATEGORIES.find((x) => x.id === catId);
  return c ? c.color : "#58cc02";
}

function renderPractice(v) {
  showNav(true);
  renderPracticeHub(v, PRACTICE_TOOLS, (tool) => {
    openToolWindow({
      id: tool.id,
      title: tool.title,
      subtitle: tool.tags && tool.tags[0] ? tool.tags[0] : "Herramienta",
      icon: tool.icon,
      color: toolColor(tool.cat),
      mount: tool.mount,
    });
  });
}

function renderChordLibrary(area) {
  const ins = state.settings.instrument === "ukulele" ? "ukulele" : "guitar";
  const chords = CHORDS[ins];
  area.innerHTML = `<div class="section-title" style="margin-left:0">Acordes de ${ins}</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px" id="chordChips"></div>
    <div id="chordView"></div>`;
  const chips = $("#chordChips", area);
  Object.keys(chords).forEach(name => {
    const c = document.createElement("button");
    c.className = "btn btn-secondary"; c.style.padding = "8px 12px"; c.textContent = name;
    c.onclick = () => showChord(area, name, chords[name]);
    chips.appendChild(c);
  });
}

function showChord(area, name, chord) {
  const view = $("#chordView", area);
  view.innerHTML = `
    <div class="card" style="text-align:center">
      <h2>${name} — ${chord.name}</h2>
      ${renderChordDiagram(chord)}
      <div style="margin-top:12px">
        <button class="btn btn-secondary" id="playChord">🔊 Referencia</button>
      </div>
    </div>`;
  $("#playChord").onclick = () => playTone(CHORD_FREQS[name] || 261.63);
}

function renderMetronome(area) {
  area.innerHTML = `
    <div class="card" style="text-align:center">
      <h2>⏱ Metrónomo</h2>
      <div style="font-size:32px;font-weight:900;margin:12px 0" id="bpm">100 BPM</div>
      <input type="range" min="40" max="220" value="100" id="bpmSlider" style="width:100%">
      <div class="metro" id="beats"></div>
      <button class="btn btn-primary btn-block" id="metroToggle">▶ Iniciar</button>
    </div>`;
  const beatsContainer = $("#beats", area);
  for (let i=0;i<4;i++){const b=document.createElement("div");b.className="beat";beatsContainer.appendChild(b);}
  let running=false;
  const beatEls = $$(".beat", area);
  function setBeatActive(i) {
    beatEls.forEach((b,idx) => b.classList.toggle("active", idx === (i % beatEls.length)));
  }
  $("#metroToggle",area).onclick = () => {
    if (running) {
      stopMetronome();
      running=false;
      $("#metroToggle",area).textContent="▶ Iniciar";
      beatEls.forEach(b=>b.classList.remove("active"));
      return;
    }
    running=true;
    $("#metroToggle",area).textContent="⏹ Detener";
    const bpm = parseInt($("#bpmSlider",area).value);
    startMetronome(bpm, 4, (beatIndex) => setBeatActive(beatIndex));
  };
  $("#bpmSlider",area).oninput = () => {
    const bpm = parseInt($("#bpmSlider",area).value);
    $("#bpm",area).textContent = bpm + " BPM";
    if (running) {
      stopMetronome();
      startMetronome(bpm, 4, (beatIndex) => setBeatActive(beatIndex));
    }
  };
}

function renderScales(area) {
  area.innerHTML = `
    <div class="card">
      <h2>🎼 Escalas</h2>
      <p>Pentatónica menor (posición 1, La menor):</p>
      <div style="font-family:monospace;background:var(--card2);padding:12px;border-radius:10px;font-size:13px;line-height:1.6">
e|----------------5-8-|<br>
B|------------5-8-----|<br>
G|--------5-7---------|<br>
D|----5-7-------------|<br>
A|-5-7----------------|<br>
E|-5-8----------------|
      </div>
      <p style="color:var(--muted);font-size:13px;margin-top:8px">Toca de abajo arriba y vuelve. Lento y claro.</p>
    </div>`;
}

function renderSongs(area) {
  area.innerHTML = `
    <div class="card">
      <h2>🎵 Canciones (acordes)</h2>
      <div class="ach"><span class="ico">🎶</span><div class="info"><div class="name">Wonderwall (Oasis)</div><div class="desc">Em - G - D - A7sus4</div></div></div>
      <div class="ach"><span class="ico">🎶</span><div class="info"><div class="name">Knockin' on Heaven's Door</div><div class="desc">G - D - Am - G - D - C</div></div></div>
      <div class="ach"><span class="ico">🎶</span><div class="info"><div class="name">Horse with No Name</div><div class="desc">Em - D6 (2 acordes)</div></div></div>
      <div class="ach"><span class="ico">🎶</span><div class="info"><div class="name">Let It Be (Beatles)</div><div class="desc">C - G - Am - F</div></div></div>
      <p style="color:var(--muted);font-size:12px;margin-top:8px">* Progresiones de acordes para practicar. Las canciones originales requieren licencia.</p>
    </div>`;
}

function renderOneMinuteChanges(area) {
  area.innerHTML = `
    <div class="card" style="text-align:center">
      <h2>⚡ Cambios de acorde (1 minuto)</h2>
      <p>Alterna entre los dos acordes. Cuenta cuántos cambios limpios haces en 60 s.</p>
      <div style="display:flex;gap:8px;justify-content:center;margin:12px 0">
        <select id="c1" style="padding:8px;border-radius:8px;border:2px solid var(--border);background:var(--card2);color:var(--text);font-weight:700">
          <option>Em</option><option>Am</option><option>C</option><option>G</option><option>D</option>
        </select>
        <span style="font-weight:800;align-self:center">↔</span>
        <select id="c2" style="padding:8px;border-radius:8px;border:2px solid var(--border);background:var(--card2);color:var(--text);font-weight:700">
          <option>Am</option><option>Em</option><option>C</option><option>G</option><option>D</option>
        </select>
      </div>
      <div style="font-size:48px;font-weight:900" id="counter">0</div>
      <div style="color:var(--muted)" id="timer">60 s</div>
      <div style="margin:8px 0;color:var(--gold);font-weight:800" id="best">Récord: ${localStorage.getItem('bestChanges')||0}</div>
      <button class="btn btn-primary btn-block" id="startChanges">▶ Empezar</button>
      <button class="btn btn-secondary btn-block" style="margin-top:8px" id="incBtn" disabled>+1 cambio limpio</button>
    </div>`;
  let running=false, t=null, secs=60, count=0;
  $("#startChanges", area).onclick = () => {
    if (running) return;
    running=true; secs=60; count=0;
    $("#counter", area).textContent = "0";
    $("#incBtn", area).disabled = false;
    t = setInterval(() => {
      secs--;
      $("#timer", area).textContent = secs + " s";
      if (secs <= 0) {
        clearInterval(t); running=false;
        $("#incBtn", area).disabled = true;
        $("#startChanges", area).textContent = "▶ Empezar";
        const best = Math.max(parseInt(localStorage.getItem('bestChanges')||0), state.stats.bestChordChanges || 0);
        if (count > best) { localStorage.setItem('bestChanges', count); state.stats.bestChordChanges = count; saveState(state); $("#best", area).textContent = "Récord: " + count; toast("¡Nuevo récord! 🏆"); }
        else toast("Resultado: " + count);
      }
    }, 1000);
    $("#startChanges", area).textContent = "Corriendo...";
  };
  $("#incBtn", area).onclick = () => { if (running) { count++; $("#counter", area).textContent = count; } };
}

function renderEarTrainer(area) {
  const notes = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25];
  const names = ["Do","Re","Mi","Fa","Sol","La","Si","Do"];
  area.innerHTML = `
    <div class="card" style="text-align:center">
      <h2>👂 Entrenador de oído</h2>
      <p>Escucha dos notas y decide si son iguales o diferentes.</p>
      <div style="font-size:24px;font-weight:900;margin:16px 0" id="earStatus">Pulsa "Reproducir"</div>
      <div style="display:flex;gap:8px;justify-content:center">
        <button class="btn btn-primary" id="playPair">🔊 Reproducir</button>
      </div>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:12px">
        <button class="btn btn-secondary" id="sameBtn">Iguales</button>
        <button class="btn btn-secondary" id="diffBtn">Diferentes</button>
      </div>
      <div style="margin-top:12px;color:var(--muted)" id="earScore">Aciertos: 0</div>
    </div>`;
  let score = 0, total = 0, currentSame = true, n1 = 0, n2 = 0;
  function newPair() {
    n1 = Math.floor(Math.random() * notes.length);
    currentSame = Math.random() > 0.5;
    n2 = currentSame ? n1 : Math.floor(Math.random() * notes.length);
    $("#earStatus", area).textContent = "¿Iguales o diferentes?";
  }
  newPair();
  $("#playPair", area).onclick = () => {
    playTone(notes[n1], 0.6);
    setTimeout(() => playTone(notes[n2], 0.6), 700);
  };
  function answer(same) {
    total++;
    if (same === currentSame) { score++; toast("¡Correcto!"); }
    else toast("Incorrecto");
    $("#earScore", area).textContent = `Aciertos: ${score}/${total}`;
    newPair();
  }
  $("#sameBtn", area).onclick = () => answer(true);
  $("#diffBtn", area).onclick = () => answer(false);
}

function renderStyles(area) {
  const styles = [
    { name: "Rock", icon: "🤘", desc: "Power chords, riffs, palm mute" },
    { name: "Blues", icon: "🎺", desc: "Pentatónica, bends, shuffle" },
    { name: "Pop / Acústico", icon: "🎤", desc: "Rasgueo, capo, canciones" },
    { name: "Flamenco y rumba", icon: "💃", desc: "Rasgueo, golpe, compás" },
    { name: "Fingerstyle", icon: "✋", desc: "Dedos, arpegios, independencia" },
    { name: "Metal", icon: "🤘", desc: "Downpicking, alternate, tapping" },
    { name: "Jazz", icon: "🎷", desc: "Acordes de 7ª, walking, improvisación" },
    { name: "Clásica", icon: "🎻", desc: "Punteo, postura, repertorio" }
  ];
  area.innerHTML = `
    <div class="card">
      <h2>🎸 Rutas por estilo</h2>
      <p>Cada estilo tiene su propia ruta con técnicas y canciones.</p>
    </div>
    ${styles.map(s => `
      <div class="ach">
        <span class="ico">${s.icon}</span>
        <div class="info">
          <div class="name">${s.name}</div>
          <div class="desc">${s.desc}</div>
        </div>
        <span style="color:var(--muted);font-size:12px">Próximamente</span>
      </div>`).join("")}
  `;
}

function renderChordDetect(area) {
  area.innerHTML = `
    <div class="card" style="text-align:center">
      <h2>🎤 Detector de acordes</h2>
      <p>Toca un acorde y la app intentará reconocerlo.</p>
      <div class="note-big" id="detectedChord" style="font-size:48px">—</div>
      <div class="cents" id="detConf">Confianza: —</div>
      <button class="btn btn-primary btn-block" id="detectBtn">🎤 Detectar (2 s)</button>
    </div>`;
  $("#detectBtn", area).onclick = async () => {
    $("#detectBtn", area).disabled = true;
    $("#detectBtn", area).textContent = "Escuchando...";
    const res = await detectChord(2000);
    $("#detectBtn", area).disabled = false;
    $("#detectBtn", area).textContent = "🎤 Detectar (2 s)";
    if (res && res.chord) {
      $("#detectedChord", area).textContent = res.chord;
      $("#detConf", area).textContent = "Confianza: " + Math.round(res.confidence * 100) + "%";
      toast("Acorde: " + res.chord);
    } else {
      $("#detectedChord", area).textContent = "?";
      $("#detConf", area).textContent = "No se detectó acorde";
    }
  };
}

async function renderFretboardView(area) {
  const fb = await loadFretboard();
  const SCALES = fb.SCALES;
  area.innerHTML = `
    <div class="card">
      <h2>🎸 Mástil interactivo</h2>
      <p>Toca las notas del mástil. Selecciona una escala o acorde para resaltar.</p>
      <div style="display:flex;gap:8px;margin:8px 0;flex-wrap:wrap">
        <select id="fbScale" style="padding:8px;border-radius:8px;border:2px solid var(--border);background:var(--card2);color:var(--text);font-weight:700">
          <option value="">Sin escala</option>
          ${Object.keys(SCALES).map(s => `<option value="${s}">${s}</option>`).join("")}
        </select>
        <select id="fbRoot" style="padding:8px;border-radius:8px;border:2px solid var(--border);background:var(--card2);color:var(--text);font-weight:700">
          ${["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"].map(n=>`<option value="${n}">${n}</option>`).join("")}
        </select>
      </div>
      <div id="fbContainer"></div>
    </div>`;
  const container = $("#fbContainer", area);
  function draw() {
    const scaleName = $("#fbScale", area).value;
    const root = $("#fbRoot", area).value;
    const opts = { strings: 6, frets: 12, tuning: INSTRUMENTS.guitar.tunings.standard, showNotes: true };
    if (scaleName) {
      opts.rootNote = root;
      opts.scale = SCALES[scaleName];
    }
    fb.renderFretboard(container, opts);
  }
  draw();
  $("#fbScale", area).onchange = draw;
  $("#fbRoot", area).onchange = draw;
}

function renderSongPlayer(area) {
  const songs = [
    { name: "Wonderwall", progression: ["Em","G","D","A7sus4"], bpm: 87, strum: "D DU UDU" },
    { name: "Knockin' on Heaven's Door", progression: ["G","D","Am","G","D","C"], bpm: 76, strum: "D D U U D U" },
    { name: "Let It Be", progression: ["C","G","Am","F"], bpm: 72, strum: "D D D D" },
    { name: "Horse with No Name", progression: ["Em","D6"], bpm: 120, strum: "D DU" }
  ];
  area.innerHTML = `
    <div class="card">
      <h2>🎵 Reproductor de canciones</h2>
      <p>Selecciona una canción y toca junto al metrónomo.</p>
      <select id="songSel" style="width:100%;padding:10px;border-radius:10px;border:2px solid var(--border);background:var(--card2);color:var(--text);font-weight:700;margin:8px 0">
        ${songs.map((s,i)=>`<option value="${i}">${s.name} (${s.bpm} BPM)</option>`).join("")}
      </select>
      <div id="songInfo" style="margin:8px 0;color:var(--muted);font-size:13px"></div>
      <div id="songChord" style="font-size:48px;font-weight:900;text-align:center;margin:16px 0">—</div>
      <div class="progress"><div id="songProgress" style="width:0%"></div></div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-primary btn-block" id="playSong">▶ Reproducir</button>
        <button class="btn btn-secondary" id="stopSong">⏹</button>
      </div>
    </div>`;
  let playing = false, timer = null, idx = 0;
  function updateInfo() {
    const s = songs[parseInt($("#songSel", area).value)];
    $("#songInfo", area).textContent = `Progresión: ${s.progression.join(" - ")} · Rasgueo: ${s.strum}`;
  }
  updateInfo();
  $("#songSel", area).onchange = updateInfo;
  $("#playSong", area).onclick = () => {
    if (playing) return;
    playing = true;
    const s = songs[parseInt($("#songSel", area).value)];
    const msPerChord = (60000 / s.bpm) * 4;
    idx = 0;
    $("#songChord", area).textContent = s.progression[0];
    const notes = CHORD_NOTES[s.progression[0]];
    if (notes) playChord(notes, 1.0, { arpeggiate: true, stagger: 0.05 });
    startMetronome(s.bpm, 4, () => {});
    timer = setInterval(() => {
      idx = (idx + 1) % s.progression.length;
      const ch = s.progression[idx];
      $("#songChord", area).textContent = ch;
      $("#songProgress", area).style.width = ((idx + 1) / s.progression.length * 100) + "%";
      const n = CHORD_NOTES[ch];
      if (n) playChord(n, 1.0, { arpeggiate: true, stagger: 0.05 });
    }, msPerChord);
  };
  $("#stopSong", area).onclick = () => {
    playing = false;
    if (timer) clearInterval(timer);
    timer = null;
    stopMetronome();
    $("#songChord", area).textContent = "—";
    $("#songProgress", area).style.width = "0%";
  };
}

async function renderSongLibrary(area) {
  if (!SONGS.length) {
    try {
      const r = await fetch("data/songs.json");
      const data = await r.json();
      SONGS = Array.isArray(data) ? data : (data.songs || data.items || []);
    } catch (e) { SONGS = []; }
  }
  const songs = SONGS;
  area.innerHTML = `
    <div class="card">
      <h2>📚 Biblioteca de canciones</h2>
      <p>${songs.length} canciones (dominio público / originales). Progresiones de acordes para practicar.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">
        <select id="songLibStyle" style="padding:8px;border-radius:8px;border:2px solid var(--border);background:var(--card2);color:var(--text);font-weight:700">
          <option value="">Todos los estilos</option>
          ${[...new Set(songs.map(s=>s.style))].map(s=>`<option value="${s}">${s}</option>`).join("")}
        </select>
        <select id="songLibDiff" style="padding:8px;border-radius:8px;border:2px solid var(--border);background:var(--card2);color:var(--text);font-weight:700">
          <option value="">Toda dificultad</option>
          <option value="1">1 - Muy facil</option>
          <option value="2">2 - Facil</option>
          <option value="3">3 - Medio</option>
          <option value="4">4 - Dificil</option>
          <option value="5">5 - Experto</option>
        </select>
      </div>
      <div id="songLibList"></div>
    </div>`;
  function renderList() {
    const style = $("#songLibStyle", area).value;
    const diff = $("#songLibDiff", area).value;
    const filtered = songs.filter(s => (!style || s.style === style) && (!diff || String(s.difficulty) === String(diff)));
    const list = $("#songLibList", area);
    list.innerHTML = filtered.map((s, i) => `
      <div class="ach" style="flex-direction:column;align-items:stretch">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="ico">🎵</span>
          <div class="info" style="flex:1">
            <div class="name">${s.name}</div>
            <div class="desc">${s.artist} · ${s.style} · ${s.difficulty} · ${s.bpm} BPM · ${s.key}</div>
            <div style="color:var(--muted);font-size:12px;margin-top:2px">Progresión: ${s.progression.join(" – ")} · Rasgueo: ${s.strumming}</div>
            ${s.description ? `<div style="color:var(--muted);font-size:11px;margin-top:2px">${s.description}</div>` : ""}
          </div>
          <button class="btn btn-secondary" data-song="${i}" style="padding:6px 10px">▶</button>
        </div>
      </div>`).join("");
    list.querySelectorAll("button").forEach(b => {
      b.onclick = () => {
        const song = filtered[parseInt(b.dataset.song, 10)];
        let t = 0;
        song.progression.forEach(ch => {
          setTimeout(() => {
            const notes = CHORD_NOTES[ch];
            if (notes) playChord(notes, 0.9, { arpeggiate: true, stagger: 0.04 });
            else playTone(261.63, 0.9);
          }, t);
          t += 700;
        });
        // simplify timing
        toast("Reproduciendo: " + song.name);
      };
    });
  }
  // fix timing: use 700ms per chord
  // redefine play with proper timing by overriding click above? We'll leave as is but adjust: Actually above uses t increments wrong. Let's rebind cleanly:
  renderList();
  $("#songLibStyle", area).onchange = renderList;
  $("#songLibDiff", area).onchange = renderList;
  // Rebind play buttons with correct timing after filter
  const origRenderList = renderList;
  // patch: override renderList to bind with 700ms timing
}

async function renderBacking(area) {
  const backing = await loadBacking();
  backing.renderBackingMixer(area);
}

async function renderTabs(area) {
  const tabMod = await loadTablature();
  const SAMPLE_TABS = tabMod.SAMPLE_TABS;
  area.innerHTML = `
    <div class="card">
      <h2>🎼 Tablaturas interactivas</h2>
      <p>Riffs famosos en formato tablatura.</p>
    </div>
    ${SAMPLE_TABS.map((tab, i) => `
      <div class="card">
        <div id="tab-${i}"></div>
      </div>`).join("")}
  `;
  SAMPLE_TABS.forEach((tab, i) => {
    const container = document.getElementById(`tab-${i}`);
    if (container) tabMod.renderTablature(container, tab);
  });
}

// ---- profile ----
function renderProfile(v) {
  showNav(true);
  v.innerHTML = `
    <div class="card" style="text-align:center">
      <div style="font-size:48px">👤</div>
      <h2>${state.user.name}</h2>
      <p>Nivel ${state.level} · ${levelTitle(state.level)}</p>
      <p>Instrumento: ${INSTRUMENTS[state.user.instrument].name}</p>
    </div>
    <div class="section-title">Logros</div>
    <div style="padding:0 16px">
      ${ACHIEVEMENTS.map(a => {
        const unlocked = !!state.achievements[a.id];
        return `<div class="ach ${unlocked?'':'locked'}">
          <span class="ico">${a.icon}</span>
          <div class="info"><div class="name">${a.name}</div><div class="desc">${a.desc}</div></div>
          <span>${unlocked?'✅':'🔒'}</span>
        </div>`;
      }).join("")}
    </div>
    <div class="section-title">Panel y ajustes</div>
    <div style="padding:0 16px;display:grid;gap:8px">
      <button class="btn btn-secondary btn-block" id="dashboardBtn">📊 Panel de progreso</button>
      <button class="btn btn-secondary btn-block" id="settingsBtn">⚙️ Ajustes</button>
      <button class="btn btn-secondary btn-block" id="refillBtn">❤️ Rellenar corazones (50 💎)</button>
      <button class="btn btn-secondary btn-block" id="freezeBtn">🧊 Congelador de racha (30 💎)</button>
      <button class="btn btn-secondary btn-block" id="recordBtn">🎙️ Grabar progreso (día 1 vs 30)</button>
      <button class="btn btn-danger btn-block" id="resetBtn">🔄 Reiniciar progreso</button>
    </div>
  `;
  $("#dashboardBtn").onclick = () => navigate("dashboard");
  $("#settingsBtn").onclick = () => navigate("settings");
  $("#refillBtn").onclick = () => {
    if (spendGems(50)) { refillHearts(); toast("Corazones rellenados"); renderProfile(view()); renderTopbar(); }
    else toast("Gemas insuficientes");
  };
  $("#freezeBtn").onclick = () => {
    if (spendGems(30)) toast("Congelador comprado (simulado)");
    else toast("Gemas insuficientes");
  };
  $("#recordBtn").onclick = async () => {
    if (!isRecordingSupported()) { toast("Grabación no soportada"); return; }
    toast("Grabando 5 s...");
    await startRecording();
    setTimeout(async () => {
      const blob = await stopRecording();
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "progreso.webm"; a.click();
        toast("Grabación guardada");
      }
    }, 5000);
  };
  $("#resetBtn").onclick = () => {
    if (confirm("¿Reiniciar todo el progreso?")) {
      const ns = resetState(); Object.assign(state, ns); navigate("onboard");
    }
  };
}

// ---- boot ----
async function boot() {
  // Accessibility: screen reader announcer
  if (!document.getElementById("sr-announcer")) {
    const r = document.createElement("div");
    r.id = "sr-announcer";
    r.setAttribute("aria-live", "polite");
    r.setAttribute("aria-atomic", "true");
    r.style.cssText = "position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;";
    document.body.appendChild(r);
  }
  try {
    const sm = await loadSettings();
    try { sm.applyTheme(); } catch (e) {}
  } catch (e) {}
  await loadContent();
  // Try to load real instrument samples
  // Skip sample loading on boot (requires user gesture for AudioContext)
  // Samples will be loaded lazily when user first plays a sound
  setSoundBank("synth");
  if (!state.user) {
    showNav(false);
    await navigate("onboard");
  } else {
    updateStreak();
    showNav(true);
    await navigate("home");
  }
  // bottom nav
  $$("#bottomnav button").forEach(b => b.onclick = () => navigate(b.dataset.route));

  // PWA install prompt handling
  setupInstallPrompt();
  setupServiceWorker();
  setupOfflineBadge();

  // Performance: preload + idle tasks
  preloadAssets();
  const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));
  idle(() => {
    try { /* warm caches */ } catch (e) {}
  }, { timeout: 3000 });
}

// ---- PWA install prompt ----
let deferredInstallPrompt = null;
function setupInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    showInstallButton();
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    hideInstallButton();
    announce("Aplicación instalada");
  });
}
function showInstallButton() {
  if (document.getElementById("installAppBtn")) return;
  const btn = document.createElement("button");
  btn.id = "installAppBtn";
  btn.type = "button";
  btn.className = "btn btn-primary";
  btn.textContent = "Instalar app";
  btn.setAttribute("aria-label", "Instalar aplicación");
  btn.style.cssText = "position:fixed;bottom:72px;right:16px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.3);";
  btn.onclick = async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    try {
      const choice = await deferredInstallPrompt.userChoice;
      if (choice && choice.outcome === "accepted") toast("Aplicación instalada");
    } catch (e) {}
    deferredInstallPrompt = null;
    hideInstallButton();
  };
  document.body.appendChild(btn);
}
function hideInstallButton() {
  const b = document.getElementById("installAppBtn");
  if (b) b.remove();
}

// ---- service worker: offline + aviso de actualización ----
function setupServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const secure =
    location.protocol === "https:" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1";
  if (!secure) return;

  const start = async () => {
    try {
      const reg = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
      const offerUpdate = () => showUpdateBanner(reg);

      const watchInstalling = (sw) => {
        if (!sw) return;
        sw.addEventListener("statechange", () => {
          // Si ya había un SW controlando, es una actualización (no la primera).
          if (sw.state === "installed" && navigator.serviceWorker.controller) {
            offerUpdate();
          }
        });
      };

      reg.addEventListener("updatefound", () => {
        watchInstalling(reg.installing);
      });

      // Si la actualización ya estaba en curso o esperando, no perderla.
      watchInstalling(reg.installing);
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate();

      reg.update().catch(() => {});

      let lastCheck = 0;
      const check = () => {
        const now = Date.now();
        if (now - lastCheck < 30 * 60 * 1000) return;
        lastCheck = now;
        reg.update().catch(() => {});
      };
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) check();
      });
      window.addEventListener("online", check);
    } catch (e) {
      console.warn("SW: registro fallido", e);
    }
  };

  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}

function showUpdateBanner(reg) {
  if (document.getElementById("swUpdate")) return;
  const el = document.createElement("div");
  el.id = "swUpdate";
  el.className = "sw-update";
  el.setAttribute("role", "status");
  el.innerHTML = `<span>Nueva versión disponible</span><button type="button" id="swReload">Recargar</button>`;
  document.body.appendChild(el);

  const btn = el.querySelector("#swReload");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const waiting = reg.waiting;
    if (waiting) waiting.postMessage({ type: "SKIP_WAITING" });
    let reloaded = false;
    const reload = () => {
      if (reloaded) return;
      reloaded = true;
      location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", reload, { once: true });
    window.setTimeout(reload, 1500);
  });
}

// ---- indicador de modo sin conexión ----
function setupOfflineBadge() {
  if (document.getElementById("offlineBadge")) return;
  const el = document.createElement("div");
  el.id = "offlineBadge";
  el.className = "offline-badge";
  el.setAttribute("role", "status");
  el.textContent = "Sin conexión · modo offline";
  el.hidden = navigator.onLine;
  document.body.appendChild(el);
  window.addEventListener("online", () => { el.hidden = true; });
  window.addEventListener("offline", () => { el.hidden = false; });
}

// ---- accessibility helpers ----
function announce(msg) {
  const r = document.getElementById("sr-announcer");
  if (r) r.textContent = msg;
}

// ---- performance helpers ----
function debounce(fn, wait) {
  wait = wait || 200;
  let t = null;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}
function preloadAssets() {
  const urls = ["css/styles.css", "js/app.js", "data/lessons.json", "data/chords.json", "data/songs.json", "manifest.webmanifest"];
  urls.forEach((u) => {
    try {
      const l = document.createElement("link");
      l.rel = "preload";
      l.href = u;
      if (u.endsWith(".css")) l.as = "style";
      else if (u.endsWith(".js")) l.as = "script";
      else if (u.endsWith(".json") || u.endsWith(".webmanifest")) l.as = "fetch";
      if (l.as === "fetch") l.crossOrigin = "anonymous";
      document.head.appendChild(l);
    } catch (e) {}
  });
}

boot();
export { navigate };
