/* ============================================================
   Strumio — Búsqueda global unificada
   Busca en lecciones, canciones, ejercicios, acordes y herramientas.
   Filtros por tipo, estilo, dificultad, artista.
   ============================================================ */
import { t } from "./i18n.js";

let _index = null;
let _indexPromise = null;

function normalize(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

async function buildIndex() {
  if (_index) return _index;
  if (_indexPromise) return _indexPromise;
  _indexPromise = (async () => {
    const items = [];
    // 1. Lecciones
    try {
      const r = await fetch("data/lessons.json");
      if (r.ok) {
        const lessons = await r.json();
        const list = Array.isArray(lessons) ? lessons : (lessons.lessons || []);
        list.forEach((l) => {
          items.push({
            type: "lesson",
            id: l.id,
            title: l.title || l.name || "",
            desc: l.description || l.summary || "",
            tags: (l.tags || []).concat(l.keywords || []),
            style: l.style || "",
            difficulty: l.difficulty || 0,
            artist: "",
            icon: "📚",
            route: "learn",
            action: () => { if (window.appNavigate) window.appNavigate("learn"); }
          });
        });
      }
    } catch (e) { console.warn("search: lessons", e); }
    // 2. Canciones
    try {
      const r = await fetch("data/songs.json");
      if (r.ok) {
        const songs = await r.json();
        const list = Array.isArray(songs) ? songs : (songs.songs || []);
        list.forEach((s) => {
          items.push({
            type: "song",
            id: s.id || s.name,
            title: s.name || s.title || "",
            desc: s.artist ? `${s.artist} · ${s.style || ""} · Dif. ${s.difficulty || "?"}` : (s.style || ""),
            tags: [s.artist, s.style, s.key].filter(Boolean),
            style: s.style || "",
            difficulty: s.difficulty || 0,
            artist: s.artist || "",
            icon: "🎵",
            route: "practice",
            action: () => { if (window.appNavigate) window.appNavigate("practice"); }
          });
        });
      }
    } catch (e) { console.warn("search: songs", e); }
    // 3. Ejercicios
    try {
      const mod = await import("./exercises.js");
      const exs = mod.EXERCISES || mod.exercises || [];
      exs.forEach((e) => {
        items.push({
          type: "exercise",
          id: e.id,
          title: e.title || e.name || "",
          desc: e.description || e.desc || "",
          tags: (e.tags || []).concat(e.category ? [e.category] : []),
          style: e.category || "",
          difficulty: e.difficulty || 0,
          artist: "",
          icon: "🎯",
          route: "practice",
          action: () => { if (window.appNavigate) window.appNavigate("practice"); }
        });
      });
    } catch (e) { console.warn("search: exercises", e); }
    // 4. Acordes
    try {
      const r = await fetch("data/chords.json");
      if (r.ok) {
        const chords = await r.json();
        const list = Array.isArray(chords) ? chords : (chords.chords || Object.values(chords));
        list.forEach((c) => {
          const name = c.name || c.id || "";
          if (!name) return;
          items.push({
            type: "chord",
            id: name,
            title: name,
            desc: c.description || c.quality || "",
            tags: [c.quality, c.type].filter(Boolean),
            style: c.quality || "",
            difficulty: 0,
            artist: "",
            icon: "🎸",
            route: "practice",
            action: () => { if (window.appNavigate) window.appNavigate("practice"); }
          });
        });
      }
    } catch (e) { console.warn("search: chords", e); }
    // 5. Herramientas
    const tools = [
      { id: "backing", title: "Backing Tracks Pro", desc: "Bases con batería y bajo reales", icon: "🥁", tags: ["backing", "pista", "base"], style: "", difficulty: 0 },
      { id: "looper", title: "Looper multipista", desc: "Graba y superpone pistas", icon: "🔁", tags: ["looper", "grabar", "pistas"], style: "", difficulty: 0 },
      { id: "tuner", title: "Afinador", desc: "Afinador cromático", icon: "🎯", tags: ["afinador", "tuner"], style: "", difficulty: 0 },
      { id: "metronome", title: "Metrónomo", desc: "Metrónomo con BPM", icon: "⏱️", tags: ["metronomo", "bpm"], style: "", difficulty: 0 },
      { id: "chordWheel", title: "Rueda de acordes", desc: "Circle of Fifths", icon: "🎡", tags: ["rueda", "acordes", "fifths"], style: "", difficulty: 0 },
      { id: "exercises", title: "Ejercicios", desc: "Ejercicios por categoría", icon: "🎯", tags: ["ejercicios", "practica"], style: "", difficulty: 0 },
      { id: "songs", title: "Canciones", desc: "Canciones y tablaturas", icon: "🎵", tags: ["canciones", "tabs", "riffs"], style: "", difficulty: 0 },
      { id: "fretboard", title: "Mástil", desc: "Escalas y notas en el mástil", icon: "🎸", tags: ["mastil", "escalas", "fretboard"], style: "", difficulty: 0 },
      { id: "ear", title: "Oído", desc: "Entrenamiento de oído", icon: "👂", tags: ["oido", "ear", "intervalos"], style: "", difficulty: 0 },
      { id: "theory", title: "Teoría", desc: "Teoría musical", icon: "📖", tags: ["teoria", "theory"], style: "", difficulty: 0 },
      { id: "styles", title: "Rutas por estilo", desc: "Aprende por estilo", icon: "🧭", tags: ["estilos", "rutas"], style: "", difficulty: 0 },
      { id: "friends", title: "Amigos", desc: "Amigos y desafíos", icon: "👥", tags: ["social", "amigos"], style: "", difficulty: 0 },
    ];
    tools.forEach((tool) => {
      items.push({
        type: "tool",
        id: tool.id,
        title: tool.title,
        desc: tool.desc,
        tags: tool.tags,
        style: tool.style,
        difficulty: tool.difficulty,
        artist: "",
        icon: tool.icon,
        route: "practice",
        action: () => { if (window.appNavigate) window.appNavigate("practice"); }
      });
    });
    _index = items;
    return items;
  })();
  return _indexPromise;
}

export async function search(query, filters = {}) {
  const items = await buildIndex();
  const q = normalize(query);
  const results = [];
  for (const item of items) {
    // text match
    if (q) {
      const haystack = normalize(item.title + " " + item.desc + " " + (item.tags || []).join(" ") + " " + (item.artist || ""));
      if (!haystack.includes(q)) continue;
    }
    // filters
    if (filters.type && filters.type !== "all" && item.type !== filters.type) continue;
    if (filters.style && filters.style !== "all" && item.style !== filters.style) continue;
    if (filters.difficulty && filters.difficulty !== "all" && item.difficulty !== parseInt(filters.difficulty)) continue;
    if (filters.artist && filters.artist !== "all" && normalize(item.artist) !== normalize(filters.artist)) continue;
    // score
    let score = 0;
    if (q) {
      if (normalize(item.title).includes(q)) score += 10;
      if (normalize(item.desc).includes(q)) score += 5;
      if ((item.tags || []).some((t) => normalize(t).includes(q))) score += 3;
      if (normalize(item.artist).includes(q)) score += 4;
    } else {
      score = 1; // show all when no query but filters active
    }
    results.push({ ...item, score });
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}

export function getFilterOptions() {
  if (!_index) return { types: [], styles: [], artists: [], difficulties: [] };
  const types = [...new Set(_index.map((i) => i.type))];
  const styles = [...new Set(_index.map((i) => i.style).filter(Boolean))].sort();
  const artists = [...new Set(_index.map((i) => i.artist).filter(Boolean))].sort();
  const difficulties = [1, 2, 3, 4, 5];
  return { types, styles, artists, difficulties };
}

export function renderSearchModal(container) {
  const opts = getFilterOptions();
  container.innerHTML = `
    <div class="gs-overlay" id="gsOverlay">
      <div class="gs-modal">
        <div class="gs-header">
          <input type="search" id="gsInput" placeholder="Buscar lecciones, canciones, ejercicios, acordes..." autocomplete="off" />
          <button id="gsClose" class="gs-close">&times;</button>
        </div>
        <div class="gs-filters">
          <select id="gsTypeFilter"><option value="all">Todos los tipos</option>${opts.types.map((t) => `<option value="${t}">${t}</option>`).join("")}</select>
          <select id="gsStyleFilter"><option value="all">Todos los estilos</option>${opts.styles.map((s) => `<option value="${s}">${s}</option>`).join("")}</select>
          <select id="gsDiffFilter"><option value="all">Toda dificultad</option>${opts.difficulties.map((d) => `<option value="${d}">Dif. ${d}</option>`).join("")}</select>
        </div>
        <div class="gs-results" id="gsResults">
          <p class="gs-hint">Escribe para buscar o usa los filtros</p>
        </div>
      </div>
    </div>
  `;
  const input = container.querySelector("#gsInput");
  const results = container.querySelector("#gsResults");
  const overlay = container.querySelector("#gsOverlay");
  const closeBtn = container.querySelector("#gsClose");
  const typeFilter = container.querySelector("#gsTypeFilter");
  const styleFilter = container.querySelector("#gsStyleFilter");
  const diffFilter = container.querySelector("#gsDiffFilter");

  async function doSearch() {
    const q = input.value.trim();
    const filters = {
      type: typeFilter.value,
      style: styleFilter.value,
      difficulty: diffFilter.value,
    };
    const res = await search(q, filters);
    if (!res.length) { results.innerHTML = '<p class="gs-empty">Sin resultados</p>'; return; }
    results.innerHTML = res.map((r) => `
      <button class="gs-item" data-id="${r.id}" data-type="${r.type}">
        <span class="gs-icon">${r.icon}</span>
        <div class="gs-text">
          <strong>${r.title}</strong>
          <span>${r.desc}</span>
        </div>
        <span class="gs-type">${r.type}</span>
      </button>
    `).join("");
    results.querySelectorAll(".gs-item").forEach((btn) => {
      btn.onclick = () => {
        const item = res.find((r) => r.id === btn.dataset.id && r.type === btn.dataset.type);
        if (item && item.action) item.action();
        close();
      };
    });
  }

  let debounceTimer = null;
  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(doSearch, 200);
  });
  typeFilter.addEventListener("change", doSearch);
  styleFilter.addEventListener("change", doSearch);
  diffFilter.addEventListener("change", doSearch);

  function close() {
    overlay.remove();
  }
  closeBtn.onclick = close;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  setTimeout(() => input.focus(), 50);
  const onKey = (e) => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); } };
  document.addEventListener("keydown", onKey);
}

export function openGlobalSearch() {
  const existing = document.getElementById("gsOverlay");
  if (existing) existing.remove();
  const container = document.createElement("div");
  document.body.appendChild(container);
  renderSearchModal(container);
}