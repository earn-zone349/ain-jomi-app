// Translation core without browser dependencies, so it can be unit-tested.

export const LANGS = ['bn', 'en'];
export const DEFAULT_LANG = 'bn';

export function isLang(value) {
  return LANGS.includes(value);
}

/**
 * Look up a key: current language, then English, then the key itself.
 * Supports {name} placeholders.
 */
export function translate(dicts, lang, key, vars) {
  let str = dicts[lang]?.[key] ?? dicts.en?.[key] ?? key;
  if (vars) {
    str = str.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
  }
  return str;
}

/**
 * Pick a bilingual DB field. pick(row, 'title', 'bn') reads row.title_bn and falls back to
 * row.title_en (and the reverse) so a half-translated record still shows something.
 */
export function pick(row, base, lang) {
  if (!row) return '';
  const other = lang === 'bn' ? 'en' : 'bn';
  const primary = row[`${base}_${lang}`];
  if (primary != null && String(primary).trim() !== '') return primary;
  const fallback = row[`${base}_${other}`];
  return fallback != null ? fallback : '';
}

/** True when the preferred-language field is empty but the other language has text. */
export function isFallback(row, base, lang) {
  if (!row) return false;
  const other = lang === 'bn' ? 'en' : 'bn';
  const primary = row[`${base}_${lang}`];
  const fb = row[`${base}_${other}`];
  return (primary == null || String(primary).trim() === '') && fb != null && String(fb).trim() !== '';
}
