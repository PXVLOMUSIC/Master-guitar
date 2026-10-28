// backend.js — Supabase integration layer for Strumio
// Handles auth, progress sync, weekly leaderboards and social features.
// Production-ready: retry, realtime, offline detection, batch sync, rate limiting, etc.
// Works fully offline when Supabase is not configured.

import { state, saveState } from "./storage.js";
import { enqueue, flush, isOnline, onOnline, onOffline, getQueueSize, clearQueue, onQueueChange, getQueue, remove } from "./sync.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_REALTIME } from "./supabase-config.js";
import { t } from "./i18n.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const CONFIG_KEY = "strumio_supabase_config";
const SESSION_KEY = "strumio_sb_session";
const CACHE_KEY_PREFIX = "strumio_cache_";
const SUPABASE_CDN_URLS = [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm",
  "https://esm.sh/@supabase/supabase-js@2",
  "https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js?module"
];

// Proveedores sociales que la app sabe mostrar. Solo aparecen los que estén
// activados en Supabase (Authentication → Providers).
const OAUTH_PROVIDERS = [
  {
    id: "google", label: "Continuar con Google", short: "G", cls: "google",
    icon: `<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>`
  },
  { id: "apple", label: "Continuar con Apple", short: "A", cls: "apple" },
  { id: "facebook", label: "Continuar con Facebook", short: "f", cls: "facebook" },
  {
    id: "github", label: "Continuar con GitHub", short: "GH", cls: "github",
    icon: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2.17c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.41.35.78 1.05.78 2.12v3.14c0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"/>
    </svg>`
  },
  { id: "discord", label: "Continuar con Discord", short: "D", cls: "discord" },
];

let supabaseModule = null;
let client = null;
let session = null;
let currentUser = null;
let backendMode = "local"; // "local" | "online" | "error"
let initialized = false;
let listenersBound = false;
let periodicTimer = null;
let batchTimer = null;
let authListeners = [];
let lastSyncAt = 0;
let cachedLeaderboard = null;

// connection status: "connected" | "connecting" | "offline"
let connectionStatus = "offline";

// realtime
let realtimeChannels = [];
let realtimeListeners = { leaderboard: [], activity: [], challenges: [], all: [] };

// rate limiter (max 100 req/min)
const RATE_LIMIT_MAX = 100;
const RATE_WINDOW_MS = 60000;
let rateTimestamps = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function ensureStateDefaults() {
  if (!state.settings) state.settings = {};
  if (!state.settings.backend) state.settings.backend = { url: "", anonKey: "", realtime: true };
  if (state.settings.backend.realtime === undefined) state.settings.backend.realtime = true;
  if (!state.sync) state.sync = { lastSyncAt: 0 };
  if (typeof state.sync.lastSyncAt !== "number") state.sync.lastSyncAt = 0;
  lastSyncAt = state.sync.lastSyncAt || 0;
}

function persistSession(sess) {
  try {
    if (sess) localStorage.setItem(SESSION_KEY, JSON.stringify(sess));
    else localStorage.removeItem(SESSION_KEY);
  } catch (e) {}
}

function readStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function notifyAuth(event, sess) {
  for (const cb of authListeners) {
    try { cb(event, sess); } catch (e) { console.warn(e); }
  }
}

function toast(msg) {
  try {
    const t = document.createElement("div");
    t.className = "toast"; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
  } catch (e) {}
}
function getNowISO() { return new Date().toISOString(); }

function enqueueProgress(payload) {
  try {
    for (const op of (getQueue() || [])) {
      if (op && op.type === "pushProgress") remove(op.id);
    }
  } catch (e) {}
  return enqueue({ type: "pushProgress", payload });
}

function getWeekStartMonday(d = new Date()) {
  const date = new Date(d);
  const day = date.getDay(); // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1) - day; // Monday
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getWeekStartISO(d = new Date()) {
  return getWeekStartMonday(d).toISOString().slice(0, 10);
}

function cacheSet(key, value) {
  try { localStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify({ t: Date.now(), v: value })); } catch (e) {}
}

function cacheGet(key, maxAgeMs = 5 * 60 * 1000) {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + key);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o.t !== "number") return null;
    if (Date.now() - o.t > maxAgeMs) return null;
    return o.v;
  } catch (e) {
    return null;
  }
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function dispatchStatus() {
  try { window.dispatchEvent(new CustomEvent("strumio:status-changed", { detail: getStatus() })); } catch (e) {}
}

function dispatchRealtime(type, payload) {
  try { window.dispatchEvent(new CustomEvent("strumio:realtime", { detail: { type, payload } })); } catch (e) {}
}

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------
async function rateLimit() {
  while (true) {
    const now = Date.now();
    rateTimestamps = rateTimestamps.filter(t => now - t < RATE_WINDOW_MS);
    if (rateTimestamps.length < RATE_LIMIT_MAX) {
      rateTimestamps.push(now);
      return;
    }
    const oldest = rateTimestamps[0];
    const wait = RATE_WINDOW_MS - (now - oldest) + 25;
    await new Promise(r => setTimeout(r, Math.max(10, wait)));
  }
}

// ---------------------------------------------------------------------------
// Retry logic (3 retries, 1s/2s/4s)
// ---------------------------------------------------------------------------
async function withRetry(fn, opts = {}) {
  const retries = (opts.retries != null) ? opts.retries : 3;
  const delays = opts.delays || [1000, 2000, 4000];
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      await rateLimit();
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < retries) {
        await new Promise(r => setTimeout(r, delays[i] || 1000));
      }
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Friendly errors
// ---------------------------------------------------------------------------
export function friendlyError(err) {
  if (!err) return "Error desconocido";
  const msg = ((err.message || err.toString || "") + "").toLowerCase();
  if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("offline")) return "Sin conexión a internet. Se guardará para sincronizar después.";
  if (msg.includes("jwt") || msg.includes("token") || msg.includes("expired") || msg.includes("session")) return "Sesión expirada. Inicia sesión de nuevo.";
  if (msg.includes("rate limit") || msg.includes("too many")) return "Demasiadas solicitudes. Intenta en un momento.";
  if (msg.includes("duplicate") || msg.includes("unique")) return "Este registro ya existe.";
  if (msg.includes("permission") || msg.includes("rls") || msg.includes("policy") || msg.includes("forbidden")) return "No tienes permiso para esta acción.";
  if (msg.includes("not found")) return "No encontrado.";
  return err.message || String(err);
}

// ---------------------------------------------------------------------------
// Session refresh
// ---------------------------------------------------------------------------
async function ensureSession() {
  if (!client) return session;
  try {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (data && data.session) {
      const expiresAt = data.session.expires_at;
      if (expiresAt && expiresAt * 1000 < Date.now() + 60000) {
        const { data: r, error: rerr } = await client.auth.refreshSession();
        if (!rerr && r && r.session) {
          session = r.session;
          currentUser = r.session.user;
          persistSession(r.session);
        } else {
          session = data.session;
          currentUser = data.session.user;
        }
      } else {
        session = data.session;
        currentUser = data.session.user;
      }
    }
  } catch (e) {
    console.warn("ensureSession error", e);
  }
  return session;
}

/**
 * Si hay sesión de Supabase pero el perfil local no existe (p. ej. tras
 * entrar con Google), crea el perfil local para que la app no vuelva a
 * mostrar el onboarding.
 */
function syncLocalUserFromSession() {
  if (!currentUser) return;
  const meta = currentUser.user_metadata || {};
  const fallbackName = currentUser.email ? currentUser.email.split("@")[0] : "Guitarrista";
  const name = meta.full_name || meta.name || meta.display_name || fallbackName;
  if (!state.user) {
    state.user = {
      name,
      email: currentUser.email || "",
      guest: false,
      instrument: (state.settings && state.settings.instrument) || "guitar",
      level: "beginner",
    };
    saveState(state);
  } else {
    state.user.guest = false;
    if (currentUser.email) state.user.email = currentUser.email;
    if (!state.user.name || state.user.name === "Invitado") state.user.name = name;
    saveState(state);
  }
}

// ---------------------------------------------------------------------------
// Progress payload / merge
// ---------------------------------------------------------------------------
function buildProgressPayload() {
  ensureStateDefaults();
  return {
    user_id: currentUser ? currentUser.id : null,
    xp: state.xp || 0,
    level: state.level || 1,
    streak: state.streak || 0,
    gems: state.gems || 0,
    hearts: state.hearts || 5,
    last_practice: state.lastPractice || null,
    completed: state.completed || {},
    achievements: state.achievements || {},
    stats: state.stats || {},
    daily_log: state.dailyLog || {},
    practice_days: state.practiceDays || [],
    settings: state.settings || {},
    updated_at: getNowISO()
  };
}

function mergeRemoteProgress(row) {
  if (!row) return;
  try {
    // take max XP, level, streak, gems, hearts
    if (typeof row.xp === "number") state.xp = Math.max(state.xp || 0, row.xp);
    if (typeof row.level === "number") state.level = Math.max(state.level || 1, row.level);
    if (typeof row.streak === "number") state.streak = Math.max(state.streak || 0, row.streak);
    if (typeof row.gems === "number") state.gems = Math.max(state.gems || 0, row.gems);
    if (typeof row.hearts === "number") state.hearts = Math.max(state.hearts || 5, row.hearts);
    if (row.last_practice !== undefined && row.last_practice) {
      // take latest
      const cur = state.lastPractice ? new Date(state.lastPractice).getTime() : 0;
      const rem = new Date(row.last_practice).getTime();
      if (rem > cur) state.lastPractice = row.last_practice;
    }
    // union completed lessons
    if (row.completed && typeof row.completed === "object") {
      state.completed = { ...(row.completed || {}), ...(state.completed || {}) };
    }
    // union achievements
    if (row.achievements && typeof row.achievements === "object") {
      state.achievements = { ...(row.achievements || {}), ...(state.achievements || {}) };
    }
    // stats merge: max for counters, union arrays
    if (row.stats && typeof row.stats === "object") {
      const cur = state.stats || {};
      const merged = { ...cur, ...row.stats };
      for (const k of ["lessonsCompleted","minutesPracticed","tunings","accuracy","bestChordChanges","totalPracticeTime"]) {
        if (typeof cur[k] === "number" || typeof row.stats[k] === "number") {
          merged[k] = Math.max(Number(cur[k] || 0), Number(row.stats[k] || 0));
        }
      }
      for (const k of ["chordsLearned","scalesLearned"]) {
        const a = Array.isArray(cur[k]) ? cur[k] : (cur[k] ? [cur[k]] : []);
        const b = Array.isArray(row.stats[k]) ? row.stats[k] : (row.stats[k] ? [row.stats[k]] : []);
        merged[k] = Array.from(new Set([...a, ...b]));
      }
      state.stats = merged;
    }
    // daily_log merge: union days, take max per metric
    if (row.daily_log && typeof row.daily_log === "object") {
      const cur = state.dailyLog || {};
      const merged = { ...row.daily_log };
      for (const [k, v] of Object.entries(cur)) {
        if (!merged[k]) merged[k] = v;
        else {
          merged[k] = {
            xp: Math.max((merged[k].xp || 0), (v.xp || 0)),
            minutes: Math.max((merged[k].minutes || 0), (v.minutes || 0)),
            lessons: Math.max((merged[k].lessons || 0), (v.lessons || 0))
          };
        }
      }
      state.dailyLog = merged;
    }
    // practiceDays union
    if (Array.isArray(row.practice_days)) {
      state.practiceDays = Array.from(new Set([...(state.practiceDays || []), ...row.practice_days]));
    }
    // settings merge (never overwrite backend config)
    if (row.settings && typeof row.settings === "object") {
      state.settings = { ...(state.settings || {}), ...row.settings };
      const cfg = getBackendConfig();
      state.settings.backend = cfg;
    }
    saveState(state);
  } catch (e) {
    console.warn("mergeRemoteProgress error", e);
  }
}

// backwards compat alias
const applyRemoteProgress = mergeRemoteProgress;

// ---------------------------------------------------------------------------
// Supabase loading
// ---------------------------------------------------------------------------
async function loadSupabaseModule() {
  if (supabaseModule) return supabaseModule;
  for (const url of SUPABASE_CDN_URLS) {
    try {
      const mod = await import(url);
      const create = mod && (mod.createClient || (mod.default && mod.default.createClient));
      if (create) {
        supabaseModule = mod;
        return mod;
      }
    } catch (e) {
      // try next
    }
  }
  return null;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

function createClientFromConfig(cfg) {
  const mod = supabaseModule;
  const create = mod && (mod.createClient || (mod.default && mod.default.createClient));
  if (!create || !cfg || !cfg.url || !cfg.anonKey) return null;
  try {
    return create(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: true,
        storage: localStorage,
        storageKey: SESSION_KEY,
        autoRefreshToken: true,
        detectSessionInUrl: true
      },
      realtime: { params: { eventsPerSecond: 10 } }
    });
  } catch (e) {
    console.warn("createClient error", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Configuration API
// ---------------------------------------------------------------------------
export function getBackendConfig() {
  ensureStateDefaults();
  let cfg = null;
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) cfg = JSON.parse(raw);
  } catch (e) {}
  if (!cfg && state.settings && state.settings.backend) cfg = state.settings.backend;
  // El usuario puede desactivar el backend explícitamente desde Ajustes.
  if (cfg && cfg.disabled) return { url: "", anonKey: "", realtime: false };
  // Fallback: configuración incluida en el proyecto (js/supabase-config.js).
  if ((!cfg || !cfg.url || !cfg.anonKey) && SUPABASE_URL && SUPABASE_ANON_KEY) {
    cfg = {
      url: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
      realtime: cfg && cfg.realtime !== undefined ? cfg.realtime : SUPABASE_REALTIME,
    };
  }
  if (!cfg) cfg = { url: "", anonKey: "", realtime: true };
  return { url: cfg.url || "", anonKey: cfg.anonKey || "", realtime: cfg.realtime !== false };
}

export function setBackendConfig(url, anonKey, realtime) {
  ensureStateDefaults();
  const cleanUrl = (url || "").trim();
  const cleanKey = (anonKey || "").trim();
  const cfg = { url: cleanUrl, anonKey: cleanKey, realtime: realtime !== false };
  // Sin URL ni clave = desconectado a propósito (no vuelve al fallback del proyecto).
  if (!cleanUrl && !cleanKey) cfg.disabled = true;
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); } catch (e) {}
  state.settings.backend = cfg;
  saveState(state);
  // recreate client
  if (client) {
    try { client.auth.signOut(); } catch (e) {}
    try { stopRealtime(); } catch (e) {}
  }
  client = null;
  session = null;
  currentUser = null;
  backendMode = "local";
  connectionStatus = "offline";
  authSettingsCache = null;
  dispatchStatus();
  return cfg;
}

export function isConfigured() {
  const cfg = getBackendConfig();
  return !!(cfg.url && cfg.anonKey);
}

export function getClient() { return client; }
export function getSession() {
  if (client) {
    return { session, user: currentUser };
  }
  const stored = readStoredSession();
  return { session: stored, user: stored ? stored.user : null };
}

export function isOnlineMode() { return backendMode === "online"; }
export function getBackendMode() { return backendMode; }
export function getLastSyncAt() { ensureStateDefaults(); return state.sync.lastSyncAt || 0; }

export function getConnectionStatus() { return connectionStatus; }
export function setConnectionStatus(s) { connectionStatus = s; dispatchStatus(); }

export function isRealtimeEnabled() {
  ensureStateDefaults();
  return getBackendConfig().realtime !== false;
}
export function setRealtimeEnabled(enabled) {
  ensureStateDefaults();
  const cfg = getBackendConfig();
  cfg.realtime = !!enabled;
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); } catch (e) {}
  state.settings.backend = { ...state.settings.backend, realtime: !!enabled };
  saveState(state);
  if (enabled) startRealtime(); else stopRealtime();
  dispatchStatus();
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------
export async function initBackend(force = false) {
  if (initialized && !force) return getStatus();
  initialized = true;
  ensureStateDefaults();
  lastSyncAt = state.sync.lastSyncAt || 0;

  if (!listenersBound) {
    listenersBound = true;
    onOnline(() => { handleOnline(); });
    onOffline(() => {
      connectionStatus = "offline";
      backendMode = isConfigured() ? "online" : "local";
      stopRealtime();
      dispatchStatus();
    });
  }

  if (force) {
    if (client) { try { client.auth.signOut(); } catch (e) {} }
    client = null;
    session = null;
    currentUser = null;
    backendMode = "local";
    connectionStatus = "offline";
  }

  const cfg = getBackendConfig();
  if (!cfg.url || !cfg.anonKey) {
    backendMode = "local";
    connectionStatus = "offline";
    startPeriodicSync();
    dispatchStatus();
    return getStatus();
  }

  connectionStatus = "connecting";
  dispatchStatus();

  // Sin red, el CDN de Supabase puede tardar: no bloquear el arranque offline.
  const mod = await withTimeout(loadSupabaseModule(), 6000).catch(() => null);
  if (!mod) {
    backendMode = "local";
    connectionStatus = "offline";
    console.warn("Strumio: Supabase module could not be loaded. Running local-only.");
    startPeriodicSync();
    dispatchStatus();
    return getStatus();
  }
  client = createClientFromConfig(cfg);
  if (!client) {
    backendMode = "error";
    connectionStatus = "offline";
    startPeriodicSync();
    dispatchStatus();
    return getStatus();
  }

  // restore session
  try {
    await ensureSession();
    syncLocalUserFromSession();
  } catch (e) {
    console.warn("getSession error", e);
  }

  // auth state listener
  try {
    client.auth.onAuthStateChange((event, sess) => {
      session = sess;
      currentUser = sess ? sess.user : null;
      persistSession(sess);
      if (sess && sess.user) {
        upsertUserProfile(sess.user).catch(() => {});
      }
      if (sess && sess.user) {
        syncLocalUserFromSession();
        connectionStatus = "connected";
        startRealtime();
        // Al volver de Google/Apple, trae el progreso de la nube.
        pullProgress().catch(() => {});
      } else {
        connectionStatus = isConfigured() ? "connecting" : "offline";
      }
      dispatchStatus();
      notifyAuth(event, sess);
    });
  } catch (e) {
    console.warn("onAuthStateChange error", e);
  }

  backendMode = "online";
  connectionStatus = isOnline() ? "connected" : "offline";
  // flush queued ops
  if (isOnline()) {
    flushQueue().catch(() => {});
  }
  startPeriodicSync();
  if (isRealtimeEnabled() && isOnline()) startRealtime();
  dispatchStatus();
  return getStatus();
}

export function getStatus() {
  return {
    mode: backendMode,
    configured: isConfigured(),
    online: isOnline(),
    connectionStatus,
    realtime: isRealtimeEnabled(),
    user: currentUser ? { id: currentUser.id, email: currentUser.email } : null,
    queueSize: getQueueSize(),
    lastSyncAt
  };
}

async function handleOnline() {
  if (!client) return;
  connectionStatus = "connecting";
  dispatchStatus();
  await ensureSession();
  await flushQueue().catch(() => {});
  if (currentUser) {
    await pushProgress().catch(() => {});
  }
  connectionStatus = "connected";
  dispatchStatus();
  if (isRealtimeEnabled()) startRealtime();
}

function startPeriodicSync() {
  if (periodicTimer) clearInterval(periodicTimer);
  periodicTimer = setInterval(() => {
    if (!isOnline()) return;
    if (!client || !currentUser) return;
    syncProgress().catch(() => {});
  }, 5 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export async function signUp(email, password, name) {
  ensureStateDefaults();
  if (!client) return { data: null, error: new Error("Backend not configured"), user: null, session: null };
  try {
    const { data, error } = await withRetry(() => client.auth.signUp({
      email,
      password,
      options: { data: { full_name: name || "", name: name || "" } }
    }));
    if (error) return { data, error, user: null, session: null };
    if (data && data.session) {
      session = data.session;
      currentUser = data.session.user;
      persistSession(data.session);
    } else if (data && data.user) {
      currentUser = data.user;
    }
    if (currentUser) {
      await upsertUserProfile(currentUser, name);
    }
    return { data, error: null, user: currentUser, session };
  } catch (e) {
    return { data: null, error: e, user: null, session: null };
  }
}

export async function signIn(email, password) {
  if (!client) return { data: null, error: new Error("Backend not configured"), user: null, session: null };
  try {
    const { data, error } = await withRetry(() => client.auth.signInWithPassword({ email, password }));
    if (error) return { data, error, user: null, session: null };
    session = data.session;
    currentUser = data.session ? data.session.user : data.user;
    persistSession(data.session);
    if (currentUser) await upsertUserProfile(currentUser);
    pullProgress().catch(() => {});
    connectionStatus = "connected";
    dispatchStatus();
    return { data, error: null, user: currentUser, session };
  } catch (e) {
    return { data: null, error: e, user: null, session: null };
  }
}

/* ---------------------------------------------------------------------------
   Acceso simplificado: OAuth (Google, Apple, GitHub…) y enlace por email
   --------------------------------------------------------------------------- */
export function getAuthRedirectUrl() {
  return window.location.origin + window.location.pathname;
}

/**
 * Abre el consentimiento del proveedor (Google, GitHub, Discord…).
 * El navegador sale y vuelve a la app; supabase-js detecta la sesión sola.
 */
export async function signInWithProvider(provider) {
  if (!client) await initBackend();
  if (!client) return { error: new Error("Backend no configurado") };
  try {
    const { data, error } = await client.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: getAuthRedirectUrl(),
        queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
      },
    });
    return { data, error };
  } catch (e) {
    return { error: e };
  }
}

let authSettingsCache = null;

export function resetAuthSettingsCache() {
  authSettingsCache = null;
}

/** Qué proveedores tiene activados el proyecto (se lee de la API pública). */
export async function getAuthSettings(force = false) {
  if (authSettingsCache && !force) return authSettingsCache;
  const cfg = getBackendConfig();
  if (!cfg.url || !cfg.anonKey) {
    return { providers: {}, email: false, anonymous: false };
  }
  try {
    const r = await fetch(cfg.url.replace(/\/$/, "") + "/auth/v1/settings", {
      headers: { apikey: cfg.anonKey, Authorization: "Bearer " + cfg.anonKey },
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const ext = j.external || {};
    authSettingsCache = {
      providers: {
        google: !!ext.google,
        apple: !!ext.apple,
        facebook: !!ext.facebook,
        github: !!ext.github,
        discord: !!ext.discord,
      },
      email: !!ext.email,
      anonymous: !!ext.anonymous_users,
      mailerAutoconfirm: !!j.mailer_autoconfirm,
    };
  } catch (e) {
    authSettingsCache = { providers: {}, email: true, anonymous: false, error: String(e) };
  }
  return authSettingsCache;
}

/** Enlace mágico: sin contraseña, un clic en el correo. */
export async function signInWithMagicLink(email) {
  if (!client) await initBackend();
  if (!client) return { error: new Error("Backend no configurado") };
  try {
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: getAuthRedirectUrl(), shouldCreateUser: true },
    });
    return { error };
  } catch (e) {
    return { error: e };
  }
}

export async function signOut() {
  if (client) {
    try { await client.auth.signOut(); } catch (e) {}
  }
  try { stopRealtime(); } catch (e) {}
  session = null;
  currentUser = null;
  persistSession(null);
  connectionStatus = isConfigured() ? "connecting" : "offline";
  dispatchStatus();
  notifyAuth("SIGNED_OUT", null);
  return true;
}

export function onAuthStateChange(cb) {
  if (typeof cb !== "function") return () => {};
  authListeners.push(cb);
  try { cb(session ? "INITIAL" : "NO_SESSION", session); } catch (e) {}
  return () => {
    authListeners = authListeners.filter(x => x !== cb);
  };
}

export async function signInAnonymously() {
  if (client) {
    try {
      const { data, error } = await withRetry(() => client.auth.signInAnonymously());
      if (error) return { data, error, user: null, session: null, guest: false };
      session = data.session;
      currentUser = data.session ? data.session.user : data.user;
      persistSession(data.session);
      if (currentUser) await upsertUserProfile(currentUser, "Invitado");
      return { data, error: null, user: currentUser, session, guest: false };
    } catch (e) {
      return { data: null, error: e, user: null, session: null, guest: false };
    }
  }
  enableGuestMode("Invitado");
  return { data: { user: state.user }, error: null, user: state.user, session: null, guest: true };
}

export function enableGuestMode(name) {
  ensureStateDefaults();
  state.user = { name: name || "Invitado", guest: true, instrument: state.settings.instrument || "guitar" };
  saveState(state);
  return state.user;
}

async function generateUsernameCandidate(user, nameOverride) {
  const meta = (user.user_metadata || {});
  const baseName = nameOverride || meta.full_name || meta.name || meta.display_name || (user.email ? user.email.split("@")[0] : "usuario");
  let base = String(baseName || "usuario").toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!base) base = "usuario";
  let candidate = base;
  try {
    const { data } = await client.from("users").select("id").eq("username", candidate).maybeSingle();
    if (data && data.id && data.id !== user.id) {
      candidate = base + Math.floor(Math.random() * 9000 + 1000);
    }
  } catch (e) {}
  return candidate;
}

async function upsertUserProfile(user, nameOverride) {
  if (!client || !user) return;
  const meta = (user.user_metadata || {});
  const name = nameOverride || meta.full_name || meta.name || meta.display_name || (user.email ? user.email.split("@")[0] : "Usuario");
  try {
    // Conserva el username existente si ya tiene uno.
    let username = null;
    try {
      const { data: existing } = await client.from("users").select("username").eq("id", user.id).maybeSingle();
      username = existing && existing.username ? existing.username : null;
    } catch (e) {}
    if (!username) username = await generateUsernameCandidate(user, nameOverride);

    const doUpsert = async (uname) => {
      const { error } = await client.from("users").upsert({
        id: user.id,
        email: user.email || "",
        name,
        username: uname,
        updated_at: getNowISO()
      }, { onConflict: "id" });
      if (error) throw error;
    };
    try {
      await withRetry(() => doUpsert(username));
    } catch (e) {
      // Conflicto de unicidad: reintenta con sufijo aleatorio.
      const retry = username + Math.floor(Math.random() * 9000 + 1000);
      await withRetry(() => doUpsert(retry));
      username = retry;
    }
    try {
      if (!state.user) state.user = { name, email: user.email || "", guest: false };
      state.user.username = username;
      if (user.email) state.user.email = user.email;
      saveState(state);
    } catch (e) {}
  } catch (e) {
    console.warn("upsertUserProfile error", e);
  }
}

// ---------------------------------------------------------------------------
// Progress sync
// ---------------------------------------------------------------------------
export async function pushProgress() {
  ensureStateDefaults();
  if (!client || !currentUser) {
    if (isConfigured()) {
      enqueueProgress(buildProgressPayload());
      scheduleBatchSync();
    }
    return { queued: true, ok: false };
  }
  if (!isOnline()) {
    enqueueProgress(buildProgressPayload());
    scheduleBatchSync();
    return { queued: true, ok: false };
  }
  const payload = buildProgressPayload();
  payload.user_id = currentUser.id;
  try {
    await withRetry(async () => {
      const { error } = await client.from("progress").upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
    });
    // submit weekly score
    const weeklyXp = getWeeklyXp();
    await submitScore(weeklyXp).catch(() => {});
    lastSyncAt = Date.now();
    state.sync.lastSyncAt = lastSyncAt;
    saveState(state);
    dispatchStatus();
    return { ok: true, error: null };
  } catch (e) {
    enqueueProgress(payload);
    scheduleBatchSync();
    return { ok: false, error: e };
  }
}

export async function pullProgress() {
  ensureStateDefaults();
  if (!client || !currentUser) return { ok: false, error: new Error("Not authenticated") };
  if (!isOnline()) return { ok: false, error: new Error("Offline") };
  try {
    const data = await withRetry(async () => {
      const { data, error } = await client.from("progress").select("*").eq("user_id", currentUser.id).maybeSingle();
      if (error) throw error;
      return data;
    });
    if (!data) {
      await pushProgress();
      return { ok: true, merged: false, created: true };
    }
    const remoteUpdated = data.updated_at ? new Date(data.updated_at).getTime() : 0;
    const localUpdated = state.sync.lastSyncAt || 0;
    // conflict resolution: merge with local (max XP, max streak, union completed)
    mergeRemoteProgress(data);
    if (remoteUpdated > localUpdated) {
      lastSyncAt = remoteUpdated;
    } else if (localUpdated > remoteUpdated) {
      await pushProgress();
      lastSyncAt = Math.max(lastSyncAt, localUpdated);
    } else {
      lastSyncAt = Math.max(lastSyncAt, remoteUpdated, localUpdated);
    }
    state.sync.lastSyncAt = lastSyncAt || Date.now();
    saveState(state);
    dispatchStatus();
    return { ok: true, merged: true, data };
  } catch (e) {
    return { ok: false, error: e };
  }
}

export async function syncProgress() {
  ensureStateDefaults();
  if (!isOnline()) {
    enqueueProgress(buildProgressPayload());
    scheduleBatchSync();
    return { queued: true };
  }
  if (!client || !currentUser) return { skipped: true };
  const r = await pushProgress();
  await pullProgress().catch(() => {});
  return r;
}

function getWeeklyXp() {
  ensureStateDefaults();
  const weekStart = getWeekStartMonday();
  let total = 0;
  const log = state.dailyLog || {};
  for (const [key, val] of Object.entries(log)) {
    const d = new Date(key);
    if (isNaN(d.getTime())) continue;
    if (d >= weekStart) {
      total += (val && typeof val.xp === "number") ? val.xp : 0;
    }
  }
  if (total <= 0) total = state.xp || 0;
  return total;
}

export async function resetRemoteProgress() {
  ensureStateDefaults();
  if (!client || !currentUser) {
    if (isConfigured()) {
      enqueue({ type: "resetProgress", payload: {} });
      scheduleBatchSync();
      return { queued: true };
    }
    return { ok: true };
  }
  if (!isOnline()) {
    enqueue({ type: "resetProgress", payload: {} });
    scheduleBatchSync();
    return { queued: true };
  }
  try {
    await withRetry(async () => {
      const { error } = await client.from("progress").delete().eq("user_id", currentUser.id);
      if (error) throw error;
    });
    await withRetry(async () => {
      const { error } = await client.from("weekly_scores").delete().eq("user_id", currentUser.id);
      if (error) throw error;
    }).catch(() => {});
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e };
  }
}

// queue flushing handler
async function flushQueue() {
  const res = await flush(async (op) => {
    if (!client || !currentUser) return false;
    await ensureSession();
    switch (op.type) {
      case "pushProgress": {
        const payload = { ...(op.payload || {}), user_id: currentUser.id, updated_at: getNowISO() };
        await withRetry(async () => {
          const { error } = await client.from("progress").upsert(payload, { onConflict: "user_id" });
          if (error) throw error;
        });
        return true;
      }
      case "submitScore": {
        const xp = (op.payload && typeof op.payload.xp === "number") ? op.payload.xp : (op.payload && op.payload.xp) || 0;
        const r = await submitScore(xp);
        return !r.error;
      }
      case "addFriend": {
        return await flushAddFriend(op.payload);
      }
      case "challenge": {
        return await flushChallenge(op.payload);
      }
      case "activity": {
        return await flushActivity(op.payload);
      }
      case "resetProgress": {
        const r = await resetRemoteProgress();
        return !(r && r.error);
      }
      default:
        return true;
    }
  });
  try { window.dispatchEvent(new CustomEvent("strumio:queue-changed", { detail: { size: getQueueSize() } })); } catch (e) {}
  dispatchStatus();
  return res;
}

export { flushQueue };

// batch sync
export function scheduleBatchSync(delay = 1200) {
  if (batchTimer) return;
  batchTimer = setTimeout(() => {
    batchTimer = null;
    if (!isOnline()) return;
    if (!client || !currentUser) return;
    syncProgress().catch(() => {});
  }, delay);
}

export async function syncBatch() {
  return await flushQueue();
}

// optimistic updates
export function optimisticUpdate(mutate, syncFn) {
  try { if (typeof mutate === "function") mutate(); } catch (e) { console.warn(e); }
  try { saveState(state); } catch (e) {}
  try { window.dispatchEvent(new CustomEvent("strumio:state-changed")); } catch (e) {}
  if (typeof syncFn === "function") {
    Promise.resolve().then(() => { try { syncFn(); } catch (e) {} });
  } else {
    scheduleBatchSync();
  }
}

// ---------------------------------------------------------------------------
// Weekly leaderboards
// ---------------------------------------------------------------------------
export async function submitScore(xp) {
  ensureStateDefaults();
  const score = Number(xp) || 0;
  if (!client || !currentUser) {
    enqueue({ type: "submitScore", payload: { xp: score } });
    scheduleBatchSync();
    return { queued: true, error: null };
  }
  if (!isOnline()) {
    enqueue({ type: "submitScore", payload: { xp: score } });
    scheduleBatchSync();
    return { queued: true, error: null };
  }
  try {
    await withRetry(async () => {
      const weekStart = getWeekStartISO();
      const { error } = await client.from("weekly_scores").upsert({
        user_id: currentUser.id,
        week_start: weekStart,
        xp: score,
        updated_at: getNowISO()
      }, { onConflict: "user_id,week_start" });
      if (error) throw error;
    });
    return { ok: true, error: null };
  } catch (e) {
    enqueue({ type: "submitScore", payload: { xp: score } });
    scheduleBatchSync();
    return { ok: false, error: e };
  }
}

export async function getWeeklyLeaderboard(limit = 50) {
  ensureStateDefaults();
  if (!client || !isOnline()) {
    const cached = cacheGet("leaderboard", 10 * 60 * 1000);
    return cached || cachedLeaderboard || [];
  }
  try {
    const rows = await withRetry(async () => {
      const weekStart = getWeekStartISO();
      const { data, error } = await client
        .from("weekly_scores")
        .select("user_id, xp, updated_at, users(name)")
        .eq("week_start", weekStart)
        .order("xp", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []).map((r, i) => ({
        rank: i + 1,
        userId: r.user_id,
        name: (r.users && r.users.name) || "Usuario",
        xp: r.xp || 0,
        isMe: currentUser && r.user_id === currentUser.id
      }));
    });
    cachedLeaderboard = rows;
    cacheSet("leaderboard", rows);
    return rows;
  } catch (e) {
    const cached = cacheGet("leaderboard", 60 * 60 * 1000);
    return cached || cachedLeaderboard || [];
  }
}

export const getLeaderboard = getWeeklyLeaderboard;

// ---------------------------------------------------------------------------
// Social: friends
// ---------------------------------------------------------------------------
export async function getFriends() {
  if (!client || !currentUser || !isOnline()) {
    return cacheGet("friends", 60 * 60 * 1000) || [];
  }
  try {
    const friends = await withRetry(async () => {
      const uid = currentUser.id;
      const { data, error } = await client
        .from("friendships")
        .select("id, requester_id, addressee_id, status, created_at, requester:users!requester_id(id,name,email,username), addressee:users!addressee_id(id,name,email,username)")
        .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);
      if (error) throw error;
      const out = [];
      for (const f of (data || [])) {
        if (f.status !== "accepted") continue;
        const other = f.requester_id === uid ? f.addressee : f.requester;
        if (other) out.push({ friendshipId: f.id, id: other.id, name: other.name, email: other.email, username: other.username, status: f.status });
      }
      return out;
    });
    cacheSet("friends", friends);
    return friends;
  } catch (e) {
    return cacheGet("friends", 60 * 60 * 1000) || [];
  }
}

export async function getFriendRequests() {
  if (!client || !currentUser || !isOnline()) return [];
  try {
    return await withRetry(async () => {
      const uid = currentUser.id;
      const { data, error } = await client
        .from("friendships")
        .select("id, requester_id, addressee_id, status, created_at, requester:users!requester_id(id,name,email,username)")
        .eq("addressee_id", uid)
        .eq("status", "pending");
      if (error) throw error;
      return (data || []).map(f => ({
        id: f.id,
        from: f.requester,
        createdAt: f.created_at
      }));
    });
  } catch (e) {
    return [];
  }
}

export async function addFriendByEmail(email) {
  ensureStateDefaults();
  if (!client || !currentUser) {
    enqueue({ type: "addFriend", payload: { email } });
    scheduleBatchSync();
    return { queued: true };
  }
  if (!isOnline()) {
    enqueue({ type: "addFriend", payload: { email } });
    scheduleBatchSync();
    return { queued: true };
  }
  try {
    const target = await withRetry(async () => {
      const { data, error } = await client.from("users").select("id,name,email").eq("email", email).maybeSingle();
      if (error) throw error;
      return data;
    });
    if (!target) return { ok: false, error: new Error(t("backend.userNotFound")) };
    if (target.id === currentUser.id) return { ok: false, error: new Error(t("backend.cannotAddSelf")) };
    // Deduplicar solicitudes existentes en cualquier dirección.
    const existing = await withRetry(async () => {
      const uid = currentUser.id;
      const { data, error } = await client.from("friendships").select("id,status").or(`and(requester_id.eq.${uid},addressee_id.eq.${target.id}),and(requester_id.eq.${target.id},addressee_id.eq.${uid})`);
      if (error) throw error;
      return data || [];
    });
    if (existing.some(f => f.status === "accepted")) return { ok: false, error: new Error(t("backend.alreadyFriends")) };
    if (existing.some(f => f.status === "pending")) return { ok: false, error: new Error(t("backend.pendingRequestExists")) };
    await withRetry(async () => {
      const { error } = await client.from("friendships").insert({
        requester_id: currentUser.id,
        addressee_id: target.id,
        status: "pending"
      });
      if (error) throw error;
    });
    await postActivity("friend_request", { to: target.id, name: target.name }).catch(() => {});
    return { ok: true, friend: target };
  } catch (e) {
    return { ok: false, error: e };
  }
}

export async function addFriendByUsername(username) {
  ensureStateDefaults();
  const uname = String(username || "").trim().toLowerCase().replace(/^@/, "");
  if (!uname) return { ok: false, error: new Error(t("backend.usernameEmpty")) };
  if (!client || !currentUser) {
    enqueue({ type: "addFriend", payload: { username: uname } });
    scheduleBatchSync();
    return { queued: true };
  }
  if (!isOnline()) {
    enqueue({ type: "addFriend", payload: { username: uname } });
    scheduleBatchSync();
    return { queued: true };
  }
  try {
    const target = await withRetry(async () => {
      const { data, error } = await client.from("users").select("id,name,email,username").eq("username", uname).maybeSingle();
      if (error) throw error;
      return data;
    });
    if (!target) return { ok: false, error: new Error(t("backend.userNotFound")) };
    if (target.id === currentUser.id) return { ok: false, error: new Error(t("backend.cannotAddSelf")) };
    const existing = await withRetry(async () => {
      const uid = currentUser.id;
      const { data, error } = await client.from("friendships").select("id,status").or(`and(requester_id.eq.${uid},addressee_id.eq.${target.id}),and(requester_id.eq.${target.id},addressee_id.eq.${uid})`);
      if (error) throw error;
      return data || [];
    });
    if (existing.some(f => f.status === "accepted")) return { ok: false, error: new Error(t("backend.alreadyFriends")) };
    if (existing.some(f => f.status === "pending")) return { ok: false, error: new Error(t("backend.pendingRequestExists")) };
    await withRetry(async () => {
      const { error } = await client.from("friendships").insert({
        requester_id: currentUser.id,
        addressee_id: target.id,
        status: "pending"
      });
      if (error) throw error;
    });
    await postActivity("friend_request", { to: target.id, name: target.name }).catch(() => {});
    return { ok: true, friend: target };
  } catch (e) {
    return { ok: false, error: e };
  }
}

async function flushAddFriend(payload) {
  if (!client || !currentUser) return false;
  if (payload && payload.username) {
    const r = await addFriendByUsername(payload.username);
    return !!r.ok;
  }
  const r = await addFriendByEmail(payload.email);
  return !!r.ok;
}

export async function acceptFriend(friendshipId) {
  if (!client || !currentUser || !isOnline()) return { ok: false, error: new Error("Offline or not configured") };
  try {
    await withRetry(async () => {
      const { error } = await client.from("friendships").update({ status: "accepted", updated_at: getNowISO() }).eq("id", friendshipId);
      if (error) throw error;
    });
    await postActivity("friend_accepted", { friendshipId }).catch(() => {});
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e };
  }
}

export async function rejectFriend(friendshipId) {
  if (!client || !currentUser || !isOnline()) return { ok: false, error: new Error("Offline or not configured") };
  try {
    await withRetry(async () => {
      const { error } = await client.from("friendships").update({ status: "rejected", updated_at: getNowISO() }).eq("id", friendshipId);
      if (error) throw error;
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e };
  }
}

export async function removeFriend(friendshipId) {
  if (!client || !currentUser || !isOnline()) return { ok: false, error: new Error("Offline or not configured") };
  try {
    await withRetry(async () => {
      const { error } = await client.from("friendships").delete().eq("id", friendshipId);
      if (error) throw error;
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e };
  }
}

// ---------------------------------------------------------------------------
// Social: share progress
// ---------------------------------------------------------------------------
export function generateShareLink() {
  ensureStateDefaults();
  const payload = {
    name: (state.user && state.user.name) || "Guitarrista",
    level: state.level || 1,
    xp: state.xp || 0,
    streak: state.streak || 0,
    lessons: (state.stats && state.stats.lessonsCompleted) || Object.keys(state.completed || {}).length,
    t: Date.now()
  };
  let encoded;
  try {
    encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  } catch (e) {
    encoded = "";
  }
  const base = (typeof location !== "undefined") ? (location.origin + location.pathname) : "";
  return base + "#share=" + encoded;
}

export function parseShareLink(hash) {
  const h = hash || (typeof location !== "undefined" ? location.hash : "");
  const m = /share=([^&]+)/.exec(h || "");
  if (!m) return null;
  try {
    return JSON.parse(decodeURIComponent(escape(atob(m[1]))));
  } catch (e) {
    return null;
  }
}

export async function shareProgress() {
  const link = generateShareLink();
  if (client && currentUser && isOnline()) {
    await postActivity("share_progress", { link, level: state.level, xp: state.xp }).catch(() => {});
  }
  return link;
}

// ---------------------------------------------------------------------------
// Social: challenges
// ---------------------------------------------------------------------------
export async function challengeFriend(friendId, lessonId) {
  ensureStateDefaults();
  if (!client || !currentUser) {
    enqueue({ type: "challenge", payload: { friendId, lessonId } });
    scheduleBatchSync();
    return { queued: true };
  }
  if (!isOnline()) {
    enqueue({ type: "challenge", payload: { friendId, lessonId } });
    scheduleBatchSync();
    return { queued: true };
  }
  try {
    const data = await withRetry(async () => {
      const { data, error } = await client.from("challenges").insert({
        challenger_id: currentUser.id,
        challenged_id: friendId,
        lesson_id: lessonId || null,
        status: "pending",
        created_at: getNowISO()
      }).select().single();
      if (error) throw error;
      return data;
    });
    await postActivity("challenge_sent", { to: friendId, lessonId }).catch(() => {});
    return { ok: true, challenge: data };
  } catch (e) {
    enqueue({ type: "challenge", payload: { friendId, lessonId } });
    scheduleBatchSync();
    return { ok: false, error: e };
  }
}

async function flushChallenge(payload) {
  if (!client || !currentUser) return false;
  const r = await challengeFriend(payload.friendId, payload.lessonId);
  return !!r.ok;
}

export async function getChallenges() {
  if (!client || !currentUser || !isOnline()) return [];
  try {
    return await withRetry(async () => {
      const uid = currentUser.id;
      const { data, error } = await client
        .from("challenges")
        .select("id, challenger_id, challenged_id, lesson_id, status, score, created_at, challenger:users!challenger_id(name), challenged:users!challenged_id(name)")
        .or(`challenger_id.eq.${uid},challenged_id.eq.${uid}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    });
  } catch (e) {
    return [];
  }
}

export async function acceptChallenge(challengeId) {
  if (!client || !currentUser || !isOnline()) return { ok: false, error: new Error("Offline or not configured") };
  try {
    await withRetry(async () => {
      const { error } = await client.from("challenges").update({ status: "accepted" }).eq("id", challengeId);
      if (error) throw error;
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e };
  }
}

export async function completeChallenge(challengeId, score) {
  if (!client || !currentUser || !isOnline()) return { ok: false, error: new Error("Offline or not configured") };
  try {
    await withRetry(async () => {
      const { error } = await client.from("challenges").update({ status: "completed", score: score || 0, completed_at: getNowISO() }).eq("id", challengeId);
      if (error) throw error;
    });
    await postActivity("challenge_completed", { challengeId, score }).catch(() => {});
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e };
  }
}

// ---------------------------------------------------------------------------
// Activity feed
// ---------------------------------------------------------------------------
export async function postActivity(type, payload = {}) {
  if (!client || !currentUser) {
    enqueue({ type: "activity", payload: { type, payload } });
    scheduleBatchSync();
    return { queued: true };
  }
  if (!isOnline()) {
    enqueue({ type: "activity", payload: { type, payload } });
    scheduleBatchSync();
    return { queued: true };
  }
  try {
    await withRetry(async () => {
      const { error } = await client.from("activity_feed").insert({
        user_id: currentUser.id,
        type,
        payload,
        created_at: getNowISO()
      });
      if (error) throw error;
    });
    return { ok: true };
  } catch (e) {
    enqueue({ type: "activity", payload: { type, payload } });
    scheduleBatchSync();
    return { ok: false, error: e };
  }
}

async function flushActivity(payload) {
  if (!client || !currentUser) return false;
  const r = await postActivity(payload.type, payload.payload || {});
  return !!r.ok;
}

export async function getActivityFeed(limit = 20) {
  if (!client || !currentUser || !isOnline()) {
    return cacheGet("activity", 5 * 60 * 1000) || [];
  }
  try {
    return await withRetry(async () => {
      const friends = await getFriends();
      const ids = friends.map(f => f.id);
      if (!ids.length) return [];
      const { data, error } = await client
        .from("activity_feed")
        .select("id, user_id, type, payload, created_at, user:users(name)")
        .in("user_id", ids)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      const rows = data || [];
      cacheSet("activity", rows);
      return rows;
    });
  } catch (e) {
    return cacheGet("activity", 60 * 60 * 1000) || [];
  }
}

// ---------------------------------------------------------------------------
// Realtime subscriptions
// ---------------------------------------------------------------------------
function startRealtime() {
  if (!client || !isRealtimeEnabled()) return;
  stopRealtime();
  connectionStatus = "connecting";
  dispatchStatus();
  try {
    const ch1 = client.channel("strumio-leaderboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "weekly_scores" }, (payload) => {
        cachedLeaderboard = null;
        notifyRealtime("leaderboard", payload);
        dispatchRealtime("leaderboard", payload);
        getWeeklyLeaderboard().catch(() => {});
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          connectionStatus = "connected";
          dispatchStatus();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          connectionStatus = "offline";
          dispatchStatus();
        }
      });

    const ch2 = client.channel("strumio-activity")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_feed" }, (payload) => {
        notifyRealtime("activity", payload);
        dispatchRealtime("activity", payload);
        cacheSet("activity", null);
      })
      .subscribe();

    const ch3 = client.channel("strumio-challenges")
      .on("postgres_changes", { event: "*", schema: "public", table: "challenges" }, (payload) => {
        notifyRealtime("challenges", payload);
        dispatchRealtime("challenges", payload);
      })
      .subscribe();

    realtimeChannels.push(ch1, ch2, ch3);
  } catch (e) {
    console.warn("realtime start error", e);
  }
}

function stopRealtime() {
  if (!client) return;
  for (const ch of realtimeChannels) {
    try { client.removeChannel(ch); } catch (e) {}
  }
  realtimeChannels = [];
}

export function onRealtimeChange(type, cb) {
  if (typeof cb !== "function") return () => {};
  const key = type || "all";
  if (!realtimeListeners[key]) realtimeListeners[key] = [];
  realtimeListeners[key].push(cb);
  return () => {
    realtimeListeners[key] = (realtimeListeners[key] || []).filter(x => x !== cb);
  };
}

function notifyRealtime(type, payload) {
  const cbs = realtimeListeners[type] || [];
  for (const cb of cbs) { try { cb(payload); } catch (e) { console.warn(e); } }
  for (const cb of (realtimeListeners.all || [])) { try { cb(type, payload); } catch (e) {} }
}

// ---------------------------------------------------------------------------
// Settings UI
// ---------------------------------------------------------------------------
export async function renderBackendSettings(container) {
  if (!container) return;
  ensureStateDefaults();
  const cfg = getBackendConfig();
  const status = getStatus();

  container.innerHTML = `
    <div class="card" id="authCard">
      <p style="color:var(--muted);font-size:13px;margin:0 0 10px">${t("backend.authIntro")}</p>
      <div id="authArea"></div>
    </div>

    <div id="socialCards" hidden>
      <div class="card">
        <h3>${t("backend.leaderboardWeekly")}</h3>
        <div id="lbArea"></div>
        <button class="btn btn-secondary btn-sm" id="lbRefreshBtn" style="margin-top:8px">${t("backend.refresh")}</button>
      </div>
      <div class="card">
        <h3>${t("backend.friends")}</h3>
        <div id="friendsArea"></div>
      </div>
      <div class="card">
        <h3>${t("backend.friendsActivity")}</h3>
        <div id="activityArea"></div>
      </div>
      <div class="card">
        <h3>${t("backend.shareChallenges")}</h3>
        <div id="socialArea"></div>
      </div>
    </div>
  `;

  const signedIn = () => !!(getSession().user || currentUser);

  async function renderAuthArea() {
    const area = container.querySelector("#authArea");
    if (!area) return;
    const sess = getSession();
    const user = sess.user || currentUser;
    if (isConfigured() && (client || supabaseModule)) {
      if (!client) await initBackend();
    }
    if (user) {
      const last = getLastSyncAt();
      area.innerHTML = `
        <p>${t("backend.sessionLabel")}: <b>${escapeHtml(user.email || user.name || t("backend.user"))}</b></p>
        <p style="color:var(--muted);font-size:13px">${t("backend.lastSync")}: ${last ? new Date(last).toLocaleString() : t("backend.never")}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" id="syncNowBtn">${t("backend.syncNow")}</button>
          <button class="btn btn-secondary btn-sm" id="signOutBtn">${t("backend.signOut")}</button>
        </div>
      `;
      const syncBtn = area.querySelector("#syncNowBtn");
      if (syncBtn) syncBtn.onclick = async () => {
        syncBtn.disabled = true;
        await syncProgress();
        toast(t("backend.synced"));
        renderAuthArea();
      };
      const btn = area.querySelector("#signOutBtn");
      if (btn) btn.onclick = async () => {
        await signOut();
        toast(t("backend.signedOut"));
        renderAuthArea();
      };
    } else {
      area.innerHTML = `
        <div class="auth-providers" id="authProviders">
          <div class="auth-loading"><span class="spinner"></span> ${t("backend.checkingAccessMethods")}</div>
        </div>
        <div class="auth-divider"><span>${t("backend.orWithEmail")}</span></div>
        <input id="authEmail" class="auth-input" type="email" placeholder="${t("backend.emailPlaceholder")}" autocomplete="email" inputmode="email">
        <input id="authPass" class="auth-input" type="password" placeholder="${t("backend.passwordPlaceholder")}" autocomplete="current-password">
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" id="loginBtn" style="flex:1">Entrar</button>
          <button class="btn btn-secondary" id="signupBtn" style="flex:1">Crear cuenta</button>
        </div>
        <button class="auth-link" id="magicBtn">${t("backend.magicLinkButton")}</button>
      `;

      const emailEl = area.querySelector("#authEmail");
      const passEl = area.querySelector("#authPass");
      const providersBox = area.querySelector("#authProviders");

      function busy(on) {
        area.querySelectorAll("button").forEach((b) => { b.disabled = !!on; });
      }

      function needCreds() {
        const email = emailEl.value.trim();
        const pass = passEl.value;
        if (!email) { toast(t("backend.enterEmail")); emailEl.focus(); return null; }
        if (!pass || pass.length < 6) { toast(t("backend.passwordMin")); passEl.focus(); return null; }
        return { email, pass };
      }

      area.querySelector("#loginBtn").onclick = async () => {
        const c = needCreds();
        if (!c) return;
        busy(true);
        const r = await signIn(c.email, c.pass);
        busy(false);
        if (r.error) { toast(t("backend.errorPrefix") + " " + friendlyError(r.error)); return; }
        toast(t("backend.welcomeBack"));
        renderAuthArea();
        refreshAll();
      };

      area.querySelector("#signupBtn").onclick = async () => {
        const c = needCreds();
        if (!c) return;
        busy(true);
        const r = await signUp(c.email, c.pass, "");
        busy(false);
        if (r.error) { toast(t("backend.errorPrefix") + " " + friendlyError(r.error)); return; }
        if (r.session) {
          toast(t("backend.accountCreated"));
          renderAuthArea();
          refreshAll();
        } else {
          toast(t("backend.accountCreatedConfirm"));
        }
      };

      area.querySelector("#magicBtn").onclick = async () => {
        const email = emailEl.value.trim();
        if (!email) { toast(t("backend.enterEmailFirst")); emailEl.focus(); return; }
        busy(true);
        const r = await signInWithMagicLink(email);
        busy(false);
        if (r.error) { toast(t("backend.errorPrefix") + " " + friendlyError(r.error)); return; }
        toast(t("backend.magicLinkSent"));
      };

      async function renderProviders() {
        if (!providersBox) return;
        const s = await getAuthSettings(true);
        // Por ahora solo Google (además del email).
        const enabled = OAUTH_PROVIDERS.filter((p) => p.id === "google" && s.providers && s.providers[p.id]);
        if (!enabled.length) {
          providersBox.innerHTML = "";
          const div = area.querySelector(".auth-divider");
          if (div) div.remove();
          return;
        }
        providersBox.innerHTML = enabled.map((p) => `
          <button class="btn-oauth ${p.cls}" data-provider="${p.id}" type="button">
            <span class="oauth-ico">${p.icon || p.short}</span>
            <span>${p.label}</span>
          </button>`).join("");
        providersBox.querySelectorAll("[data-provider]").forEach((btn) => {
          btn.onclick = async () => {
            btn.disabled = true;
            const r = await signInWithProvider(btn.dataset.provider);
            if (r && r.error) {
              toast(t("backend.errorPrefix") + " " + friendlyError(r.error));
              btn.disabled = false;
            }
          };
        });
      }

      renderProviders();
    }
  }

  async function renderLeaderboard() {
    const area = container.querySelector("#lbArea");
    if (!area) return;
    area.innerHTML = "<p>Cargando…</p>";
    const rows = await getWeeklyLeaderboard(50);
    if (!rows.length) {
      area.innerHTML = "<p style='color:var(--muted)'>" + t("backend.noDataYet") + ".</p>";
      return;
    }
    area.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr><th>#</th><th>Nombre</th><th>XP</th></tr></thead>
        <tbody>
          ${rows.map(r => `<tr style="${r.isMe ? "font-weight:800;color:var(--green)" : ""}"><td>${r.rank}</td><td>${escapeHtml(r.name)}</td><td>${r.xp}</td></tr>`).join("")}
        </tbody>
      </table>
    `;
  }

  async function renderFriends() {
    const area = container.querySelector("#friendsArea");
    if (!area) return;
    const friends = await getFriends();
    const requests = await getFriendRequests();
    area.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <input id="friendUsername" type="text" placeholder="${t("backend.usernamePlaceholder")}" style="flex:1;padding:10px;border-radius:10px;border:2px solid var(--border);background:var(--card-2);color:var(--text)">
        <button class="btn btn-primary btn-sm" id="addFriendByUsernameBtn">${t("backend.add")}</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <input id="friendEmail" type="email" placeholder="${t("backend.emailPlaceholder")}" style="flex:1;padding:10px;border-radius:10px;border:2px solid var(--border);background:var(--card-2);color:var(--text)">
        <button class="btn btn-secondary btn-sm" id="addFriendBtn">${t("backend.byEmail")}</button>
      </div>
      ${requests.length ? `<div style="margin-bottom:8px"><b>${t("backend.requests")}:</b>${requests.map(r => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
          <span>${escapeHtml(r.from && r.from.name || r.from && r.from.email || "Usuario")}${r.from && r.from.username ? ` <span style="color:var(--muted);font-size:11px">@${escapeHtml(r.from.username)}</span>` : ""}</span>
          <div style="display:flex;gap:6px">
            <button class="btn btn-primary btn-sm" data-acc="${r.id}">${t("backend.accept")}</button>
            <button class="btn btn-secondary btn-sm" data-rej="${r.id}">${t("backend.reject")}</button>
          </div>
        </div>`).join("")}</div>` : ""}
      <div><b>${t("backend.friends")}:</b> ${friends.length ? friends.map(f => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
          <span>${escapeHtml(f.name || f.email)}${f.username ? ` <span style="color:var(--muted);font-size:11px">@${escapeHtml(f.username)}</span>` : ""}</span>
          <button class="btn btn-secondary btn-sm" data-ch="${f.id}">${t("backend.challenge")}</button>
        </div>`).join("") : "<p style='color:var(--muted)'>" + t("backend.noFriendsYet") + ".</p>"}
      </div>
    `;
    const addUserBtn = area.querySelector("#addFriendByUsernameBtn");
    if (addUserBtn) addUserBtn.onclick = async () => {
      const username = area.querySelector("#friendUsername").value.trim();
      if (!username) { toast(t("backend.enterFriendUsername")); return; }
      const r = await addFriendByUsername(username);
      if (r.error) { toast(t("backend.errorPrefix") + " " + friendlyError(r.error)); return; }
      if (r.queued) { toast(t("backend.queuedOffline")); return; }
      toast(t("backend.friendRequestSent"));
      renderFriends();
    };
    const addBtn = area.querySelector("#addFriendBtn");
    if (addBtn) addBtn.onclick = async () => {
      const email = area.querySelector("#friendEmail").value.trim();
      if (!email) { toast(t("backend.enterFriendEmail")); return; }
      const r = await addFriendByEmail(email);
      if (r.error) { toast(t("backend.errorPrefix") + " " + friendlyError(r.error)); return; }
      if (r.queued) { toast(t("backend.queuedOffline")); return; }
      toast(t("backend.friendRequestSent"));
      renderFriends();
    };
    area.querySelectorAll("[data-acc]").forEach(b => {
      b.onclick = async () => {
        await acceptFriend(b.dataset.acc);
        toast(t("backend.accepted"));
        renderFriends();
      };
    });
    area.querySelectorAll("[data-rej]").forEach(b => {
      b.onclick = async () => {
        await rejectFriend(b.dataset.rej);
        toast(t("backend.rejected"));
        renderFriends();
      };
    });
    area.querySelectorAll("[data-ch]").forEach(b => {
      b.onclick = async () => {
        const friendId = b.dataset.ch;
        const r = await challengeFriend(friendId, null);
        if (r.error) { toast(t("backend.errorPrefix") + " " + friendlyError(r.error)); return; }
        toast(r.queued ? t("backend.challengeQueued") : t("backend.challengeSent"));
      };
    });
  }

  async function renderActivity() {
    const area = container.querySelector("#activityArea");
    if (!area) return;
    area.innerHTML = "<p>Cargando…</p>";
    const rows = await getActivityFeed(20);
    if (!rows.length) {
      area.innerHTML = "<p style='color:var(--muted)'>" + t("backend.noRecentActivity") + ".</p>";
      return;
    }
    area.innerHTML = rows.map(r => {
      const name = (r.user && r.user.name) || "Amigo";
      const when = r.created_at ? new Date(r.created_at).toLocaleString() : "";
      return `<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">
        <b>${escapeHtml(name)}</b> · ${escapeHtml(r.type)} ${r.payload ? escapeHtml(JSON.stringify(r.payload).slice(0, 80)) : ""}
        <div style="color:var(--muted);font-size:11px">${escapeHtml(when)}</div>
      </div>`;
    }).join("");
  }

  async function renderSocial() {
    const area = container.querySelector("#socialArea");
    if (!area) return;
    const link = generateShareLink();
    area.innerHTML = `
      <div style="margin-bottom:8px">
        <button class="btn btn-primary btn-sm" id="shareBtn">${t("backend.generateProgressLink")}</button>
        <input id="shareLink" type="text" readonly value="${escapeHtml(link)}" style="width:100%;padding:8px;border-radius:10px;border:2px solid var(--border);background:var(--card-2);color:var(--text);margin-top:8px;font-size:12px">
      </div>
      <div style="margin-top:8px">
        <button class="btn btn-secondary btn-sm" id="postAchievementBtn">${t("backend.publishAchievement")}</button>
      </div>
    `;
    area.querySelector("#shareBtn").onclick = async () => {
      const l = await shareProgress();
      const inp = area.querySelector("#shareLink");
      if (inp) inp.value = l;
      try { await navigator.clipboard.writeText(l); toast(t("backend.linkCopied")); } catch (e) { toast(t("backend.linkGenerated")); }
    };
    area.querySelector("#postAchievementBtn").onclick = async () => {
      await postActivity("achievement", { level: state.level, xp: state.xp });
      toast(t("backend.published"));
      renderActivity();
    };
  }

  async function refreshAll() {
    await renderAuthArea();
    const social = container.querySelector("#socialCards");
    if (social) social.hidden = !signedIn();
    if (!signedIn()) return;
    await renderLeaderboard();
    await renderFriends();
    await renderActivity();
    await renderSocial();
  }

  // wire
  container.querySelector("#lbRefreshBtn").onclick = async () => {
    await renderLeaderboard();
    toast(t("backend.updated"));
  };

  // realtime updates -> refresh UI
  const rtHandler = (e) => {
    const t = e.detail && e.detail.type;
    if (t === "leaderboard") renderLeaderboard();
    if (t === "activity") renderActivity();
    if (t === "challenges") { /* could refresh */ }
  };
  window.addEventListener("strumio:realtime", rtHandler);

  // onAuthStateChange update UI
  onAuthStateChange(() => { if (container.isConnected) refreshAll(); });

  await refreshAll();
}

// default export bundle
export default {
  initBackend,
  syncProgress,
  syncBatch,
  scheduleBatchSync,
  optimisticUpdate,
  getLeaderboard,
  getWeeklyLeaderboard,
  submitScore,
  getStatus,
  getConnectionStatus,
  setConnectionStatus,
  isRealtimeEnabled,
  setRealtimeEnabled,
  onRealtimeChange,
  friendlyError,
  signUp,
  signIn,
  signOut,
  getSession,
  onAuthStateChange,
  signInAnonymously,
  enableGuestMode,
  pushProgress,
  pullProgress,
  getFriends,
  getFriendRequests,
  addFriendByEmail,
  addFriendByUsername,
  resetRemoteProgress,
  acceptFriend,
  rejectFriend,
  removeFriend,
  generateShareLink,
  parseShareLink,
  shareProgress,
  challengeFriend,
  getChallenges,
  acceptChallenge,
  completeChallenge,
  getActivityFeed,
  postActivity,
  getBackendConfig,
  setBackendConfig,
  isConfigured,
  getClient,
  isOnlineMode,
  getBackendMode,
  getLastSyncAt,
  renderBackendSettings
};