// settings.js — settings panel, progress dashboard, theme manager, notifications
import { state, saveState, defaultState, resetState } from "./storage.js";
import { INSTRUMENTS } from "./instruments.js";
import { ACHIEVEMENTS, levelTitle } from "./gamification.js";
import { renderBackendSettings, getStatus, setRealtimeEnabled, isRealtimeEnabled, syncProgress } from "./backend.js";
import { clearQueue } from "./sync.js";

// ---------- helpers ----------
function ensureDefaults() {
  const d = defaultState();
  if (!state.settings) state.settings = {};
  state.settings = { ...d.settings, ...state.settings };
  if (!state.stats) state.stats = {};
  state.stats = { ...d.stats, ...state.stats };
  if (!Array.isArray(state.stats.chordsLearned)) {
    state.stats.chordsLearned = state.stats.chordsLearned ? [state.stats.chordsLearned] : [];
  }
  if (!Array.isArray(state.stats.scalesLearned)) {
    state.stats.scalesLearned = state.stats.scalesLearned ? [state.stats.scalesLearned] : [];
  }
  if (!state.dailyLog) state.dailyLog = {};
  if (!Array.isArray(state.practiceDays)) state.practiceDays = [];
}

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function haptic(pattern = 10) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
  return true;
}
export { haptic };

// ---------- Theme manager ----------
export function getTheme() {
  ensureDefaults();
  return state.settings.theme || "auto";
}

export function applyTheme() {
  ensureDefaults();
  const t = state.settings.theme || "auto";
  let resolved = t;
  if (t === "auto") {
    resolved = (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark";
  }
  document.body.classList.toggle("light", resolved === "light");
  if (typeof window !== "undefined" && window.matchMedia) {
    // keep auto in sync
    if (!applyTheme._bound) {
      applyTheme._bound = true;
      const mq = window.matchMedia("(prefers-color-scheme: light)");
      const handler = () => { if ((state.settings.theme || "auto") === "auto") applyTheme(); };
      if (mq.addEventListener) mq.addEventListener("change", handler);
      else if (mq.addListener) mq.addListener(handler);
    }
  }
  return resolved;
}

export function toggleTheme() {
  ensureDefaults();
  const current = document.body.classList.contains("light") ? "light" : "dark";
  const next = current === "light" ? "dark" : "light";
  state.settings.theme = next;
  saveState(state);
  applyTheme();
  haptic(10);
  return next;
}

// ---------- Notification scheduler ----------
export async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;
  try {
    const perm = await Notification.requestPermission();
    const granted = perm === "granted";
    ensureDefaults();
    state.settings.notifications = granted;
    saveState(state);
    if (granted) haptic(15);
    return granted;
  } catch (e) {
    return false;
  }
}

let reminderTimer = null;
export function scheduleReminder(hour) {
  ensureDefaults();
  const h = Number(hour);
  if (!isNaN(h)) state.settings.reminderHour = h;
  state.settings.notifications = true;
  saveState(state);
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return false;
  }
  if (reminderTimer) { clearTimeout(reminderTimer); reminderTimer = null; }
  const scheduleNext = () => {
    const now = new Date();
    const next = new Date();
    next.setHours(state.settings.reminderHour || 19, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const delay = next.getTime() - now.getTime();
    reminderTimer = setTimeout(() => {
      try {
        new Notification("Strumio 🎸", {
          body: "Hora de practicar guitarra. ¡Vamos!",
          icon: "./icons/icon-192.png",
          tag: "strumio-reminder"
        });
      } catch (e) {}
      scheduleNext();
    }, delay);
  };
  scheduleNext();
  haptic(10);
  return true;
}

// ---------- Date helpers ----------
function dateKey(d) { return d.toDateString(); }
function lastNDays(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    out.push({ date: d, key: d.toDateString() });
  }
  return out;
}

// ---------- Render Settings ----------
export function renderSettings(container) {
  ensureDefaults();
  const s = state.settings;
  const instruments = Object.entries(INSTRUMENTS);

  container.innerHTML = `
    <div class="card" style="text-align:center">
      <div style="font-size:40px">⚙️</div>
      <h2>Ajustes</h2>
      <p>Personaliza tu experiencia</p>
    </div>

    <div class="section-title">Apariencia</div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-weight:800">Tema</div>
          <div style="color:var(--muted);font-size:12px">Oscuro, claro o automático</div>
        </div>
        <select id="themeSel" style="padding:8px 10px;border-radius:10px;border:2px solid var(--border);background:var(--card-2);color:var(--text);font-weight:700">
          <option value="dark" ${s.theme === "dark" ? "selected" : ""}>Oscuro</option>
          <option value="light" ${s.theme === "light" ? "selected" : ""}>Claro</option>
          <option value="auto" ${s.theme === "auto" ? "selected" : ""}>Auto</option>
        </select>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0">
        <div>
          <div style="font-weight:800">Idioma</div>
          <div style="color:var(--muted);font-size:12px">Interfaz</div>
        </div>
        <select id="langSel" style="padding:8px 10px;border-radius:10px;border:2px solid var(--border);background:var(--card-2);color:var(--text);font-weight:700">
          <option value="es" ${s.language === "es" ? "selected" : ""}>Español</option>
          <option value="en" ${s.language === "en" ? "selected" : ""}>English</option>
        </select>
      </div>
    </div>

    <div class="section-title">Sonido y feedback</div>
    <div class="card">
      ${renderToggle("soundToggle", "Sonido", "Efectos de sonido en la app", s.sound)}
      ${renderToggle("metroSoundToggle", "Sonido del metrónomo", "Click del metrónomo", s.metronomeSound)}
      ${renderToggle("hapticToggle", "Feedback háptico", "Vibración en interacciones", s.haptic)}
    </div>

    <div class="section-title">Práctica</div>
    <div class="card">
      <div style="padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="font-weight:800;margin-bottom:8px">Meta diaria (minutos)</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${[5, 10, 15, 20].map(m => `<button class="btn ${s.dailyGoal === m ? "btn-primary" : "btn-secondary"} btn-sm dailyGoalBtn" data-min="${m}">${m} min</button>`).join("")}
        </div>
      </div>
      <div style="padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="font-weight:800;margin-bottom:8px">Instrumento por defecto</div>
        <select id="insSel" style="width:100%;padding:10px;border-radius:10px;border:2px solid var(--border);background:var(--card-2);color:var(--text);font-weight:700">
          ${instruments.map(([k, ins]) => `<option value="${k}" ${s.instrument === k ? "selected" : ""}>${ins.emoji} ${ins.name}</option>`).join("")}
        </select>
      </div>
      <div style="padding:8px 0">
        <div style="font-weight:800;margin-bottom:8px">Referencia del afinador (Hz)</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${[432, 440, 442].map(p => `<button class="btn ${s.tunerPitch === p ? "btn-primary" : "btn-secondary"} btn-sm tunerPitchBtn" data-pitch="${p}">${p} Hz</button>`).join("")}
        </div>
      </div>
    </div>

    <div class="section-title">Notificaciones</div>
    <div class="card">
      ${renderToggle("notifToggle", "Recordatorios", "Notificación diaria para practicar", s.notifications)}
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0">
        <div>
          <div style="font-weight:800">Hora del recordatorio</div>
          <div style="color:var(--muted);font-size:12px">24 h</div>
        </div>
        <select id="reminderHourSel" style="padding:8px 10px;border-radius:10px;border:2px solid var(--border);background:var(--card-2);color:var(--text);font-weight:700">
          ${Array.from({ length: 24 }, (_, i) => `<option value="${i}" ${s.reminderHour === i ? "selected" : ""}>${String(i).padStart(2, "0")}:00</option>`).join("")}
        </select>
      </div>
      <button class="btn btn-secondary btn-block" id="permBtn" style="margin-top:8px">🔔 Solicitar permiso de notificaciones</button>
    </div>

    <div class="section-title">Datos y respaldo</div>
    <div class="card">
      <p style="color:var(--muted);font-size:12px;margin:0 0 10px">Tu progreso vive en este dispositivo. Exporta una copia antes de cambiar de móvil, borrar datos o reinstalar.</p>
      <button class="btn btn-secondary btn-block" id="exportProgressBtn">⬇️ Exportar progreso</button>
      <button class="btn btn-secondary btn-block" id="importProgressBtn" style="margin-top:8px">⬆️ Importar progreso</button>
      <input type="file" id="importProgressFile" accept="application/json,.json" hidden>
      <button class="btn btn-danger btn-block" id="resetProgressBtn" style="margin-top:8px">🗑️ Restablecer este dispositivo</button>
      <p style="color:var(--muted);font-size:11px;margin:10px 0 0">El archivo no contiene contraseñas. Si tienes cuenta, la nube puede restaurar tu progreso al iniciar sesión.</p>
    </div>

    <div class="section-title">Conexión / Backend</div>
    <div class="card" id="connectionStatusCard">
      <div id="connStatusText" style="font-size:13px;margin-bottom:8px">Cargando estado…</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <button class="btn btn-secondary btn-sm" id="settingsSyncBtn">Sincronizar ahora</button>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700">
          <input type="checkbox" id="settingsRealtimeToggle"> Tiempo real
        </label>
      </div>
    </div>
    <div id="backendSettings"></div>

    <div style="height:20px"></div>
  `;

  // wire theme
  try { renderBackendSettings(container.querySelector("#backendSettings")); } catch (e) { console.warn(e); }

  // connection status / sync / realtime toggle
  try {
    const connText = container.querySelector("#connStatusText");
    const updateConn = () => {
      try {
        const s = getStatus();
        const label = s.connectionStatus || (s.online ? "connected" : "offline");
        const color = label === "connected" ? "var(--green)" : (label === "connecting" ? "var(--gold)" : "var(--muted)");
        if (connText) connText.innerHTML = `Estado: <b style="color:${color}">${label}</b> · Modo: <b>${s.mode}</b> · Cola: <b>${s.queueSize}</b> · ${s.online ? "Online" : "Offline"}`;
      } catch (e) {}
    };
    updateConn();
    const statusHandler = () => updateConn();
    window.addEventListener("strumio:status-changed", statusHandler);
    const syncBtn = container.querySelector("#settingsSyncBtn");
    if (syncBtn) syncBtn.onclick = async () => {
      await syncProgress();
      updateConn();
      toast("Sincronizado");
    };
    const rtToggle = container.querySelector("#settingsRealtimeToggle");
    if (rtToggle) {
      rtToggle.checked = isRealtimeEnabled();
      rtToggle.onchange = () => {
        setRealtimeEnabled(rtToggle.checked);
        updateConn();
        toast(rtToggle.checked ? "Tiempo real activado" : "Tiempo real desactivado");
      };
    }
  } catch (e) { console.warn(e); }
  container.querySelector("#themeSel").onchange = (e) => {
    state.settings.theme = e.target.value;
    saveState(state);
    applyTheme();
    haptic(10);
    toast("Tema actualizado");
  };
  container.querySelector("#langSel").onchange = (e) => {
    state.settings.language = e.target.value;
    saveState(state);
    haptic(10);
    toast("Idioma actualizado");
  };

  // toggles
  bindToggle(container, "soundToggle", "sound");
  bindToggle(container, "metroSoundToggle", "metronomeSound");
  bindToggle(container, "hapticToggle", "haptic");
  bindToggle(container, "notifToggle", "notifications", async (val) => {
    if (val) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        state.settings.notifications = false;
        saveState(state);
        const cb = container.querySelector("#notifToggle");
        if (cb) cb.checked = false;
        toast("Permiso denegado");
        return;
      }
      scheduleReminder(state.settings.reminderHour);
      toast("Recordatorio programado");
    }
  });

  // daily goal
  container.querySelectorAll(".dailyGoalBtn").forEach(b => {
    b.onclick = () => {
      state.settings.dailyGoal = parseInt(b.dataset.min);
      saveState(state);
      haptic(10);
      toast("Meta: " + b.dataset.min + " min");
      renderSettings(container);
    };
  });

  // instrument
  container.querySelector("#insSel").onchange = (e) => {
    state.settings.instrument = e.target.value;
    if (state.user) state.user.instrument = e.target.value;
    saveState(state);
    haptic(10);
    toast("Instrumento actualizado");
  };

  // tuner pitch
  container.querySelectorAll(".tunerPitchBtn").forEach(b => {
    b.onclick = () => {
      state.settings.tunerPitch = parseInt(b.dataset.pitch);
      saveState(state);
      haptic(10);
      toast("Referencia: " + b.dataset.pitch + " Hz");
      renderSettings(container);
    };
  });

  // reminder hour
  container.querySelector("#reminderHourSel").onchange = (e) => {
    state.settings.reminderHour = parseInt(e.target.value);
    saveState(state);
    if (state.settings.notifications && Notification.permission === "granted") {
      scheduleReminder(state.settings.reminderHour);
    }
    haptic(10);
  };

  // permission button
  container.querySelector("#permBtn").onclick = async () => {
    const granted = await requestNotificationPermission();
    if (granted) {
      toast("Permiso concedido");
      scheduleReminder(state.settings.reminderHour);
      const cb = container.querySelector("#notifToggle");
      if (cb) cb.checked = true;
      state.settings.notifications = true;
      saveState(state);
    } else {
      toast("Permiso denegado o no soportado");
    }
  };

  // backup / restore
  const exportBtn = container.querySelector("#exportProgressBtn");
  if (exportBtn) exportBtn.onclick = exportProgress;
  const importBtn = container.querySelector("#importProgressBtn");
  const importFile = container.querySelector("#importProgressFile");
  if (importBtn && importFile) {
    importBtn.onclick = () => importFile.click();
    importFile.onchange = async () => {
      const file = importFile.files && importFile.files[0];
      importFile.value = "";
      if (file) await importProgressFile(file);
    };
  }
  const resetBtn = container.querySelector("#resetProgressBtn");
  if (resetBtn) resetBtn.onclick = resetLocalProgress;

  applyTheme();
}

// ---------- Backup / restore ----------
function exportProgress() {
  try {
    // Copia portátil: sin configuración de backend ni marcas de sincronización.
    const snapshot = JSON.parse(JSON.stringify(state));
    delete snapshot.sync;
    if (snapshot.settings) delete snapshot.settings.backend;
    const payload = {
      app: "strumio",
      version: 1,
      exportedAt: new Date().toISOString(),
      state: snapshot,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `strumio-progreso-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Progreso exportado");
  } catch (e) {
    console.warn("export", e);
    toast("No se pudo exportar");
  }
}

function normalizeImportedState(raw) {
  const source = raw && raw.state && typeof raw.state === "object" ? raw.state : raw;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("Formato no válido");
  }

  // Copia segura: evita claves de prototipo en un JSON manipulado.
  const incoming = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    incoming[key] = value;
  }

  const d = defaultState();
  const objectOr = (value, fallback) =>
    value && typeof value === "object" && !Array.isArray(value) ? value : fallback;

  const merged = {
    ...d,
    ...incoming,
    settings: { ...d.settings, ...objectOr(incoming.settings, {}) },
    stats: { ...d.stats, ...objectOr(incoming.stats, {}) },
    completed: objectOr(incoming.completed, {}),
    achievements: objectOr(incoming.achievements, {}),
    tunerHistory: objectOr(incoming.tunerHistory, {}),
    dailyLog: objectOr(incoming.dailyLog, {}),
    practiceDays: Array.isArray(incoming.practiceDays) ? incoming.practiceDays : [],
  };

  // El perfil de la cuenta actual manda si ya hay sesión local.
  if (state.user) merged.user = state.user;
  // La configuración de backend no se importa: evita redirigir la sesión a otro servidor.
  if (state.settings && state.settings.backend) {
    merged.settings.backend = state.settings.backend;
  } else {
    delete merged.settings.backend;
  }
  // No arrastrar marcas de sincronización antiguas: la nube debe comparar de nuevo.
  delete merged.sync;

  if (!Array.isArray(merged.stats.chordsLearned)) {
    merged.stats.chordsLearned = merged.stats.chordsLearned ? [merged.stats.chordsLearned] : [];
  }
  if (!Array.isArray(merged.stats.scalesLearned)) {
    merged.stats.scalesLearned = merged.stats.scalesLearned ? [merged.stats.scalesLearned] : [];
  }

  return merged;
}

async function importProgressFile(file) {
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    toast("Archivo demasiado grande");
    return;
  }
  try {
    const parsed = JSON.parse(await file.text());
    const merged = normalizeImportedState(parsed);
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, merged);
    saveState(state);
    toast("Progreso importado. Recargando…");
    setTimeout(() => location.reload(), 800);
  } catch (e) {
    console.warn("import", e);
    toast("Archivo no válido");
  }
}

function resetLocalProgress() {
  const ok = window.confirm(
    "¿Restablecer el progreso de este dispositivo?\n\nSe borrarán XP, lecciones, racha y ajustes locales. Si tienes cuenta, la nube puede restaurarlo al volver a iniciar sesión."
  );
  if (!ok) return;
  for (const key of ["bestChanges", "strumio_tools_v1", "strumio_video_progress", "strumio_video_watched"]) {
    try { localStorage.removeItem(key); } catch (e) {}
  }
  try { clearQueue(); } catch (e) {}
  resetState();
  location.reload();
}

function renderToggle(id, label, desc, checked) {
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-weight:800">${label}</div>
        <div style="color:var(--muted);font-size:12px">${desc}</div>
      </div>
      <label style="position:relative;display:inline-block;width:46px;height:26px">
        <input type="checkbox" id="${id}" ${checked ? "checked" : ""} style="opacity:0;width:0;height:0">
        <span style="position:absolute;cursor:pointer;inset:0;background:${checked ? "var(--green)" : "var(--card-3)"};border-radius:999px;transition:background .2s">
          <span style="position:absolute;height:20px;width:20px;left:${checked ? "23px" : "3px"};bottom:3px;background:#fff;border-radius:50%;transition:left .2s;box-shadow:0 1px 3px rgba(0,0,0,.3)"></span>
        </span>
      </label>
    </div>`;
}

function bindToggle(container, id, key, onChange) {
  const cb = container.querySelector("#" + id);
  if (!cb) return;
  // style sync
  const sync = (val) => {
    const span = cb.parentElement.querySelector("span");
    const knob = span.querySelector("span");
    span.style.background = val ? "var(--green)" : "var(--card-3)";
    knob.style.left = val ? "23px" : "3px";
  };
  cb.onchange = async () => {
    const val = cb.checked;
    state.settings[key] = val;
    saveState(state);
    sync(val);
    if (state.settings.haptic) haptic(8);
    if (onChange) await onChange(val);
  };
  // click on visual span toggles checkbox
  const span = cb.parentElement.querySelector("span");
  span.onclick = () => { cb.checked = !cb.checked; cb.onchange(); };
  sync(cb.checked);
}

// ---------- Render Dashboard ----------
export function renderDashboard(container) {
  ensureDefaults();
  const st = state.stats;
  const practicedDays = Object.keys(state.dailyLog).length || state.practiceDays.length;
  const chordsCount = Array.isArray(st.chordsLearned) ? st.chordsLearned.length : (st.chordsLearned || 0);
  const scalesCount = Array.isArray(st.scalesLearned) ? st.scalesLearned.length : (st.scalesLearned || 0);
  const bestChanges = st.bestChordChanges || parseInt(localStorage.getItem("bestChanges") || "0", 10) || 0;
  const totalMinutes = st.totalPracticeTime || st.minutesPracticed || 0;
  const accuracy = st.accuracy || 0;

  container.innerHTML = `
    <div class="card" style="text-align:center">
      <div style="font-size:40px">📊</div>
      <h2>Panel de progreso</h2>
      <p>Nivel ${state.level} · ${levelTitle(state.level)} · ${state.xp}/${state.level * 100} XP</p>
    </div>

    <div class="card">
      <h2>📈 XP (últimos días)</h2>
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <button class="btn btn-secondary btn-sm" id="range7">7 días</button>
        <button class="btn btn-secondary btn-sm" id="range30">30 días</button>
      </div>
      <canvas id="xpChart" width="320" height="160" style="width:100%;max-width:320px;display:block;margin:0 auto"></canvas>
    </div>

    <div class="card">
      <h3>🗓️ Calendario de racha (30 días)</h3>
      <div id="calGrid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-top:8px"></div>
      <p style="color:var(--muted);font-size:12px;margin-top:8px">Días practicados: ${practicedDays} · Racha: ${state.streak}</p>
    </div>

    <div class="section-title">Estadísticas</div>
    <div style="padding:0 16px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${statCard("⏱️", "Tiempo practicado", totalMinutes + " min")}
      ${statCard("📚", "Lecciones", state.stats.lessonsCompleted || Object.keys(state.completed || {}).length)}
      ${statCard("🎯", "Precisión", accuracy + "%")}
      ${statCard("🎸", "Acordes aprendidos", chordsCount)}
      ${statCard("🎼", "Escalas aprendidas", scalesCount)}
      ${statCard("⚡", "Récord cambios", bestChanges)}
    </div>

    <div class="section-title">Logros</div>
    <div style="padding:0 16px">
      ${ACHIEVEMENTS.map(a => {
        const unlocked = !!state.achievements[a.id];
        return `<div class="ach ${unlocked ? "" : "locked"}">
          <span class="ico">${a.icon}</span>
          <div class="info"><div class="name">${a.name}</div><div class="desc">${a.desc}</div></div>
          <span>${unlocked ? "✅" : "🔒"}</span>
        </div>`;
      }).join("")}
    </div>

    <div style="height:20px"></div>
  `;

  let currentRange = 7;
  const canvas = container.querySelector("#xpChart");
  function redraw() { drawXPChart(canvas, currentRange); }
  container.querySelector("#range7").onclick = () => { currentRange = 7; redraw(); haptic(8); };
  container.querySelector("#range30").onclick = () => { currentRange = 30; redraw(); haptic(8); };
  redraw();

  // calendar
  const calGrid = container.querySelector("#calGrid");
  lastNDays(30).forEach(d => {
    const practiced = !!state.dailyLog[d.key] || (state.practiceDays || []).includes(d.key);
    const cell = document.createElement("div");
    cell.style.aspectRatio = "1";
    cell.style.borderRadius = "6px";
    cell.style.background = practiced ? (cssVar("--green") || "#58cc02") : (cssVar("--card-2") || "#243444");
    cell.style.display = "flex";
    cell.style.alignItems = "center";
    cell.style.justifyContent = "center";
    cell.style.fontSize = "10px";
    cell.style.fontWeight = "800";
    cell.style.color = practiced ? "#fff" : "var(--muted)";
    cell.textContent = d.date.getDate();
    calGrid.appendChild(cell);
  });
}

function statCard(icon, label, value) {
  return `<div class="card" style="margin:0;text-align:center;padding:12px">
    <div style="font-size:24px">${icon}</div>
    <div style="font-size:20px;font-weight:900;margin:4px 0">${value}</div>
    <div style="color:var(--muted);font-size:11px;font-weight:700">${label}</div>
  </div>`;
}

function drawXPChart(canvas, n) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const days = lastNDays(n);
  const vals = days.map(d => (state.dailyLog && state.dailyLog[d.key] && state.dailyLog[d.key].xp) ? state.dailyLog[d.key].xp : 0);
  const max = Math.max(10, ...vals);
  const padL = 28, padR = 8, padT = 10, padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const barW = plotW / vals.length;

  // axis
  const border = cssVar("--border") || "#2a3a4a";
  const muted = cssVar("--muted") || "#94a3b8";
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, H - padB);
  ctx.lineTo(W - padR, H - padB);
  ctx.stroke();

  // bars
  const green = cssVar("--green") || "#58cc02";
  vals.forEach((v, i) => {
    const h = (v / max) * plotH;
    const x = padL + i * barW + 2;
    const y = H - padB - h;
    const bw = Math.max(2, barW - 4);
    ctx.fillStyle = green;
    ctx.fillRect(x, y, bw, h);
  });

  // labels (first, middle, last)
  ctx.fillStyle = muted;
  ctx.font = "9px sans-serif";
  ctx.textAlign = "center";
  if (n <= 7) {
    days.forEach((d, i) => {
      const x = padL + i * barW + barW / 2;
      ctx.fillText(d.date.getDate(), x, H - 8);
    });
  } else {
    [0, Math.floor(n / 2), n - 1].forEach(i => {
      const x = padL + i * barW + barW / 2;
      ctx.fillText(days[i].date.getDate() + "/" + (days[i].date.getMonth() + 1), x, H - 8);
    });
  }

  // max label
  ctx.textAlign = "right";
  ctx.fillText(max, padL - 4, padT + 8);
  ctx.fillText("0", padL - 4, H - padB);
}

// Apply theme on module load
try { ensureDefaults(); applyTheme(); } catch (e) {}

// Auto-schedule reminder if enabled
try {
  ensureDefaults();
  if (state.settings.notifications && "Notification" in window && Notification.permission === "granted") {
    scheduleReminder(state.settings.reminderHour);
  }
} catch (e) {}
