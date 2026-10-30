/* ============================================================
   Strumio — Rutas por estilo
   Learning paths organized by musical style.
   ============================================================ */
import { t } from "./i18n.js";

const STYLE_ROUTES = {
  rock: {
    name: "Rock",
    icon: "🤘",
    color: "#ef4444",
    desc: "Power chords, riffs, palm mute, distorsión",
    techniques: [
      "Power chords (5tas)",
      "Palm mute",
      "Alternate picking",
      "Downpicking",
      "Riffs con cuerdas graves",
      "Bends y vibrato",
    ],
    songs: ["rock", "rock-espanol", "metal"],
    exercises: ["power-chord", "palm-mute", "alternate-picking"],
    level: "beginner",
  },
  blues: {
    name: "Blues",
    icon: "🎸",
    color: "#3b82f6",
    desc: "Pentatónica, bends, shuffle, 12-bar blues",
    techniques: [
      "Escala pentatónica menor",
      "Bends (1/2 y 1 tono)",
      "Vibrato",
      "Shuffle (ternario)",
      "12-bar blues",
      "Turnarounds",
    ],
    songs: ["blues"],
    exercises: ["pentatonic", "bends", "shuffle"],
    level: "beginner",
  },
  "pop-acustico": {
    name: "Pop / Acústico",
    icon: "🎤",
    color: "#22c55e",
    desc: "Rasgueo, capo, canciones, acordes abiertos",
    techniques: [
      "Rasgueo básico (D DU UDU)",
      "Acordes abiertos (G, C, D, Em, Am)",
      "Capo y transposición",
      "Fingerpicking básico",
      "Cambios de acorde rápidos",
    ],
    songs: ["pop", "pop-espanol", "folk", "indie"],
    exercises: ["strumming", "chord-changes", "fingerpicking"],
    level: "beginner",
  },
  flamenco: {
    name: "Flamenco y rumba",
    icon: "💃",
    color: "#f59e0b",
    desc: "Rasgueo, golpe, compás, falsetas",
    techniques: [
      "Rasgueo flamenco",
      "Golpe (percusión en la tapa)",
      "Compás (12 tiempos)",
      "Falsetas",
      "Picado",
      "Alzapúa",
    ],
    songs: ["flamenco", "rumba-flamenca", "rumba"],
    exercises: ["flamenco-rasgueo", "compas"],
    level: "intermediate",
  },
  fingerstyle: {
    name: "Fingerstyle",
    icon: "✋",
    color: "#8b5cf6",
    desc: "Dedos, arpegios, independencia, Travis picking",
    techniques: [
      "Independencia de dedos",
      "Arpegios (p-i-m-a)",
      "Travis picking",
      "Thumb independence",
      "Percusión en la guitarra",
    ],
    songs: ["folk", "classical", "pop"],
    exercises: ["fingerpicking", "arpeggios", "travis-picking"],
    level: "intermediate",
  },
  metal: {
    name: "Metal",
    icon: "🤘",
    color: "#6b7280",
    desc: "Downpicking, alternate, tapping, sweep",
    techniques: [
      "Downpicking",
      "Alternate picking",
      "Palm mute",
      "Tapping",
      "Sweep picking",
      "Legato",
    ],
    songs: ["metal", "rock"],
    exercises: ["downpicking", "alternate-picking", "tapping"],
    level: "advanced",
  },
  jazz: {
    name: "Jazz",
    icon: "🎷",
    color: "#06b6d4",
    desc: "Acordes de 7ª, walking bass, improvisación",
    techniques: [
      "Acordes de 7ª (maj7, min7, dom7)",
      "Walking bass",
      "Improvisación con modos",
      "Comping",
      "ii-V-I",
      "Voice leading",
    ],
    songs: ["jazz", "bossa nova"],
    exercises: ["jazz-chords", "walking-bass", "ii-v-i"],
    level: "advanced",
  },
  classical: {
    name: "Clásica",
    icon: "🎼",
    color: "#a855f7",
    desc: "Punteo, postura, repertorio, técnica",
    techniques: [
      "Postura y posición",
      "Punteo (tirando y apoyando)",
      "Independencia de dedos",
      "Arpegios",
      "Lectura de partitura",
      "Repertorio clásico",
    ],
    songs: ["classical"],
    exercises: ["classical-technique", "sight-reading"],
    level: "intermediate",
  },
};

export function renderStyles(area) {
  area.innerHTML = `
    <div class="card">
      <h2>🧭 Rutas por estilo</h2>
      <p>Cada estilo tiene su propia ruta con técnicas, canciones y ejercicios.</p>
    </div>
    <div class="style-grid">
      ${Object.entries(STYLE_ROUTES).map(([key, s]) => `
        <div class="style-card" data-style="${key}" style="--sc:${s.color}">
          <div class="style-card__icon">${s.icon}</div>
          <div class="style-card__info">
            <div class="style-card__name">${s.name}</div>
            <div class="style-card__desc">${s.desc}</div>
            <div class="style-card__level">Nivel: ${s.level}</div>
          </div>
          <button class="btn btn-primary btn-sm style-start" data-style="${key}">Empezar</button>
        </div>
      `).join("")}
    </div>
  `;

  // Wire up style card clicks
  area.querySelectorAll(".style-start").forEach((btn) => {
    btn.onclick = () => {
      const style = btn.dataset.style;
      const route = STYLE_ROUTES[style];
      if (!route) return;
      renderStyleDetail(area, style, route);
    };
  });
}

function renderStyleDetail(area, styleKey, route) {
  // Get songs for this style
  let songs = [];
  try {
    const allSongs = window.__songsCache || [];
    if (allSongs.length) {
      songs = allSongs.filter((s) => route.songs.includes(s.style));
    }
  } catch (e) {}
  // Try to load songs if not cached
  if (!songs.length) {
    fetch("data/songs.json").then((r) => r.json()).then((data) => {
      const list = Array.isArray(data) ? data : (data.songs || []);
      window.__songsCache = list;
      const filtered = list.filter((s) => route.songs.includes(s.style));
      renderStyleDetailContent(area, styleKey, route, filtered);
    }).catch(() => {
      renderStyleDetailContent(area, styleKey, route, []);
    });
    area.innerHTML = `<div class="card"><p>Cargando canciones...</p></div>`;
    return;
  }
  renderStyleDetailContent(area, styleKey, route, songs);
}

function renderStyleDetailContent(area, styleKey, route, songs) {
  const songList = songs.slice(0, 8).map((s) => `
    <div class="style-song">
      <span class="style-song__title">${escapeHtml(s.title)}</span>
      <span class="style-song__artist">${escapeHtml(s.artist || "")}</span>
      <span class="style-song__diff">Dif. ${s.difficulty || "?"}</span>
    </div>
  `).join("");

  area.innerHTML = `
    <div class="card" style="border-left: 4px solid ${route.color}">
      <button class="btn btn-secondary btn-sm" id="backToStyles">← Volver</button>
      <h2 style="margin-top:8px">${route.icon} ${route.name}</h2>
      <p style="color:var(--muted);font-size:14px">${route.desc}</p>
      <div class="style-level">Nivel recomendado: <strong>${route.level}</strong></div>
    </div>
    <div class="card">
      <h3>Técnicas clave</h3>
      <ul class="style-techniques">
        ${route.techniques.map((t) => `<li>${t}</li>`).join("")}
      </ul>
    </div>
    ${songs.length ? `
    <div class="card">
      <h3>Canciones recomendadas (${songs.length})</h3>
      <div class="style-songs">${songList}</div>
      ${songs.length > 8 ? `<p class="muted" style="font-size:12px;margin-top:8px">+${songs.length - 8} más en la biblioteca</p>` : ""}
    </div>
    ` : ""}
    <div class="card">
      <h3>Ejercicios</h3>
      <p class="muted" style="font-size:13px">Busca ejercicios de ${route.name} en la sección Ejercicios.</p>
    </div>
  `;
  const backBtn = area.querySelector("#backToStyles");
  if (backBtn) backBtn.onclick = () => renderStyles(area);
}

export { STYLE_ROUTES };