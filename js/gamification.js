import { state, saveState } from "./storage.js";

export const XP_PER_LEVEL = 100;

export function xpForLevel(lv) { return lv * XP_PER_LEVEL; }

export function addXP(amount) {
  state.xp += amount;
  let leveled = false;
  while (state.xp >= xpForLevel(state.level)) {
    state.xp -= xpForLevel(state.level);
    state.level += 1;
    leveled = true;
  }
  saveState(state);
  return { leveled, level: state.level };
}

export function addGems(n) { state.gems += n; saveState(state); }
export function spendGems(n) {
  if (state.gems < n) return false;
  state.gems -= n; saveState(state); return true;
}
export function loseHeart() {
  if (state.hearts > 0) state.hearts -= 1;
  saveState(state);
  return state.hearts;
}
export function refillHearts() {
  state.hearts = 5; saveState(state);
}
export function regenHearts() {
  // regenera 1 corazón cada 30 min (simplificado: si han pasado 30 min, +1)
  const now = Date.now();
  const last = state.lastPractice ? new Date(state.lastPractice).getTime() : now;
  // no-op real; dejamos corazones como están para prototipo
}

export function updateStreak() {
  const today = new Date().toDateString();
  if (state.lastPractice === today) return state.streak;
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (state.lastPractice === yesterday) state.streak += 1;
  else if (state.lastPractice === null) state.streak = 1;
  else state.streak = 1;
  state.lastPractice = today;
  saveState(state);
  return state.streak;
}

export const ACHIEVEMENTS = [
  { id: "first_lesson", name: "Primera lección", desc: "Completa tu primera lección", icon: "🌟", check: s => s.stats.lessonsCompleted >= 1 },
  { id: "five_lessons", name: "En marcha", desc: "Completa 5 lecciones", icon: "🚀", check: s => s.stats.lessonsCompleted >= 5 },
  { id: "twenty_lessons", name: "Constante", desc: "Completa 20 lecciones", icon: "🏆", check: s => s.stats.lessonsCompleted >= 20 },
  { id: "streak_3", name: "3 días seguidos", desc: "Mantén una racha de 3 días", icon: "🔥", check: s => s.streak >= 3 },
  { id: "streak_7", name: "Semana perfecta", desc: "Mantén una racha de 7 días", icon: "🔥🔥", check: s => s.streak >= 7 },
  { id: "level_5", name: "Nivel 5", desc: "Alcanza el nivel 5", icon: "⭐", check: s => s.level >= 5 },
  { id: "level_10", name: "Nivel 10", desc: "Alcanza el nivel 10", icon: "💫", check: s => s.level >= 10 },
  { id: "tuner_pro", name: "Oído fino", desc: "Usa el afinador 10 veces", icon: "🎯", check: s => s.stats.tunings >= 10 },
  { id: "gems_50", name: "Ahorrador", desc: "Acumula 50 gemas", icon: "💎", check: s => s.gems >= 50 }
];

export function checkAchievements() {
  const newly = [];
  for (const a of ACHIEVEMENTS) {
    if (!state.achievements[a.id] && a.check(state)) {
      state.achievements[a.id] = true;
      state.gems += 5;
      newly.push(a);
    }
  }
  if (newly.length) saveState(state);
  return newly;
}

export function levelTitle(lv) {
  if (lv < 3) return "Principiante";
  if (lv < 6) return "Aprendiz";
  if (lv < 10) return "Guitarrista";
  if (lv < 15) return "Avanzado";
  return "Maestro";
}
