const KEY = "strumio_state_v1";

const defaultState = () => ({
  user: null,
  xp: 0,
  level: 1,
  gems: 0,
  hearts: 5,
  streak: 0,
  lastPractice: null,
  completed: {},   // lessonId -> true
  achievements: {}, // achievementId -> true
  dailyChallengeDone: null,
  settings: { theme: "dark", sound: true, metronomeSound: true, haptic: true, dailyGoal: 10, notifications: false, reminderHour: 19, language: "es", instrument: "guitar", tunerPitch: 440 },
  stats: { lessonsCompleted: 0, minutesPracticed: 0, tunings: 0, accuracy: 0, chordsLearned: [], scalesLearned: [], bestChordChanges: 0, totalPracticeTime: 0 },
  tunerHistory: {},
  dailyLog: {},
  practiceDays: []
});

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    return { ...defaultState(), ...s };
  } catch (e) {
    return defaultState();
  }
}

export function saveState(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}

export function resetState() {
  localStorage.removeItem(KEY);
  return defaultState();
}

export const state = loadState();
export { defaultState };
