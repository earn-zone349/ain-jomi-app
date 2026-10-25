// Pure text helpers: no DOM, no network. Unit-tested in tests/text.test.js.

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

/** Replace ASCII digits with Bangla digits. */
export function toBnDigits(value) {
  return String(value).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

/** Replace Bangla digits with ASCII digits (for searching and parsing). */
export function toAsciiDigits(value) {
  return String(value).replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
}

/** Format a number/string for display in the given language. */
export function formatNumber(value, lang) {
  const s = String(value);
  return lang === 'bn' ? toBnDigits(s) : s;
}

/** Normalise a search query or text for forgiving substring matching. */
export function normalizeText(value) {
  return toAsciiDigits(String(value ?? ''))
    .normalize('NFC')
    .replace(/[‌‍]/g, '') // zero-width (joiners) differ between keyboards
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse our light plain-text format into blocks. Rendering is done with textContent,
 * so content from the database can never inject markup.
 *   "# Heading"  -> {type:'h'}
 *   "- item"     -> {type:'li'}
 *   other lines  -> {type:'p'}   (blank lines separate paragraphs; first line of a doc = {type:'title'})
 */
export function parseBlocks(text) {
  const out = [];
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  let first = true;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (first) {
      first = false;
      if (!line.startsWith('# ') && !line.startsWith('- ')) {
        out.push({ type: 'title', text: line });
        continue;
      }
    }
    if (line.startsWith('# ')) out.push({ type: 'h', text: line.slice(2).trim() });
    else if (line.startsWith('- ')) out.push({ type: 'li', text: line.slice(2).trim() });
    else out.push({ type: 'p', text: line });
  }
  return out;
}

/** Compare dotted versions: returns -1, 0, 1. Missing parts count as 0. */
export function compareVersions(a, b) {
  const pa = String(a ?? '0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b ?? '0').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

export function truncate(text, max) {
  const s = String(text ?? '');
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value ?? '').trim());
}

/** Minimal password policy: 8+ chars, not purely digits. Returns an i18n key or null. */
export function passwordProblem(pw) {
  const s = String(pw ?? '');
  if (s.length < 8) return 'auth.err.pwShort';
  if (/^[0-9]+$/.test(s)) return 'auth.err.pwDigits';
  return null;
}
