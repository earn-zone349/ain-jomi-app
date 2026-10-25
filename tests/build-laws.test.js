import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateCategories, validateLaw, buildOutputs, loadAll, writeOutputs } from '../scripts/build-laws.mjs';
import { uuidFromString } from '../src/lib/text.js';

const cats = new Set(['criminal-law', 'land-law']);
const good = () => ({
  slug: 'penal-code-1860',
  category: 'criminal-law',
  title: { bn: 'দণ্ডবিধি', en: 'Penal Code' },
  year: 1860,
  source: { name: 'bdlaws', url: 'https://bdlaws.minlaw.gov.bd/', last_verified: '2026-01-31' },
  sections: [{ no: '1', text: { bn: 'পাঠ' } }],
});

test('categories: valid list passes, duplicates and missing names fail', () => {
  assert.deepEqual(validateCategories({ categories: [{ slug: 'a', name: { bn: 'ক', en: 'A' } }] }).errors, []);
  const r = validateCategories({ categories: [{ slug: 'a', name: { bn: 'ক', en: 'A' } }, { slug: 'a', name: { bn: 'খ' } }] });
  assert.ok(r.errors.some((e) => /duplicate/.test(e)));
  assert.ok(r.errors.some((e) => /both required/.test(e)));
  assert.ok(validateCategories({}).errors.length);
});

test('the real categories.json is valid and has no duplicates', () => {
  const real = JSON.parse(readFileSync('content/categories.json', 'utf8'));
  const r = validateCategories(real);
  assert.deepEqual(r.errors, []);
  assert.equal(r.categories.length, 28);
});

test('law: valid file passes and maps to app fields', () => {
  const r = validateLaw(good(), 'penal-code-1860.json', cats);
  assert.deepEqual(r.errors, []);
  assert.equal(r.law.entry.id, 'penal-code-1860');
  assert.equal(r.law.entry.category_id, 'criminal-law');
  assert.equal(r.law.entry.law_status, 'in_force');
  assert.equal(r.law.entry.section_count, 1);
  assert.equal(r.law.sections[0].id, 'penal-code-1860~1');
  assert.equal(r.law.sections[0].text_bn, 'পাঠ');
});

test('law: drafts are skipped without errors', () => {
  const r = validateLaw({ ...good(), status: 'draft', category: 'nope' }, 'penal-code-1860.json', cats);
  assert.deepEqual(r.errors, []);
  assert.equal(r.law, null);
});

test('law: every kind of mistake is reported with the file name', () => {
  const bad = (patch) => validateLaw({ ...good(), ...patch }, 'penal-code-1860.json', cats).errors.join(' | ');
  assert.match(bad({ slug: 'Other' }), /slug/);
  assert.match(bad({ slug: 'other-name' }), /must equal the file name/);
  assert.match(bad({ category: 'unknown' }), /does not exist/);
  assert.match(bad({ title: {} }), /title/);
  assert.match(bad({ year: 'abc' }), /year/);
  assert.match(bad({ law_status: 'weird' }), /law_status/);
  assert.match(bad({ source: { url: 'http://insecure.example' } }), /https/);
  assert.match(bad({ source: { last_verified: '2026-13-45' } }), /last_verified/);
  assert.match(bad({ sections: [{ no: '1', text: { bn: 'a' } }, { no: '1', text: { bn: 'b' } }] }), /duplicate section/);
  assert.match(bad({ sections: [{ no: '', text: { bn: 'a' } }] }), /"no"/);
  assert.match(bad({ sections: [{ no: '2' }] }), /text/);
  assert.match(bad({ keywords: 'x' }), /keywords/);
  assert.ok(bad({ slug: 'Other' }).startsWith('penal-code-1860.json:'));
});

test('law: warnings (not errors) for missing source or one-language title', () => {
  const r = validateLaw({ slug: 'a', category: 'land-law', title: { bn: 'ক' } }, 'a.json', cats);
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.length >= 2);
});

test('outputs: index has no section text, search and laws files are keyed by slug, version is stable', () => {
  const l = validateLaw(good(), 'penal-code-1860.json', cats).law;
  const a = buildOutputs([{ id: 'criminal-law' }], [l], 'x');
  const b = buildOutputs([{ id: 'criminal-law' }], [l], 'y');
  assert.equal(a.index.version, b.index.version);
  assert.ok(!JSON.stringify(a.index).includes('পাঠ'));
  assert.ok(a.lawFiles['penal-code-1860'].sections[0].text_bn === 'পাঠ');
  assert.ok(a.search['penal-code-1860'].b.includes('পাঠ'));
  const changed = validateLaw({ ...good(), sections: [{ no: '1', text: { bn: 'অন্য' } }] }, 'penal-code-1860.json', cats).law;
  assert.notEqual(buildOutputs([{ id: 'criminal-law' }], [changed]).index.version, a.index.version);
});

test('loadAll + writeOutputs on a temp folder; bad JSON and duplicate slugs are errors; _files ignored', () => {
  const root = mkdtempSync(join(tmpdir(), 'laws-'));
  mkdirSync(join(root, 'laws'));
  writeFileSync(join(root, 'categories.json'), JSON.stringify({ categories: [{ slug: 'criminal-law', name: { bn: 'ক', en: 'C' } }] }));
  writeFileSync(join(root, 'laws', 'penal-code-1860.json'), JSON.stringify(good()));
  writeFileSync(join(root, 'laws', '_template.json'), '{ not json');
  const ok = loadAll(root, join(root, 'laws'));
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.laws.length, 1);
  const out = join(root, 'out');
  writeOutputs(out, buildOutputs(ok.categories, ok.laws));
  assert.ok(existsSync(join(out, 'index.json')) && existsSync(join(out, 'laws', 'penal-code-1860.json')) && existsSync(join(out, 'search.json')));

  writeFileSync(join(root, 'laws', 'broken.json'), '{ nope');
  assert.ok(loadAll(root, join(root, 'laws')).errors.some((e) => /broken\.json: not valid JSON/.test(e)));
});

test('uuidFromString is deterministic, uuid-shaped and distinct', () => {
  const a = uuidFromString('penal-code-1860');
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(a, uuidFromString('penal-code-1860'));
  assert.notEqual(a, uuidFromString('penal-code-1861'));
  assert.notEqual(uuidFromString('x~1'), uuidFromString('x~2'));
});
