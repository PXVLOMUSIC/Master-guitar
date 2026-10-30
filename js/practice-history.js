/* ============================================================
   Strumio — Historial de práctica
   Registro detallado de lo practicado + gráficas.
   ============================================================ */

const KEY = "strumio_practice_history_v1";

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch (e) {
    return [];
  }
}

function saveHistory(entries) {
  try {
    // Keep last 500 entries
    const trimmed = entries.slice(-500);
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch (e) { console.warn("history save", e); }
}

export function logPractice(type, detail = {}) {
  const entries = loadHistory();
  entries.push({
    type, // "lesson", "song", "exercise", "tuner", "backing", "looper"
    detail,
    timestamp: Date.now(),
    date: new Date().toISOString().slice(0, 10),
  });
  saveHistory(entries);
}

export function getHistory(days = 30) {
  const entries = loadHistory();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return entries.filter((e) => e.timestamp >= cutoff);
}

export function getDailyStats(days = 30) {
  const entries = getHistory(days);
  const byDate = {};
  entries.forEach((e) => {
    if (!byDate[e.date]) byDate[e.date] = { date: e.date, count: 0, types: {} };
    byDate[e.date].count++;
    byDate[e.date].types[e.type] = (byDate[e.date].types[e.type] || 0) + 1;
  });
  // Fill in missing dates
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    result.push(byDate[d] || { date: d, count: 0, types: {} });
  }
  return result;
}

export function getTypeStats(days = 30) {
  const entries = getHistory(days);
  const stats = {};
  entries.forEach((e) => {
    stats[e.type] = (stats[e.type] || 0) + 1;
  });
  return stats;
}

export function renderHistory(container) {
  const stats = getDailyStats(30);
  const typeStats = getTypeStats(30);
  const total = stats.reduce((s, d) => s + d.count, 0);
  const activeDays = stats.filter((d) => d.count > 0).length;

  container.innerHTML = `
    <div class="history">
      <h2>Historial de práctica</h2>
      <div class="history-summary">
        <div class="history-stat"><strong>${total}</strong><span>actividades (30 días)</span></div>
        <div class="history-stat"><strong>${activeDays}</strong><span>días activos</span></div>
        <div class="history-stat"><strong>${Math.round(total / 30 * 10) / 10}</strong><span>promedio/día</span></div>
      </div>
      <canvas id="historyChart" width="600" height="200" style="width:100%;border-radius:8px;background:var(--card2,#2a2a3e);"></canvas>
      <div class="history-types">
        <h3>Por tipo</h3>
        ${Object.entries(typeStats).map(([type, count]) => `
          <div class="history-type-row">
            <span class="history-type-name">${type}</span>
            <div class="history-type-bar"><div style="width:${Math.round(count / total * 100)}%"></div></div>
            <span class="history-type-count">${count}</span>
          </div>
        `).join("") || "<p class='muted'>Sin datos</p>"}
      </div>
      <div class="history-recent">
        <h3>Actividad reciente</h3>
        ${getHistory(7).slice(-10).reverse().map((e) => `
          <div class="history-entry">
            <span class="history-entry__type">${e.type}</span>
            <span class="history-entry__detail">${escapeHtml(JSON.stringify(e.detail).slice(0, 60))}</span>
            <span class="history-entry__time">${new Date(e.timestamp).toLocaleString()}</span>
          </div>
        `).join("") || "<p class='muted'>Sin actividad reciente</p>"}
      </div>
    </div>
  `;

  // Draw chart
  const canvas = container.querySelector("#historyChart");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const maxCount = Math.max(1, ...stats.map((d) => d.count));
    const barW = w / stats.length;
    ctx.fillStyle = "#22c55e";
    stats.forEach((d, i) => {
      const barH = (d.count / maxCount) * (h - 30);
      const x = i * barW;
      const y = h - barH - 20;
      ctx.fillRect(x + 2, y, barW - 4, barH);
      // label
      if (i % 5 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "9px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(d.date.slice(5), x + barW / 2, h - 5);
        ctx.fillStyle = "#22c55e";
      }
    });
  }
}