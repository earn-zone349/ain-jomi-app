import test from 'node:test';
import assert from 'node:assert/strict';
import { DISTRICTS, DIVISIONS, COURTS } from '../src/lib/lawyers-options.js';
import { validateApplication, normalizePhone, sortLawyers, filterLawyers, PUBLIC_COLUMNS, SIGNED_IN_COLUMNS } from '../src/lib/lawyers-core.js';

const good = () => ({
  full_name: 'Ayesha Rahman', enrollment_no: 'DBA-1234', enrollment_year: '2015', bar_association: 'Dhaka Bar',
  courts: ['lower_courts'], practice_areas: ['land-law'], district: 'dhaka', office_address: '12 Court Road, Dhaka',
  phone: '০১৭০০-০০০ ০০১', email: 'A@X.com', qualifications: 'LL.B', consent_public: true,
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
  assert.equal(validateApplication({ ...good(), email: '', enrollment_year: '' }).ok, true);
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

test('anonymous column list has no contact details', () => {
  for (const c of ['phone', 'email', 'office_address']) {
    assert.ok(!PUBLIC_COLUMNS.split(',').includes(c));
    assert.ok(SIGNED_IN_COLUMNS.split(',').includes(c));
  }
});
