/* ============================================================
   Strumio — Amigos y desafíos (gamificación social)
   ============================================================ */
import { t } from "./i18n.js";
import * as backend from "./backend.js";

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function toast(msg) {
  if (typeof window !== "undefined" && typeof window.toast === "function") {
    try { window.toast(msg); return; } catch (e) {}
  }
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:8px 14px;border-radius:8px;z-index:9999";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

export async function renderFriends(container) {
  container.innerHTML = `<div class="friends"><h2>Amigos y desafíos</h2><p class="muted">Cargando...</p></div>`;
  const cfg = backend.getBackendConfig();
  if (!cfg || !backend.isConfigured()) {
    container.innerHTML = `<div class="friends"><h2>Amigos y desafíos</h2><p>Configura el backend en Ajustes para usar funciones sociales.</p></div>`;
    return;
  }

  let friends = [];
  let requests = [];
  let challenges = [];
  let leaderboard = [];
  try {
    friends = await backend.getFriends() || [];
    requests = await backend.getFriendRequests() || [];
    challenges = await backend.getChallenges() || [];
    // Weekly leaderboard
    try {
      const lb = await backend.getWeeklyLeaderboard();
      if (lb) leaderboard = lb;
    } catch (e) {}
    // Notify about pending challenges
    const pendingChallenges = challenges.filter((c) => c.status === "pending" && c.challenged_id === (backend.getSession() && backend.getSession().user && backend.getSession().user.id));
    if (pendingChallenges.length > 0) {
      toast(`Tienes ${pendingChallenges.length} desafío(s) pendiente(s)`);
    }
    if (requests.length > 0) {
      toast(`Tienes ${requests.length} solicitud(es) de amistad`);
    }
  } catch (e) { console.warn("friends load", e); }

  const friendsHtml = friends.length
    ? friends.map((f) => `
        <div class="friend-row">
          <span class="friend-name">${escapeHtml(f.username || f.email || f.id)}</span>
          <button class="btn btn-sm btn-danger" data-act="remove-friend" data-id="${f.id}">Eliminar</button>
          <button class="btn btn-sm btn-primary" data-act="challenge-friend" data-id="${f.id}">Desafiar</button>
        </div>`).join("")
    : "<p class='muted'>No tienes amigos aún. Añade por username.</p>";

  const requestsHtml = requests.length
    ? requests.map((r) => `
        <div class="friend-row">
          <span class="friend-name">${escapeHtml(r.username || r.email || r.id)}</span>
          <button class="btn btn-sm btn-success" data-act="accept-friend" data-id="${r.id}">Aceptar</button>
          <button class="btn btn-sm btn-danger" data-act="reject-friend" data-id="${r.id}">Rechazar</button>
        </div>`).join("")
    : "";

  const challengesHtml = challenges.length
    ? challenges.map((c) => `
        <div class="challenge-row ${c.status}">
          <span class="challenge-info">${escapeHtml(c.challenger_name || c.challenger_id)} → ${escapeHtml(c.challenged_name || c.challenged_id)}</span>
          <span class="challenge-status">${c.status}</span>
          ${c.status === "pending" && c.challenged_id === (backend.getSession() && backend.getSession().user && backend.getSession().user.id) ? `<button class="btn btn-sm btn-primary" data-act="accept-challenge" data-id="${c.id}">Aceptar</button>` : ""}
          ${c.status === "accepted" ? `<button class="btn btn-sm btn-success" data-act="complete-challenge" data-id="${c.id}">Completar</button>` : ""}
        </div>`).join("")
    : "<p class='muted'>No hay desafíos.</p>";

  const leaderboardHtml = leaderboard.length
    ? leaderboard.map((entry, idx) => `
        <div class="lb-row">
          <span class="lb-rank">${idx + 1}</span>
          <span class="lb-name">${escapeHtml(entry.username || entry.name || entry.id)}</span>
          <span class="lb-score">${entry.score || entry.xp || 0} XP</span>
        </div>`).join("")
    : "<p class='muted'>Sin datos esta semana.</p>";

  container.innerHTML = `
    <div class="friends">
      <h2>Amigos y desafíos</h2>
      <div class="friends-section">
        <h3>Añadir amigo</h3>
        <div class="add-friend">
          <input type="text" id="friendUsername" placeholder="Username del amigo" />
          <button class="btn btn-primary" id="addFriendBtn">Añadir</button>
        </div>
      </div>
      ${requests.length ? `<div class="friends-section"><h3>Solicitudes pendientes</h3>${requestsHtml}</div>` : ""}
      <div class="friends-section">
        <h3>Mis amigos (${friends.length})</h3>
        ${friendsHtml}
      </div>
      <div class="friends-section">
        <h3>Desafíos</h3>
        ${challengesHtml}
      </div>
      <div class="friends-section">
        <h3>🏆 Leaderboard semanal</h3>
        ${leaderboardHtml}
      </div>
    </div>
  `;

  // Wire up events
  const addBtn = container.querySelector("#addFriendBtn");
  if (addBtn) {
    addBtn.onclick = async () => {
      const input = container.querySelector("#friendUsername");
      const username = input ? input.value.trim() : "";
      if (!username) { toast("Introduce un username"); return; }
      try {
        const r = await backend.addFriendByUsername(username);
        if (r && r.ok) { toast("Solicitud enviada"); await renderFriends(container); }
        else { toast(r && r.error ? String(r.error) : "Error al añadir"); }
      } catch (e) { toast("Error al añadir amigo"); }
    };
  }

  container.querySelectorAll("[data-act]").forEach((btn) => {
    btn.onclick = async () => {
      const act = btn.dataset.act;
      const id = btn.dataset.id;
      try {
        if (act === "remove-friend") {
          await backend.removeFriend(id);
          toast("Amigo eliminado");
        } else if (act === "accept-friend") {
          await backend.acceptFriend(id);
          toast("Solicitud aceptada");
        } else if (act === "reject-friend") {
          await backend.rejectFriend(id);
          toast("Solicitud rechazada");
        } else if (act === "challenge-friend") {
          const r = await backend.challengeFriend(id, null);
          if (r && r.ok) toast("Desafío enviado"); else toast("Error al desafiar");
        } else if (act === "accept-challenge") {
          await backend.acceptChallenge(id);
          toast("Desafío aceptado");
        } else if (act === "complete-challenge") {
          await backend.completeChallenge(id);
          // Give rewards
          if (window.state) {
            window.state.xp = (window.state.xp || 0) + 50;
            window.state.gems = (window.state.gems || 0) + 5;
            if (window.saveState) window.saveState(window.state);
          }
          toast("Desafío completado! +50 XP, +5 gemas");
        }
        await renderFriends(container);
      } catch (e) { toast("Error"); console.error(e); }
    };
  });
}

export function openFriends() {
  const existing = document.getElementById("friendsOverlay");
  if (existing) existing.remove();
  const container = document.createElement("div");
  container.id = "friendsOverlay";
  container.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;";
  const modal = document.createElement("div");
  modal.style.cssText = "width:100%;max-width:480px;max-height:80vh;overflow-y:auto;background:var(--card,#1e1e2e);border:1px solid var(--border,#333);border-radius:16px;padding:20px;";
  container.appendChild(modal);
  document.body.appendChild(container);
  container.addEventListener("click", (e) => { if (e.target === container) container.remove(); });
  renderFriends(modal);
}