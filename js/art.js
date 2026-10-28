import { t } from "./i18n.js";
// art.js — ilustraciones propias en SVG: la mascota "Púa" y las portadas de
// cada unidad. Todo vectorial, sin imágenes externas, y se adapta al tema.

let uid = 0;

/**
 * Púa, la mascota de Strumio (una púa de guitarra con cara).
 * @param {"happy"|"wave"|"cheer"|"think"} mood
 */
export function mascot(mood = "happy", size = 120) {
  const id = "pua" + (++uid);
  const arms = {
    happy: "",
    wave: `<path d="M98 62c10-4 16-14 15-24" class="pua-arm pua-wave"/><circle cx="113" cy="36" r="6" fill="#22c55e"/>`,
    cheer: `<path d="M24 58c-10-6-14-16-12-26" class="pua-arm"/><path d="M96 58c10-6 14-16 12-26" class="pua-arm"/><circle cx="12" cy="30" r="6" fill="#22c55e"/><circle cx="108" cy="30" r="6" fill="#22c55e"/>
            <g class="pua-spark"><path d="M14 10l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#ffc800"/><path d="M104 6l1.5 4.5 4.5 1.5-4.5 1.5-1.5 4.5-1.5-4.5-4.5-1.5 4.5-1.5z" fill="#ff9600"/></g>`,
    think: `<path d="M92 72c8 2 12-4 10-10" class="pua-arm"/><circle cx="101" cy="60" r="5" fill="#22c55e"/>
            <g fill="var(--muted)"><circle cx="100" cy="24" r="3"/><circle cx="108" cy="14" r="4.5"/></g>`,
  }[mood] || "";
  const mouth = {
    happy: `<path d="M50 74q10 9 20 0" />`,
    wave: `<path d="M48 72q12 12 24 0" />`,
    cheer: `<path d="M47 70q13 16 26 0z" fill="#7a1d1d" stroke-linejoin="round"/>`,
    think: `<path d="M52 76h14" />`,
  }[mood] || "";
  const eyes = mood === "cheer"
    ? `<path d="M41 56q5-6 10 0M69 56q5-6 10 0" fill="none" stroke="#14301a" stroke-width="4" stroke-linecap="round"/>`
    : `<circle cx="46" cy="56" r="6" fill="#14301a"/><circle cx="74" cy="56" r="6" fill="#14301a"/><circle cx="48" cy="54" r="2" fill="#fff"/><circle cx="76" cy="54" r="2" fill="#fff"/>`;
  return `<svg class="mascot mascot--${mood}" width="${size}" height="${size}" viewBox="-8 -8 136 136" role="img" aria-label="${t('art.mascotAriaLabel')}">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8ee000"/><stop offset="1" stop-color="#3fa000"/></linearGradient>
    </defs>
    <ellipse cx="60" cy="112" rx="26" ry="5" fill="#000" opacity=".18"/>
    <g class="pua-body">
      <path d="M60 106C40 92 22 70 22 48 22 28 40 18 60 18s38 10 38 30c0 22-18 44-38 58z" fill="url(#${id})"/>
      <path d="M34 36c6-9 16-12 26-12" stroke="#fff" stroke-opacity=".45" stroke-width="5" fill="none" stroke-linecap="round"/>
      ${eyes}
      <circle cx="38" cy="68" r="5" fill="#ff7aa8" opacity=".55"/><circle cx="82" cy="68" r="5" fill="#ff7aa8" opacity=".55"/>
      <g fill="none" stroke="#14301a" stroke-width="3.5" stroke-linecap="round">${mouth}</g>
    </g>
    <g fill="none" stroke="#3fa000" stroke-width="6" stroke-linecap="round">${arms}</g>
  </svg>`;
}

/* ---------------- portadas de unidad ---------------- */
const PALETTES = [
  ["#22c55e", "#2b7a00"], ["#1cb0f6", "#0b5f8a"], ["#ff9600", "#b34d00"], ["#ce82ff", "#6b2aa3"],
  ["#ff4b4b", "#9e1b1b"], ["#ffc800", "#a87700"], ["#2bd9a5", "#0d7a5a"], ["#ff6b9d", "#a3204f"],
];
const COLOR_INDEX = { green: 0, blue: 1, orange: 2, purple: 3, red: 4, gold: 5, yellow: 5, teal: 6, pink: 7 };

function motif(kind, c) {
  switch (kind % 6) {
    case 0: // cuerdas
      return [0, 1, 2, 3, 4, 5].map((i) => `<line x1="0" y1="${14 + i * 12}" x2="400" y2="${10 + i * 13}" stroke="${c}" stroke-width="${1 + i * 0.5}" opacity=".35"/>`).join("");
    case 1: // mástil con puntos
      return [60, 140, 220, 300, 380].map((x) => `<line x1="${x}" y1="0" x2="${x}" y2="96" stroke="${c}" stroke-width="3" opacity=".25"/>`).join("") +
        [100, 180, 260].map((x) => `<circle cx="${x}" cy="48" r="7" fill="${c}" opacity=".35"/>`).join("") + `<circle cx="340" cy="30" r="7" fill="${c}" opacity=".35"/><circle cx="340" cy="66" r="7" fill="${c}" opacity=".35"/>`;
    case 2: // ondas de sonido
      return [0, 1, 2, 3].map((i) => `<path d="M0 ${48 + i * 4} Q 50 ${10 + i * 8} 100 48 T 200 48 T 300 48 T 400 48" fill="none" stroke="${c}" stroke-width="2.5" opacity="${0.4 - i * 0.08}"/>`).join("");
    case 3: // notas
      return [[250, 60], [300, 36], [350, 58], [390, 30]].map(([x, y]) => `<g fill="${c}" opacity=".35"><ellipse cx="${x}" cy="${y + 16}" rx="9" ry="7" transform="rotate(-20 ${x} ${y + 16})"/><rect x="${x + 7}" y="${y - 14}" width="3" height="30"/></g>`).join("");
    case 4: // círculos (boca de la guitarra)
      return [50, 38, 26].map((r, i) => `<circle cx="330" cy="48" r="${r}" fill="none" stroke="${c}" stroke-width="${4 - i}" opacity=".3"/>`).join("");
    default: // rayos
      return Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return `<line x1="340" y1="48" x2="${340 + Math.cos(a) * 120}" y2="${48 + Math.sin(a) * 120}" stroke="${c}" stroke-width="10" opacity=".12"/>`; }).join("");
  }
}

/** Portada SVG de una unidad de la ruta de aprendizaje. */
export function unitCover(unit, index, done, total) {
  const pal = PALETTES[COLOR_INDEX[unit.color] ?? index % PALETTES.length];
  const id = "uc" + (++uid);
  const [num, ...rest] = String(unit.title).split(/\s[–-]\s/);
  const name = rest.join(" – ") || unit.title;
  const pct = total ? done / total : 0;
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  return `<svg class="unit-cover" viewBox="0 0 400 112" role="img" aria-label="${esc(unit.title)}">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${pal[0]}"/><stop offset="1" stop-color="${pal[1]}"/></linearGradient>
      <linearGradient id="${id}f" x1="0" y1="0" x2="1" y2="0"><stop offset=".35" stop-color="${pal[1]}" stop-opacity=".85"/><stop offset=".75" stop-color="${pal[1]}" stop-opacity="0"/></linearGradient>
    </defs>
    <rect width="400" height="112" fill="url(#${id})"/>
    <g transform="translate(0 8)">${motif(index, "#fff")}</g>
    <rect width="400" height="112" fill="url(#${id}f)"/>
    <text x="20" y="36" fill="#fff" fill-opacity=".85" font-size="12" font-weight="800" letter-spacing="1.6">${esc(rest.length ? num : "Unidad " + (index + 1)).toUpperCase()}</text>
    <text x="20" y="64" fill="#fff" font-size="${Math.min(22, Math.floor(600 / Math.max(1, name.length)))}" font-weight="900">${esc(name)}</text>
    <rect x="20" y="80" width="150" height="8" rx="4" fill="#000" fill-opacity=".25"/>
    <rect x="20" y="80" width="${Math.max(pct ? 8 : 0, 150 * pct)}" height="8" rx="4" fill="#fff"/>
    <text x="180" y="88" fill="#fff" fill-opacity=".9" font-size="11" font-weight="800">${done}/${total} lecciones</text>
  </svg>`;
}
