import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, coerceRow, friendlyError, restorableFields, parseJsonInput, isVersion } from '../web/admin/admin-lib.js';
import { TABLES } from '../web/admin/schema-config.js';

test('slugify', () => {
  assert.equal(slugify('The Penal Code, 1860'), 'the-penal-code-1860');
  assert.equal(slugify('  --Hello__World--  '), 'hello-world');
  assert.equal(slugify('দণ্ডবিধি'), ''); // Bangla-only: admin must type a slug
  assert.equal(slugify('a'.repeat(200), 10), 'aaaaaaaaaa');
});

test('coerceRow: required, numbers, nulls, defaults', () => {
  const fields = TABLES.laws.fields;
  const bad = coerceRow(fields, { title_bn: '', title_en: 'x', slug: 'xx', year: '19x0' });
  assert.ok(bad.errors.title_bn);
  assert.ok(bad.errors.slug === undefined);
  assert.ok(bad.errors.year);

  const ok = coerceRow(fields, { title_bn: 'দণ্ডবিধি', title_en: 'Penal Code', slug: 'penal-code-1860', year: '1860', source_url: 'https://bdlaws.minlaw.gov.bd/', status: '', summary_en: '  ' });
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.row.year, 1860);
  assert.equal(ok.row.status, 'draft'); // default
  assert.equal(ok.row.law_status, 'in_force'); // default
  assert.equal(ok.row.summary_en, null); // blank -> null
  assert.equal(ok.row.act_number, null);
});

test('coerceRow: rejects bad urls, slugs, dates, select values, out-of-range numbers', () => {
  const f = TABLES.laws.fields;
  const base = { title_bn: 'a', title_en: 'a', slug: 'ok-slug' };
  assert.ok(coerceRow(f, { ...base, source_url: 'javascript:alert(1)' }).errors.source_url);
  assert.ok(coerceRow(f, { ...base, slug: 'Bad Slug' }).errors.slug);
  assert.ok(coerceRow(f, { ...base, last_verified_at: '2026-13-45' }).errors.last_verified_at);
  assert.ok(coerceRow(f, { ...base, status: 'deleted' }).errors.status);
  assert.ok(coerceRow(f, { ...base, year: '1500' }).errors.year);
  assert.ok(coerceRow(f, { ...base, year: '2.5' }).errors.year);
  assert.ok(coerceRow(f, { ...base, summary_en: 'x'.repeat(4001) }).errors.summary_en);
});

test('every configured field has a label and a unique key per table', () => {
  for (const [name, cfg] of Object.entries(TABLES)) {
    const keys = cfg.fields.map((f) => f.key);
    assert.equal(new Set(keys).size, keys.length, `${name}: duplicate keys`);
    for (const f of cfg.fields) assert.ok(f.label, `${name}.${f.key} label`);
    for (const c of cfg.columns) assert.ok(keys.includes(c.key) || ['slug', 'version'].includes(c.key), `${name}: column ${c.key} not a field`);
  }
});

test('friendlyError maps common database failures', () => {
  assert.match(friendlyError({ code: '23505', message: 'duplicate key' }), /already exists/);
  assert.match(friendlyError({ code: '23514', message: 'A published item cannot go back to draft' }), /Archive/);
  assert.match(friendlyError({ code: '42501', message: 'x' }), /permission/);
  assert.match(friendlyError(new Error('Failed to fetch')), /internet/);
  assert.equal(friendlyError(null), '');
});

test('restorableFields never rolls back identity, ownership, timestamps or status', () => {
  const out = restorableFields({ id: 1, status: 'published', created_at: 'x', created_by: 'x', updated_at: 'x', updated_by: 'x', title_en: 'Old', year: 1860 });
  assert.deepEqual(out, { title_en: 'Old', year: 1860 });
  assert.deepEqual(restorableFields(null), {});
});

test('parseJsonInput / isVersion', () => {
  assert.equal(parseJsonInput('{"a":1}').value.a, 1);
  assert.equal(parseJsonInput('{oops').ok, false);
  assert.ok(isVersion('0.1.0') && isVersion('1') && isVersion('1.2.3.4'));
  assert.ok(!isVersion('v1') && !isVersion('1..2') && !isVersion(''));
});
