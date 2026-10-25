import test from 'node:test';
import assert from 'node:assert/strict';
import { toBnDigits, toAsciiDigits, formatNumber, normalizeText, parseBlocks, compareVersions, truncate, isValidEmail, passwordProblem } from '../src/lib/text.js';

test('Bangla digit conversion round-trips', () => {
  assert.equal(toBnDigits('2026-10-22'), '২০২৬-১০-২২');
  assert.equal(toAsciiDigits('২০২৬'), '2026');
  assert.equal(toAsciiDigits(toBnDigits('0123456789')), '0123456789');
  assert.equal(formatNumber(12, 'bn'), '১২');
  assert.equal(formatNumber(12, 'en'), '12');
});

test('normalizeText is forgiving for search', () => {
  assert.equal(normalizeText('  Penal   CODE '), 'penal code');
  assert.equal(normalizeText('ধারা ৩৭৮'), 'ধারা 378'); // Bangla digits match ASCII queries
  assert.equal(normalizeText('a‌b'), 'ab');
  assert.equal(normalizeText(null), '');
});

test('parseBlocks: title, headings, bullets, paragraphs', () => {
  const blocks = parseBlocks('Title line\n\nEffective: today\n\n# 1. Heading\n- one\n- two\nPlain');
  assert.deepEqual(
    blocks.map((b) => b.type),
    ['title', 'p', 'h', 'li', 'li', 'p'],
  );
  assert.equal(blocks[2].text, '1. Heading');
});

test('parseBlocks never produces markup (text stays text)', () => {
  const [b] = parseBlocks('<img src=x onerror=alert(1)>');
  assert.equal(b.text, '<img src=x onerror=alert(1)>');
});

test('parseBlocks: first line starting with "# " is a heading, not a title', () => {
  assert.equal(parseBlocks('# Heading first')[0].type, 'h');
});

test('compareVersions', () => {
  assert.equal(compareVersions('0.1.0', '0.1.0'), 0);
  assert.equal(compareVersions('0.1.0', '0.2.0'), -1);
  assert.equal(compareVersions('1.0', '0.9.9'), 1);
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
  assert.equal(compareVersions('1.10.0', '1.9.0'), 1); // numeric, not lexical
  assert.equal(compareVersions(undefined, '0.0.1'), -1);
});

test('truncate', () => {
  assert.equal(truncate('abcdef', 10), 'abcdef');
  assert.equal(truncate('abcdef', 4), 'abc…');
});

test('isValidEmail', () => {
  assert.ok(isValidEmail('a@b.co'));
  assert.ok(isValidEmail(' user.name+tag@example.com '));
  assert.ok(!isValidEmail('a@b'));
  assert.ok(!isValidEmail('a b@c.com'));
  assert.ok(!isValidEmail(''));
});

test('passwordProblem', () => {
  assert.equal(passwordProblem('short1'), 'auth.err.pwShort');
  assert.equal(passwordProblem('12345678'), 'auth.err.pwDigits');
  assert.equal(passwordProblem('abcd1234'), null);
  assert.equal(passwordProblem(''), 'auth.err.pwShort');
});
