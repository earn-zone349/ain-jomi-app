import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateUnits, validateCosts, validateGlossary, buildLand } from '../scripts/build-land.mjs';

const read = (n) => JSON.parse(readFileSync(`content/land/${n}.json`, 'utf8'));

test('shipped land data files are valid', () => {
  assert.deepEqual(validateUnits(read('units')), []);
  assert.deepEqual(validateCosts(read('costs')), []);
  assert.deepEqual(validateGlossary(read('glossary')), []);
  assert.equal(read('costs').status, 'draft'); // no rates are shipped until someone checks them against an official source
});

test('units: duplicates, bad numbers and missing standard units are caught', () => {
  const u = read('units');
  assert.ok(validateUnits({ ...u, area_units: u.area_units.filter((x) => x.id !== 'acre') }).some((m) => /acre/.test(m)));
  assert.ok(validateUnits({ ...u, regions: [{ ...u.regions[0] }, { ...u.regions[0] }] }).some((m) => /duplicate/.test(m)));
  assert.ok(validateUnits({ ...u, regions: [{ ...u.regions[0], katha_sqft: 0 }] }).some((m) => /katha_sqft/.test(m)));
  assert.ok(validateUnits({ ...u, regions: [{ ...u.regions[0], id: 'custom' }] }).some((m) => /custom/.test(m)));
});

test('costs: a published list needs rates, a date and a source', () => {
  const item = { id: 'stamp', label: { bn: 'স্ট্যাম্প', en: 'Stamp' }, kind: 'percent', value: 1.5 };
  assert.deepEqual(validateCosts({ status: 'draft', items: [] }), []);
  assert.ok(validateCosts({ status: 'published', items: [] }).length >= 3);
  assert.deepEqual(validateCosts({ status: 'published', as_of: '2026-07-01', source: { name: 'NBR', url: 'https://nbr.gov.bd/' }, items: [item] }), []);
  assert.ok(validateCosts({ status: 'draft', items: [{ ...item, value: 150 }] }).some((m) => /100/.test(m)));
  assert.ok(validateCosts({ status: 'draft', items: [{ ...item, kind: 'weird' }] }).some((m) => /kind/.test(m)));
  assert.ok(validateCosts({ status: 'draft', items: [item, item] }).some((m) => /duplicate/.test(m)));
  assert.ok(validateCosts({ status: 'nope', items: [] }).length);
});

test('glossary: both languages required', () => {
  assert.ok(validateGlossary({ terms: [{ id: 'a', term: { bn: 'ক' }, meaning: { bn: 'খ', en: 'B' } }] }).length);
  assert.ok(validateGlossary({}).length);
});

test('buildLand writes the files without the _help notes', () => {
  const out = mkdtempSync(join(tmpdir(), 'land-'));
  const r = buildLand('content/land', out);
  assert.deepEqual(r.errors, []);
  assert.ok(existsSync(join(out, 'units.json')) && existsSync(join(out, 'costs.json')) && existsSync(join(out, 'glossary.json')));
  assert.ok(!('_help' in JSON.parse(readFileSync(join(out, 'units.json'), 'utf8'))));
});
