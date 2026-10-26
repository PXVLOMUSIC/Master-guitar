/* ============================================================
   Strumio — Practice Hub + Tool Window
   Agrupa las herramientas en categorías y las abre en una
   ventana superpuesta (no debajo del listado).
   ============================================================ */

const FAV_KEY = "strumio_tools_v1";

export const CATEGORIES = [
  { id: "chords", name: "Acordes", icon: "🎸", color: "#58cc02", soft: "rgba(88,204,2,.14)" },
  { id: "rhythm", name: "Ritmo", icon: "🥁", color: "#ff9600", soft: "rgba(255,150,0,.14)" },
  { id: "ear", name: "Oído", icon: "👂", color: "#1cb0f6", soft: "rgba(28,176,246,.14)" },
  { id: "technique", name: "Técnica", icon: "⚡", color: "#ce82ff", soft: "rgba(206,130,255,.14)" },
  { id: "songs", name: "Repertorio", icon: "🎵", color: "#ff6b9d", soft: "rgba(255,107,157,.14)" },
  { id: "theory", name: "Teoría y más", icon: "🎼", color: "#ffc800", soft: "rgba(255,200,0,.14)" },
];

function loadMeta() {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) || "{}") || {};
  } catch (e) {
    return {};
  }
}

function saveMeta(meta) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(meta)); } catch (e) {}
}

function toggleFavorite(id) {
  const meta = loadMeta();
  meta.favs = meta.favs || [];
  const i = meta.favs.indexOf(id);
  if (i >= 0) meta.favs.splice(i, 1);
  else meta.favs.unshift(id);
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

const catById = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[0];

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ------------------------------------------------------------
   Tool window (modal)
   ------------------------------------------------------------ */
let activeWindow = null;

export function closeToolWindow() {
  if (!activeWindow) return;
  const { backdrop, onClose } = activeWindow;
  activeWindow = null;
  document.body.classList.remove("tool-open");
  backdrop.classList.add("closing");
  try { onClose && onClose(); } catch (e) {}
  document.dispatchEvent(new CustomEvent("strumio:toolclose"));
  setTimeout(() => {
    try { backdrop.remove(); } catch (e) {}
  }, 190);
}

export function openToolWindow({ title, subtitle = "", icon = "🎸", color = "#58ba00", mount, id = "" }) {
  closeToolWindow();
  if (id) pushRecent(id);

  const backdrop = document.createElement("div");
  backdrop.className = "tool-window-backdrop";
  backdrop.innerHTML = `
    <section class="tool-window" role="dialog" aria-modal="true" aria-labelledby="toolWindowTitle">
      <header class="tool-window__head">
        <button class="tool-window__nav" data-close="1" aria-label="Volver">←</button>
        <div class="tool-window__identity">
          <span class="tool-window__icon" style="--tool-color:${color}">${icon}</span>
          <div class="tool-window__titles">
            <span class="tool-window__kicker">${escapeHtml(subtitle || "Herramienta")}</span>
            <h2 id="toolWindowTitle">${escapeHtml(title)}</h2>
          </div>
        </div>
        <button class="tool-window__nav tool-window__close" data-close="1" aria-label="Cerrar">✕</button>
      </header>
      <div class="tool-window__body" id="toolWindowBody">
        <div class="tool-loading"><span class="spinner"></span><span>Cargando herramienta…</span></div>
      </div>
    </section>
  `;
  document.body.appendChild(backdrop);
  document.body.classList.add("tool-open");

  const body = backdrop.querySelector("#toolWindowBody");
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  const close = () => {
    document.body.style.overflow = prevOverflow;
    closeToolWindow();
  };

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
    if (e.target.closest("[data-close]")) close();
  });

  const onKey = (e) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);

  activeWindow = { backdrop, onClose: () => document.removeEventListener("keydown", onKey) };

  // focus management
  requestAnimationFrame(() => {
    const first = backdrop.querySelector("button, [href], input, select, textarea");
    if (first) first.focus({ preventScroll: true });
  });

  // Mount the tool. Show a helpful error instead of a blank window.
  Promise.resolve()
    .then(() => mount(body))
    .then(() => {
      body.classList.add("ready");
      const loader = body.querySelector(":scope > .tool-loading");
      if (loader) loader.remove();
    })
    .catch((err) => {
      console.error("Tool error", err);
      body.innerHTML = `
        <div class="tool-error">
          <span class="tool-error__icon">😵</span>
          <h3>No se pudo abrir esta herramienta</h3>
          <p>${escapeHtml(err && err.message ? err.message : "Error inesperado")}</p>
          <button class="btn btn-primary" data-close="1">Volver</button>
        </div>`;
    });

  return close;
}

/* ------------------------------------------------------------
   Hub
   ------------------------------------------------------------ */
export function renderPracticeHub(root, tools, onOpen) {
  const meta = loadMeta();
  const favs = new Set(meta.favs || []);
  let activeCat = "all";
  let query = "";

  root.innerHTML = `
    <section class="practice-hub">
      <header class="practice-hero">
        <div class="practice-hero__glow"></div>
        <div class="practice-hero__content">
          <span class="practice-hero__kicker">Practica con propósito</span>
          <h1>¿Qué quieres mejorar hoy?</h1>
          <p>${tools.length} herramientas y entrenadores con audio real.</p>
        </div>
        <div class="practice-hero__badges">
          <span class="hero-badge">🔊 Samples reales</span>
          <span class="hero-badge">🎯 Sin anuncios</span>
        </div>
      </header>

      <div class="practice-search">
        <span class="practice-search__icon">⌕</span>
        <input id="toolSearch" type="search" placeholder="Buscar herramienta, acorde, escala…" autocomplete="off" aria-label="Buscar herramienta">
        <button class="practice-search__clear" id="toolSearchClear" aria-label="Borrar búsqueda" hidden>✕</button>
      </div>

      <nav class="practice-tabs" id="practiceTabs" aria-label="Categorías de práctica">
        <button class="practice-tab active" data-cat="all"><span>✦</span>Todas</button>
        ${CATEGORIES.map((c) => `<button class="practice-tab" data-cat="${c.id}"><span>${c.icon}</span>${c.name}</button>`).join("")}
      </nav>

      <div id="favSection"></div>
      <div id="hubList"></div>
    </section>
  `;

  const tabs = root.querySelector("#practiceTabs");
  const list = root.querySelector("#hubList");
  const favSection = root.querySelector("#favSection");
  const search = root.querySelector("#toolSearch");
  const clearBtn = root.querySelector("#toolSearchClear");

  function card(t, compact = false) {
    const c = catById(t.cat);
    const isFav = favs.has(t.id);
    return `
      <article class="tool-card${compact ? " tool-card--compact" : ""}" data-tool="${t.id}" style="--cat:${c.color};--cat-soft:${c.soft}" tabindex="0" role="button" aria-label="${escapeHtml(t.title)}">
        <div class="tool-card__top">
          <span class="tool-card__icon">${t.icon}</span>
          <button class="tool-card__fav${isFav ? " is-fav" : ""}" data-fav="${t.id}" aria-label="${isFav ? "Quitar de favoritos" : "Añadir a favoritos"}" title="Favorito">${isFav ? "★" : "☆"}</button>
        </div>
        <h3>${escapeHtml(t.title)}</h3>
        <p>${escapeHtml(t.desc)}</p>
        <div class="tool-card__meta">
          ${(t.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
        </div>
      </article>`;
  }

  function renderFavorites() {
    const favTools = tools.filter((t) => favs.has(t.id));
    if (!favTools.length) { favSection.innerHTML = ""; return; }
    favSection.innerHTML = `
      <div class="hub-section-head"><h2>★ Tus favoritos</h2><span>${favTools.length}</span></div>
      <div class="tool-grid tool-grid--favs">${favTools.map((t) => card(t, true)).join("")}</div>`;
  }

  function renderList() {
    const q = query.trim().toLowerCase();
    let filtered = tools;
    if (activeCat !== "all") filtered = filtered.filter((t) => t.cat === activeCat);
    if (q) {
      filtered = filtered.filter((t) =>
        (t.title + " " + t.desc + " " + (t.tags || []).join(" ") + " " + (t.keywords || "")).toLowerCase().includes(q));
    }
    if (!filtered.length) {
      list.innerHTML = `<div class="hub-empty"><span>🔎</span><h3>Sin resultados</h3><p>Prueba con “acordes”, “ritmo” o “escalas”.</p></div>`;
      return;
    }
    const groups = CATEGORIES.map((c) => ({
      cat: c,
      items: filtered.filter((t) => t.cat === c.id),
    })).filter((g) => g.items.length);
    list.innerHTML = groups.map((g) => `
      <section class="hub-section">
        <div class="hub-section-head">
          <h2><span class="hub-dot" style="background:${g.cat.color}"></span>${g.cat.name}</h2>
          <span>${g.items.length}</span>
        </div>
        <div class="tool-grid">${g.items.map((t) => card(t)).join("")}</div>
      </section>`).join("");
  }

  function refresh() {
    renderFavorites();
    renderList();
  }

  tabs.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]");
    if (!b) return;
    activeCat = b.dataset.cat;
    tabs.querySelectorAll(".practice-tab").forEach((x) => x.classList.toggle("active", x === b));
    renderList();
  });

  search.addEventListener("input", () => {
    query = search.value;
    clearBtn.hidden = !query;
    renderList();
  });
  clearBtn.addEventListener("click", () => {
    search.value = ""; query = ""; clearBtn.hidden = true; search.focus(); renderList();
  });

  function activate(el) {
    const id = el.dataset.tool;
    const t = tools.find((x) => x.id === id);
    if (t) onOpen(t);
  }

  root.addEventListener("click", (e) => {
    const favBtn = e.target.closest("[data-fav]");
    if (favBtn) {
      e.stopPropagation();
      const id = favBtn.dataset.fav;
      const now = toggleFavorite(id);
      if (now) favs.add(id); else favs.delete(id);
      favBtn.classList.toggle("is-fav", now);
      favBtn.textContent = now ? "★" : "☆";
      refresh();
      return;
    }
    const cardEl = e.target.closest("[data-tool]");
    if (cardEl) activate(cardEl);
  });

  root.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const cardEl = e.target.closest("[data-tool]");
    if (cardEl) { e.preventDefault(); activate(cardEl); }
  });

  refresh();
}
