import test from 'node:test';
import assert from 'node:assert/strict';
import { translate, pick, isFallback, isLang } from '../src/lib/i18n-core.js';

const dicts = { bn: { a: 'এক', hi: 'হ্যালো {name}' }, en: { a: 'one', b: 'only en', hi: 'Hi {name}' } };

test('translate: language, fallback to English, then the key', () => {
  assert.equal(translate(dicts, 'bn', 'a'), 'এক');
  assert.equal(translate(dicts, 'bn', 'b'), 'only en');
  assert.equal(translate(dicts, 'bn', 'zzz'), 'zzz');
});

test('translate: placeholders, unknown placeholders stay visible', () => {
  assert.equal(translate(dicts, 'en', 'hi', { name: 'Rakib' }), 'Hi Rakib');
  assert.equal(translate(dicts, 'en', 'hi', {}), 'Hi {name}');
  assert.equal(translate(dicts, 'en', 'hi', { name: 0 }), 'Hi 0');
});

test('pick: falls back to the other language when empty', () => {
  const row = { title_bn: '  ', title_en: 'Penal Code' };
  assert.equal(pick(row, 'title', 'bn'), 'Penal Code');
  assert.ok(isFallback(row, 'title', 'bn'));
  assert.ok(!isFallback(row, 'title', 'en'));
  assert.equal(pick({ title_bn: 'দণ্ডবিধি', title_en: null }, 'title', 'en'), 'দণ্ডবিধি');
  assert.equal(pick(null, 'title', 'bn'), '');
  assert.equal(pick({}, 'title', 'bn'), '');
});

test('isLang', () => {
  assert.ok(isLang('bn') && isLang('en'));
  assert.ok(!isLang('fr') && !isLang(null));
});
