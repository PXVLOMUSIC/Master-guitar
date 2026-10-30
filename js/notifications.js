/* ============================================================
   Strumio — Notificaciones push (recordatorios de práctica)
   ============================================================ */
import { state, saveState } from "./storage.js";

const REMINDER_KEY = "strumio_reminder_scheduled";

export function isSupported() {
  return "Notification" in window;
}

export async function requestPermission() {
  if (!isSupported()) return false;
  try {
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      if (state.settings) state.settings.notifications = true;
      saveState(state);
      scheduleDailyReminder();
      return true;
    }
  } catch (e) { console.warn("notif", e); }
  return false;
}

export function scheduleDailyReminder() {
  if (!isSupported() || Notification.permission !== "granted") return;
  if (!state.settings || !state.settings.notifications) return;
  // Clear existing
  if (window._reminderTimer) clearTimeout(window._reminderTimer);
  const hour = state.settings.reminderHour || 19;
  const now = new Date();
  const target = new Date();
  target.setHours(hour, 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const delay = target.getTime() - now.getTime();
  window._reminderTimer = setTimeout(() => {
    showReminder();
    scheduleDailyReminder(); // reschedule for next day
  }, delay);
}

function showReminder() {
  if (!isSupported() || Notification.permission !== "granted") return;
  try {
    const n = new Notification("Strumio", {
      body: "¡Hora de practicar guitarra! 🎸 Tu racha te espera.",
      icon: "assets/icons/icon-192.png",
      tag: "daily-reminder",
    });
    n.onclick = () => { window.focus(); n.close(); };
  } catch (e) { console.warn("notif show", e); }
}

export function initNotifications() {
  if (!isSupported()) return;
  if (state.settings && state.settings.notifications && Notification.permission === "granted") {
    scheduleDailyReminder();
  }
}

export function cancelReminder() {
  if (window._reminderTimer) { clearTimeout(window._reminderTimer); window._reminderTimer = null; }
}