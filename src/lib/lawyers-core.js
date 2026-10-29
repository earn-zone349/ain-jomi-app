// Pure logic for the lawyer directory: checking an application, filtering and ordering the list.
// The database enforces the same rules (supabase/phase5_lawyers.sql); this gives the user a clear message first.
//
// The list is deliberately NEUTRAL. The Bangladesh Bar Council's conduct rules do not allow an advocate to seek work
// by advertising, so there are no ratings, reviews, "featured" slots or free-text promotion: only the conventional
// details (name, enrolment, qualifications, courts, areas, office). Order is alphabetical.

import { DISTRICT_IDS, COURT_IDS, LIMITS } from './lawyers-options.js';

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

  if (form.consent_public !== true) errors.consent_public = 'required';

  const clean = { full_name, enrollment_no, enrollment_year, bar_association, courts, practice_areas, district, office_address, phone, email: email || null, qualifications: qualifications || null, consent_public: true };
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

/** Everything an anonymous visitor may ask the view for (the database hides the rest from them). */
export const PUBLIC_COLUMNS = 'id,full_name,enrollment_no,enrollment_year,bar_association,courts,practice_areas,district,qualifications,verified_at';
export const SIGNED_IN_COLUMNS = `${PUBLIC_COLUMNS},office_address,phone,email`;
