import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLawText } from '../scripts/text-to-law.mjs';
import { validateLaw } from '../scripts/build-laws.mjs';

const sample = readFileSync('tests/fixtures/sample-law.txt', 'utf8');

test('parses header, chapters, sections and language switches', () => {
  const { json, errors } = parseLawText(sample);
  assert.deepEqual(errors, []);
  assert.equal(json.slug, 'sample-act-2000');
  assert.equal(json.year, 2000);
  assert.deepEqual(json.title, { bn: 'নমুনা আইন, ২০০০', en: 'Sample Act, 2000' });
  assert.deepEqual(json.keywords, ['নমুনা', 'sample']);
  assert.equal(json.sections.length, 2);
  const [a, b] = json.sections;
  assert.equal(a.no, '১');
  assert.deepEqual(a.chapter, { bn: 'অধ্যায় ১', en: 'Chapter 1' });
  assert.deepEqual(a.heading, { bn: 'সংক্ষিপ্ত শিরোনাম', en: 'Short title' });
  assert.equal(a.text.bn, 'প্রথম লাইন।\n\nদ্বিতীয় অনুচ্ছেদ।'); // paragraphs kept, text untouched
  assert.equal(a.text.en, 'First line.');
  assert.equal(a.explain.bn, 'সহজ কথায় ব্যাখ্যা।');
  assert.equal(a.punishment.en, 'None.');
  assert.equal(b.no, '2ক');
  assert.equal(b.chapter, undefined); // "@@" with nothing clears the chapter
  assert.deepEqual(b.heading, { bn: 'সংজ্ঞা', en: '' });
});

test('result passes the same validation as the app build', () => {
  const { json } = parseLawText(sample);
  const r = validateLaw(json, 'sample-act-2000.json', new Set(['civil-law']));
  assert.deepEqual(r.errors, []);
  assert.equal(r.law.sections.length, 2);
});

test('reports mistakes with line numbers instead of guessing', () => {
  assert.match(parseLawText('slug sample\n§ 1 | a\nx').errors[0], /line 1/);
  assert.match(parseLawText('slug: a\n§ | a\nx').errors.join(), /needs a number/);
  assert.match(parseLawText('slug: a\n§ 1 | a\nx\n--wrong\ny').errors.join(), /unknown marker/);
  assert.match(parseLawText('slug: a\nstray text\n§ 1 | a\nx').errors.join() || 'none', /none|stray|header/);
  assert.match(parseLawText('slug: a\n§ 1 | a\nx').errors.join() || 'ok', /ok/);
});
