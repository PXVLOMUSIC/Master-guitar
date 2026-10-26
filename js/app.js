import { state, saveState, resetState } from "./storage.js";
import { initI18n, applyDocumentLanguage, t, getCurrentLanguage } from "./i18n.js";
import { INSTRUMENTS, midiToFreq, closestString, centsOff, midiToNote } from "./instruments.js";
import { addXP, updateStreak, checkAchievements, ACHIEVEMENTS, levelTitle, refillHearts, loseHeart, spendGems } from "./gamification.js";
import { startMic, stopMic, playTone, isRunning, playChord, startMetronome, stopMetronome, isMetronomeRunning, detectChord, isRecordingSupported, startRecording, stopRecording, noteToFrequency, setSoundBank, loadInstrumentSamples, warmRealInstruments, setGuitarTone, setEarInstrument, earInstrument } from "./audio.js";
import { initBackend, syncProgress, getSession, getAuthSettings, signInWithProvider } from "./backend.js";
import { renderPracticeHub, openFromHash, closeSection } from "./practice-hub.js";
import { icon } from "./icons.js";
import { mascot, unitCover } from "./art.js";

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
const loadSongPlayer = () => import("./song-player.js");
const loadChordVoicings = () => import("./chord-voicings.js");
const loadImprovisation = () => import("./improvisation.js");

let LESSONS = { units: [], ukulele: [] };
let CHORDS = { guitar: {}, ukulele: {} };
let SONGS = [];

async function localizedDataPath(base, ext) {
  const lang = getCurrentLanguage();
  if (lang && lang !== "es") {
    return `data/${base}.${lang}.${ext}`;
  }
  return `data/${base}.${ext}`;
}

async function fetchJsonWithFallback(primary, fallback) {
  try {
    const r = await fetch(primary, { cache: "no-cache" });
    if (r.ok) return await r.json();
  } catch (e) {}
  const r2 = await fetch(fallback, { cache: "no-cache" });
  return await r2.json();
}

async function loadContent() {
  try {
    const lessonsPath = await localizedDataPath("lessons", "json");
    LESSONS = await fetchJsonWithFallback(lessonsPath, "data/lessons.json");
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
  closeSection({ fromHistory: true });
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
    case "settings": { const m = await loadSettings(); if (!state.settingsVisited) { state.settingsVisited = true; saveState(state); } m.renderSettings(v); break; }
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
      <div class="onboard">${skipButton()}
        <div class="onboard-mascot">${mascot("wave", 128)}</div>
        <h1>${t("onboard.welcome")}</h1>
        <p class="sub">${t("onboard.subtitle")}</p>
        <input id="nameInput" placeholder="${t("onboard.namePlaceholder")}" style="width:100%;padding:14px;border-radius:12px;border:2px solid var(--border);background:var(--card2);color:var(--text);font-size:16px;font-weight:700;margin-top:16px">
        <button class="btn btn-primary btn-block" style="margin-top:16px" id="nextBtn">${t("onboard.continue")}</button>
      </div>`,
    () => `
      <div class="onboard">${skipButton()}
        <h1>${t("onboard.chooseInstrument")}</h1>
        <div class="choices">
          ${Object.entries(INSTRUMENTS).map(([k,ins]) => `
            <div class="choice ${data.instrument===k?'selected':''}" data-ins="${k}" role="button" tabindex="0" aria-label="${ins.name}">
              <span class="ico">${ins.emoji}</span>
              <div><div style="font-weight:800">${ins.name}</div></div>
            </div>`).join("")}
        </div>
        <button class="btn btn-primary btn-block" style="margin-top:16px" id="nextBtn">${t("onboard.continue")}</button>
      </div>`,
    () => `
      <div class="onboard">${skipButton()}
        <h1>${t("onboard.howStart")}</h1>
        <p class="sub">${t("onboard.adapt")}</p>
        <div class="choices">
          <div class="choice selected" data-start="test" role="button" tabindex="0"><span class="ico">🎯</span><div><div style="font-weight:800">${t("onboard.levelTest")} <span class="pill-rec">${t("onboard.recommended")}</span></div><div style="color:var(--muted);font-size:13px">${t("onboard.levelTestDesc")}</div></div></div>
          <div class="choice" data-start="zero" role="button" tabindex="0"><span class="ico">🌱</span><div><div style="font-weight:800">${t("onboard.startZero")}</div><div style="color:var(--muted);font-size:13px">${t("onboard.startZeroDesc")}</div></div></div>
        </div>
      </div>`
  ];

  function draw() {
    v.innerHTML = steps[step]();
    bindSkip(data);
    if (step === 0) {
      const go = () => { data.name = $("#nameInput").value.trim() || "Guitarrista"; step = 1; draw(); };
      $("#nextBtn").onclick = go;
      $("#nameInput").onkeydown = (e) => { if (e.key === "Enter") go(); };
      $("#nameInput").focus();
    } else if (step === 1) {
      $$(".choice").forEach(c => c.onclick = () => { data.instrument = c.dataset.ins; draw(); });
      $("#nextBtn").onclick = () => { step = 2; draw(); };
    } else {
      $$(".choice").forEach(c => c.onclick = () => {
        if (c.dataset.start === "test") startPlacement(data);
        else finishPlacement(data, null);
      });
    }
  }
  draw();
}

// "Omitir" en cualquier paso: guarda lo que haya y va directo a Inicio.
function skipButton() {
  return `<button class="onboard-skip" id="skipOnboard" type="button">${t("onboard.skip")}</button>`;
}
function bindSkip(data) {
  const b = document.getElementById("skipOnboard");
  if (!b) return;
  b.onclick = () => {
    if (!state.user) {
      const input = document.getElementById("nameInput");
      const name = (input && input.value.trim()) || (data && data.name) || "Guitarrista";
      state.user = { name, instrument: (data && data.instrument) || "guitar", level: "beginner" };
      state.settings.instrument = state.user.instrument;
      state.level = state.level || 1;
      updateStreak();
    }
    state.setupDone = true;
    saveState(state);
    navigate("home");
  };
}

// ---- placement test ----
// Cada pregunta suma "w" puntos si se acierta. "No lo sé" cuenta como fallo sin penalizar.
const PLACEMENT_AREAS = { exp: "Experiencia", acordes: "Acordes", teoria: "Teoría", oido: "Oído", ritmo: "Ritmo", tecnica: "Técnica" };

function placementQuestions(ins) {
  const chords = CHORDS[ins === "ukulele" ? "ukulele" : "guitar"] || {};
  const diagram = (name) => (ins !== "bass" && chords[name]) ? renderChordDiagram(chords[name]) : "";
  const triad = (root, minor) => [root, root * Math.pow(2, (minor ? 3 : 4) / 12), root * Math.pow(2, 7 / 12)];
  const q = [
    { area: "exp", w: 0, q: "¿Cuánto tiempo llevas tocando?", opts: ["Nada, empiezo ahora", "Menos de 6 meses", "Entre 6 meses y 2 años", "Más de 2 años"], exp: [0, 2, 5, 8] },
    { area: "exp", w: 0, q: "¿Qué puedes tocar ya?", opts: ["Nada todavía", "Algunos acordes abiertos", "Canciones completas con cejilla", "Solos e improvisación"], exp: [0, 2, 5, 8] },
    { area: "teoria", w: 1, q: ins === "bass" ? "La afinación estándar del bajo de 4 cuerdas es:" : ins === "ukulele" ? "La afinación estándar del ukelele es:" : "La afinación estándar de la guitarra es:",
      opts: ins === "bass" ? ["E A D G", "G C E A", "D A D G", "C G D A"] : ins === "ukulele" ? ["G C E A", "E A D G", "D G B E", "C F A D"] : ["E A D G B E", "D A D G A D", "G C E A", "C G D A E B"], a: 0 },
    diagram("Em")
      ? { area: "acordes", w: 1, q: "¿Qué acorde es este?", html: diagram("Em"), opts: ["Em", "Am", "E", "C"], a: 0 }
      : { area: "acordes", w: 1, q: "¿Qué notas forman el acorde de Do mayor?", opts: ["Do, Mi, Sol", "Do, Re, Mi", "Do, Fa, La", "Do, Mib, Sol"], a: 0 },
    diagram("G")
      ? { area: "acordes", w: 2, q: "¿Y este?", html: diagram("G"), opts: ["D", "G", "C", "Em"], a: 1 }
      : { area: "acordes", w: 2, q: "¿Qué notas forman La menor?", opts: ["La, Do#, Mi", "La, Do, Mi", "La, Re, Mi", "La, Do, Fa"], a: 1 },
    { area: "oido", w: 1, q: "Escucha: ¿el segundo sonido es más agudo o más grave?", play: () => { playTone(220, 0.6); setTimeout(() => playTone(330, 0.6), 700); }, opts: ["Más agudo", "Más grave", "Igual"], a: 0 },
    { area: "oido", w: 2, q: "Escucha el acorde: ¿es mayor o menor?", play: () => playChord(triad(196, true), 2, { instrument: "guitar", stagger: 0.03 }), opts: ["Mayor (alegre)", "Menor (triste)"], a: 1 },
    { area: "ritmo", w: 1, q: "En un compás de 4/4, ¿cuántas negras caben?", opts: ["2", "3", "4", "8"], a: 2 },
    { area: "ritmo", w: 2, q: "Una corchea dura…", opts: ["El doble que una negra", "La mitad que una negra", "Lo mismo que una blanca", "Un compás entero"], a: 1 },
    { area: "teoria", w: 2, q: "La escala pentatónica menor tiene…", opts: ["5 notas", "6 notas", "7 notas", "12 notas"], a: 0 },
    { area: "tecnica", w: 2, q: "¿Qué es un hammer-on?", opts: ["Golpear la caja con la mano", "Hacer sonar una nota pisando el traste sin volver a pulsar la cuerda", "Tocar con púa hacia arriba", "Apagar las cuerdas con la palma"], a: 1 },
    { area: "teoria", w: 3, q: "¿Qué acordes forman un I–IV–V en Sol mayor?", opts: ["G – C – D", "G – Am – D", "G – C – Em", "G – D – Em"], a: 0 },
    { area: "oido", w: 3, q: "Escucha el intervalo: ¿qué distancia hay entre las dos notas?", play: () => { playTone(261.63, 0.7); setTimeout(() => playTone(392, 0.7), 800); }, opts: ["Tercera", "Quinta", "Octava"], a: 1 },
    { area: "tecnica", w: 3, q: "Para tocar un Fa con cejilla en la guitarra, el dedo 1 pisa…", opts: ["Solo la 1ª cuerda", "Todas las cuerdas en el traste 1", "Las cuerdas 3 y 4", "Ninguna, se toca al aire"], a: 1 },
  ];
  return q;
}

function startPlacement(data) {
  const questions = placementQuestions(data.instrument);
  const answers = [];
  let qi = 0;
  const v = view();
  showNav(false);
  function drawQ() {
    if (qi >= questions.length) { finishPlacement(data, scorePlacement(questions, answers)); return; }
    const q = questions[qi];
    const pct = Math.round((qi / questions.length) * 100);
    v.innerHTML = `
      <div class="onboard placement">${skipButton()}
        <div class="placement-top">
          <span class="placement-area">${PLACEMENT_AREAS[q.area]}</span>
          <span style="color:var(--muted);font-size:13px">${qi + 1} / ${questions.length}</span>
        </div>
        <div class="progress"><div style="width:${pct}%"></div></div>
        <div class="qcard" style="margin-top:16px">
          <div class="prompt">${q.q}</div>
          ${q.html ? `<div style="display:flex;justify-content:center;margin-top:12px">${q.html}</div>` : ""}
          ${q.play ? `<button class="btn btn-secondary" id="playQ" style="margin-top:12px">🔊 Escuchar</button>` : ""}
        </div>
        <div class="options">
          ${q.opts.map((o,i)=>`<button class="opt" data-i="${i}">${o}</button>`).join("")}
          ${q.area !== "exp" ? `<button class="auth-link" data-i="-1" style="margin-top:4px">No lo sé</button>` : ""}
        </div>
      </div>`;
    bindSkip(data);
    if (q.play) { $("#playQ").onclick = q.play; setTimeout(q.play, 300); }
    $$("[data-i]", v).forEach(o => o.onclick = () => {
      const i = parseInt(o.dataset.i);
      answers[qi] = i;
      if (q.area !== "exp" && i >= 0) o.classList.add(i === q.a ? "correct" : "wrong");
      qi++;
      setTimeout(drawQ, q.area === "exp" ? 150 : 450);
    });
  }
  drawQ();
}

function scorePlacement(questions, answers) {
  let exp = 0, got = 0, max = 0;
  const areas = {};
  questions.forEach((q, i) => {
    const a = answers[i];
    if (q.area === "exp") { exp += q.exp[a] || 0; return; }
    const ar = areas[q.area] || (areas[q.area] = { got: 0, max: 0 });
    ar.max += q.w; max += q.w;
    if (a === q.a) { ar.got += q.w; got += q.w; }
  });
  // 70% conocimientos + 30% experiencia declarada.
  const pct = Math.round(((got / max) * 0.7 + (exp / 16) * 0.3) * 100);
  return { pct, areas };
}

function finishPlacement(data, result) {
  state.user = { name: data.name, instrument: data.instrument, level: "beginner" };
  state.settings.instrument = data.instrument;
  const all = (LESSONS.units || []).flatMap(u => u.lessons);
  let skip = 0;
  if (result && result.pct >= 70) {
    state.user.level = "advanced"; state.level = 4; skip = 10;
  } else if (result && result.pct >= 35) {
    state.user.level = "intermediate"; state.level = 2; skip = 5;
  } else {
    state.level = 1;
  }
  all.slice(0, skip).forEach(l => { state.completed[l.id] = true; });
  state.stats.lessonsCompleted = Math.min(skip, all.length);
  state.placement = result ? { pct: result.pct, date: new Date().toISOString() } : null;
  updateStreak();
  saveState(state);
  if (result) renderPlacementResult(result);
  else renderWelcomeSetup();
}

function renderPlacementResult(result) {
  const v = view();
  const LV = {
    beginner: { ico: "🌱", name: "Principiante", txt: "Empezarás por lo básico: postura, afinación y tus primeros acordes." },
    intermediate: { ico: "🌿", name: "Intermedio", txt: "Hemos marcado como hechas las 5 primeras lecciones. Vas directo a cambios de acorde y ritmo." },
    advanced: { ico: "🌳", name: "Avanzado", txt: "Hemos marcado como hechas las 10 primeras lecciones. Tu rutina incluye técnica y oído avanzados." }
  }[state.user.level];
  const rows = Object.entries(result.areas).map(([k, a]) => {
    const p = Math.round((a.got / a.max) * 100);
    return `<div class="placement-row"><span>${PLACEMENT_AREAS[k]}</span><div class="progress"><div style="width:${p}%"></div></div><b>${p}%</b></div>`;
  }).join("");
  v.innerHTML = `
    <div class="onboard">${skipButton()}
      <div class="onboard-mascot">${mascot("cheer", 128)}</div>
      <h1>${LV.ico} Nivel ${LV.name}</h1>
      <p class="sub">${LV.txt}</p>
      <div class="card" style="text-align:left;margin:16px 0 0">${rows}</div>
      <button class="btn btn-primary btn-block" style="margin-top:16px" id="nextBtn">${t("onboard.continue")}</button>
    </div>`;
  bindSkip();
  $("#nextBtn").onclick = renderWelcomeSetup;
}

// Último paso: recordatorios y sugerencia de pasar por Ajustes.
function renderWelcomeSetup() {
  const v = view();
  showNav(false);
  const cap = window.Capacitor;
  const supported = "Notification" in window || !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const hour = state.settings.reminderHour ?? 19;
  v.innerHTML = `
    <div class="onboard">${skipButton()}
      <div class="onboard-mascot">${mascot("think", 120)}</div>
      <h1>¿Te recordamos practicar?</h1>
      <p class="sub">Quince minutos al día valen más que dos horas el domingo. Te avisamos una vez al día, a la hora que elijas.</p>
      ${supported ? `
        <label class="setup-hour">Avisarme a las
          <select id="hourSel">${Array.from({ length: 17 }, (_, i) => i + 7).map(h => `<option value="${h}" ${h === hour ? "selected" : ""}>${h}:00</option>`).join("")}</select>
        </label>
        <button class="btn btn-primary btn-block" style="margin-top:12px" id="notifYes">Activar recordatorios</button>`
      : `<p class="sub">Este navegador no permite notificaciones.</p>`}
      <button class="auth-link" id="notifNo" style="margin-top:8px">${t("home.cloudLater")}</button>
    </div>`;
  bindSkip();
  const next = () => renderSettingsTip();
  if (supported) $("#notifYes").onclick = async () => {
    const btn = $("#notifYes"); btn.disabled = true;
    const m = await loadSettings();
    const ok = await m.requestNotificationPermission();
    if (ok) { m.scheduleReminder(parseInt($("#hourSel").value)); toast("Recordatorio activado 🔔"); }
    else toast("Puedes activarlos luego en Ajustes");
    next();
  };
  $("#notifNo").onclick = next;
}

function renderSettingsTip() {
  const v = view();
  v.innerHTML = `
    <div class="onboard">${skipButton()}
      <div class="emoji">⚙️</div>
      <h1>Un último paso</h1>
      <p class="sub">Te recomendamos pasar por Ajustes para dejar la app a tu gusto:</p>
      <div class="card" style="text-align:left;margin:16px 0 0">
        <p>🎯 <b>Objetivo diario</b> de práctica</p>
        <p>🔊 <b>Sonido y metrónomo</b></p>
        <p>🎼 <b>Afinación de referencia</b> (440 Hz)</p>
        <p style="margin-bottom:0">☁️ <b>Cuenta</b> para guardar tu progreso</p>
      </div>
      <button class="btn btn-primary btn-block" style="margin-top:16px" id="goSettings">Ir a Ajustes</button>
      <button class="auth-link" id="goHome" style="margin-top:8px">Más tarde</button>
    </div>`;
  bindSkip();
  const done = (route) => {
    state.setupDone = true; saveState(state);
    toast("¡Bienvenido, " + state.user.name + "! 🎸");
    navigate(route);
  };
  $("#goSettings").onclick = () => done("settings");
  $("#goHome").onclick = () => done("home");
}

// ---- home ----
function renderHome(v) {
  showNav(true);
  if (!state.user) { navigate("onboard"); return; }
  const ins = INSTRUMENTS[state.user.instrument];
  const dailyDone = state.dailyChallengeDone === new Date().toDateString();
  const todayKey = new Date().toDateString();
  const planDays = new Set([
    ...(state.practiceDays || []),
    ...Object.keys(state.dailyLog || {}),
    ...Object.keys(state.practiceLog || {})
  ]);
  const planCount = Math.min(30, planDays.size);
  const planPct = Math.round((planCount / 30) * 100);
  const planDone = planCount >= 30;
  const practicedToday = planDays.has(todayKey);
  v.innerHTML = `
    <div class="card" style="text-align:center">
      <div class="home-mascot">${mascot(state.streak > 2 ? "cheer" : "wave", 84)}</div>
      <h2>${t("home.welcome", {name: state.user.name})}</h2>
      <p>${t("home.level", {level: state.level, title: levelTitle(state.level), xp: state.xp, next: state.level*100})}</p>
      <button class="btn btn-primary btn-block" id="continueBtn">${t("home.continue")}</button>
    </div>
    <div id="routineCard"></div>
    ${!state.settingsVisited ? `<div class="card setup-card" id="setupCard">
      <div><b>${t("home.setupTitle")}</b><p>${t("home.setupDesc")}</p></div>
      <div class="setup-card__actions"><button class="btn btn-secondary" id="setupGo">${t("home.setupGo")}</button><button class="auth-link" id="setupLater" aria-label="${t("home.setupHide")}">${t("home.setupHide")}</button></div>
    </div>` : ""}
    ${!getSession().user ? `<div id="cloudCard"></div>` : ""}
    ${state.stats.lessonsCompleted < 10 ? `<div class="card" style="border-color:var(--orange);background:#2a2218">
      <p style="margin:0;font-weight:800;color:var(--orange)">${t("home.tipTitle")}</p>
      <p style="margin:4px 0 0">${t("home.tipBody")}</p>
    </div>` : ""}
    ${getReviewLessons().length ? `<div class="card">
      <h2>${t("home.reviewTitle")}</h2>
      <p>${t("home.reviewDesc")}</p>
      ${getReviewLessons().map(l=>`<button class="btn btn-secondary btn-block" style="margin-top:6px" data-rev="${l.id}">📖 ${l.title}</button>`).join("")}
    </div>` : ""}
    <div class="challenge-card">
      <h3>${t("home.challengeTitle")}</h3>
      <p style="color:var(--muted);font-size:14px;margin:0 0 10px">${dailyDone ? t("home.challengeDone") : t("home.challengeDesc")}</p>
      <button class="btn btn-secondary btn-block" id="dailyBtn" ${dailyDone?"disabled":""}>${dailyDone?t("home.challengeCompleted"):t("home.challengeStart")}</button>
    </div>
    <div class="section-title">${t("home.progressTitle")}</div>
    <div class="card">
      <p>${t("home.lessonsCompleted", {count: state.stats.lessonsCompleted})}</p>
      <p>${t("home.streak", {count: state.streak})}</p>
      <p>${t("home.tunings", {count: state.stats.tunings})}</p>
      <p>${t("home.gems", {count: state.gems})}</p>
    </div>
    <div class="card">
      <h2>${t("home.planTitle")}</h2>
      <p>${planDone ? t("home.planDone") : t("home.planProgress", {count: planCount, pct: planPct})}</p>
      <p style="color:var(--muted);font-size:13px;margin:4px 0 0">${planDone ? t("home.planDoneHint") : practicedToday ? t("home.planTodayHint") : t("home.planStartHint")}</p>
      <div class="progress"><div style="width:${planPct}%"></div></div>
    </div>
    <div class="section-title">${t("home.quickAccess")}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 16px">
      <button class="btn btn-secondary" id="quickTuner">${t("home.tuner")}</button>
      <button class="btn btn-secondary" id="quickPractice">${t("home.practice")}</button>
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
  const sg = $("#setupGo"); if (sg) sg.onclick = () => navigate("settings");
  const sl = $("#setupLater"); if (sl) sl.onclick = () => { state.settingsVisited = true; saveState(state); $("#setupCard").remove(); };
  hydrateRoutineCard();
  hydrateCloudCard();
}

// Rutina de hoy en Inicio: bloques, minutos y estado.
async function hydrateRoutineCard() {
  const box = document.getElementById("routineCard");
  if (!box) return;
  let r;
  try { r = (await loadPracticeRoutines()).getTodayRoutine(); } catch (e) { return; }
  if (!document.body.contains(box)) return;
  const LV = { beginner: "principiante", intermediate: "intermedio", advanced: "avanzado" };
  box.innerHTML = `
    <div class="card routine-card ${r.done ? "is-done" : ""}">
      <div class="routine-card__head">
        <div>
          <span class="routine-card__kicker">${t("home.routineTitle")}</span>
          <h2>${r.done ? t("home.routineDone") : t("home.routineMinutes", {total: r.total})}</h2>
          <p>${t("home.routineLevel", {level: LV[r.level] || r.level, today: r.minutesToday ? t("home.routineTodayMinutes", {minutes: Math.round(r.minutesToday)}) : ""})}</p>
        </div>
        <span class="routine-card__ring" style="--p:${r.done ? 100 : Math.min(100, Math.round((r.minutesToday / r.total) * 100))}">${r.done ? "✓" : r.total + "'"}</span>
      </div>
      <ol class="routine-card__blocks">
        ${r.blocks.map(b => `<li><span>${b.icon}</span><b>${b.name}</b><em>${b.duration} min</em></li>`).join("")}
      </ol>
      <button class="btn ${r.done ? "btn-secondary" : "btn-primary"} btn-block" id="routineGo">${r.done ? t("home.routineRepeat") : t("home.routineStart")}</button>
    </div>`;
  box.querySelector("#routineGo").onclick = () => {
    history.replaceState(null, "", "#practicar/hoy");
    navigate("practice");
  };
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
          <b>${t("home.cloudSave")}</b>
          <p>${t("home.cloudSync")}</p>
        </div>
      </div>
      ${google
        ? `<button class="btn btn-primary btn-block" id="cloudGoogle" type="button">${t("home.cloudGoogle")}</button>`
        : `<button class="btn btn-secondary btn-block" id="cloudOpen" type="button">${t("home.cloudOpen")}</button>`}
      <button class="auth-link" id="cloudLater" type="button">${t("home.cloudLater")}</button>
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
  v.innerHTML = `<div class="path"><h2 style="margin:0 0 8px">${t("learn.title")}</h2>
    <p style="color:var(--muted);font-size:13px;margin:0 0 12px">${t("learn.instrument", {name: INSTRUMENTS[state.user.instrument].name})}</p></div>`;
  const path = $(".path", v);
  units.forEach((u, ui) => {
    const header = document.createElement("div");
    header.className = "unit-header unit-header--cover";
    header.innerHTML = unitCover(u, ui, u.lessons.filter(l => state.completed[l.id]).length, u.lessons.length);
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
  });
  // ukulele toggle
  const toggle = document.createElement("div");
  toggle.style.cssText = "padding:16px;text-align:center";
  toggle.innerHTML = `<button class="btn btn-ghost" id="switchIns">${isUk ? t("learn.switchToGuitar") : t("learn.switchToUkulele")}</button>`;
  path.appendChild(toggle);
  $("#switchIns").onclick = async () => {
    const newIns = isUk ? "guitar" : "ukulele";
    state.settings.instrument = newIns;
    state.user.instrument = newIns;
    saveState(state);
    try { await loadInstrumentSamples(newIns); setSoundBank("samples"); } catch (e) {}
    renderLearn(v);
    toast(t("learn.instrumentChanged", {name: INSTRUMENTS[newIns].name}));
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
  ctrl.innerHTML = `<button class="btn btn-primary btn-block" id="contBtn">${t("lesson.continue")}</button>`;
  $("#contBtn").onclick = () => nextStep(view());
}

function renderDemo(qc, ctrl, step) {
  const chord = step.chord ? CHORDS.guitar[step.chord] || CHORDS.ukulele[step.chord] : null;
  let chordHtml = "";
  if (chord) chordHtml = renderChordDiagram(chord);
  qc.innerHTML = `
    <div class="prompt">${step.title || t("lesson.demo")}</div>
    <div class="sub">${step.text || ""}</div>
    ${chordHtml}
    ${step.freq ? `<div style="margin-top:12px"><button class="btn btn-secondary" id="playBtn">${t("lesson.listen")}</button></div>` : ""}
  `;
  if (step.freq) $("#playBtn").onclick = () => playTone(step.freq);
  if (step.chord) {
    const btn = document.createElement("button");
    btn.className = "btn btn-secondary btn-block"; btn.style.marginTop = "10px";
    btn.textContent = t("lesson.listenChord");
    btn.onclick = () => {
      const notes = CHORD_NOTES[step.chord];
      if (notes) playChord(notes, 1.4, { arpeggiate: true, stagger: 0.08 });
      else playTone(CHORD_FREQS[step.chord] || 261.63);
    };
    ctrl.appendChild(btn);
  }
  const cont = document.createElement("button");
  cont.className = "btn btn-primary btn-block"; cont.style.marginTop = "10px";
  cont.textContent = t("lesson.continue");
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
  ctrl.innerHTML = `<button class="btn btn-primary btn-block" id="contBtn">${t("lesson.continue")}</button>`;
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
      ${newAch.length ? `<div style="margin-top:10px">${newAch.map(a=>`<div class="ach"><span class="ico">${a.icon}</span><div class="info"><div class="name">${t(a.name)}</div><div class="desc">${t(a.desc)}</div></div></div>`).join("")}</div>` : ""}
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
      <h2 style="margin:0 0 12px;text-align:center">${t("tuner.title")}</h2>
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
        <button class="btn btn-secondary" id="chromaticBtn" style="padding:8px 14px;font-size:13px;${tunerState.chromatic?'border-color:var(--green);background:#2d4a2d':''}">${tunerState.chromatic?t('tuner.chromatic'):t('tuner.byString')}</button>
        <button class="btn btn-secondary" id="muteBtn" style="padding:8px 14px;font-size:13px">${tunerState.muteChime?t('tuner.muted'):t('tuner.sound')}</button>
        <button class="btn btn-secondary" id="continuousBtn" style="padding:8px 14px;font-size:13px;${tunerState.continuous?'border-color:var(--green);background:#2d4a2d':''}">${tunerState.continuous?t('tuner.stopTone'):t('tuner.continuousTone')}</button>
        <button class="btn btn-secondary" id="autoTuneBtn" style="padding:8px 14px;font-size:13px;${tunerState.autoTune?'border-color:var(--green);background:#2d4a2d':''}">${t("tuner.tuneAll")}</button>
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
        <div style="font-size:16px;color:var(--muted);margin-top:4px" id="tNoteFull">${t("tuner.playString")}</div>
        <div class="cents" id="tCents" style="font-size:18px;margin-top:8px;font-weight:700">—</div>
        <div id="fineTune" style="font-size:13px;color:var(--green);margin-top:4px;min-height:18px"></div>
        <!-- Meter bar -->
        <div style="margin:16px 0;position:relative">
          <div class="meter" style="height:20px;background:var(--border);border-radius:10px;position:relative;overflow:hidden">
            <div class="zone" style="position:absolute;top:0;height:100%;background:rgba(88,204,2,0.2);left:42%;width:16%;border-left:2px solid var(--green);border-right:2px solid var(--green)"></div>
            <div id="needle" style="position:absolute;top:0;width:4px;height:100%;background:var(--red);left:50%;transform:translateX(-50%);transition:left 0.1s,bbackground 0.3s;border-radius:2px"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:4px">
            <span>${t("tuner.low")}</span>
            <span style="color:var(--green);font-weight:800">${t("tuner.inTune")}</span>
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
  { id: "songs", cat: "songs", icon: "🎵", title: "Progresiones con banda", desc: "50 progresiones con batería, bajo y guitarra reales. Base rítmica 4/4 simplificada.", tags: ["50 progresiones"], keywords: "cancion tocar banda play along acordes", mount: (el) => renderSongs(el) },
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

// Al cambiar de herramienta o cerrar una sección se para todo lo que suene.
function stopPracticeAudio() {
  if (isMetronomeRunning()) stopMetronome();
  if (isRunning()) stopMic();
  loadBacking().then((m) => { if (m.isBackingRunning()) m.stopBackingTrack(); }).catch(() => {});
  loadSongPlayer().then((m) => m.stopSongPlayer()).catch(() => {});
}

function renderPractice(v) {
  showNav(true);
  renderPracticeHub(v, PRACTICE_TOOLS, stopPracticeAudio);
  openFromHash(PRACTICE_TOOLS, stopPracticeAudio);
}

function renderChordLibrary(area) {
  const ins = state.settings.instrument === "ukulele" ? "ukulele" : "guitar";
  const chords = CHORDS[ins];
  area.innerHTML = `<div class="section-title" style="margin-left:0">Acordes de ${ins === "ukulele" ? "ukelele" : "guitarra"}</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px" id="chordChips"></div>
    <div id="chordView"></div>`;
  const chips = $("#chordChips", area);
  Object.keys(chords).forEach(name => {
    const c = document.createElement("button");
    c.className = "btn btn-secondary chord-chip"; c.style.padding = "8px 12px"; c.textContent = name;
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
      <div style="margin-top:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-primary" id="strumChord">Rasguear</button>
        <button class="btn btn-secondary" id="arpChord">Arpegio</button>
      </div>
    </div>`;
  const ins = state.settings.instrument === "ukulele" ? "ukulele" : "guitar";
  const freqs = chordShapeFreqs(chord, ins) || CHORD_NOTES[name] || [CHORD_FREQS[name] || 261.63];
  $("#strumChord").onclick = () => playChord(freqs, 2.2, { instrument: ins, stagger: 0.022 });
  $("#arpChord").onclick = () => playChord(freqs, 2.4, { instrument: ins, arpeggiate: true, stagger: 0.2 });
}

// Frecuencias reales de un diagrama (trastes por cuerda, -1 = no se toca).
function chordShapeFreqs(chord, ins) {
  const open = INSTRUMENTS[ins] && INSTRUMENTS[ins].tunings.standard;
  if (!chord || !Array.isArray(chord.frets) || !open || chord.frets.length !== open.length) return null;
  const freqs = chord.frets
    .map((fret, i) => (fret >= 0 ? open[i] * Math.pow(2, fret / 12) : null))
    .filter((f) => f != null);
  return freqs.length ? freqs : null;
}

function beatsForTimeSignature(sig) {
  if (sig === "3/4") return 3;
  if (sig === "6/8") return 6;
  return 4;
}

function renderMetronome(area) {
  area.innerHTML = `
    <div class="card" style="text-align:center">
      <h2>⏱ Metrónomo</h2>
      <div style="font-size:32px;font-weight:900;margin:12px 0" id="bpm">100 BPM</div>
      <input type="range" min="40" max="220" value="100" id="bpmSlider" style="width:100%">
      <div style="display:flex;justify-content:center;gap:8px;margin:10px 0;flex-wrap:wrap">
        <label style="font-weight:800;font-size:13px">Compás
          <select id="timeSigSel" style="margin-left:6px;padding:6px 8px;border-radius:10px;border:2px solid var(--border);background:var(--card-2);color:var(--text);font-weight:700">
            <option value="4/4">4/4</option>
            <option value="3/4">3/4</option>
            <option value="6/8">6/8</option>
          </select>
        </label>
      </div>
      <div class="metro" id="beats"></div>
      <button class="btn btn-primary btn-block" id="metroToggle">▶ Iniciar</button>
      <p style="color:var(--muted);font-size:12px;margin:8px 0 0">6/8 se marca en 6 pulsos (negra con puntillo = 3 pulsos).</p>
    </div>`;
  let beatsCount = 4;
  const beatsContainer = $("#beats", area);
  function rebuildBeats() {
    beatsContainer.innerHTML = "";
    for (let i=0;i<beatsCount;i++){const b=document.createElement("div");b.className="beat";beatsContainer.appendChild(b);}
  }
  rebuildBeats();
  let running=false;
  let beatEls = $$(".beat", area);
  function setBeatActive(i) {
    beatEls.forEach((b,idx) => b.classList.toggle("active", idx === (i % beatEls.length)));
  }
  const getTimeSig = () => $("#timeSigSel", area).value;
  $("#timeSigSel", area).onchange = () => {
    beatsCount = beatsForTimeSignature(getTimeSig());
    rebuildBeats();
    beatEls = $$(".beat", area);
    if (running) {
      stopMetronome();
      const bpm = parseInt($("#bpmSlider",area).value);
      startMetronome(bpm, beatsCount, (beatIndex) => setBeatActive(beatIndex));
    }
  };
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
    beatsCount = beatsForTimeSignature(getTimeSig());
    rebuildBeats();
    beatEls = $$(".beat", area);
    const bpm = parseInt($("#bpmSlider",area).value);
    startMetronome(bpm, beatsCount, (beatIndex) => setBeatActive(beatIndex));
  };
  $("#bpmSlider",area).oninput = () => {
    const bpm = parseInt($("#bpmSlider",area).value);
    $("#bpm",area).textContent = bpm + " BPM";
    if (running) {
      stopMetronome();
      startMetronome(bpm, beatsCount, (beatIndex) => setBeatActive(beatIndex));
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

function escapeHtml(v) {
  return String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function loadSongs() {
  if (!SONGS.length) {
    try {
      const lang = getCurrentLanguage();
      const primary = (lang && lang !== "es") ? `data/songs.${lang}.json` : "data/songs.json";
      let r = await fetch(primary, { cache: "no-cache" });
      if (!r.ok) r = await fetch("data/songs.json", { cache: "no-cache" });
      const data = await r.json();
      SONGS = Array.isArray(data) ? data : (data.songs || data.items || []);
    } catch (e) { SONGS = []; }
  }
  return SONGS;
}

function songDiagram(name) {
  const ins = state.settings.instrument === "ukulele" ? "ukulele" : "guitar";
  const chord = CHORDS[ins] && CHORDS[ins][name];
  return chord ? renderChordDiagram(chord) : "";
}

async function openSongPlayer(area, song, onBack) {
  const m = await loadSongPlayer();
  m.renderSongPlayer(area, song, { diagram: songDiagram, onBack });
}

// Canciones para tocar con banda real (batería, bajo y guitarra).
async function renderSongs(area) {
  const songs = await loadSongs();
  let diff = "";
  area.innerHTML = `
    <div class="song-pick">
      <p class="song-pick__intro">Progresiones simplificadas en 4/4 para practicar con banda; no son transcripciones completas.</p>
      <div class="song-pick__filters" role="tablist">
        ${[["", "Todas"], ["1", "Muy fácil"], ["2", "Fácil"], ["3", "Media"], ["4", "Difícil"], ["5", "Experta"]].map(([k, l]) => `<button class="seg-btn ${k === "" ? "on" : ""}" data-diff="${k}">${l}</button>`).join("")}
      </div>
      <div class="song-pick__list" id="songPickList"></div>
    </div>`;
  const list = $("#songPickList", area);
  function draw() {
    const items = songs.map((s, i) => [s, i]).filter(([s]) => !diff || String(s.difficulty) === diff);
    list.innerHTML = items.map(([s, i]) => `
      <button class="song-row" data-i="${i}">
        <span class="song-row__badge" data-style="${s.style}">${escapeHtml(s.key)}</span>
        <span class="song-row__info"><b>${escapeHtml(s.name)}</b><em>${escapeHtml(s.progression.slice(0, 4).join(" · "))}${s.progression.length > 4 ? " …" : ""}</em></span>
        <span class="song-row__meta">${s.bpm} BPM<br>${"●".repeat(Math.min(5, s.difficulty))}</span>
      </button>`).join("");
    list.querySelectorAll(".song-row").forEach((b) => {
      b.onclick = () => openSongPlayer(area, songs[+b.dataset.i], () => renderSongs(area));
    });
  }
  area.querySelectorAll("[data-diff]").forEach((b) => b.onclick = () => {
    diff = b.dataset.diff;
    area.querySelectorAll("[data-diff]").forEach((x) => x.classList.toggle("on", x === b));
    draw();
  });
  draw();
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
    playTone(notes[n1], 0.6, { instrument: earInstrument() });
    setTimeout(() => playTone(notes[n2], 0.6, { instrument: earInstrument() }), 700);
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

async function renderSongLibrary(area) {
  const songs = await loadSongs();
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
      b.onclick = () => openSongPlayer(area, filtered[parseInt(b.dataset.song, 10)], () => renderSongLibrary(area));
    });
  }
  renderList();
  $("#songLibStyle", area).onchange = renderList;
  $("#songLibDiff", area).onchange = renderList;
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
function getProfileAvatar() {
  const src = state.user && state.user.avatar;
  return typeof src === "string" &&
    src.length <= 900000 &&
    /^data:image\/(?:jpeg|png|webp|gif);base64,/i.test(src) ? src : "";
}

async function loadAvatarImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (e) {
      // Safari antiguo o formatos sin soporte: probamos con <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("No se pudo leer la imagen"));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

async function makeAvatarDataUrl(file) {
  if (!file || !file.type || !file.type.startsWith("image/")) {
    throw new Error("Selecciona un archivo de imagen");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("La imagen es demasiado grande (máximo 10 MB)");
  }
  const img = await loadAvatarImage(file);
  const width = img.width || img.naturalWidth;
  const height = img.height || img.naturalHeight;
  if (!width || !height) throw new Error("La imagen no es válida");

  const side = Math.min(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    img,
    Math.max(0, (width - side) / 2),
    Math.max(0, (height - side) / 2),
    side, side,
    0, 0, 512, 512
  );
  if (typeof img.close === "function") img.close();

  let quality = 0.86;
  let data = canvas.toDataURL("image/jpeg", quality);
  while (data.length > 700000 && quality > 0.5) {
    quality -= 0.08;
    data = canvas.toDataURL("image/jpeg", quality);
  }
  if (data.length > 900000) throw new Error("La foto es demasiado grande");
  return data;
}

function renderProfile(v) {
  showNav(true);
  const avatar = getProfileAvatar();
  v.innerHTML = `
    <input type="file" id="avatarInput" accept="image/*" hidden>
    <div class="card" style="text-align:center">
      <div class="profile-avatar-wrap">
        <button class="profile-avatar" id="avatarBtn" type="button" aria-label="${avatar ? t("profile.changePhoto") : t("profile.addPhoto")}">
          ${avatar ? `<img src="${avatar}" alt="Foto de perfil">` : `<span class="profile-avatar__fallback" aria-hidden="true">👤</span>`}
          <span class="profile-avatar__edit" aria-hidden="true">✎</span>
        </button>
        <div class="profile-avatar-actions">
          <button class="btn btn-secondary btn-sm" id="avatarChange" type="button">${avatar ? t("profile.changePhoto") : t("profile.addPhoto")}</button>
          ${avatar ? `<button class="btn btn-secondary btn-sm" id="avatarRemove" type="button">${t("profile.removePhoto")}</button>` : ""}
        </div>
      </div>
      <h2>${escapeHtml(state.user.name)}</h2>
      <p>${t("profile.level", {level: state.level, title: levelTitle(state.level)})}</p>
      <p>${t("profile.instrument", {name: INSTRUMENTS[state.user.instrument].name})}</p>
      <p style="color:var(--muted);font-size:12px;margin:8px 0 0">${t("profile.photoLocal")}</p>
    </div>
    <div class="section-title">${t("profile.achievements")}</div>
    <div style="padding:0 16px">
      ${ACHIEVEMENTS.map(a => {
        const unlocked = !!state.achievements[a.id];
        return `<div class="ach ${unlocked?'':'locked'}">
          <span class="ico">${a.icon}</span>
          <div class="info"><div class="name">${t(a.name)}</div><div class="desc">${t(a.desc)}</div></div>
          <span>${unlocked?'✅':'🔒'}</span>
        </div>`;
      }).join("")}
    </div>
    <div class="section-title">${t("profile.panel")}</div>
    <div style="padding:0 16px;display:grid;gap:8px">
      <button class="btn btn-secondary btn-block" id="dashboardBtn">${t("profile.dashboard")}</button>
      <button class="btn btn-secondary btn-block" id="settingsBtn">${t("profile.settings")}</button>
      <button class="btn btn-secondary btn-block" id="refillBtn">${t("profile.refill")}</button>
      <button class="btn btn-secondary btn-block" id="freezeBtn">${t("profile.freeze")}</button>
      <button class="btn btn-secondary btn-block" id="recordBtn">${t("profile.record")}</button>
      <button class="btn btn-danger btn-block" id="resetBtn">${t("profile.reset")}</button>
    </div>
  `;
  const avatarInput = $("#avatarInput");
  const openAvatarPicker = () => avatarInput && avatarInput.click();
  $("#avatarBtn").onclick = openAvatarPicker;
  $("#avatarChange").onclick = openAvatarPicker;
  const avatarRemove = $("#avatarRemove");
  if (avatarRemove) avatarRemove.onclick = () => {
    delete state.user.avatar;
    saveState(state);
    toast("Foto eliminada");
    renderProfile(view());
  };
  if (avatarInput) avatarInput.onchange = async () => {
    const file = avatarInput.files && avatarInput.files[0];
    avatarInput.value = "";
    if (!file) return;
    const changeBtn = $("#avatarChange");
    if (changeBtn) { changeBtn.disabled = true; changeBtn.textContent = "Procesando…"; }
    try {
      state.user.avatar = await makeAvatarDataUrl(file);
      saveState(state);
      toast("Foto actualizada");
      renderProfile(view());
    } catch (e) {
      console.warn("avatar", e);
      toast(e.message || "No se pudo usar la foto");
      if (changeBtn) {
        changeBtn.disabled = false;
        changeBtn.textContent = getProfileAvatar() ? "Cambiar foto" : "Añadir foto";
      }
    }
  };

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
  try { await initI18n(); applyDocumentLanguage(); } catch (e) { console.warn("i18n", e); }
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
    await navigate(location.hash.startsWith("#practicar/") ? "practice" : "home");
  }
  try { applyDocumentLanguage(); } catch (e) {}
  // bottom nav (iconos SVG en lugar de emojis)
  const NAV_ICONS = { home: "home", learn: "book", tuner: "tuner", practice: "guitar", profile: "user" };
  $$("#bottomnav button").forEach(b => {
    const label = b.textContent.replace(/^[^A-Za-zÁÉÍÓÚáéíóúÑñ]+/, "").trim();
    b.innerHTML = `${icon(NAV_ICONS[b.dataset.route] || "guitar", 22)}<span>${label}</span>`;
    b.onclick = () => navigate(b.dataset.route);
  });

  // PWA install prompt handling
  setupInstallPrompt();
  setupServiceWorker();
  setupOfflineBadge();

  // Performance: preload + idle tasks
  preloadAssets();
  const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));
  idle(() => {
    // Descarga en segundo plano la guitarra real y el click del metrónomo.
    try {
      setGuitarTone(state.settings.guitarTone || "acoustic");
      setEarInstrument(state.settings.earInstrument || "guitar");
      warmRealInstruments(state.settings.instrument === "bass" ? "bass" : "guitar");
    } catch (e) {}
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
