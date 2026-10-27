// i18n-phrases.js — traduce en pantalla el texto que aún está escrito en
// español dentro del código (herramientas de Practicar, avisos, etc.).
// Las claves de locales/<idioma>.json siguen siendo la vía principal; esto
// cubre el resto con un diccionario frase -> traducción en
// locales/phrases/<idioma>.json. Una frase con {0}, {1}… es un patrón:
// "Récord: {0}" traduce "Récord: 12" conservando el número.

const ATTRS = ["placeholder", "aria-label", "title", "alt"];
const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "CODE", "PRE"]);

let exact = null;
let patterns = [];
let observer = null;
const done = new WeakMap(); // nodo -> último texto que pusimos

function compile(dict) {
  exact = new Map();
  patterns = [];
  for (const [src, dst] of Object.entries(dict)) {
    // Un patrón idéntico ("{0} · {1}") sigue sirviendo: traduce sus partes.
    if (!dst || (src === dst && !/\{\d+\}/.test(src))) continue;
    const key = src.replace(/\s+/g, " ").trim();
    if (/\{\d+\}/.test(key)) {
      const parts = key.split(/(\{\d+\})/);
      const order = [];
      const re = parts.map((p) => {
        const m = /^\{(\d+)\}$/.exec(p);
        if (m) { order.push(+m[1]); return "(.+?)"; }
        return p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }).join("");
      patterns.push({ re: new RegExp("^" + re + "$"), order, dst, lit: key.replace(/\{\d+\}/g, "").length });
    } else {
      exact.set(key, dst);
    }
  }
  // Primero los patrones con más texto fijo (más específicos).
  patterns.sort((a, b) => b.lit - a.lit);
}

function translateString(text) {
  const key = text.replace(/\s+/g, " ").trim();
  if (!key || !/[A-Za-zÁÉÍÓÚáéíóúÑñ¿¡]/.test(key)) return null;
  let out = exact.get(key);
  if (out == null) {
    for (const p of patterns) {
      const m = p.re.exec(key);
      if (!m) continue;
      const vals = {};
      p.order.forEach((n, i) => { vals[n] = m[i + 1]; });
      // Los valores también pueden ser frases (por ejemplo, un nivel).
      out = p.dst.replace(/\{(\d+)\}/g, (_, n) => {
        const v = vals[n] ?? "";
        return exact.get(v.trim()) ?? v;
      });
      break;
    }
  }
  if (out == null) return null;
  const lead = text.match(/^\s*/)[0];
  const trail = text.match(/\s*$/)[0];
  return lead + out + trail;
}

function translateNode(node) {
  if (node.nodeType === 3) {
    const parent = node.parentElement;
    if (!parent || SKIP.has(parent.tagName) || parent.closest("[data-no-translate]")) return;
    if (done.get(node) === node.nodeValue) return;
    const tr = translateString(node.nodeValue);
    if (tr != null && tr !== node.nodeValue) { node.nodeValue = tr; }
    done.set(node, node.nodeValue);
    return;
  }
  if (node.nodeType !== 1) return;
  if (node.closest && node.closest("[data-no-translate]")) return;
  for (const a of ATTRS) {
    const v = node.getAttribute && node.getAttribute(a);
    if (!v) continue;
    const tr = translateString(v);
    if (tr != null && tr !== v) node.setAttribute(a, tr);
  }
  if (SKIP.has(node.tagName)) return;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n = walker.nextNode();
  while (n) {
    if (n.nodeType === 3) translateNode(n);
    else {
      for (const a of ATTRS) {
        const v = n.getAttribute(a);
        if (!v) continue;
        const tr = translateString(v);
        if (tr != null && tr !== v) n.setAttribute(a, tr);
      }
    }
    n = walker.nextNode();
  }
}

/** Traduce una frase suelta (para alert/confirm o texto que no va al DOM). */
export function translatePhrase(text) {
  if (!exact) return text;
  const tr = translateString(String(text));
  return tr == null ? text : tr;
}

export async function startPhraseTranslator(lang) {
  if (observer) { observer.disconnect(); observer = null; }
  exact = null;
  if (!lang || lang === "es") return;
  let dict = {};
  try {
    const r = await fetch(`locales/phrases/${lang}.json`);
    if (r.ok) dict = await r.json();
  } catch (e) { return; }
  compile(dict);
  // alert/confirm/prompt con texto fijo en español
  for (const fn of ["alert", "confirm", "prompt"]) {
    const orig = window[fn];
    if (!orig || orig.__phrases) continue;
    const wrapped = function (msg, ...rest) { return orig.call(window, translatePhrase(msg), ...rest); };
    wrapped.__phrases = true;
    window[fn] = wrapped;
  }
  translateNode(document.body);
  observer = new MutationObserver((records) => {
    for (const rec of records) {
      if (rec.type === "characterData") translateNode(rec.target);
      else if (rec.type === "attributes") translateNode(rec.target);
      else rec.addedNodes.forEach((n) => translateNode(n));
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
