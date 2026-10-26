import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNumber, roundTo, trimNumber, buildAreaUnits, convertArea, toSqft, breakdown, lengthToFeet, shapes, shareOfArea, splitEqually, totalPrice, pricePerUnit, estimateCost, LandInputError } from '../src/lib/land-core.js';

const data = JSON.parse(readFileSync('content/land/units.json', 'utf8'));
const units = buildAreaUnits(data, 'standard');
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const val = (res, id) => res.find((r) => r.id === id).value;
const code = (fn) => {
  try {
    fn();
  } catch (e) {
    return e instanceof LandInputError ? e.code : `other:${e.message}`;
  }
  return null;
};

test('parseNumber: Bangla digits, commas, decimals, rejects junk', () => {
  assert.equal(parseNumber('১২৩'), 123);
  assert.equal(parseNumber('১,২৫০.৫'), 1250.5);
  assert.equal(parseNumber('2.5'), 2.5);
  assert.equal(parseNumber('.5'), 0.5);
  assert.equal(parseNumber('৩।৫'), 3.5);
  for (const bad of ['', ' ', 'abc', '1.2.3', '-5', '1e5', '১২ক', null, undefined]) assert.equal(parseNumber(bad), null, String(bad));
  assert.equal(parseNumber('1e13'), null);
  assert.equal(parseNumber('99999999999999'), null); // beyond the sanity limit
});

test('number formatting', () => {
  assert.equal(roundTo(2.00005, 4), 2.0001);
  assert.equal(trimNumber(2.5), '2.5');
  assert.equal(trimNumber(3), '3');
  assert.equal(trimNumber(0.1 + 0.2), '0.3');
  assert.equal(trimNumber(1234567.891234), '1234567.8912');
  assert.equal(trimNumber(10, 0), '10'); // no decimal point: zeros must stay
  assert.equal(trimNumber(100), '100');
  assert.equal(trimNumber(0), '0');
  assert.equal(trimNumber(0, 0), '0');
  assert.equal(trimNumber(20.00001, 2), '20');
});

test('fixed unit relationships: 1 acre = 100 shotok = 43560 sq ft; 1 shotok = 435.6 sq ft', () => {
  const r = convertArea(1, 'acre', units);
  near(val(r, 'sqft'), 43560);
  near(val(r, 'shotok'), 100);
  near(val(r, 'hectare'), 0.40468564, 1e-6);
  near(val(r, 'sqm'), 4046.8564224, 1e-4);
});

test('standard region: 1 bigha = 20 katha = 14400 sq ft; 1 katha = 16 chhatak = 720 sq ft', () => {
  const r = convertArea(1, 'bigha', units);
  near(val(r, 'sqft'), 14400);
  near(val(r, 'katha'), 20);
  near(val(r, 'chhatak'), 320);
  near(val(r, 'shotok'), 14400 / 435.6, 1e-9);
});

test('33-shotok region: 1 bigha = 33 shotok', () => {
  const u = buildAreaUnits(data, 'shotok33');
  near(val(convertArea(1, 'bigha', u), 'shotok'), 33, 1e-6);
});

test('custom region and unknown region fall back safely', () => {
  const u = buildAreaUnits(data, 'custom', { katha_sqft: 800, katha_per_bigha: 16 });
  near(val(convertArea(1, 'bigha', u), 'sqft'), 12800);
  near(val(convertArea(1, 'katha', buildAreaUnits(data, 'nope')), 'sqft'), 720); // first region
  assert.equal(code(() => buildAreaUnits(data, 'custom', { katha_sqft: 0, katha_per_bigha: 20 })), 'positive');
});

test('round trip: any unit -> sq ft -> same unit', () => {
  for (const u of units) {
    const sq = toSqft(2.75, u.id, units);
    near(val(convertArea(sq, 'sqft', units), u.id), (2.75 * u.sqft) / u.sqft, 1e-9 * Math.max(1, u.sqft));
  }
});

test('breakdown: whole bigha and katha, remainder as fraction, no floating point wobble', () => {
  let b = breakdown(14400, units, ['bigha', 'katha']);
  assert.deepEqual(b.map((x) => x.value), [1, 0]);
  b = breakdown(14400 * 2 + 720 * 5 + 360, units, ['bigha', 'katha']);
  assert.equal(b[0].value, 2);
  near(b[1].value, 5.5);
  b = breakdown(19999.9999999999, units, ['bigha', 'katha', 'chhatak']);
  assert.equal(b[0].value, 1);
  assert.ok(b[1].value >= 0 && b[1].value < 20);
  assert.equal(code(() => breakdown(1, units, ['nope'])), 'unit');
});

test('lengths: hat, gaj, metre, inch', () => {
  near(lengthToFeet(10, 'hat', data.length_units), 15);
  near(lengthToFeet(2, 'gaj', data.length_units), 6);
  near(lengthToFeet(1, 'm', data.length_units), 3.280839895, 1e-8);
  near(lengthToFeet(24, 'inch', data.length_units), 2);
});

test('shapes', () => {
  assert.equal(shapes.rectangle(20, 36), 720); // exactly one katha
  assert.equal(shapes.triangle(10, 6), 30);
  near(shapes.triangleSides(3, 4, 5), 6);
  assert.equal(code(() => shapes.triangleSides(1, 2, 3)), 'triangle'); // degenerate
  assert.equal(code(() => shapes.triangleSides(1, 2, 10)), 'triangle');
  assert.equal(shapes.trapezoid(10, 20, 4), 60);
  assert.equal(code(() => shapes.rectangle(0, 5)), 'positive');
  assert.equal(code(() => shapes.rectangle(-1, 5)), 'positive');
  assert.equal(code(() => shapes.rectangle(NaN, 5)), 'number');
});

test('shares and equal split', () => {
  near(shareOfArea(14400, 3, 8), 5400);
  near(shareOfArea(1000, 8, 8), 1000);
  assert.equal(shareOfArea(1000, 0, 8), 0);
  assert.equal(code(() => shareOfArea(1000, 9, 8)), 'fractionTooBig');
  assert.equal(code(() => shareOfArea(1000, 1, 0)), 'fraction');
  assert.equal(code(() => shareOfArea(1000, 1.5, 4)), 'fraction');
  near(splitEqually(1000, 4), 250);
  assert.equal(code(() => splitEqually(1000, 0)), 'people');
  assert.equal(code(() => splitEqually(1000, 2.5)), 'people');
});

test('price per unit <-> total', () => {
  const area = toSqft(5, 'katha', units); // 3600 sq ft
  near(totalPrice(300000, 'katha', area, units), 1500000);
  near(pricePerUnit(1500000, 'katha', area, units), 300000);
  assert.equal(code(() => totalPrice(0, 'katha', area, units)), 'positive');
});

test('cost estimate: percent and fixed items', () => {
  const r = estimateCost(1000000, [
    { id: 'a', label: 'A', kind: 'percent', value: 1.5 },
    { id: 'b', label: 'B', kind: 'fixed', value: 500 },
  ]);
  near(r.lines[0].amount, 15000);
  near(r.lines[1].amount, 500);
  near(r.total, 15500);
  assert.deepEqual(estimateCost(100, []).total, 0);
  assert.equal(code(() => estimateCost(0, [])), 'positive');
});
