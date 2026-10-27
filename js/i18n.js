import { state, saveState } from "./storage.js";
import { startPhraseTranslator } from "./i18n-phrases.js";

export const SUPPORTED_LANGUAGES = [
  { code: "es", label: "Español" },
  { code: "en", label: "English" },
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" }
];

const FALLBACK_LANGUAGE = "es";
let currentLanguage = FALLBACK_LANGUAGE;
const localeCache = {};

function normalizeLanguageTag(tag) {
  const value = String(tag || "").trim().toLowerCase();
  if (!value) return null;
  if (value === "pt" || value.startsWith("pt-")) return "pt-BR";
  if (value === "es" || value.startsWith("es-")) return "es";
  if (value === "en" || value.startsWith("en-")) return "en";
  if (value === "fr" || value.startsWith("fr-")) return "fr";
  if (value === "de" || value.startsWith("de-")) return "de";
  if (value === "it" || value.startsWith("it-")) return "it";
  return null;
}

export function detectLanguage() {
  const tags = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language || navigator.userLanguage || ""];
  for (const tag of tags) {
    const resolved = normalizeLanguageTag(tag);
    if (resolved) return resolved;
  }
  return "en";
}

export function resolveLanguage(setting) {
  if (setting && setting !== "auto") {
    return SUPPORTED_LANGUAGES.some((lang) => lang.code === setting) ? setting : "en";
  }
  return detectLanguage();
}

async function loadLocale(lang) {
  if (localeCache[lang]) return localeCache[lang];
  try {
    const response = await fetch(`locales/${lang}.json`, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    localeCache[lang] = data;
    return data;
  } catch (e) {
    console.warn("Could not load locale", lang, e);
    if (lang !== FALLBACK_LANGUAGE) return loadLocale(FALLBACK_LANGUAGE);
    return {};
  }
}

function interpolate(text, vars) {
  return String(text).replace(/\{(\w+)\}/g, (_, key) => (vars && vars[key] != null ? vars[key] : `{${key}}`));
}

export function t(key, vars) {
  const locale = localeCache[currentLanguage] || {};
  const fallback = localeCache[FALLBACK_LANGUAGE] || {};
  const raw = (locale && locale[key]) || (fallback && fallback[key]) || key;
  return interpolate(raw, vars);
}

export function getCurrentLanguage() {
  return currentLanguage;
}

export function applyDocumentLanguage() {
  document.documentElement.lang = currentLanguage;
  document.documentElement.dir = "ltr";
  const title = t("app.title");
  if (title && title !== "app.title") document.title = title;
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.getAttribute("data-i18n");
    if (key) node.textContent = t(key);
  });
}

export async function initI18n() {
  if (!state.settings) state.settings = {};
  if (!state.settings.language) state.settings.language = "auto";
  currentLanguage = resolveLanguage(state.settings.language);
  await loadLocale(currentLanguage);
  if (currentLanguage !== FALLBACK_LANGUAGE) await loadLocale(FALLBACK_LANGUAGE);
  applyDocumentLanguage();
  try { await startPhraseTranslator(currentLanguage); } catch (e) { console.warn("phrases", e); }
}

export async function setLanguage(setting) {
  if (!state.settings) state.settings = {};
  state.settings.language = setting || "auto";
  saveState(state);
  currentLanguage = resolveLanguage(state.settings.language);
  await loadLocale(currentLanguage);
  if (currentLanguage !== FALLBACK_LANGUAGE) await loadLocale(FALLBACK_LANGUAGE);
  applyDocumentLanguage();
  return currentLanguage;
}