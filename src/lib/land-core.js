// Land maths. Pure functions, no DOM, no network. Unit-tested in tests/land-core.test.js.
// Every area is kept in square feet internally and converted only for display.

import { toAsciiDigits } from './text.js';

export class LandInputError extends Error {
  constructor(code) {
    super(code);
    this.code = code; // maps to the i18n key land.err.<code>
  }
}

const MAX = 1e12;

/**
 * Parses what a person typed: Bangla or English digits, commas, one decimal point.
 * Returns a finite number >= 0, or null if it is empty or not a number.
 */
export function parseNumber(input) {
  const s = toAsciiDigits(String(input ?? ''))
    .replace(/[,\s]/g, '')
    .replace(/[।]/g, '.');
  if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= MAX ? n : null;
}

function positive(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new LandInputError('number');
  if (n <= 0) throw new LandInputError('positive');
  return n;
}

export function roundTo(x, digits = 4) {
  const f = 10 ** digits;
  return Math.round((x + Number.EPSILON) * f) / f;
}

/** 2.50000 -> "2.5", 3 -> "3". Never uses exponent notation. */
export function trimNumber(x, digits = 4) {
  const fixed = roundTo(x, digits).toFixed(digits);
  // Only strip zeros after a decimal point, otherwise 100 would become 1.
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

/**
 * Area units for a region. data is content/land/units.json.
 * custom = { katha_sqft, katha_per_bigha } is used when regionId === 'custom'.
 * Returns [{ id, name:{bn,en}, sqft }] in display order, including chhatak, katha and bigha.
 */
export function buildAreaUnits(data, regionId, custom = null) {
  let region = data.regions.find((r) => r.id === regionId);
  if (regionId === 'custom' && custom) region = { katha_sqft: custom.katha_sqft, katha_per_bigha: custom.katha_per_bigha };
  if (!region) region = data.regions[0];
  const katha = positive(region.katha_sqft);
  const perBigha = positive(region.katha_per_bigha);
  const chhatak = katha / (data.chhatak_per_katha || 16);
  const local = [
    { id: 'bigha', name: { bn: 'বিঘা', en: 'Bigha' }, sqft: katha * perBigha },
    { id: 'katha', name: { bn: 'কাঠা', en: 'Katha' }, sqft: katha },
    { id: 'chhatak', name: { bn: 'ছটাক', en: 'Chhatak' }, sqft: chhatak },
  ];
  const [sqft, sqm, shotok, acre, hectare] = ['sqft', 'sqm', 'shotok', 'acre', 'hectare'].map((id) => data.area_units.find((u) => u.id === id));
  return [...local, shotok, acre, hectare, sqft, sqm].filter(Boolean);
}

/** Converts value of unit fromId into every unit. Returns [{ id, value }]. */
export function convertArea(value, fromId, units) {
  const from = units.find((u) => u.id === fromId);
  if (!from) throw new LandInputError('unit');
  const sqft = positive(value) * from.sqft;
  return units.map((u) => ({ id: u.id, value: sqft / u.sqft }));
}

export const toSqft = (value, unitId, units) => {
  const u = units.find((x) => x.id === unitId);
  if (!u) throw new LandInputError('unit');
  return positive(value) * u.sqft;
};

/**
 * Splits an area into whole parts of the given units, largest first, with the last unit keeping the fraction.
 * breakdown(14500, units, ['bigha','katha']) -> [{id:'bigha', value:1}, {id:'katha', value:0.1389}]
 */
export function breakdown(sqft, units, ids) {
  let rest = sqft;
  const out = [];
  ids.forEach((id, i) => {
    const u = units.find((x) => x.id === id);
    if (!u) throw new LandInputError('unit');
    if (i === ids.length - 1) {
      out.push({ id, value: rest / u.sqft });
    } else {
      // The tiny epsilon stops 14400 sq ft showing up as "0 bigha 20 katha" through floating point error.
      const whole = Math.floor(rest / u.sqft + 1e-9);
      out.push({ id, value: whole });
      rest -= whole * u.sqft;
      if (rest < 0) rest = 0;
    }
  });
  return out;
}

export function lengthToFeet(value, unitId, lengthUnits) {
  const u = lengthUnits.find((x) => x.id === unitId);
  if (!u) throw new LandInputError('unit');
  return positive(value) * u.feet;
}

// Shapes: inputs and result in feet / square feet.
export const shapes = {
  rectangle: (length, width) => positive(length) * positive(width),
  triangle: (base, height) => (positive(base) * positive(height)) / 2,
  /** Heron's formula. Throws 'triangle' if the three sides cannot form a triangle. */
  triangleSides: (a, b, c) => {
    positive(a);
    positive(b);
    positive(c);
    if (a + b <= c || a + c <= b || b + c <= a) throw new LandInputError('triangle');
    const s = (a + b + c) / 2;
    return Math.sqrt(s * (s - a) * (s - b) * (s - c));
  },
  /** Two parallel sides a and b, and the distance h between them. */
  trapezoid: (a, b, h) => ((positive(a) + positive(b)) * positive(h)) / 2,
};

/** numerator/denominator of a total area, e.g. 3/8 of 2 bigha. */
export function shareOfArea(totalSqft, numerator, denominator) {
  positive(totalSqft);
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || numerator < 0 || denominator < 1) throw new LandInputError('fraction');
  if (numerator > denominator) throw new LandInputError('fractionTooBig');
  return (totalSqft * numerator) / denominator;
}

export function splitEqually(totalSqft, people) {
  positive(totalSqft);
  if (!Number.isInteger(people) || people < 1 || people > 1000) throw new LandInputError('people');
  return totalSqft / people;
}

/** Price per unit -> total price for an area (sqft), or total -> price per unit. */
export function totalPrice(pricePerUnit, unitId, areaSqft, units) {
  const u = units.find((x) => x.id === unitId);
  if (!u) throw new LandInputError('unit');
  return positive(pricePerUnit) * (positive(areaSqft) / u.sqft);
}

export function pricePerUnit(total, unitId, areaSqft, units) {
  const u = units.find((x) => x.id === unitId);
  if (!u) throw new LandInputError('unit');
  return positive(total) / (positive(areaSqft) / u.sqft);
}

/**
 * Cost calculated from published rates (content/land/costs.json).
 * items: [{ id, label, kind:'percent'|'fixed', value }]; percent items are a share of the deed value.
 */
export function estimateCost(deedValue, items) {
  positive(deedValue);
  const lines = items.map((it) => ({
    id: it.id,
    label: it.label,
    amount: it.kind === 'percent' ? (deedValue * it.value) / 100 : it.value,
  }));
  return { lines, total: lines.reduce((sum, l) => sum + l.amount, 0) };
}
