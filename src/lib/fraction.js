// Exact rational numbers (BigInt numerator / denominator). Inheritance shares must add up to exactly 1,
// so nothing in the inheritance engine ever touches floating point.

const abs = (a) => (a < 0n ? -a : a);
function gcd(a, b) {
  a = abs(a);
  b = abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export class Fraction {
  constructor(n, d = 1n) {
    n = BigInt(n);
    d = BigInt(d);
    if (d === 0n) throw new RangeError('Fraction: zero denominator');
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d) || 1n;
    this.n = n / g;
    this.d = d / g;
    Object.freeze(this);
  }

  static of(n, d = 1) {
    return new Fraction(n, d);
  }

  add(o) {
    return new Fraction(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  sub(o) {
    return new Fraction(this.n * o.d - o.n * this.d, this.d * o.d);
  }
  mul(o) {
    return new Fraction(this.n * o.n, this.d * o.d);
  }
  div(o) {
    if (o.n === 0n) throw new RangeError('Fraction: division by zero');
    return new Fraction(this.n * o.d, this.d * o.n);
  }
  cmp(o) {
    const l = this.n * o.d;
    const r = o.n * this.d;
    return l < r ? -1 : l > r ? 1 : 0;
  }
  eq(o) {
    return this.cmp(o) === 0;
  }
  isZero() {
    return this.n === 0n;
  }
  toString() {
    return this.d === 1n ? `${this.n}` : `${this.n}/${this.d}`;
  }

  /** Decimal text rounded half-up to `places` digits after the point (for money display only). */
  toFixed(places = 2) {
    const scale = 10n ** BigInt(places);
    let q;
    q = (2n * this.n * scale + this.d) / (2n * this.d);
    const whole = q / scale;
    const frac = (q % scale).toString().padStart(places, '0');
    return places ? `${whole}.${frac}` : `${whole}`;
  }

  /** Parses "1250", "1,250.50", "১২৫০.৫০" into an exact Fraction. Returns null for anything else. */
  static parseDecimal(text) {
    const norm = normalizeDecimal(text);
    if (norm === null) return null;
    const [w, f = ''] = norm.split('.');
    return new Fraction(BigInt(w + f), 10n ** BigInt(f.length));
  }
}

const BN = '০১২৩৪৫৬৭৮৯';
export function normalizeDecimal(text) {
  if (typeof text !== 'string') return null;
  let s = text.trim().replace(/[,\s]/g, '').replace(/[০-৯]/g, (c) => String(BN.indexOf(c))).replace(/[।]/g, '.');
  if (!/^(\d+(\.\d+)?|\.\d+)$/.test(s)) return null;
  if (s.startsWith('.')) s = `0${s}`;
  if (s.replace('.', '').length > 18) return null;
  return s;
}

export const ZERO = new Fraction(0n);
export const ONE = new Fraction(1n);
export const sum = (list) => list.reduce((a, b) => a.add(b), ZERO);
