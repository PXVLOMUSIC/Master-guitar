/* ============================================================
   Strumio — Búsqueda global unificada
   Busca en lecciones, canciones, ejercicios, acordes y herramientas.
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
      const lang = (window.getCurrentLanguage && window.getCurrentLanguage()) || "es";
      const resp = await fetch(`data/lessons.${lang}.json`.replace(".es.", "."));
      // try direct file first
      let lessons = null;
      try {
        const r = await fetch(`data/lessons.json`);
        if (r.ok) lessons = await r.json();
      } catch (e) {}
      if (!lessons) {
        try {
          const r = await fetch(`data/lessons.${lang}.json`);
          if (r.ok) lessons = await r.json();
        } catch (e) {}
      }
      if (Array.isArray(lessons)) {
        lessons.forEach((l) => {
          items.push({
            type: "lesson",
            id: l.id,
            title: l.title || l.name || "",
            desc: l.description || l.summary || "",
            tags: (l.tags || []).concat(l.keywords || []),
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
            id: s.id,
            title: s.title || "",
            desc: s.artist ? `${s.artist} · ${s.style || ""}` : (s.style || ""),
            tags: [s.artist, s.style, s.difficulty].filter(Boolean),
            icon: "🎵",
            route: "practice",
            action: () => { if (window.openPracticeTool) window.openPracticeTool("songs"); }
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
          icon: "🎯",
          route: "practice",
          action: () => { if (window.openPracticeTool) window.openPracticeTool("exercises"); }
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
            icon: "🎸",
            route: "practice",
            action: () => { if (window.openPracticeTool) window.openPracticeTool("chords"); }
          });
        });
      }
    } catch (e) { console.warn("search: chords", e); }
    // 5. Herramientas de práctica
    const tools = [
      { id: "backing", title: "Backing Tracks Pro", desc: "Bases con batería y bajo reales", icon: "🥁", tags: ["backing", "pista", "base"] },
      { id: "looper", title: "Looper multipista", desc: "Graba y superpone pistas", icon: "🔁", tags: ["looper", "grabar", "pistas"] },
      { id: "tuner", title: "Afinador", desc: "Afinador cromático", icon: "🎯", tags: ["afinador", "tuner"] },
      { id: "metronome", title: "Metrónomo", desc: "Metrónomo con BPM", icon: "⏱️", tags: ["metronomo", "bpm"] },
      { id: "chordWheel", title: "Rueda de acordes", desc: "Circle of Fifths", icon: "🎡", tags: ["rueda", "acordes", "fifths"] },
      { id: "exercises", title: "Ejercicios", desc: "Ejercicios por categoría", icon: "🎯", tags: ["ejercicios", "practica"] },
      { id: "songs", title: "Canciones", desc: "Canciones y tablaturas", icon: "🎵", tags: ["canciones", "tabs", "riffs"] },
      { id: "fretboard", title: "Mástil", desc: "Escalas y notas en el mástil", icon: "🎸", tags: ["mastil", "escalas", "fretboard"] },
      { id: "ear", title: "Oído", desc: "Entrenamiento de oído", icon: "👂", tags: ["oido", "ear", "intervalos"] },
      { id: "theory", title: "Teoría", desc: "Teoría musical", icon: "📖", tags: ["teoria", "theory"] },
    ];
    tools.forEach((tool) => {
      items.push({
        type: "tool",
        id: tool.id,
        title: tool.title,
        desc: tool.desc,
        tags: tool.tags,
        icon: tool.icon,
        route: "practice",
        action: () => { if (window.openTool) window.openTool(tool.id); }
      });
    });
    _index = items;
    return items;
  })();
  return _indexPromise;
}

export async function search(query, limit = 20) {
  const items = await buildIndex();
  const q = normalize(query);
  if (!q) return [];
  const results = [];
  for (const item of items) {
    const haystack = normalize(item.title + " " + item.desc + " " + (item.tags || []).join(" "));
    if (haystack.includes(q)) {
      // score: title match > desc match > tag match
      let score = 0;
      if (normalize(item.title).includes(q)) score += 10;
      if (normalize(item.desc).includes(q)) score += 5;
      if ((item.tags || []).some((t) => normalize(t).includes(q))) score += 3;
      results.push({ ...item, score });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

export function renderSearchModal(container) {
  container.innerHTML = `
    <div class="gs-overlay" id="gsOverlay">
      <div class="gs-modal">
        <div class="gs-header">
          <input type="search" id="gsInput" placeholder="Buscar lecciones, canciones, ejercicios, acordes..." autocomplete="off" />
          <button id="gsClose" class="gs-close">&times;</button>
        </div>
        <div class="gs-results" id="gsResults">
          <p class="gs-hint">Escribe para buscar en toda la app</p>
        </div>
      </div>
    </div>
  `;
  const input = container.querySelector("#gsInput");
  const results = container.querySelector("#gsResults");
  const overlay = container.querySelector("#gsOverlay");
  const closeBtn = container.querySelector("#gsClose");

  let debounceTimer = null;
  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const q = input.value.trim();
      if (!q) { results.innerHTML = '<p class="gs-hint">Escribe para buscar en toda la app</p>'; return; }
      const res = await search(q, 25);
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
    }, 200);
  });

  function close() {
    overlay.remove();
  }
  closeBtn.onclick = close;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  // Focus input
  setTimeout(() => input.focus(), 50);
  // Keyboard: Escape to close
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