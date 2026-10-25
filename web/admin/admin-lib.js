// Pure helpers for the admin panel (no DOM, no network): unit-tested in tests/admin-lib.test.js.

/** URL-safe slug from English text. Returns '' when nothing usable is left (e.g. Bangla-only titles). */
export function slugify(text, max = 80) {
  return String(text ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

export const SLUG_RE = /^[a-z0-9-]{2,120}$/;

/**
 * Field kinds: text, textarea, number, date, url, select, ref, slug.
 * Converts raw form values to a DB row: trims, '' -> null for optional fields, numbers parsed.
 * Returns { row, errors } where errors maps field key -> message.
 */
export function coerceRow(fields, values) {
  const row = {};
  const errors = {};
  for (const f of fields) {
    let v = values[f.key];
    if (typeof v === 'string') v = v.trim();
    const empty = v === undefined || v === null || v === '';

    if (empty) {
      if (f.required) errors[f.key] = 'Required / আবশ্যক';
      else if (f.default !== undefined) row[f.key] = f.default;
      else row[f.key] = null;
      continue;
    }
    if (f.kind === 'number') {
      const n = Number(v);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        errors[f.key] = 'Whole number only / পূর্ণসংখ্যা দিন';
        continue;
      }
      if (f.min !== undefined && n < f.min) errors[f.key] = `Minimum ${f.min}`;
      else if (f.max !== undefined && n > f.max) errors[f.key] = `Maximum ${f.max}`;
      else row[f.key] = n;
      continue;
    }
    if (f.kind === 'url') {
      if (!/^https?:\/\/\S+$/i.test(v)) errors[f.key] = 'Must start with http:// or https://';
      else row[f.key] = v;
      continue;
    }
    if (f.kind === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) errors[f.key] = 'Use a valid date';
      else row[f.key] = v;
      continue;
    }
    if (f.kind === 'slug') {
      if (!SLUG_RE.test(v)) errors[f.key] = 'Lowercase letters, digits and "-" only (2-120 chars)';
      else row[f.key] = v;
      continue;
    }
    if (f.kind === 'select' && f.options && !f.options.some((o) => o.value === v)) {
      errors[f.key] = 'Pick one of the options';
      continue;
    }
    if (f.max && String(v).length > f.max) {
      errors[f.key] = `Too long (max ${f.max})`;
      continue;
    }
    row[f.key] = v;
  }
  return { row, errors };
}

/** Turn a Supabase/PostgREST error into a short, human message. */
export function friendlyError(err) {
  if (!err) return '';
  const msg = String(err.message || err);
  const code = String(err.code || '');
  if (code === '23505') return 'This value already exists (duplicate slug / number). Change it and try again.';
  if (code === '23514' && /cannot go back to draft/i.test(msg)) return 'A published item cannot go back to draft. Archive it instead.';
  if (code === '23514') return 'A value is out of the allowed range or too long.';
  if (code === '23503') return 'This item is still linked to other data.';
  if (code === '42501' || /row-level security|permission denied|admins only/i.test(msg)) return 'You do not have permission for this action.';
  if (/failed to fetch|network/i.test(msg)) return 'No internet connection.';
  if (/invalid login credentials/i.test(msg)) return 'Wrong email or password.';
  return msg;
}

/**
 * Columns that may be restored from an audit_log snapshot: everything except identity, ownership,
 * timestamps and status (status is never rolled back: it would resurrect withdrawn content).
 */
export function restorableFields(oldData) {
  const skip = new Set(['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'status']);
  const out = {};
  for (const [k, v] of Object.entries(oldData || {})) if (!skip.has(k)) out[k] = v;
  return out;
}

/** Parse a JSON textarea; returns { ok, value } or { ok:false, error }. */
export function parseJsonInput(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${e.message}` };
  }
}

/** Dotted-version check used by the settings form. */
export function isVersion(v) {
  return /^\d+(\.\d+){0,3}$/.test(String(v ?? '').trim());
}
