/* ============================================================
   Strumio — Iconos SVG (trazo 2px, 24x24, color = currentColor)
   Sustituyen a los emojis para que la app se vea igual en
   todos los dispositivos.
   ============================================================ */

const P = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 21.5V4.5"/><path d="M8 7h8"/>',
  tuner: '<circle cx="12" cy="13" r="8"/><path d="M12 13l4-4"/><path d="M12 3v2"/><path d="M4.5 9.5l1.5.8"/><path d="M19.5 9.5l-1.5.8"/>',
  guitar: '<path d="M14 10l6-6"/><path d="M18 2l4 4"/><path d="M10.5 9.5a4 4 0 0 0-5.7.3 4 4 0 0 0-.9 3.7 3 3 0 0 1-1.3 3 3 3 0 0 0 4.4 4.4 3 3 0 0 1 3-1.3 4 4 0 0 0 3.7-.9 4 4 0 0 0 .3-5.7z"/><circle cx="9" cy="15" r="1.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  chords: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M5 8h14M5 13h14M10 3v18M14 3v18"/><circle cx="12" cy="10.5" r="1.2" fill="currentColor"/><circle cx="16.5" cy="15.5" r="1.2" fill="currentColor"/>',
  rhythm: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  band: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8v8M12 8v8M17 8v8"/><rect x="5.5" y="10" width="3" height="2" rx=".5" fill="currentColor"/><rect x="10.5" y="13" width="3" height="2" rx=".5" fill="currentColor"/><rect x="15.5" y="9" width="3" height="2" rx=".5" fill="currentColor"/>',
  songs: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  fretboard: '<rect x="2" y="7" width="20" height="10" rx="1.5"/><path d="M7 7v10M12 7v10M17 7v10"/><path d="M2 10.3h20M2 13.7h20" opacity=".5"/><circle cx="9.5" cy="12" r="1.2" fill="currentColor"/>',
  ear: '<path d="M6 8.5a6 6 0 1 1 12 0c0 3.5-3 4.5-3 7.5a3 3 0 0 1-5.5 1.6"/><path d="M9.5 8.5a2.5 2.5 0 0 1 5 0c0 1.5-1.5 2-1.5 3.5"/>',
  theory: '<path d="M12 2l2.4 4.8 5.3.8-3.8 3.7.9 5.3L12 14.1l-4.8 2.5.9-5.3-3.8-3.7 5.3-.8z"/><path d="M5 21h14"/>',
  today: '<path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/><circle cx="12" cy="12" r="4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
  arrow: '<path d="M9 6l6 6-6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  flame: '<path d="M12 22c4 0 7-2.7 7-6.8 0-3.6-2.6-6.2-4.4-8.2-.4 2-1.6 3.4-3 3.9C12.3 7.6 11 4.7 8.5 2.5 8.4 6.4 5 9.5 5 15.2 5 19.3 8 22 12 22z"/>',
};

export function icon(name, size = 22, extra = "") {
  const body = P[name] || P.guitar;
  return `<svg class="ico-svg ${extra}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
