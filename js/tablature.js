// Interactive tablature renderer
export function renderTablature(container, tab, options = {}) {
  // tab: { title, bpm, lines: [{string, notes: [{fret, duration, technique}]}], tuning }
  // Renders an interactive tab with playback
  const strings = tab.tuning || ["E","A","D","G","B","E"];
  const numStrings = strings.length;
  // Build a grid: rows = strings (top to bottom = high to low or vice versa)
  // Standard tab: high E on top
  const displayStrings = [...strings].reverse(); // high to low top-to-bottom
  let html = `<div class="tablature" style="font-family:monospace;font-size:14px;line-height:1.8;overflow-x:auto">`;
  html += `<div style="color:var(--muted);font-size:12px;margin-bottom:8px">${tab.title || "Tablatura"} · ${tab.bpm || 120} BPM</div>`;
  // String lines
  for (let s = 0; s < numStrings; s++) {
    const strName = displayStrings[s];
    html += `<div style="display:flex;align-items:center;gap:4px;margin:2px 0">`;
    html += `<span style="width:20px;color:var(--muted);font-weight:700">${strName}</span>`;
    html += `<span style="flex:1;border-bottom:1px solid var(--border);height:1px;position:relative">`;
    // Notes on this string
    const notes = (tab.lines && tab.lines[s]) ? tab.lines[s].notes : [];
    // render notes as positioned
    html += `</span></div>`;
  }
  html += `</div>`;
  // Simpler: render as text-based tab
  html = renderTextTab(tab);
  container.innerHTML = html;
}

function renderTextTab(tab) {
  const strings = tab.tuning || ["e","B","G","D","A","E"];
  const lines = tab.lines || [];
  // Ensure 6 lines
  const numStrings = strings.length;
  // Build note positions
  const maxLen = Math.max(...lines.map(l => (l.notes || []).length), 1) * 4;
  let result = `<div style="background:var(--card2);padding:12px;border-radius:10px;overflow-x:auto;font-family:monospace;font-size:13px;line-height:1.6">`;
  result += `<div style="color:var(--muted);font-size:12px;margin-bottom:8px">${tab.title || "Tablatura"} · ${tab.bpm || 120} BPM</div>`;
  for (let s = 0; s < numStrings; s++) {
    const strName = strings[s];
    const notes = (lines[s] && lines[s].notes) ? lines[s].notes : [];
    let line = strName + "|";
    let pos = 0;
    notes.forEach(n => {
      const fret = n.fret != null ? String(n.fret) : "-";
      const dur = n.duration || 1;
      const spaces = " ".repeat(Math.max(1, dur - fret.length));
      line += fret + spaces + "-";
    });
    line += "|";
    result += `<div>${line}</div>`;
  }
  result += `</div>`;
  return result;
}

export function parseTab(text) {
  // Parse ASCII tab into structured format
  const lines = text.trim().split("\n");
  const result = { title: "Tablatura", bpm: 120, tuning: [], lines: [] };
  lines.forEach((line, i) => {
    const m = line.match(/^([a-zA-Z0-9#]+)\|(.+)\|$/);
    if (m) {
      result.tuning.push(m[1]);
      const notes = m[2].match(/\d+|-+/g) || [];
      result.lines.push({ string: i, notes: notes.map(n => ({ fret: n === "-" ? null : parseInt(n), duration: n.length })) });
    }
  });
  return result;
}

export const SAMPLE_TABS = [
  {
    title: "Smoke on the Water (riff)",
    bpm: 112,
    tuning: ["e","B","G","D","A","E"],
    lines: [
      { string: 0, notes: [{fret:null,duration:2},{fret:null,duration:2},{fret:null,duration:2},{fret:null,duration:2},{fret:null,duration:2}] },
      { string: 1, notes: [] },
      { string: 2, notes: [] },
      { string: 3, notes: [{fret:0,duration:2},{fret:3,duration:2},{fret:5,duration:3},{fret:0,duration:2},{fret:3,duration:2},{fret:6,duration:2},{fret:5,duration:3}] },
      { string: 4, notes: [] },
      { string: 5, notes: [] }
    ]
  },
  {
    title: "Seven Nation Army (riff)",
    bpm: 120,
    tuning: ["e","B","G","D","A","E"],
    lines: [
      { string: 0, notes: [] },
      { string: 1, notes: [] },
      { string: 2, notes: [] },
      { string: 3, notes: [] },
      { string: 4, notes: [{fret:7,duration:2},{fret:7,duration:2},{fret:10,duration:2},{fret:7,duration:2},{fret:5,duration:2},{fret:3,duration:2},{fret:5,duration:2}] },
      { string: 5, notes: [] }
    ]
  },
  {
    title: "Iron Man (riff)",
    bpm: 140,
    tuning: ["e","B","G","D","A","E"],
    lines: [
      { string: 0, notes: [] },
      { string: 1, notes: [] },
      { string: 2, notes: [] },
      { string: 3, notes: [{fret:2,duration:2},{fret:5,duration:2},{fret:2,duration:2},{fret:3,duration:2},{fret:2,duration:2},{fret:0,duration:4}] },
      { string: 4, notes: [] },
      { string: 5, notes: [] }
    ]
  },
  {
    title: "Come As You Are (riff)",
    bpm: 120,
    tuning: ["e","B","G","D","A","E"],
    lines: [
      { string: 0, notes: [] },
      { string: 1, notes: [] },
      { string: 2, notes: [{fret:0,duration:2},{fret:0,duration:2},{fret:2,duration:2},{fret:2,duration:2},{fret:3,duration:2},{fret:2,duration:2},{fret:0,duration:2},{fret:0,duration:2}] },
      { string: 3, notes: [] },
      { string: 4, notes: [] },
      { string: 5, notes: [] }
    ]
  },
  {
    title: "Eye of the Tiger (riff)",
    bpm: 109,
    tuning: ["e","B","G","D","A","E"],
    lines: [
      { string: 0, notes: [] },
      { string: 1, notes: [] },
      { string: 2, notes: [] },
      { string: 3, notes: [{fret:2,duration:2},{fret:2,duration:2},{fret:4,duration:2},{fret:2,duration:2},{fret:2,duration:2},{fret:4,duration:2},{fret:2,duration:2},{fret:4,duration:2}] },
      { string: 4, notes: [] },
      { string: 5, notes: [] }
    ]
  },
  {
    title: "Back in Black (riff)",
    bpm: 93,
    tuning: ["e","B","G","D","A","E"],
    lines: [
      { string: 0, notes: [] },
      { string: 1, notes: [] },
      { string: 2, notes: [] },
      { string: 3, notes: [{fret:0,duration:2},{fret:0,duration:2},{fret:2,duration:2},{fret:0,duration:2},{fret:0,duration:2},{fret:2,duration:2}] },
      { string: 4, notes: [] },
      { string: 5, notes: [{fret:0,duration:2},{fret:0,duration:2},{fret:0,duration:2},{fret:0,duration:2},{fret:0,duration:2},{fret:0,duration:2}] }
    ]
  },
  {
    title: "Sweet Child O Mine (intro)",
    bpm: 125,
    tuning: ["e","B","G","D","A","E"],
    lines: [
      { string: 0, notes: [{fret:12,duration:2},{fret:15,duration:2},{fret:14,duration:2},{fret:12,duration:2},{fret:15,duration:2},{fret:14,duration:2},{fret:12,duration:2},{fret:15,duration:2}] },
      { string: 1, notes: [] },
      { string: 2, notes: [] },
      { string: 3, notes: [] },
      { string: 4, notes: [] },
      { string: 5, notes: [] }
    ]
  }
];