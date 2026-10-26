/* ============================================================
   Strumio — Practicar
   8 secciones. Cada sección abre su propia pantalla a pantalla
   completa, con pestañas para sus herramientas.
   ============================================================ */
import { icon } from "./icons.js";
import { t } from "./i18n.js";

const META_KEY = "strumio_tools_v1";

export const SECTIONS = [
  { id: "hoy", name: "Rutina de hoy", icon: "today", color: "#58cc02", desc: "Sesión guiada de 15 minutos", tools: ["routines"] },
  { id: "acordes", name: "Acordes", icon: "chords", color: "#58cc02", desc: "Aprende, cambia y detecta acordes", tools: ["chords", "voicings", "transitions", "changes", "chordDetect"] },
  { id: "ritmo", name: "Ritmo", icon: "rhythm", color: "#ff9600", desc: "Metrónomo y rasgueo", tools: ["metronome", "strumming", "rhythm"] },
  { id: "banda", name: "Tocar con banda", icon: "band", color: "#ff4b4b", desc: "Bases con batería y bajo reales", tools: ["backing", "practiceMode"] },
  { id: "canciones", name: "Canciones", icon: "songs", color: "#ff6b9d", desc: "Canciones, riffs y tablaturas", tools: ["songs", "songLibrary", "tabs", "tabPlayer"] },
  { id: "mastil", name: "Mástil y escalas", icon: "fretboard", color: "#ce82ff", desc: "Escalas, técnica e improvisación", tools: ["scales", "fretboard", "fingerExercises", "techniques", "improvisation"] },
  { id: "oido", name: "Oído", icon: "ear", color: "#1cb0f6", desc: "Intervalos y tipos de acorde", tools: ["ear", "interval", "chordType", "voicingQuiz"] },
  { id: "teoria", name: "Teoría y utilidades", icon: "theory", color: "#ffc800", desc: "Teoría, estilos, cejilla y vídeos", tools: ["theory", "styles", "capo", "transposition", "videos"] },
];

function loadMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY) || "{}") || {}; } catch (e) { return {}; }
}
function saveMeta(meta) {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) {}
}
function toggleFavorite(id) {
  const meta = loadMeta();
  meta.favs = meta.favs || [];
  const i = meta.favs.indexOf(id);
  if (i >= 0) meta.favs.splice(i, 1); else meta.favs.unshift(id);
  saveMeta(meta);
  return meta.favs.includes(id);
}
function pushRecent(id) {
  const meta = loadMeta();
  meta.recent = (meta.recent || []).filter((x) => x !== id);
  meta.recent.unshift(id);
  meta.recent = meta.recent.slice(0, 4);
  saveMeta(meta);
}

const sectionOf = (toolId) => SECTIONS.find((s) => s.tools.includes(toolId));

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ------------------------------------------------------------
   Pantalla de sección
   ------------------------------------------------------------ */
let activePage = null;

export function closeSection({ fromHistory = false } = {}) {
  if (!activePage) return;
  const page = activePage;
  activePage = null;
  try { page.leave(); } catch (e) {}
  document.removeEventListener("keydown", page.onKey);
  document.body.classList.remove("section-open");
  page.el.classList.add("closing");
  setTimeout(() => { try { page.el.remove(); } catch (e) {} }, 220);
  if (!fromHistory && history.state && history.state.strumioSection) history.back();
  else if (location.hash.startsWith("#practicar/")) history.replaceState(null, "", location.pathname + location.search);
}

// Botón "atrás" del móvil o del navegador: cierra la sección.
window.addEventListener("popstate", () => {
  if (activePage) closeSection({ fromHistory: true });
});

/**
 * Abre una sección a pantalla completa.
 * @param section  elemento de SECTIONS
 * @param tools    registro de herramientas (id, title, desc, mount)
 * @param toolId   pestaña inicial (opcional)
 * @param onLeave  se llama al cambiar de pestaña o cerrar, para parar el audio
 */
export function openSection(section, tools, toolId, onLeave) {
  if (activePage) closeSection({ fromHistory: true });
  const items = section.tools.map((id) => tools.find((t) => t.id === id)).filter(Boolean);
  if (!items.length) return;
  let current = items.find((t) => t.id === toolId) || items[0];

  const el = document.createElement("div");
  el.className = "section-page";
  el.style.setProperty("--sec", section.color);
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", section.name);
  el.innerHTML = `
    <header class="section-page__head">
      <div class="section-page__bar">
        <button class="icon-btn" data-back aria-label="${t("practice.back")}">${icon("back")}</button>
        <div class="section-page__title">
          <span class="section-page__icon">${icon(section.icon, 20)}</span>
          <h2>${escapeHtml(section.name)}</h2>
        </div>
        <button class="icon-btn section-page__fav" data-fav aria-label="Favorito">${icon("star", 20)}</button>
      </div>
      ${items.length > 1 ? `<nav class="section-tabs" role="tablist">
        ${items.map((t) => `<button role="tab" class="section-tab" data-tab="${t.id}">${escapeHtml(t.short || t.title)}</button>`).join("")}
      </nav>` : ""}
    </header>
    <main class="section-page__body">
      <p class="section-page__desc"></p>
      <div class="section-page__tool"></div>
    </main>`;
  document.body.appendChild(el);
  document.body.classList.add("section-open");

  const body = el.querySelector(".section-page__tool");
  const desc = el.querySelector(".section-page__desc");
  const favBtn = el.querySelector("[data-fav]");
  const scroller = el.querySelector(".section-page__body");
  let mountToken = 0;

  function syncFav() {
    const on = (loadMeta().favs || []).includes(current.id);
    favBtn.classList.toggle("is-fav", on);
    favBtn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function leave() {
    try { onLeave && onLeave(); } catch (e) {}
    document.dispatchEvent(new CustomEvent("strumio:toolclose"));
  }

  function show(tool) {
    if (body.childElementCount) leave();
    current = tool;
    pushRecent(tool.id);
    el.querySelectorAll(".section-tab").forEach((b) => {
      const on = b.dataset.tab === tool.id;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
      if (on) b.scrollIntoView({ block: "nearest", inline: "center" });
    });
    desc.textContent = tool.desc || "";
    syncFav();
    scroller.scrollTop = 0;
    history.replaceState({ strumioSection: section.id }, "", `#practicar/${section.id}/${tool.id}`);
    const token = ++mountToken;
    body.innerHTML = `<div class="tool-loading"><span class="spinner"></span><span>${t("practice.loading")}</span></div>`;
    Promise.resolve()
      .then(() => { if (token === mountToken) { body.innerHTML = ""; return tool.mount(body); } })
      .catch((err) => {
        console.error("Tool error", err);
        if (token !== mountToken) return;
        body.innerHTML = `<div class="tool-error"><h3>${t("practice.errorOpen")}</h3><p>${escapeHtml(err && err.message ? err.message : "${t("practice.errorUnexpected")}")}</p></div>`;
      });
  }

  el.addEventListener("click", (e) => {
    if (e.target.closest("[data-back]")) { closeSection(); return; }
    if (e.target.closest("[data-fav]")) { toggleFavorite(current.id); syncFav(); return; }
    const tab = e.target.closest("[data-tab]");
    if (tab && tab.dataset.tab !== current.id) show(items.find((t) => t.id === tab.dataset.tab));
  });
  const onKey = (e) => { if (e.key === "Escape") closeSection(); };
  document.addEventListener("keydown", onKey);

  activePage = { el, leave, onKey };
  history.pushState({ strumioSection: section.id }, "", `#practicar/${section.id}/${current.id}`);
  show(current);
  requestAnimationFrame(() => el.querySelector("[data-back]").focus({ preventScroll: true }));
}

/** Abre la pantalla indicada en la URL (#practicar/seccion/herramienta). */
export function openFromHash(tools, onLeave) {
  const m = location.hash.match(/^#practicar\/([\w-]+)(?:\/([\w-]+))?/);
  if (!m) return false;
  const section = SECTIONS.find((s) => s.id === m[1]);
  if (!section) return false;
  history.replaceState(null, "", location.pathname + location.search);
  openSection(section, tools, m[2], onLeave);
  return true;
}

/** Abre una herramienta concreta en su sección. */
export function openTool(toolId, tools, onLeave) {
  const s = sectionOf(toolId);
  if (s) openSection(s, tools, toolId, onLeave);
}

/* ------------------------------------------------------------
   Pantalla principal de Practicar
   ------------------------------------------------------------ */
export function renderPracticeHub(root, tools, onLeave) {
  const meta = loadMeta();
  const byId = (id) => tools.find((t) => t.id === id);
  const today = SECTIONS[0];
  const grid = SECTIONS.slice(1);
  const last = (meta.recent || []).map(byId).find((t) => t && t.id !== "routines");
  const favTools = (meta.favs || []).map(byId).filter(Boolean);

  root.innerHTML = `
    <section class="practice">
      <header class="practice__head">
        <span class="kicker">${t("practice.title")}</span>
        <h1>${t("practice.whatToday")}</h1>
      </header>

      <button class="today-card" data-section="${today.id}">
        <span class="today-card__icon">${icon("today", 28)}</span>
        <span class="today-card__text">
          <strong>${today.name}</strong>
          <span>${t("practice.warmup")}</span>
        </span>
        <span class="today-card__cta">${icon("play", 16)}<span>${t("practice.minutes15")}</span></span>
      </button>

      ${last ? `<button class="continue-row" data-tool="${last.id}">
        <span class="continue-row__label">${t("practice.continue")}</span>
        <span class="continue-row__name">${escapeHtml(last.title)}</span>
        ${icon("arrow", 18)}
      </button>` : ""}

      <label class="search-field">
        ${icon("search", 18)}
        <input id="toolSearch" type="search" placeholder="${t("practice.searchPlaceholder")}" autocomplete="off" aria-label="${t("practice.searchAria")}">
      </label>
      <div id="searchResults" class="search-results" hidden></div>

      <div id="hubMain">
        ${favTools.length ? `
          <h2 class="hub-title">${t("practice.favorites")}</h2>
          <div class="fav-row">${favTools.map((t) => {
            const s = sectionOf(t.id);
            return `<button class="fav-chip" data-tool="${t.id}" style="--sec:${s ? s.color : "#58cc02"}">${icon(s ? s.icon : "guitar", 16)}<span>${escapeHtml(t.title)}</span></button>`;
          }).join("")}</div>` : ""}

        <h2 class="hub-title">${t("practice.sections")}</h2>
        <div class="section-grid">
          ${grid.map((s) => `
            <button class="section-card" data-section="${s.id}" style="--sec:${s.color}">
              <span class="section-card__icon">${icon(s.icon, 26)}</span>
              <strong>${escapeHtml(s.name)}</strong>
              <span class="section-card__desc">${escapeHtml(s.desc)}</span>
              <span class="section-card__count">${s.tools.length} ${s.tools.length === 1 ? t("practice.tool") : t("practice.tools")}</span>
            </button>`).join("")}
        </div>
      </div>
    </section>`;

  const search = root.querySelector("#toolSearch");
  const results = root.querySelector("#searchResults");
  const main = root.querySelector("#hubMain");

  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    if (!q) { results.hidden = true; main.hidden = false; return; }
    const found = tools.filter((t) => (t.title + " " + t.desc + " " + (t.tags || []).join(" ") + " " + (t.keywords || "")).toLowerCase().includes(q));
    main.hidden = true;
    results.hidden = false;
    results.innerHTML = found.length
      ? found.map((t) => {
          const s = sectionOf(t.id);
          return `<button class="result-row" data-tool="${t.id}" style="--sec:${s ? s.color : "#58cc02"}">
            <span class="result-row__icon">${icon(s ? s.icon : "guitar", 18)}</span>
            <span class="result-row__text"><strong>${escapeHtml(t.title)}</strong><span>${escapeHtml(s ? s.name : "")}</span></span>
            ${icon("arrow", 18)}
          </button>`;
        }).join("")
      : `<p class="hub-empty">${t("practice.noResults")}</p>`;
  });

  root.addEventListener("click", (e) => {
    const secBtn = e.target.closest("[data-section]");
    if (secBtn) {
      const s = SECTIONS.find((x) => x.id === secBtn.dataset.section);
      if (s) openSection(s, tools, null, onLeave);
      return;
    }
    const toolBtn = e.target.closest("[data-tool]");
    if (toolBtn) openTool(toolBtn.dataset.tool, tools, onLeave);
  });
}
