// Pure logic for the lawyer directory: checking an application, payments, filtering and ordering the list.
// The database enforces the same rules (supabase/phase5_lawyers.sql and phase5_lawyers_v2.sql); this gives the user a
// clear message first.
//
// The list order is deliberately NEUTRAL: alphabetical. Ratings are shown, but never used to rank or to feature anyone.

import { DISTRICT_IDS, COURT_IDS, LIMITS, CERT_TYPES } from './lawyers-options.js';

const BN = '০১২৩৪৫৬৭৮৯';
const ascii = (s) => String(s ?? '').replace(/[০-৯]/g, (c) => String(BN.indexOf(c)));

/** "০১৭০০-০০০ ০০১" -> "01700000001". Keeps a leading + . */
export function normalizePhone(v) {
  const s = ascii(v).trim().replace(/[\s-]/g, '');
  return s;
}
export const phoneOk = (v) => /^\+?[0-9]{6,15}$/.test(normalizePhone(v));
export const emailOk = (v) => v.length <= LIMITS.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

/**
 * Checks an application form. Returns { ok, errors: { field: code }, clean } where clean is ready to send.
 * form: { full_name, enrollment_no, enrollment_year, bar_association, courts[], practice_areas[], district,
 *         office_address, phone, email, qualifications, consent_public }
 */
export function validateApplication(form, categorySlugs = null) {
  const errors = {};
  const str = (v) => String(v ?? '').trim();
  const between = (s, [lo, hi]) => s.length >= lo && s.length <= hi;

  const full_name = str(form.full_name);
  if (!between(full_name, LIMITS.name)) errors.full_name = 'length';

  const enrollment_no = ascii(str(form.enrollment_no));
  if (!/^[A-Za-z0-9/. -]{2,40}$/.test(enrollment_no)) errors.enrollment_no = 'format';

  let enrollment_year = null;
  const yearText = ascii(str(form.enrollment_year));
  if (yearText !== '') {
    const y = Number(yearText);
    if (!Number.isInteger(y) || y < 1948 || y > new Date().getFullYear()) errors.enrollment_year = 'range';
    else enrollment_year = y;
  }

  const bar_association = str(form.bar_association);
  if (!between(bar_association, LIMITS.bar)) errors.bar_association = 'length';

  const courts = [...new Set(form.courts || [])];
  if (!courts.length || courts.some((c) => !COURT_IDS.has(c))) errors.courts = 'required';

  const practice_areas = [...new Set(form.practice_areas || [])];
  if (!practice_areas.length) errors.practice_areas = 'required';
  else if (practice_areas.length > LIMITS.areas) errors.practice_areas = 'tooMany';
  else if (practice_areas.some((a) => !/^[a-z0-9-]+$/.test(a) || (categorySlugs && !categorySlugs.has(a)))) errors.practice_areas = 'invalid';

  const district = str(form.district);
  if (!DISTRICT_IDS.has(district)) errors.district = 'required';

  const office_address = str(form.office_address);
  if (!between(office_address, LIMITS.address)) errors.office_address = 'length';

  const phone = normalizePhone(form.phone);
  if (!phoneOk(phone)) errors.phone = 'format';

  const email = str(form.email).toLowerCase();
  if (email && !emailOk(email)) errors.email = 'format';

  const qualifications = str(form.qualifications);
  if (qualifications.length > LIMITS.qualifications) errors.qualifications = 'length';

  const education = str(form.education);
  if (education.length > LIMITS.education) errors.education = 'length';

  const achievements = str(form.achievements);
  if (achievements.length > LIMITS.achievements) errors.achievements = 'length';

  const thisYear = new Date().getFullYear();
  let practising_since = null;
  const sinceText = ascii(str(form.practising_since));
  if (sinceText !== '') {
    const y = Number(sinceText);
    if (!Number.isInteger(y) || y < 1948 || y > thisYear) errors.practising_since = 'range';
    else practising_since = y;
  }

  const count = (v, key) => {
    const text = ascii(str(v));
    if (text === '') return null;
    const n = Number(text);
    if (!/^[0-9]{1,7}$/.test(text) || n > LIMITS.cases) { errors[key] = 'range'; return null; }
    return n;
  };
  const cases_handled = count(form.cases_handled, 'cases_handled');
  const cases_won = count(form.cases_won, 'cases_won');
  if (cases_won !== null && cases_handled === null && !errors.cases_handled) errors.cases_handled = 'required';
  else if (cases_won !== null && cases_handled !== null && cases_won > cases_handled) errors.cases_won = 'moreThanHandled';

  const certificate_paths = [...new Set(form.certificate_paths || [])];
  if (!certificate_paths.length) errors.certificate_paths = 'required';
  else if (certificate_paths.length > LIMITS.certificates) errors.certificate_paths = 'tooMany';

  if (form.consent_public !== true) errors.consent_public = 'required';

  const clean = {
    full_name, enrollment_no, enrollment_year, bar_association, courts, practice_areas, district, office_address, phone,
    email: email || null, qualifications: qualifications || null, education: education || null, practising_since,
    cases_handled, cases_won, achievements: achievements || null, certificate_paths, consent_public: true,
  };
  return { ok: Object.keys(errors).length === 0, errors, clean };
}

/** Neutral, deterministic order: by name. No ranking of any kind. */
export function sortLawyers(list, locale = 'bn') {
  return [...list].sort((a, b) => a.full_name.localeCompare(b.full_name, locale) || String(a.id).localeCompare(String(b.id)));
}

/** Filters by district, practice area, court and a text query (name or enrolment number). */
export function filterLawyers(list, { district = '', area = '', court = '', q = '' } = {}) {
  const needle = ascii(q).trim().toLowerCase();
  return list.filter((l) => {
    if (district && l.district !== district) return false;
    if (area && !(l.practice_areas || []).includes(area)) return false;
    if (court && !(l.courts || []).includes(court)) return false;
    if (needle && !`${l.full_name} ${ascii(l.enrollment_no)}`.toLowerCase().includes(needle)) return false;
    return true;
  });
}

/** What the public list asks for. Phone and email are NOT here: they come from get_lawyer_contact after payment. */
export const PUBLIC_COLUMNS = 'id,full_name,enrollment_no,enrollment_year,bar_association,courts,practice_areas,district,office_address,qualifications,education,practising_since,cases_handled,cases_won,achievements,certificate_paths,verified_at,rating_avg,rating_count';

/** Checks one certificate file before upload. Returns an error code or null. */
export function certificateProblem(file) {
  if (!file) return 'required';
  if (!Object.prototype.hasOwnProperty.call(CERT_TYPES, file.type)) return 'type';
  if (!(file.size > 0)) return 'empty';
  if (file.size > LIMITS.certificateBytes) return 'size';
  return null;
}

/** Storage path for a new certificate: <user id>/<random>.<ext>. Matches the database check. */
export function certificatePath(userId, file, random) {
  return `${userId}/${random}.${CERT_TYPES[file.type]}`;
}

/** bKash payment form. trx_id is upper-cased with spaces removed (as the database does). */
export function validatePayment({ sender_number, trx_id }) {
  const errors = {};
  const sender = normalizePhone(sender_number);
  if (!phoneOk(sender)) errors.sender_number = 'format';
  const trx = ascii(String(trx_id ?? '')).replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z0-9]{6,20}$/.test(trx)) errors.trx_id = 'format';
  return { ok: Object.keys(errors).length === 0, errors, clean: { sender_number: sender, trx_id: trx } };
}

/** Years of practice from the year the advocate says they started. Not an estimate: plain subtraction, shown with the start year. */
export function yearsSince(startYear, now = new Date().getFullYear()) {
  return Number.isInteger(startYear) && startYear <= now ? now - startYear : null;
}

/** Latest payment of a kind for one lawyer (rejected ones only count if nothing else exists). */
export function paymentFor(payments, lawyerId, kind) {
  const mine = (payments || []).filter((p) => p.lawyer_id === lawyerId && p.kind === kind);
  return mine.find((p) => p.status === 'approved') || mine.find((p) => p.status === 'pending') || mine[0] || null;
}

/** Fee settings written by the admin. Returns null when a fee is missing, so the app never shows a guessed price. */
export function readPricing(raw) {
  const v = raw && typeof raw === 'object' ? raw : {};
  const fee = (n) => (Number.isInteger(n) && n >= 0 ? n : null);
  const contact = fee(v.contact_fee);
  const rating = fee(v.rating_fee);
  const bkash = typeof v.bkash_number === 'string' ? normalizePhone(v.bkash_number) : '';
  return { contact, rating, bkash: phoneOk(bkash) ? bkash : '', note_bn: String(v.note_bn || ''), note_en: String(v.note_en || ''), ready: contact !== null && rating !== null && phoneOk(bkash) };
}
