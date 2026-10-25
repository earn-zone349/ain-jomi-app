// Runtime i18n: current language, t(), field picking, number/date formatting.

import { DEFAULT_LANG, LANGS, isLang, pick as pickCore, isFallback as isFallbackCore, translate } from '../lib/i18n-core.js';
import { formatNumber } from '../lib/text.js';
import { getString, setString } from '../core/storage.js';
import { bn } from './bn.js';
import { en } from './en.js';

const dicts = { bn, en };
const listeners = new Set();
let current = DEFAULT_LANG;

export function initLang() {
  const saved = getString('lang', null);
  current = isLang(saved) ? saved : DEFAULT_LANG;
  applyDocumentLang();
  return current;
}

export function hasChosenLang() {
  return isLang(getString('lang', null));
}

export function getLang() {
  return current;
}

/** Always persists (so choosing the default language still counts as "chosen"); notifies only on change. */
export function setLang(lang) {
  if (!isLang(lang)) return;
  const changed = lang !== current;
  current = lang;
  setString('lang', lang);
  applyDocumentLang();
  if (changed) listeners.forEach((fn) => fn(lang));
}

function applyDocumentLang() {
  document.documentElement.lang = current === 'bn' ? 'bn-BD' : 'en';
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function t(key, vars) {
  return translate(dicts, current, key, vars);
}

/** Bilingual DB field with fallback to the other language. */
export function pick(row, base) {
  return pickCore(row, base, current);
}

export function isFallback(row, base) {
  return isFallbackCore(row, base, current);
}

/** Number as text, with Bangla digits when the UI language is Bangla. */
export function num(value) {
  return formatNumber(value, current);
}

export function formatDate(value, opts = { year: 'numeric', month: 'long', day: 'numeric' }) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(current === 'bn' ? 'bn-BD' : 'en-GB', opts).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function formatDateTime(value) {
  return formatDate(value, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function appName() {
  return current === 'bn' ? 'আইন জমি' : 'Ain Jomi';
}

export { LANGS };
