import test from 'node:test';
import assert from 'node:assert/strict';
import { DISTRICTS, DIVISIONS, COURTS } from '../src/lib/lawyers-options.js';
import { validateApplication, normalizePhone, sortLawyers, filterLawyers, PUBLIC_COLUMNS, certificateProblem, certificatePath, validatePayment, yearsSince, paymentFor, readPricing } from '../src/lib/lawyers-core.js';

const good = () => ({
  full_name: 'Ayesha Rahman', enrollment_no: 'DBA-1234', enrollment_year: '2015', bar_association: 'Dhaka Bar',
  courts: ['lower_courts'], practice_areas: ['land-law'], district: 'dhaka', office_address: '12 Court Road, Dhaka',
  phone: '০১৭০০-০০০ ০০১', email: 'A@X.com', qualifications: 'LL.B', consent_public: true,
  education: 'LL.B (Dhaka University)', practising_since: '2015', cases_handled: '100', cases_won: '60', achievements: 'Award 2018',
  certificate_paths: ['u1/a.pdf'],
});

test('options: 64 districts in 8 divisions, unique slugs that fit the database pattern', () => {
  assert.equal(DISTRICTS.length, 64);
  assert.equal(DIVISIONS.length, 8);
  assert.equal(new Set(DISTRICTS.map((d) => d.id)).size, 64);
  for (const d of DISTRICTS) {
    assert.match(d.id, /^[a-z_]{3,30}$/);
    assert.ok(d.bn && d.en);
  }
  assert.equal(COURTS.length, 4);
});

test('phone: Bangla digits, spaces and dashes are normalised', () => {
  assert.equal(normalizePhone('০১৭০০-০০০ ০০১'), '01700000001');
  assert.equal(normalizePhone('+880 1700-000001'), '+8801700000001');
});

test('a good application passes and is cleaned', () => {
  const r = validateApplication(good());
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.clean.phone, '01700000001');
  assert.equal(r.clean.email, 'a@x.com');
  assert.equal(r.clean.enrollment_year, 2015);
  assert.equal(r.clean.cases_won, 60);
  assert.equal(r.clean.practising_since, 2015);
  assert.deepEqual(r.clean.certificate_paths, ['u1/a.pdf']);
});

test('each rule is enforced', () => {
  const bad = (patch) => validateApplication({ ...good(), ...patch }).errors;
  assert.equal(bad({ full_name: 'Al' }).full_name, 'length');
  assert.equal(bad({ enrollment_no: '#' }).enrollment_no, 'format');
  assert.equal(bad({ enrollment_year: '1900' }).enrollment_year, 'range');
  assert.equal(bad({ enrollment_year: String(new Date().getFullYear() + 1) }).enrollment_year, 'range');
  assert.equal(bad({ courts: [] }).courts, 'required');
  assert.equal(bad({ courts: ['moon'] }).courts, 'required');
  assert.equal(bad({ practice_areas: [] }).practice_areas, 'required');
  assert.equal(bad({ practice_areas: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }).practice_areas, 'tooMany');
  assert.equal(bad({ practice_areas: ['Bad Slug'] }).practice_areas, 'invalid');
  assert.equal(bad({ district: 'atlantis' }).district, 'required');
  assert.equal(bad({ office_address: 'x' }).office_address, 'length');
  assert.equal(bad({ phone: 'abc' }).phone, 'format');
  assert.equal(bad({ email: 'nope' }).email, 'format');
  assert.equal(bad({ qualifications: 'x'.repeat(201) }).qualifications, 'length');
  assert.equal(bad({ consent_public: false }).consent_public, 'required');
  assert.equal(bad({ certificate_paths: [] }).certificate_paths, 'required');
  assert.equal(bad({ certificate_paths: ['a', 'b', 'c', 'd', 'e', 'f'] }).certificate_paths, 'tooMany');
  assert.equal(bad({ cases_won: '200' }).cases_won, 'moreThanHandled');
  assert.equal(bad({ cases_handled: '', cases_won: '5' }).cases_handled, 'required');
  assert.equal(bad({ cases_handled: '-1' }).cases_handled, 'range');
  assert.equal(bad({ practising_since: '1900' }).practising_since, 'range');
  assert.equal(bad({ education: 'x'.repeat(601) }).education, 'length');
  assert.equal(bad({ achievements: 'x'.repeat(601) }).achievements, 'length');
  assert.equal(validateApplication({ ...good(), email: '', enrollment_year: '', education: '', practising_since: '', cases_handled: '', cases_won: '', achievements: '' }).ok, true);
  assert.equal(validateApplication({ ...good(), practice_areas: ['made-up'] }, new Set(['land-law'])).errors.practice_areas, 'invalid');
});

test('list: neutral alphabetical order, no ranking', () => {
  const l = [{ id: '2', full_name: 'Bashir' }, { id: '1', full_name: 'Ayesha' }, { id: '3', full_name: 'Ayesha' }];
  assert.deepEqual(sortLawyers(l, 'en').map((x) => x.id), ['1', '3', '2']);
});

test('filters combine and search by name or enrolment number (also in Bangla digits)', () => {
  const l = [
    { id: '1', full_name: 'Ayesha Rahman', enrollment_no: 'DBA-1234', district: 'dhaka', practice_areas: ['land-law'], courts: ['lower_courts'] },
    { id: '2', full_name: 'Bashir Ahmed', enrollment_no: '5678', district: 'sylhet', practice_areas: ['criminal-law', 'land-law'], courts: ['high_court_division'] },
  ];
  assert.equal(filterLawyers(l, {}).length, 2);
  assert.deepEqual(filterLawyers(l, { district: 'sylhet' }).map((x) => x.id), ['2']);
  assert.deepEqual(filterLawyers(l, { area: 'land-law' }).length, 2);
  assert.deepEqual(filterLawyers(l, { area: 'land-law', court: 'lower_courts' }).map((x) => x.id), ['1']);
  assert.deepEqual(filterLawyers(l, { q: 'bashir' }).map((x) => x.id), ['2']);
  assert.deepEqual(filterLawyers(l, { q: '৫৬৭৮' }).map((x) => x.id), ['2']);
  assert.equal(filterLawyers(l, { q: 'nobody' }).length, 0);
});

test('public column list has no phone or email (they come only after payment)', () => {
  for (const c of ['phone', 'email']) assert.ok(!PUBLIC_COLUMNS.split(',').includes(c));
  assert.ok(PUBLIC_COLUMNS.split(',').includes('office_address'));
});

test('certificate files: type and size are checked, path matches the database rule', () => {
  assert.equal(certificateProblem({ type: 'application/pdf', size: 1000 }), null);
  assert.equal(certificateProblem({ type: 'image/png', size: 3 * 1024 * 1024 }), null);
  assert.equal(certificateProblem({ type: 'image/png', size: 3 * 1024 * 1024 + 1 }), 'size');
  assert.equal(certificateProblem({ type: 'application/zip', size: 10 }), 'type');
  assert.equal(certificateProblem({ type: 'image/jpeg', size: 0 }), 'empty');
  assert.equal(certificateProblem(null), 'required');
  const p = certificatePath('00000000-0000-0000-0000-0000000000f1', { type: 'image/jpeg' }, 'abc123');
  assert.match(p, /^00000000-0000-0000-0000-0000000000f1\/[A-Za-z0-9._-]{1,80}$/);
  assert.ok(p.endsWith('.jpg'));
});

test('payment form: bKash number and transaction id are cleaned like the database does', () => {
  const r = validatePayment({ sender_number: '০১৯২২-২২২ ২২২', trx_id: ' 9ab1 2cd34e ' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.clean, { sender_number: '01922222222', trx_id: '9AB12CD34E' });
  assert.equal(validatePayment({ sender_number: 'abc', trx_id: '12' }).ok, false);
  assert.equal(validatePayment({ sender_number: '01922222222', trx_id: '12' }).errors.trx_id, 'format');
});

test('years of practice is plain subtraction from the stated start year', () => {
  assert.equal(yearsSince(2012, 2026), 14);
  assert.equal(yearsSince(2027, 2026), null);
  assert.equal(yearsSince(null, 2026), null);
});

test('payment status per lawyer: approved wins over pending over rejected', () => {
  const pays = [
    { lawyer_id: 'a', kind: 'contact', status: 'rejected' },
    { lawyer_id: 'a', kind: 'contact', status: 'pending' },
    { lawyer_id: 'b', kind: 'contact', status: 'approved' },
    { lawyer_id: 'a', kind: 'rating', status: 'approved' },
  ];
  assert.equal(paymentFor(pays, 'a', 'contact').status, 'pending');
  assert.equal(paymentFor(pays, 'a', 'rating').status, 'approved');
  assert.equal(paymentFor(pays, 'c', 'contact'), null);
});

test('pricing: shown only when the admin has set every part, never guessed', () => {
  assert.equal(readPricing(null).ready, false);
  assert.equal(readPricing({ contact_fee: 50, rating_fee: 2500, bkash_number: '' }).ready, false);
  assert.equal(readPricing({ contact_fee: null, rating_fee: 2500, bkash_number: '01711111111' }).ready, false);
  const ok = readPricing({ contact_fee: 50, rating_fee: 2500, bkash_number: '০১৭১১-১১১১১১' });
  assert.equal(ok.ready, true);
  assert.equal(ok.bkash, '01711111111');
  assert.equal(ok.contact, 50);
  assert.equal(ok.rating, 2500);
});
